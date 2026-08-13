import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { WardrobeApplicationController } from './application/wardrobe-application-controller.ts';
import { LocalWardrobePhotoManager } from './application/wardrobe-photo-manager.ts';
import {
  createManagedWardrobePhotoRelativePath,
  isManagedWardrobePhotoRelativePath,
} from './data/wardrobe-photo-path.ts';
import {
  calculateWardrobePhotoResize,
  wardrobePhotoPolicy,
} from './domain/wardrobe-photo.ts';

const profileId = '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const itemId = '118f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const stagedPhoto = Object.freeze({
  id: '218f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  previewUri: 'file:///private/cache/kuyara/wardrobe/staging/staged.jpg',
});
const oldPath =
  'kuyara/wardrobe/photos/318f0f4d-1d45-4ae7-a8f1-796e8297d3b4.jpg';
const newPath =
  'kuyara/wardrobe/photos/418f0f4d-1d45-4ae7-a8f1-796e8297d3b4.jpg';

function wardrobeItem(photoRelativePath = oldPath) {
  return {
    id: itemId,
    localProfileId: profileId,
    name: 'Rain shell',
    category: 'outerwear',
    garmentTypeId: 'rain_jacket',
    color: null,
    colorFamily: 'blue',
    thermalLevelOverride: null,
    waterProtectionOverride: null,
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
    photoRelativePath,
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T10:05:00.000Z',
    deletedAt: null,
  };
}

test('photo policy preserves aspect ratio, caps the long edge, and never upscales', () => {
  assert.deepEqual(wardrobePhotoPolicy, {
    maximumLongEdge: 1600,
    jpegQuality: 0.8,
    format: 'jpeg',
  });
  assert.deepEqual(calculateWardrobePhotoResize({ width: 4000, height: 3000 }), {
    width: 1600,
    height: null,
    outputWidth: 1600,
    outputHeight: 1200,
  });
  assert.deepEqual(calculateWardrobePhotoResize({ width: 1200, height: 2400 }), {
    width: null,
    height: 1600,
    outputWidth: 800,
    outputHeight: 1600,
  });
  assert.equal(calculateWardrobePhotoResize({ width: 1200, height: 800 }), null);
  assert.throws(() => calculateWardrobePhotoResize({ width: 0, height: 800 }));
});

test('photo manager treats picker cancellation as no change and stages processed output', async () => {
  const calls = [];
  const canceled = new LocalWardrobePhotoManager(
    { async pickPhoto() { calls.push('pick'); return null; } },
    { async processPhoto() { calls.push('process'); throw new Error('unexpected'); } },
    { async stagePhoto() { calls.push('stage'); throw new Error('unexpected'); } },
  );
  assert.equal(await canceled.preparePhoto(), null);
  assert.deepEqual(calls, ['pick']);

  const picked = { uri: 'file:///picked.heic', width: 2400, height: 1200 };
  const processed = { uri: 'file:///cache/processed.jpg', width: 1600, height: 800 };
  const manager = new LocalWardrobePhotoManager(
    { async pickPhoto() { calls.push('pick-ready'); return picked; } },
    {
      async processPhoto(value) {
        calls.push('process-ready');
        assert.equal(value, picked);
        return processed;
      },
    },
    {
      async stagePhoto(value) {
        calls.push('stage-ready');
        assert.equal(value, processed);
        return stagedPhoto;
      },
    },
  );
  assert.equal(await manager.preparePhoto(), stagedPhoto);
  assert.deepEqual(calls, ['pick', 'pick-ready', 'process-ready', 'stage-ready']);
});

