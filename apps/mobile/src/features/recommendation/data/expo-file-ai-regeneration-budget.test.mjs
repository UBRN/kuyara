import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { fileUri } from '../../../../test/file-uri.mjs';

// Mock the device file to verify durable, serialized reservations.
const files = new Map();
let readFailure = false;
let writeFailure = false;

function throwOnRead() {
  if (readFailure) throw new Error('read failed');
}

function throwOnWrite() {
  if (writeFailure) throw new Error('write failed');
}

globalThis.__kuyaraRegenerationBudgetFileMocks = {
  Directory: class {
    constructor(...parts) {
      this.uri = fileUri(parts);
    }

    create() {
      throwOnWrite();
    }
  },
  File: class {
    constructor(...parts) {
      this.uri = fileUri(parts);
    }

    get exists() {
      throwOnRead();
      return files.has(this.uri);
    }

    async text() {
      throwOnRead();
      return files.get(this.uri);
    }

    write(value) {
      throwOnWrite();
      files.set(this.uri, value);
    }
  },
  Paths: { document: { uri: 'file:///documents' } },
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-file-system') {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
          const mocks = globalThis.__kuyaraRegenerationBudgetFileMocks;
          export const { Directory, File, Paths } = mocks;
        `)}`,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { ExpoFileAiRegenerationBudget } = await import(
  './expo-file-ai-regeneration-budget.ts'
);

const budgetPath = 'file:///documents/kuyara/recommendation/ai-regenerations.json';

test.beforeEach(() => {
  files.clear();
  readFailure = false;
  writeFailure = false;
});

test('six concurrent reservations across instances allow exactly five', async () => {
  const reservations = await Promise.all(Array.from({ length: 6 }, () =>
    new ExpoFileAiRegenerationBudget().reserve('2026-09-18')));
  assert.deepEqual(reservations, [true, true, true, true, true, false]);
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 5 }));
});

test('the dressing-day date shares one allowance and a new date resets it', async () => {
  const budget = new ExpoFileAiRegenerationBudget();
  assert.equal(await budget.reserve('2026-09-18'), true);
  assert.equal(await budget.reserve('2026-09-18'), true);
  assert.equal(await budget.reserve('2026-09-19'), true);
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-19', count: 1 }));
});

test('corrupt content starts a fresh count that is rewritten, and still caps the day at five', async () => {
  for (const stored of ['not json', '', 'null', '[]', '{"dayKey":"2026-09-18"}',
    '{"dayKey":"2026-09-18","count":"2"}', '{"dayKey":"2026-09-18","count":-1}',
    '{"dayKey":"2026-09-18","count":1.5}']) {
    files.set(budgetPath, stored);
    assert.equal(await new ExpoFileAiRegenerationBudget().reserve('2026-09-18'), true, stored);
    assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 1 }), stored);
  }
  files.set(budgetPath, 'not json');
  const reservations = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    reservations.push(await new ExpoFileAiRegenerationBudget().reserve('2026-09-18'));
  }
  assert.deepEqual(reservations, [true, true, true, true, true, false]);
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 5 }));
});

test('unreadable and unwritable stores deny a reservation', async () => {
  const budget = new ExpoFileAiRegenerationBudget();
  files.set(budgetPath, JSON.stringify({ dayKey: '2026-09-18', count: 1 }));
  readFailure = true;
  assert.equal(await budget.reserve('2026-09-18'), false);
  readFailure = false;
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 1 }));
  files.clear();
  readFailure = true;
  assert.equal(await budget.reserve('2026-09-18'), false);
  readFailure = false;
  writeFailure = true;
  assert.equal(await budget.reserve('2026-09-18'), false);
  assert.equal(files.has(budgetPath), false);
});

test('a failed write does not falsely consume or grant a slot', async () => {
  const budget = new ExpoFileAiRegenerationBudget();
  files.set(budgetPath, JSON.stringify({ dayKey: '2026-09-18', count: 4 }));
  writeFailure = true;
  assert.equal(await budget.reserve('2026-09-18'), false);
  writeFailure = false;
  assert.equal(await budget.reserve('2026-09-18'), true);
  assert.equal(await budget.reserve('2026-09-18'), false);
});

test('a released slot is given back to its day, never below zero and never to another day', async () => {
  const budget = new ExpoFileAiRegenerationBudget();
  for (let attempt = 0; attempt < 5; attempt += 1) await budget.reserve('2026-09-18');
  assert.equal(await budget.reserve('2026-09-18'), false);
  await budget.release('2026-09-18');
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 4 }));
  assert.equal(await budget.reserve('2026-09-18'), true);

  await budget.release('2026-09-17');
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 5 }));

  files.set(budgetPath, JSON.stringify({ dayKey: '2026-09-19', count: 0 }));
  await budget.release('2026-09-19');
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-19', count: 0 }));
  files.clear();
  await budget.release('2026-09-19');
  assert.equal(files.has(budgetPath), false);
});

test('a release runs in turn with reservations, and a store it cannot use changes nothing', async () => {
  files.set(budgetPath, JSON.stringify({ dayKey: '2026-09-18', count: 5 }));
  const budget = new ExpoFileAiRegenerationBudget();
  const [released, reserved] = await Promise.all([budget.release('2026-09-18'), new ExpoFileAiRegenerationBudget().reserve('2026-09-18')]);
  assert.equal(released, undefined);
  assert.equal(reserved, true);
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 5 }));

  writeFailure = true;
  await budget.release('2026-09-18');
  writeFailure = false;
  readFailure = true;
  await budget.release('2026-09-18');
  readFailure = false;
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 5 }));
});

test('a signed-in member\'s day allows ten re-asks; everyone else keeps five', async () => {
  const { dailyAiRegenerationsFor } = await import('../domain/regeneration-policy.ts');
  assert.equal(dailyAiRegenerationsFor(false), 5);
  assert.equal(dailyAiRegenerationsFor(true), 10);
  const budget = new ExpoFileAiRegenerationBudget();
  const member = [];
  for (let attempt = 0; attempt < 11; attempt += 1) member.push(await budget.reserve('2026-09-18', dailyAiRegenerationsFor(true)));
  assert.deepEqual(member, [...Array(10).fill(true), false]);
  // Signing out the same day leaves the five a non-member has, already spent.
  assert.equal(await budget.reserve('2026-09-18', dailyAiRegenerationsFor(false)), false);
});
