import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// `expo-sqlite` is replaced by a stub that records every native call, in order, on
// `globalThis.__expoSqliteStub.log` as `[handleId, method, ...args]`. Handles number from 1
// per reset, so the shared connection is 1 and a transaction connection opened after it is 2.
// A statement listed in `failures` throws instead of running; its optional `inTransaction`
// sets what `isInTransactionAsync` reports afterwards (a COMMIT that SQLite already rolled back).
const stub = `
  // Read per call, not once: this stub module is evaluated a single time while the tests
  // replace the state object before every fresh import of the module under test.
  function handle(name, options) {
    const stub = globalThis.__expoSqliteStub;
    const id = ++stub.handles;
    let inTransaction = false;
    stub.log.push([id, 'openDatabaseAsync', name, options]);
    const record = (method, ...args) => stub.log.push([id, method, ...args]);
    const exec = async (sql) => {
      record('execAsync', sql);
      const failure = stub.failures.get(sql);
      if (failure) {
        if (failure.inTransaction !== undefined) inTransaction = failure.inTransaction;
        throw failure.error;
      }
      if (sql.startsWith('BEGIN')) inTransaction = true;
      if (sql === 'COMMIT;' || sql === 'ROLLBACK;') inTransaction = false;
    };
    return {
      execAsync: exec,
      runAsync: async (sql) => { record('runAsync', sql); return { changes: 0, lastInsertRowId: 0 }; },
      getFirstAsync: async (sql) => { record('getFirstAsync', sql); return null; },
      getAllAsync: async (sql) => { record('getAllAsync', sql); return []; },
      isInTransactionAsync: async () => { record('isInTransactionAsync'); return inTransaction; },
      closeAsync: async () => { record('closeAsync'); },
    };
  }

  export async function openDatabaseAsync(name, options) {
    const stub = globalThis.__expoSqliteStub;
    if (stub.failOpen) {
      stub.failOpen = false;
      stub.log.push([0, 'openDatabaseAsync', name, options]);
      throw new Error('open failed');
    }
    return handle(name, options);
  }

  export function openDatabaseSync() { throw new Error('unused'); }
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-sqlite') {
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(stub)}` };
    }
    return nextResolve(specifier, context);
  },
});

// The module under test memoizes the open promise at module level, so every test imports a
// fresh copy through a cache-busting query on the module URL: a distinct URL is a distinct
// ESM instance, and the file behind it is read the same way. That keeps the tests independent
// of their order without a reset hook in production code.
let importCount = 0;

async function loadFreshModule() {
  globalThis.__expoSqliteStub = { log: [], failures: new Map(), handles: 0, failOpen: false };
  const url = new URL(`./expo-sqlite-database.ts?instance=${importCount++}`, import.meta.url);
  return import(url.href);
}

function log() {
  return globalThis.__expoSqliteStub.log;
}

function failStatement(sql, error, inTransaction) {
  globalThis.__expoSqliteStub.failures.set(sql, { error, inTransaction });
}

const transactionPreamble = [
  [2, 'openDatabaseAsync', 'kuyara.db', { useNewConnection: true }],
  [2, 'execAsync', 'PRAGMA busy_timeout = 5000;'],
  [2, 'execAsync', 'PRAGMA foreign_keys = ON;'],
  [2, 'execAsync', 'BEGIN IMMEDIATE;'],
];

async function openSharedHandle() {
  const { openKuyaraDatabase } = await loadFreshModule();
  const database = await openKuyaraDatabase();
  assert.deepEqual(log(), [
    [1, 'openDatabaseAsync', 'kuyara.db', undefined],
    [1, 'execAsync', 'PRAGMA busy_timeout = 5000;'],
  ]);
  log().length = 0;
  return database;
}

test('six concurrent callers share one open, and busy_timeout is set before the handle resolves', async () => {
  const { openKuyaraDatabase } = await loadFreshModule();

  const handles = await Promise.all(Array.from({ length: 6 }, () => openKuyaraDatabase()));

  assert.deepEqual(log(), [
    [1, 'openDatabaseAsync', 'kuyara.db', undefined],
    [1, 'execAsync', 'PRAGMA busy_timeout = 5000;'],
  ]);
  assert.ok(handles.every((handle) => handle === handles[0]), 'same object for every caller');
});