test('managed photo paths are unique UUID JPEG paths and reject unmanaged deletion targets', () => {
  const first = createManagedWardrobePhotoRelativePath(
    '518f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  );
  const second = createManagedWardrobePhotoRelativePath(
    '618f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  );
  assert.notEqual(first, second);
  assert.equal(isManagedWardrobePhotoRelativePath(first), true);
  assert.equal(isManagedWardrobePhotoRelativePath('wardrobe/photos/legacy.jpg'), false);
  assert.equal(isManagedWardrobePhotoRelativePath('kuyara/wardrobe/photos/../secret.jpg'), false);
  assert.throws(() => createManagedWardrobePhotoRelativePath('not-a-uuid'));
});

test('Expo adapters use the single-image privacy options and current processing/storage APIs', async () => {
  const adapterSource = await readFile(
    new URL('./data/expo-wardrobe-photo-adapters.ts', import.meta.url),
    'utf8',
  );
  assert.match(adapterSource, /mediaTypes:\s*\['images'\]/);
  assert.match(adapterSource, /allowsMultipleSelection:\s*false/);
  assert.match(adapterSource, /selectionLimit:\s*1/);
  assert.match(adapterSource, /base64:\s*false/);
  assert.match(adapterSource, /exif:\s*false/);
  assert.doesNotMatch(adapterSource, /launchCameraAsync|requestMediaLibraryPermissionsAsync/);
  assert.match(adapterSource, /ImageManipulator\.manipulate\(/);
  assert.match(adapterSource, /renderAsync\(\)/);
  assert.match(adapterSource, /SaveFormat\.JPEG/);
  assert.doesNotMatch(adapterSource, /manipulateAsync\(/);
  assert.match(adapterSource, /new Directory\(\s*Paths\.document/);
  assert.match(adapterSource, /new File\(/);
  assert.doesNotMatch(adapterSource, /expo-file-system\/legacy/);
});

test('native config blocks camera and microphone permissions and localizes photo access', async () => {
  const [appConfig, english, turkish] = await Promise.all([
    readFile(new URL('../../../app.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../../localization/native/en.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../../localization/native/tr.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const pickerPlugin = appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
  );
  assert.equal(pickerPlugin[1].cameraPermission, false);
  assert.equal(pickerPlugin[1].microphonePermission, false);
  assert.equal(appConfig.expo.ios.infoPlist.CFBundleAllowMixedLocalizations, true);
  assert.equal(appConfig.expo.locales.en, './src/localization/native/en.json');
  assert.equal(appConfig.expo.locales.tr, './src/localization/native/tr.json');
  assert.ok(english.ios.NSPhotoLibraryUsageDescription);
  assert.ok(turkish.ios.NSPhotoLibraryUsageDescription);
});

function photoManager(events, options = {}) {
  return {
    async preparePhoto() { return stagedPhoto; },
    async commitStagedPhoto() {
      events.push('commit-new');
      return { relativePath: newPath, previewUri: 'file:///documents/new.jpg' };
    },
    async discardStagedPhoto() { events.push('discard-staging'); },
    async deleteStoredPhoto(path) {
      events.push(path === oldPath ? 'delete-old' : 'delete-new');
      if (options.failOldCleanup && path === oldPath) {
        throw new Error('cleanup failed');
      }
    },
    resolvePhotoUri(path) { return path ? `file:///documents/${path}` : null; },
  };
}

function repository(events, options = {}) {
  let current = options.current ?? wardrobeItem();
  return {
    async listActiveItems() { return current && !current.deletedAt ? [current] : []; },
    async getActiveItem() { events.push('read-current'); return current; },
    async getItemIncludingDeleted() { return current; },
    async createItem(input) {
      events.push('write-create');
      if (options.failCreate) throw new Error('create failed');
      current = wardrobeItem(input.photoRelativePath ?? null);
      return current;
    },
    async updateItem(input) {
      events.push('write-update');
      if (options.failUpdate) throw new Error('update failed');
      current = { ...current, ...input };
      return current;
    },
    async softDeleteItem() {
      events.push('write-soft-delete');
      if (options.failSoftDelete) throw new Error('soft delete failed');
      current = { ...current, photoRelativePath: null, deletedAt: current.updatedAt };
      return current;
    },
  };
}

async function readyController(events, repositoryOptions = {}, managerOptions = {}) {
  const repo = repository(events, repositoryOptions);
  let cleanupReports = 0;
  const controller = new WardrobeApplicationController(
    profileId,
    async () => repo,
    photoManager(events, managerOptions),
    () => { cleanupReports += 1; },
  );
  await controller.initialize();
  return { controller, cleanupReports: () => cleanupReports };
}

test('create keeps DB and files consistent on success and failure', async () => {
  const successEvents = [];
  const success = await readyController(successEvents, { current: null });
  const created = await success.controller.createItem(
    { garmentTypeId: 'rain_jacket' },
    { kind: 'replace', stagedPhoto },
  );
  assert.equal(created.photoRelativePath, newPath);
  assert.deepEqual(successEvents, ['commit-new', 'write-create', 'discard-staging']);

  const failureEvents = [];
  const failure = await readyController(failureEvents, {
    current: null,
    failCreate: true,
  });
  await assert.rejects(() =>
    failure.controller.createItem(
      { garmentTypeId: 'rain_jacket' },
      { kind: 'replace', stagedPhoto },
    ),
  );
  assert.deepEqual(failureEvents, ['commit-new', 'write-create', 'delete-new']);
});

test('replace preserves the old photo on failure and removes it only after success', async () => {
  const failureEvents = [];
  const failure = await readyController(failureEvents, { failUpdate: true });
  await assert.rejects(() =>
    failure.controller.updateItem(
      itemId,
      { garmentTypeId: 'rain_jacket' },
      { kind: 'replace', stagedPhoto },
    ),
  );
  assert.deepEqual(failureEvents, [
    'read-current',
    'commit-new',
    'write-update',
    'delete-new',
  ]);

  const successEvents = [];
  const success = await readyController(successEvents);
  const updated = await success.controller.updateItem(
    itemId,
    { garmentTypeId: 'rain_jacket' },
    { kind: 'replace', stagedPhoto },
  );
  assert.equal(updated.photoRelativePath, newPath);
  assert.deepEqual(successEvents, [
    'read-current',
    'commit-new',
    'write-update',
    'discard-staging',
    'delete-old',
  ]);
});

test('remove and soft delete clear the path before deleting the previous photo', async () => {
  const failureEvents = [];
  const failure = await readyController(failureEvents, { failUpdate: true });
  await assert.rejects(() =>
    failure.controller.updateItem(
      itemId,
      { garmentTypeId: 'rain_jacket' },
      { kind: 'remove' },
    ),
  );
  assert.deepEqual(failureEvents, ['read-current', 'write-update']);

  const successEvents = [];
  const success = await readyController(successEvents);
  const updated = await success.controller.updateItem(
    itemId,
    { garmentTypeId: 'rain_jacket' },
    { kind: 'remove' },
  );
  assert.equal(updated.photoRelativePath, null);
  assert.deepEqual(successEvents, ['read-current', 'write-update', 'delete-old']);

  const failedDeleteEvents = [];
  const failedSoftDelete = await readyController(failedDeleteEvents, {
    failSoftDelete: true,
  });
  await assert.rejects(() => failedSoftDelete.controller.softDeleteItem(itemId));
  assert.deepEqual(failedDeleteEvents, ['write-soft-delete']);

  const deleteEvents = [];
  const softDelete = await readyController(deleteEvents);
  const deleted = await softDelete.controller.softDeleteItem(itemId);
  assert.equal(deleted.photoRelativePath, null);
  assert.deepEqual(deleteEvents, ['write-soft-delete', 'delete-old']);
  assert.deepEqual(softDelete.controller.getSnapshot().items, []);

  const noPhotoEvents = [];
  const noPhoto = await readyController(noPhotoEvents, {
    current: wardrobeItem(null),
  });
  await noPhoto.controller.softDeleteItem(itemId);
  assert.deepEqual(noPhotoEvents, ['write-soft-delete']);
});

test('cleanup failure does not roll back a successful database update', async () => {
  const events = [];
  const result = await readyController(events, {}, { failOldCleanup: true });
  const updated = await result.controller.updateItem(
    itemId,
    { garmentTypeId: 'rain_jacket' },
    { kind: 'replace', stagedPhoto },
  );
  assert.equal(updated.photoRelativePath, newPath);
  assert.equal(result.cleanupReports(), 1);

  const deleteEvents = [];
  const deleteResult = await readyController(
    deleteEvents,
    {},
    { failOldCleanup: true },
  );
  const deleted = await deleteResult.controller.softDeleteItem(itemId);
  assert.equal(deleted.photoRelativePath, null);
  assert.deepEqual(deleteEvents, ['write-soft-delete', 'delete-old']);
  assert.deepEqual(deleteResult.controller.getSnapshot().items, []);
  assert.equal(deleteResult.cleanupReports(), 1);
});
