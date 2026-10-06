import assert from 'node:assert/strict';
import test from 'node:test';
import { installFakeExpoFileSystem } from '../../../../test/fakes/expo-file-system.mjs';

// The real file adapter behind history photos, run against a stand-in for expo-file-system.
const fileSystem = installFakeExpoFileSystem();
const { files: nativeFiles, createdDirectories } = fileSystem;

const { ExpoHistoryPhotoStorage } = await import('./expo-history-photo-storage.ts');

const photoId = '418f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const stagedUri = 'file:///cache/kuyara/wardrobe/staging/518f0f4d-1d45-4ae7-a8f1-796e8297d3b4.jpg';
const storedPath = `kuyara/history/photos/${photoId}.jpg`;
const storedUri = `file:///documents/${storedPath}`;

function reset(t) {
  nativeFiles.clear();
  createdDirectories.length = 0;
  fileSystem.copyFailure = null;
  fileSystem.deleteFailure = null;
  t.after(() => { nativeFiles.clear(); fileSystem.copyFailure = null; fileSystem.deleteFailure = null; });
}

test('copyStaged copies a staged file to the managed history path', async (t) => {
  reset(t);
  nativeFiles.set(stagedUri, '');
  const storage = new ExpoHistoryPhotoStorage(() => photoId.toUpperCase());
  assert.equal(await storage.copyStaged(stagedUri), storedPath);
  assert.equal(nativeFiles.has(storedUri), true);
  assert.equal(nativeFiles.has(stagedUri), true, 'the copy leaves the staged file for discardStaged');
});

test('copyStaged and discardStaged accept only an existing file inside the staging directory', async (t) => {
  reset(t);
  const storage = new ExpoHistoryPhotoStorage(() => photoId);
  const outside = [
    'file:///cache/other/a.jpg',
    'file:///cache/kuyara/wardrobe/staging-evil/a.jpg',
    'file:///documents/kuyara/history/photos/a.jpg',
  ];
  for (const uri of outside) nativeFiles.set(uri, '');
  for (const uri of [...outside, stagedUri]) {
    // `stagedUri` itself is missing here, so a staged path that does not exist is refused too.
    await assert.rejects(() => storage.copyStaged(uri), /Invalid staged history photo/, uri);
    await assert.rejects(() => storage.discardStaged(uri), /Invalid staged history photo/, uri);
  }
  assert.equal(nativeFiles.has(storedUri), false, 'nothing was copied');
  for (const uri of outside) assert.equal(nativeFiles.has(uri), true, `${uri} was not deleted`);
});

test('discardStaged deletes the staged file', async (t) => {
  reset(t);
  nativeFiles.set(stagedUri, '');
  await new ExpoHistoryPhotoStorage(() => photoId).discardStaged(stagedUri);
  assert.equal(nativeFiles.has(stagedUri), false);
});

test('copyStaged rejects an identifier that is not a UUID v4 and copies nothing', async (t) => {
  reset(t);
  nativeFiles.set(stagedUri, '');
  const storage = new ExpoHistoryPhotoStorage(() => '../../evil');
  await assert.rejects(() => storage.copyStaged(stagedUri), /Invalid history photo identifier/);
  assert.deepEqual([...nativeFiles.keys()], [stagedUri]);
});

test('a failing copy leaves no partial destination behind and rethrows the copy error', async (t) => {
  reset(t);
  nativeFiles.set(stagedUri, '');
  fileSystem.copyFailure = new Error('copy failed');
  const storage = new ExpoHistoryPhotoStorage(() => photoId);
  await assert.rejects(() => storage.copyStaged(stagedUri), (error) => error === fileSystem.copyFailure);
  assert.equal(nativeFiles.has(storedUri), false);
  assert.equal(nativeFiles.has(stagedUri), true);
});

test('a failing copy whose partial file cannot be removed still rethrows the copy error', async (t) => {
  reset(t);
  nativeFiles.set(stagedUri, '');
  fileSystem.copyFailure = new Error('copy failed');
  fileSystem.deleteFailure = new Error('delete failed');
  const storage = new ExpoHistoryPhotoStorage(() => photoId);
  await assert.rejects(() => storage.copyStaged(stagedUri), (error) => error === fileSystem.copyFailure);
});

test('deleteStored removes a managed file, tolerates a missing one and never touches an unmanaged path', async (t) => {
  reset(t);
  const storage = new ExpoHistoryPhotoStorage(() => photoId);
  const legacy = 'file:///documents/wardrobe/photos/legacy.jpg';
  const traversal = 'file:///documents/../x.jpg';
  nativeFiles.set(legacy, '');
  nativeFiles.set(traversal, '');
  nativeFiles.set(storedUri, '');

  await storage.deleteStored(storedPath);
  assert.equal(nativeFiles.has(storedUri), false);
  await storage.deleteStored(storedPath);
  await storage.deleteStored('wardrobe/photos/legacy.jpg');
  await storage.deleteStored('../x.jpg');
  assert.equal(nativeFiles.has(legacy), true);
  assert.equal(nativeFiles.has(traversal), true);
});

test('resolveUri answers the file uri only for an existing managed photo and never throws', async (t) => {
  reset(t);
  const storage = new ExpoHistoryPhotoStorage(() => photoId);
  assert.equal(storage.resolveUri(null), null);
  assert.equal(storage.resolveUri(storedPath), null, 'a missing file is no photo');
  nativeFiles.set(storedUri, '');
  assert.equal(storage.resolveUri(storedPath), storedUri);
  nativeFiles.set('file:///documents/wardrobe/photos/legacy.jpg', '');
  assert.equal(storage.resolveUri('wardrobe/photos/legacy.jpg'), null, 'an unmanaged path is no photo');
  assert.equal(storage.resolveUri('../x.jpg'), null);
});
