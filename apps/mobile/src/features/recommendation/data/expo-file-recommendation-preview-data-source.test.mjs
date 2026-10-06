import assert from 'node:assert/strict';
import test from 'node:test';
import { installFakeExpoFileSystem } from '../../../../test/fakes/expo-file-system.mjs';

// Mock the device file to verify the once-a-day claim and the kept record.
const fileSystem = installFakeExpoFileSystem();
const { files } = fileSystem;

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
  fileSystem.readFailure = false;
  fileSystem.writeFailure = false;
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
  fileSystem.readFailure = true;
  assert.equal(await source.claim('profile-one', '2026-10-02'), false);
  fileSystem.readFailure = false;
  fileSystem.writeFailure = true;
  assert.equal(await source.claim('profile-one', '2026-10-02'), false);
  assert.equal(files.has(previewPath), false);
});
