import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// The real file adapter behind history photos, run against a stand-in for expo-file-system
// (the same registerHooks pattern as the wardrobe photo tests).
const nativeFiles = new Set();
const createdDirectories = [];
let nativeCopyFailure = null;

function nativeUri(parts) {
  const [root, ...segments] = parts;
  const rootUri = typeof root === 'string' ? root : root.uri;
  return [rootUri.replace(/\/$/, ''), ...segments].join('/');
}

globalThis.__kuyaraHistoryPhotoNativeMocks = {
  Directory: class {
    constructor(...parts) { this.uri = `${nativeUri(parts)}/`; }
    create() { createdDirectories.push(this.uri); }
  },
  File: class {
    constructor(...parts) { this.uri = nativeUri(parts); }
    get exists() { return nativeFiles.has(this.uri); }
    async copy(destination) {
      nativeFiles.add(destination.uri);
      if (nativeCopyFailure) throw nativeCopyFailure;
    }
    delete() { nativeFiles.delete(this.uri); }
  },
  Paths: { cache: { uri: 'file:///cache' }, document: { uri: 'file:///documents' } },
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-file-system') {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
          const mocks = globalThis.__kuyaraHistoryPhotoNativeMocks;
          export const { Directory, File, Paths } = mocks;
        `)}`,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { ExpoHistoryPhotoStorage } = await import('./expo-history-photo-storage.ts');

const photoId = '418f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const stagedUri = 'file:///cache/kuyara/wardrobe/staging/518f0f4d-1d45-4ae7-a8f1-796e8297d3b4.jpg';
const storedPath = `kuyara/history/photos/${photoId}.jpg`;
const storedUri = `file:///documents/${storedPath}`;

function reset(t) {
  nativeFiles.clear();
  createdDirectories.length = 0;
  nativeCopyFailure = null;
  t.after(() => { nativeFiles.clear(); nativeCopyFailure = null; });
}

test('copyStaged copies a staged file to the managed history path', async (t) => {
  reset(t);
  nativeFiles.add(stagedUri);
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
  for (const uri of outside) nativeFiles.add(uri);
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
  nativeFiles.add(stagedUri);
  await new ExpoHistoryPhotoStorage(() => photoId).discardStaged(stagedUri);
  assert.equal(nativeFiles.has(stagedUri), false);
});

test('copyStaged rejects an identifier that is not a UUID v4 and copies nothing', async (t) => {
  reset(t);
  nativeFiles.add(stagedUri);
  const storage = new ExpoHistoryPhotoStorage(() => '../../evil');
  await assert.rejects(() => storage.copyStaged(stagedUri), /Invalid history photo identifier/);
  assert.deepEqual([...nativeFiles], [stagedUri]);
});

test('a failing copy leaves no partial destination behind and rethrows the copy error', async (t) => {
  reset(t);
  nativeFiles.add(stagedUri);
  nativeCopyFailure = new Error('copy failed');
  const storage = new ExpoHistoryPhotoStorage(() => photoId);
  await assert.rejects(() => storage.copyStaged(stagedUri), (error) => error === nativeCopyFailure);
  assert.equal(nativeFiles.has(storedUri), false);
  assert.equal(nativeFiles.has(stagedUri), true);
});

test('deleteStored removes a managed file, tolerates a missing one and never touches an unmanaged path', async (t) => {
  reset(t);
  const storage = new ExpoHistoryPhotoStorage(() => photoId);
  const legacy = 'file:///documents/wardrobe/photos/legacy.jpg';
  const traversal = 'file:///documents/../x.jpg';
  nativeFiles.add(legacy);
  nativeFiles.add(traversal);
  nativeFiles.add(storedUri);

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
  nativeFiles.add(storedUri);
  assert.equal(storage.resolveUri(storedPath), storedUri);
  nativeFiles.add('file:///documents/wardrobe/photos/legacy.jpg');
  assert.equal(storage.resolveUri('wardrobe/photos/legacy.jpg'), null, 'an unmanaged path is no photo');
  assert.equal(storage.resolveUri('../x.jpg'), null);
});
