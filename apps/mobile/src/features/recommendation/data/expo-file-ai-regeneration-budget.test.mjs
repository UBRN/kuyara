import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// Mock the device file to verify durable, serialized reservations.
const files = new Map();
let readFailure = false;
let writeFailure = false;

function fileUri(parts) {
  const [root, ...segments] = parts;
  const rootUri = typeof root === 'string' ? root : root.uri;
  return [rootUri.replace(/\/$/, ''), ...segments].join('/');
}

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

test('malformed, unreadable and unwritable stores deny a reservation', async () => {
  const budget = new ExpoFileAiRegenerationBudget();
  for (const stored of ['not json', 'null', '[]', '{"dayKey":"2026-09-18"}',
    '{"dayKey":"2026-09-18","count":"2"}', '{"dayKey":"2026-09-18","count":-1}']) {
    files.set(budgetPath, stored);
    assert.equal(await budget.reserve('2026-09-18'), false, stored);
  }
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
