import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { fileUri } from '../../../../test/file-uri.mjs';

// Mock the device file to verify the once-a-day claim and the kept record.
const files = new Map();
let readFailure = false;
let writeFailure = false;

function throwOnRead() {
  if (readFailure) throw new Error('read failed');
}

function throwOnWrite() {
  if (writeFailure) throw new Error('write failed');
}

globalThis.__kuyaraPreviewFileMocks = {
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
          const mocks = globalThis.__kuyaraPreviewFileMocks;
          export const { Directory, File, Paths } = mocks;
        `)}`,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { ExpoFileRecommendationPreviewDataSource } = await import(
  './expo-file-recommendation-preview-data-source.ts'
);

const previewPath = 'file:///documents/kuyara/recommendation/tomorrow-preview.json';
const record = {
  id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  localProfileId: 'profile-one',
  weatherSnapshotId: 'weather-one',
  locationKey: 'manual:sample.istanbul',
  generationMode: 'ai-assisted',
  contextJson: '{}',
  outfitsJson: '[]',
  createdAt: '2026-10-01T19:00:00.000Z',
  updatedAt: '2026-10-01T19:00:00.000Z',
};

test.beforeEach(() => {
  files.clear();
  readFailure = false;
  writeFailure = false;
});

test('a day is claimed once per profile, across instances and concurrent claims', async () => {
  const claims = await Promise.all(Array.from({ length: 3 }, () =>
    new ExpoFileRecommendationPreviewDataSource().claim('profile-one', '2026-10-02')));
  assert.deepEqual(claims, [true, false, false]);
  const source = new ExpoFileRecommendationPreviewDataSource();
  assert.equal(await source.claim('profile-one', '2026-10-03'), true);
  assert.equal(await source.claim('profile-two', '2026-10-03'), true);
});

test('the saved record keeps the claim and belongs to its own profile', async () => {
  const source = new ExpoFileRecommendationPreviewDataSource();
  assert.equal(await source.claim('profile-one', '2026-10-02'), true);
  assert.equal(await source.replaceSnapshot(record), record);
  assert.deepEqual(await source.getSnapshot('profile-one'), record);
  assert.equal(await source.getSnapshot('profile-two'), null);
  assert.equal(await source.claim('profile-one', '2026-10-02'), false);
});

test('a malformed file holds no claim; an unreadable or unwritable one denies it', async () => {
  const source = new ExpoFileRecommendationPreviewDataSource();
  for (const stored of ['not json', 'null', '[]', '{"dayKey":"2026-10-02"}']) {
    files.set(previewPath, stored);
    assert.equal(await source.claim('profile-one', '2026-10-02'), true, stored);
  }
  files.clear();
  readFailure = true;
  assert.equal(await source.claim('profile-one', '2026-10-02'), false);
  readFailure = false;
  writeFailure = true;
  assert.equal(await source.claim('profile-one', '2026-10-02'), false);
  assert.equal(files.has(previewPath), false);
});