test('a failed busy_timeout pragma rejects the open, so the handle never resolves without it', async () => {
  const { openKuyaraDatabase } = await loadFreshModule();
  const pragma = 'PRAGMA busy_timeout = 5000;';
  globalThis.__expoSqliteStub.failures.set(pragma, { error: new Error('pragma failed') });

  await assert.rejects(() => openKuyaraDatabase(), { message: 'pragma failed' });
  globalThis.__expoSqliteStub.failures.delete(pragma);
  await openKuyaraDatabase();

  assert.deepEqual(log().map(([, method, sql]) => [method, sql]), [
    ['openDatabaseAsync', 'kuyara.db'],
    ['execAsync', pragma],
    ['openDatabaseAsync', 'kuyara.db'],
    ['execAsync', pragma],
  ]);
});

test('a rejected open clears the memo and the next call opens again', async () => {
  const { openKuyaraDatabase } = await loadFreshModule();
  globalThis.__expoSqliteStub.failOpen = true;

  await assert.rejects(() => openKuyaraDatabase(), { message: 'open failed' });
  const database = await openKuyaraDatabase();

  assert.deepEqual(log(), [
    [0, 'openDatabaseAsync', 'kuyara.db', undefined],
    [1, 'openDatabaseAsync', 'kuyara.db', undefined],
    [1, 'execAsync', 'PRAGMA busy_timeout = 5000;'],
  ]);
  assert.equal(database, await openKuyaraDatabase(), 'the successful open is memoized');
});

test('a transaction runs on its own connection: pragmas, BEGIN IMMEDIATE, body, COMMIT, close', async () => {
  const database = await openSharedHandle();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync('INSERT INTO t DEFAULT VALUES;');
  });

  assert.deepEqual(log(), [
    ...transactionPreamble,
    [2, 'execAsync', 'INSERT INTO t DEFAULT VALUES;'],
    [2, 'execAsync', 'COMMIT;'],
    [2, 'closeAsync'],
  ]);
});

test('a body that throws inside the open transaction rolls back, closes, and rethrows', async () => {
  const database = await openSharedHandle();
  const bodyError = new Error('body failed');

  await assert.rejects(
    () => database.withExclusiveTransactionAsync(async () => { throw bodyError; }),
    (error) => error === bodyError,
  );

  assert.deepEqual(log(), [
    ...transactionPreamble,
    [2, 'isInTransactionAsync'],
    [2, 'execAsync', 'ROLLBACK;'],
    [2, 'closeAsync'],
  ]);
});

test('a BEGIN IMMEDIATE failure propagates as itself with no ROLLBACK, and the connection still closes', async () => {
  const database = await openSharedHandle();
  const beginError = new Error('database is locked');
  failStatement('BEGIN IMMEDIATE;', beginError);
  let bodyRan = false;

  await assert.rejects(
    () => database.withExclusiveTransactionAsync(async () => { bodyRan = true; }),
    (error) => error === beginError,
  );

  assert.equal(bodyRan, false);
  assert.deepEqual(log(), [...transactionPreamble, [2, 'closeAsync']]);
});

test('a COMMIT failure that already ended the transaction is rethrown without a ROLLBACK', async () => {
  const database = await openSharedHandle();
  const commitError = new Error('disk I/O error');
  failStatement('COMMIT;', commitError, false);

  await assert.rejects(
    () => database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync('INSERT INTO t DEFAULT VALUES;', []);
    }),
    (error) => error === commitError,
  );

  assert.deepEqual(log(), [
    ...transactionPreamble,
    [2, 'runAsync', 'INSERT INTO t DEFAULT VALUES;'],
    [2, 'execAsync', 'COMMIT;'],
    [2, 'isInTransactionAsync'],
    [2, 'closeAsync'],
  ]);
});
