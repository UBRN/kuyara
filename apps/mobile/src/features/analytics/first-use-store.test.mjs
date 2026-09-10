import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

import { FirstUseTracker } from './application/first-use-tracker.ts';
import { InMemoryFirstUseStore } from './data/in-memory-first-use-store.ts';

const files = new Map();
const createdDirectories = [];

function fileUri(parts) {
  const [root, ...segments] = parts;
  const rootUri = typeof root === 'string' ? root : root.uri;
  return [rootUri.replace(/\/$/, ''), ...segments].join('/');
}

globalThis.__kuyaraFirstUseFileMocks = {
  Directory: class {
    constructor(...parts) {
      this.uri = fileUri(parts);
    }

    create(options) {
      createdDirectories.push([this.uri, options]);
    }
  },
  File: class {
    constructor(...parts) {
      this.uri = fileUri(parts);
    }

    get exists() {
      return files.has(this.uri);
    }

    async text() {
      return files.get(this.uri);
    }

    write(value) {
      files.set(this.uri, value);
    }

    delete() {
      files.delete(this.uri);
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
          const mocks = globalThis.__kuyaraFirstUseFileMocks;
          export const { Directory, File, Paths } = mocks;
        `)}`,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { ExpoFileFirstUseStore } = await import(
  './data/expo-file-first-use-store.ts'
);

const storePath = 'file:///documents/kuyara/analytics/first-uses.json';

test('the tracker returns true only once, including concurrent attempts', async () => {
  const tracker = new FirstUseTracker(new InMemoryFirstUseStore());

  assert.deepEqual(
    await Promise.all([
      tracker.markFirstUse('closet'),
      tracker.markFirstUse('closet'),
    ]),
    [true, false],
  );
  assert.equal(await tracker.markFirstUse('manual_refresh'), true);
  assert.equal(await tracker.markFirstUse('manual_refresh'), false);
});

test('the in-memory store can start with already-used features', async () => {
  const store = new InMemoryFirstUseStore(['notifications']);

  assert.equal(await store.has('notifications'), true);
  assert.equal(await store.has('closet'), false);
});

test('the file store treats missing and corrupt content as unused', async (t) => {
  files.clear();
  createdDirectories.length = 0;
  t.after(() => files.clear());
  const store = new ExpoFileFirstUseStore();

  assert.equal(await store.has('closet'), false);
  files.set(storePath, '{not-json');
  assert.equal(await store.has('closet'), false);
  files.set(storePath, JSON.stringify(['unknown-feature']));
  assert.equal(await store.has('closet'), false);
});

test('the file store writes only the feature set in the document directory', async (t) => {
  files.clear();
  createdDirectories.length = 0;
  t.after(() => files.clear());
  const store = new ExpoFileFirstUseStore();

  await store.markUsed('notifications');
  await store.markUsed('closet');

  assert.equal(await store.has('notifications'), true);
  assert.equal(await store.has('closet'), true);
  assert.deepEqual(JSON.parse(files.get(storePath)), ['closet', 'notifications']);
  assert.deepEqual(createdDirectories.at(-1), [
    'file:///documents/kuyara/analytics',
    { idempotent: true, intermediates: true },
  ]);
});

test('clearing forgets every first use in both stores', async (t) => {
  files.clear();
  t.after(() => files.clear());
  const memory = new InMemoryFirstUseStore(['closet']);
  await memory.clear();
  assert.equal(await memory.has('closet'), false);

  const file = new ExpoFileFirstUseStore();
  await file.markUsed('closet');
  await file.clear();
  assert.equal(files.has(storePath), false);
  assert.equal(await file.has('closet'), false);
  await file.clear();
});
