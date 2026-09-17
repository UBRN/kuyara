import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// The adapter is the only thing between a device file and two `void`-ed calls, so the file
// system is mocked rather than the adapter: a rejection here would leave an unhandled promise
// on the device and nothing else would report it.
const files = new Map();
let failure = null;

function fileUri(parts) {
  const [root, ...segments] = parts;
  const rootUri = typeof root === 'string' ? root : root.uri;
  return [rootUri.replace(/\/$/, ''), ...segments].join('/');
}

function throwWhenFailing() {
  if (failure) throw new Error(failure);
}

globalThis.__kuyaraRegenerationBudgetFileMocks = {
  Directory: class {
    constructor(...parts) {
      this.uri = fileUri(parts);
    }

    create() {
      throwWhenFailing();
    }
  },
  File: class {
    constructor(...parts) {
      this.uri = fileUri(parts);
    }

    get exists() {
      throwWhenFailing();
      return files.has(this.uri);
    }

    async text() {
      throwWhenFailing();
      return files.get(this.uri);
    }

    write(value) {
      throwWhenFailing();
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
  failure = null;
});

test('a missing file reads as no regenerations today', async () => {
  assert.equal(await new ExpoFileAiRegenerationBudget().usedToday('2026-09-18'), 0);
});

test('recording counts up and the count is read back for the same day', async () => {
  const budget = new ExpoFileAiRegenerationBudget();

  await budget.record('2026-09-18');
  await budget.record('2026-09-18');

  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 2 }));
  assert.equal(await budget.usedToday('2026-09-18'), 2);
});

test("yesterday's entry reads as zero and is overwritten rather than cleaned up", async () => {
  const budget = new ExpoFileAiRegenerationBudget();
  files.set(budgetPath, JSON.stringify({ dayKey: '2026-09-17', count: 3 }));

  assert.equal(await budget.usedToday('2026-09-18'), 0);

  await budget.record('2026-09-18');
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 1 }));
});

test('a malformed or wrongly shaped file reads as zero', async () => {
  const budget = new ExpoFileAiRegenerationBudget();

  for (const stored of ['not json', 'null', '[]', '{"dayKey":"2026-09-18"}',
    '{"dayKey":"2026-09-18","count":"2"}', '{"dayKey":"2026-09-18","count":-1}']) {
    files.set(budgetPath, stored);
    assert.equal(await budget.usedToday('2026-09-18'), 0, stored);
  }
});

// Finding 3 of the presubmit read: both call sites are `void`-ed, so a rejection would reach
// no catch at all.
test('a throwing file system leaves neither call rejecting', async () => {
  const budget = new ExpoFileAiRegenerationBudget();
  failure = 'file system unavailable';

  assert.equal(await budget.usedToday('2026-09-18'), 0);
  assert.equal(await budget.record('2026-09-18'), undefined);
});

test('a write that fails leaves the previous count in place and allows one more regeneration', async () => {
  const budget = new ExpoFileAiRegenerationBudget();
  files.set(budgetPath, JSON.stringify({ dayKey: '2026-09-18', count: 1 }));

  failure = 'disk full';
  await budget.record('2026-09-18');
  failure = null;

  assert.equal(await budget.usedToday('2026-09-18'), 1);
});
