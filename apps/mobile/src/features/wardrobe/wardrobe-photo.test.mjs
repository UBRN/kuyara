import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';

import { WardrobeApplicationController } from './application/wardrobe-application-controller.ts';
import { LocalWardrobePhotoManager } from './application/wardrobe-photo-manager.ts';
import { fileUri as nativeFileUri } from '../../../test/file-uri.mjs';
import {
  createManagedWardrobePhotoRelativePath,
  isManagedWardrobePhotoRelativePath,
} from './domain/wardrobe-photo-path.ts';
import {
  calculateWardrobePhotoResize,
  classifyWardrobePhotoProblem,
  WardrobeCameraAccessError,
  wardrobePhotoPolicy,
  WardrobePhotoValidationError,
} from './domain/wardrobe-photo.ts';

const nativeImageCalls = [];
const nativeFiles = new Set();
let nativeCopyFailure = null;
let nativeDeleteFailure = null;
let nativeSaveFailure = null;

globalThis.__kuyaraWardrobePhotoNativeMocks = {
  Directory: class {
    create() {}
  },
  File: class {
    constructor(...parts) {
      this.uri = nativeFileUri(parts);
    }

    get exists() {
      return nativeFiles.has(this.uri);
    }

    async copy(destination) {
      nativeFiles.add(destination.uri);
      if (nativeCopyFailure) throw nativeCopyFailure;
    }

    delete() {
      if (nativeDeleteFailure) throw nativeDeleteFailure;
      nativeFiles.delete(this.uri);
    }
  },
  ImageManipulator: {
    manipulate(uri) {
      nativeImageCalls.push(['manipulate', uri]);
      return {
        resize(dimensions) {
          nativeImageCalls.push(['resize', dimensions]);
        },
        async renderAsync() {
          nativeImageCalls.push(['render']);
          return {
            async saveAsync(options) {
              nativeImageCalls.push(['save', options]);
              if (nativeSaveFailure) throw nativeSaveFailure;
              return {
                uri: 'file:///cache/processed.jpg',
                width: 1600,
                height: 1200,
              };
            },
          };
        },
      };
    },
  },
  Paths: {
    cache: { uri: 'file:///cache' },
    document: { uri: 'file:///documents' },
  },
  // The system camera: what the permission request answers, what the capture returns, and
  // the order of the native calls the adapter made.
  camera: {
    calls: [],
    permission: { granted: true, status: 'granted', canAskAgain: true, expires: 'never' },
    result: { canceled: true, assets: null },
  },
  Platform: { OS: 'ios' },
};

const nativeMockModules = {
  'expo-file-system': `
    const mocks = globalThis.__kuyaraWardrobePhotoNativeMocks;
    export const { Directory, File, Paths } = mocks;
  `,
  'expo-image-manipulator': `
    export const ImageManipulator =
      globalThis.__kuyaraWardrobePhotoNativeMocks.ImageManipulator;
    export const SaveFormat = Object.freeze({ JPEG: 'jpeg' });
  `,
  'expo-image-picker': `
    const camera = globalThis.__kuyaraWardrobePhotoNativeMocks.camera;
    export const launchImageLibraryAsync = async () => null;
    export const requestCameraPermissionsAsync = async () => {
      camera.calls.push('request-permission');
      return camera.permission;
    };
    export const launchCameraAsync = async (options) => {
      camera.calls.push(['launch-camera', options]);
      if (camera.rejection) throw camera.rejection;
      return camera.result;
    };
  `,
  // A live binding, so a test can stand the adapter on a Simulator.
  'expo-device': `
    export let isDevice = true;
    globalThis.__kuyaraWardrobePhotoNativeMocks.setIsDevice = (value) => { isDevice = value; };
  `,
  'react-native': `
    export const Platform = globalThis.__kuyaraWardrobePhotoNativeMocks.Platform;
  `,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = nativeMockModules[specifier];
    if (source) {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(source)}`,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  ExpoPrivateWardrobePhotoStorage,
  ExpoSystemWardrobePhotoPicker,
  ExpoWardrobePhotoProcessor,
} = await import('./data/expo-wardrobe-photo-adapters.ts');

const nativeMocks = globalThis.__kuyaraWardrobePhotoNativeMocks;

function standCamera(t, { permission, result, isDevice = true, os = 'ios' } = {}) {
  const camera = nativeMocks.camera;
  const defaults = { permission: camera.permission, result: camera.result };
  camera.calls.length = 0;
  if (permission) camera.permission = permission;
  if (result) camera.result = result;
  nativeMocks.setIsDevice(isDevice);
  nativeMocks.Platform.OS = os;
  t.after(() => {
    camera.permission = defaults.permission;
    camera.result = defaults.result;
    nativeMocks.setIsDevice(true);
    nativeMocks.Platform.OS = 'ios';
  });
  return camera;
}

const capturedAsset = Object.freeze({
  uri: 'file:///cache/ImagePicker/captured.jpg',
  width: 4032,
  height: 3024,
  type: 'image',
});
// iOS reports a restricted camera (Screen Time, device management) as denied and never
// asks again: `ImagePickerPermissionRequesters.swift` folds `.restricted` into denied.
const deniedPermission = Object.freeze({
  granted: false, status: 'denied', canAskAgain: true, expires: 'never',
});
const restrictedPermission = Object.freeze({
  granted: false, status: 'denied', canAskAgain: false, expires: 'never',
});

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

test('the camera route asks permission only on the tap and returns the library shape', async (t) => {
  const camera = standCamera(t, { result: { canceled: false, assets: [capturedAsset] } });
  const picker = new ExpoSystemWardrobePhotoPicker();
  assert.deepEqual(camera.calls, []);

  const captured = await picker.capturePhoto();

  assert.deepEqual(captured, { uri: capturedAsset.uri, width: 4032, height: 3024 });
  assert.deepEqual(camera.calls, [
    'request-permission',
    ['launch-camera', {
      mediaTypes: ['images'],
      allowsEditing: false,
      base64: false,
      exif: false,
      quality: 1,
    }],
  ]);
});

test('a captured photo runs the same processing and private staging as a chosen one', async () => {
  const calls = [];
  const picked = { uri: 'file:///cache/ImagePicker/captured.jpg', width: 4032, height: 3024 };
  const processed = { uri: 'file:///cache/processed.jpg', width: 1600, height: 1200 };
  const manager = new LocalWardrobePhotoManager(
    {
      async pickPhoto() { calls.push('library'); return picked; },
      async capturePhoto() { calls.push('camera'); return picked; },
    },
    {
      async processPhoto(value) {
        calls.push('process');
        assert.equal(value, picked);
        return processed;
      },
    },
    {
      async stagePhoto(value) {
        calls.push('stage');
        assert.equal(value, processed);
        return stagedPhoto;
      },
    },
  );

  assert.equal(await manager.preparePhoto('camera'), stagedPhoto);
  assert.equal(await manager.preparePhoto('library'), stagedPhoto);
  assert.equal(await manager.preparePhoto(), stagedPhoto);
  assert.deepEqual(calls, [
    'camera', 'process', 'stage',
    'library', 'process', 'stage',
    'library', 'process', 'stage',
  ]);
});

test('a denied camera permission rejects as denied and never opens the camera', async (t) => {
  const camera = standCamera(t, { permission: deniedPermission });
  await assert.rejects(
    () => new ExpoSystemWardrobePhotoPicker().capturePhoto(),
    (error) => error instanceof WardrobeCameraAccessError && error.reason === 'denied',
  );
  assert.deepEqual(camera.calls, ['request-permission']);
});

test('a restricted camera rejects as denied and never opens the camera', async (t) => {
  const camera = standCamera(t, { permission: restrictedPermission });
  await assert.rejects(
    () => new ExpoSystemWardrobePhotoPicker().capturePhoto(),
    (error) => error instanceof WardrobeCameraAccessError && error.reason === 'denied',
  );
  assert.deepEqual(camera.calls, ['request-permission']);
});

test('an iOS Simulator rejects as unavailable after the prompt, before UIKit is asked for a camera', async (t) => {
  // UIImagePickerController throws an uncatchable exception for a source type the device
  // lacks, and expo-image-picker does not check, so the adapter must not launch it.
  const camera = standCamera(t, {
    isDevice: false,
    result: { canceled: false, assets: [capturedAsset] },
  });
  await assert.rejects(
    () => new ExpoSystemWardrobePhotoPicker().capturePhoto(),
    (error) => error instanceof WardrobeCameraAccessError && error.reason === 'unavailable',
  );
  assert.deepEqual(camera.calls, ['request-permission']);
});

test('an Android emulator still opens the camera; Android checks for a camera itself', async (t) => {
  const camera = standCamera(t, {
    isDevice: false,
    os: 'android',
    result: { canceled: false, assets: [capturedAsset] },
  });
  assert.deepEqual(
    await new ExpoSystemWardrobePhotoPicker().capturePhoto(),
    { uri: capturedAsset.uri, width: 4032, height: 3024 },
  );
  assert.equal(camera.calls.length, 2);
});

test('a cancelled camera is no change: nothing is processed or staged', async (t) => {
  const camera = standCamera(t, { result: { canceled: true, assets: null } });
  assert.equal(await new ExpoSystemWardrobePhotoPicker().capturePhoto(), null);
  assert.equal(camera.calls.length, 2);

  const calls = [];
  const manager = new LocalWardrobePhotoManager(
    { async capturePhoto() { calls.push('camera'); return null; } },
    { async processPhoto() { calls.push('process'); throw new Error('unexpected'); } },
    { async stagePhoto() { calls.push('stage'); throw new Error('unexpected'); } },
  );
  assert.equal(await manager.preparePhoto('camera'), null);
  assert.deepEqual(calls, ['camera']);
});

test('Android without a camera app rejects as unavailable, not as a failed photo', async (t) => {
  // expo-image-picker's Android `launchCameraAsync` throws `MissingActivityToHandleIntent`
  // before opening anything; Expo infers the code from the class name.
  const camera = standCamera(t, { os: 'android' });
  camera.rejection = Object.assign(new Error('Failed to resolve activity'), {
    code: 'ERR_MISSING_ACTIVITY_TO_HANDLE_INTENT',
  });
  t.after(() => { camera.rejection = null; });
  await assert.rejects(
    () => new ExpoSystemWardrobePhotoPicker().capturePhoto(),
    (error) => error instanceof WardrobeCameraAccessError && error.reason === 'unavailable',
  );

  const other = new Error('camera failed');
  camera.rejection = other;
  await assert.rejects(() => new ExpoSystemWardrobePhotoPicker().capturePhoto(), (error) => error === other);
});

test('a captured photo is validated like a chosen one', async (t) => {
  standCamera(t, {
    result: { canceled: false, assets: [{ ...capturedAsset, type: 'video' }] },
  });
  await assert.rejects(
    () => new ExpoSystemWardrobePhotoPicker().capturePhoto(),
    WardrobePhotoValidationError,
  );
});

test('photo manager stops before storage and repository when processing rejects', async () => {
  const calls = [];
  const repositoryEvents = [];
  const storage = {
    async stagePhoto() { calls.push('stage'); throw new Error('unexpected'); },
  };
  const processorFailure = new LocalWardrobePhotoManager(
    {
      async pickPhoto() {
        calls.push('pick-ready');
        return { uri: 'file:///picked.heic', width: 4000, height: 3000 };
      },
    },
    {
      async processPhoto() {
        calls.push('process-failed');
        throw new Error('processor failed');
      },
    },
    storage,
  );
  const processorController = new WardrobeApplicationController(
    profileId,
    async () => repository(repositoryEvents, { current: null }),
    processorFailure,
  );
  await processorController.initialize();
  await assert.rejects(() => processorController.preparePhoto(), /processor failed/);
  assert.deepEqual(calls, ['pick-ready', 'process-failed']);
  assert.deepEqual(repositoryEvents, []);
});

test('Expo processor requests aspect-ratio resize and JPEG compression', async () => {
  nativeImageCalls.length = 0;
  const result = await new ExpoWardrobePhotoProcessor().processPhoto({
    uri: 'file:///picked.heic',
    width: 4000,
    height: 3000,
  });

  assert.deepEqual(nativeImageCalls, [
    ['manipulate', 'file:///picked.heic'],
    ['resize', { width: 1600, height: null }],
    ['render'],
    ['save', { base64: false, compress: 0.8, format: 'jpeg' }],
  ]);
  assert.deepEqual(result, {
    uri: 'file:///cache/processed.jpg',
    width: 1600,
    height: 1200,
  });
});

test('the processor deletes the picker original in the app cache once processed, and on failure', async (t) => {
  t.after(() => {
    nativeSaveFailure = null;
    nativeDeleteFailure = null;
    nativeFiles.clear();
  });
  const original = 'file:///cache/ImagePicker/captured.jpg';
  const photo = { uri: original, width: 4032, height: 3024 };

  nativeFiles.add(original);
  const processed = await new ExpoWardrobePhotoProcessor().processPhoto(photo);
  assert.equal(processed.uri, 'file:///cache/processed.jpg');
  assert.equal(nativeFiles.has(original), false);

  nativeFiles.add(original);
  nativeSaveFailure = new Error('save failed');
  await assert.rejects(
    () => new ExpoWardrobePhotoProcessor().processPhoto(photo),
    (error) => error === nativeSaveFailure,
  );
  assert.equal(nativeFiles.has(original), false);
  nativeSaveFailure = null;

  // A missing or undeletable original never fails the photo.
  assert.equal((await new ExpoWardrobePhotoProcessor().processPhoto(photo)).width, 1600);
  nativeFiles.add(original);
  nativeDeleteFailure = new Error('delete failed');
  assert.equal((await new ExpoWardrobePhotoProcessor().processPhoto(photo)).width, 1600);
  assert.equal(nativeFiles.has(original), true);
});

test('the processor never deletes an original outside the app cache', async (t) => {
  t.after(() => nativeFiles.clear());
  const outside = 'file:///documents/kuyara/wardrobe/photos/518f0f4d-1d45-4ae7-a8f1-796e8297d3b4.jpg';
  nativeFiles.add(outside);
  await new ExpoWardrobePhotoProcessor().processPhoto({ uri: outside, width: 800, height: 600 });
  assert.equal(nativeFiles.has(outside), true);
});

test('failed private copy removes its partial destination before repository write', async (t) => {
  nativeFiles.clear();
  nativeCopyFailure = new Error('copy failed');
  t.after(() => {
    nativeCopyFailure = null;
    nativeFiles.clear();
  });

  const stagedUri = `file:///cache/kuyara/wardrobe/staging/${stagedPhoto.id}.jpg`;
  const destinationUri = `file:///documents/${newPath}`;
  nativeFiles.add(stagedUri);
  const repositoryEvents = [];
  const storage = new ExpoPrivateWardrobePhotoStorage(
    () => '418f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  );
  const manager = new LocalWardrobePhotoManager({}, {}, storage);
  const controller = new WardrobeApplicationController(
    profileId,
    async () => repository(repositoryEvents, { current: null }),
    manager,
  );
  await controller.initialize();

  await assert.rejects(
    () => controller.createItem(
      { garmentTypeId: 'rain_jacket' },
      { kind: 'replace', stagedPhoto },
    ),
    (error) => error === nativeCopyFailure,
  );
  assert.deepEqual(repositoryEvents, []);
  assert.equal(nativeFiles.has(destinationUri), false);
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
  // The library route is the system picker and needs no photo-library permission; the
  // camera is requested only by the camera route.
  assert.doesNotMatch(adapterSource, /requestMediaLibraryPermissionsAsync|getCameraPermissionsAsync/);
  assert.match(adapterSource, /requestCameraPermissionsAsync\(\)/);
  assert.match(adapterSource, /new Directory\(\s*Paths\.document/);
  assert.match(adapterSource, /new File\(/);
  assert.doesNotMatch(adapterSource, /expo-file-system\/legacy/);
});

test('native config localizes camera and photo access and blocks the microphone', async () => {
  const [appConfig, english, turkish] = await Promise.all([
    readFile(new URL('../../../app.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../../localization/native/en.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../../localization/native/tr.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const pickerPlugin = appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
  );
  // The plugin's string is the Info.plist base value; the locale files override it per
  // language, so the English file and the plugin must say the same thing.
  assert.equal(pickerPlugin[1].cameraPermission, english.ios.NSCameraUsageDescription);
  assert.equal(pickerPlugin[1].photosPermission, english.ios.NSPhotoLibraryUsageDescription);
  assert.equal(pickerPlugin[1].microphonePermission, false);
  assert.equal(appConfig.expo.ios.infoPlist.CFBundleAllowMixedLocalizations, true);
  assert.equal(appConfig.expo.locales.en, './src/localization/native/en.json');
  assert.equal(appConfig.expo.locales.tr, './src/localization/native/tr.json');
  assert.ok(english.ios.NSPhotoLibraryUsageDescription);
  assert.ok(turkish.ios.NSPhotoLibraryUsageDescription);
  assert.match(english.ios.NSCameraUsageDescription, /take a Closet photo/);
  assert.match(turkish.ios.NSCameraUsageDescription, /Gardırop fotoğrafı çekebilmen/);
  // K1: user-facing copy makes no storage-location promise.
  for (const text of [english.ios.NSCameraUsageDescription, turkish.ios.NSCameraUsageDescription]) {
    assert.doesNotMatch(text, /device|stays|only|cihaz|kalır|yalnız/i);
  }
  assert.equal(english.ios.NSMicrophoneUsageDescription, undefined);
  assert.equal(turkish.ios.NSMicrophoneUsageDescription, undefined);
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
    async listPendingPhotoCleanup() {
      return current?.deletedAt && current.photoRelativePath && !options.livePhotoReference
        ? [{ id: current.id, photoRelativePath: current.photoRelativePath }]
        : [];
    },
    async clearPendingPhotoCleanup(_localProfileId, id, photoRelativePath) {
      events.push('clear-pending');
      if (options.failPendingClear) throw new Error('clear pending failed');
      if (
        current?.id !== id ||
        current.deletedAt === null ||
        current.photoRelativePath !== photoRelativePath ||
        options.livePhotoReference
      ) {
        return false;
      }
      current = { ...current, photoRelativePath: null };
      return true;
    },
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
      current = { ...current, deletedAt: current.updatedAt };
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
  return { controller, repo, cleanupReports: () => cleanupReports };
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

test('remove clears first, while soft delete clears only after deleting the previous photo', async () => {
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
  assert.deepEqual(deleteEvents, [
    'write-soft-delete',
    'delete-old',
    'clear-pending',
  ]);
  assert.deepEqual(softDelete.controller.getSnapshot().items, []);
  assert.equal(
    (await softDelete.repo.getItemIncludingDeleted()).photoRelativePath,
    null,
  );

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
  assert.equal(deleted.photoRelativePath, oldPath);
  assert.deepEqual(deleteEvents, ['write-soft-delete', 'delete-old']);
  assert.deepEqual(deleteResult.controller.getSnapshot().items, []);
  assert.equal(
    (await deleteResult.repo.getItemIncludingDeleted()).photoRelativePath,
    oldPath,
  );
  assert.equal(deleteResult.cleanupReports(), 1);
});

test('initialization retries a pending deletion and clears the tombstone path', async () => {
  const events = [];
  const repo = repository(events, {
    current: { ...wardrobeItem(), deletedAt: '2026-07-30T10:05:00.000Z' },
  });
  const controller = new WardrobeApplicationController(
    profileId,
    async () => repo,
    photoManager(events),
  );

  await controller.initialize();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(controller.getSnapshot().status, 'ready');
  assert.deepEqual(events, ['delete-old', 'clear-pending']);
  assert.equal((await repo.getItemIncludingDeleted()).photoRelativePath, null);
});

test('a still-failing retry stays pending without blocking or failing initialization', async () => {
  const repo = repository([], {
    current: { ...wardrobeItem(), deletedAt: '2026-07-30T10:05:00.000Z' },
  });
  let cleanupStarted;
  let rejectCleanup;
  const started = new Promise((resolve) => { cleanupStarted = resolve; });
  const retryingManager = {
    ...photoManager([]),
    async deleteStoredPhoto() {
      cleanupStarted();
      await new Promise((_resolve, reject) => { rejectCleanup = reject; });
    },
  };
  let cleanupReports = 0;
  const controller = new WardrobeApplicationController(
    profileId,
    async () => repo,
    retryingManager,
    () => { cleanupReports += 1; },
  );

  await controller.initialize();
  assert.equal(controller.getSnapshot().status, 'ready');
  await started;
  rejectCleanup(new Error('cleanup failed again'));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal((await repo.getItemIncludingDeleted()).photoRelativePath, oldPath);
  assert.equal(cleanupReports, 1);
});

test('pending cleanup never sends unmanaged or live-referenced paths to storage', async () => {
  for (const [path, repositoryOptions] of [
    ['wardrobe/photos/unmanaged.jpg', {}],
    [oldPath, { livePhotoReference: true }],
  ]) {
    const events = [];
    const repo = repository(events, {
      ...repositoryOptions,
      current: {
        ...wardrobeItem(path),
        deletedAt: '2026-07-30T10:05:00.000Z',
      },
    });
    const controller = new WardrobeApplicationController(
      profileId,
      async () => repo,
      photoManager(events),
    );

    await controller.initialize();
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(events, []);
    assert.equal((await repo.getItemIncludingDeleted()).photoRelativePath, path);
  }
});

test('a photo attempt error maps to denied, unavailable or failed', () => {
  assert.equal(classifyWardrobePhotoProblem(new WardrobeCameraAccessError('denied')), 'denied');
  assert.equal(classifyWardrobePhotoProblem(new WardrobeCameraAccessError('unavailable')), 'unavailable');
  assert.equal(classifyWardrobePhotoProblem(new WardrobePhotoValidationError()), 'failed');
  assert.equal(classifyWardrobePhotoProblem(new Error('anything')), 'failed');
  assert.equal(classifyWardrobePhotoProblem('not an error'), 'failed');
});

// The real adapter behind the rule that a missing or corrupt photo file never breaks the
// Closet: the read and delete paths, and the guards on staging and committing.
test('resolvePhotoUri answers null for a missing file or an invalid path and never throws', (t) => {
  t.after(() => nativeFiles.clear());
  const storage = new ExpoPrivateWardrobePhotoStorage(() => '418f0f4d-1d45-4ae7-a8f1-796e8297d3b4');
  nativeFiles.clear();
  assert.equal(storage.resolvePhotoUri(newPath), null, 'a purged file is no photo');
  for (const invalid of ['../x', '/abs/x.jpg', '', 'kuyara/wardrobe/photos/../../x.jpg']) {
    assert.equal(storage.resolvePhotoUri(invalid), null, invalid);
  }
  nativeFiles.add(`file:///documents/${newPath}`);
  assert.equal(storage.resolvePhotoUri(newPath), `file:///documents/${newPath}`);
});

test('deleteStoredPhoto removes a managed file, tolerates a missing one and skips unmanaged paths', async (t) => {
  t.after(() => nativeFiles.clear());
  const storage = new ExpoPrivateWardrobePhotoStorage(() => '418f0f4d-1d45-4ae7-a8f1-796e8297d3b4');
  const legacy = 'file:///documents/wardrobe/photos/legacy.jpg';
  const traversal = 'file:///documents/kuyara/wardrobe/photos/../secret.jpg';
  nativeFiles.clear();
  nativeFiles.add(legacy);
  nativeFiles.add(traversal);

  await storage.deleteStoredPhoto(newPath);
  nativeFiles.add(`file:///documents/${newPath}`);
  await storage.deleteStoredPhoto(newPath);
  assert.equal(nativeFiles.has(`file:///documents/${newPath}`), false);
  await storage.deleteStoredPhoto('wardrobe/photos/legacy.jpg');
  await storage.deleteStoredPhoto('kuyara/wardrobe/photos/../secret.jpg');
  assert.equal(nativeFiles.has(legacy), true);
  assert.equal(nativeFiles.has(traversal), true);
});

test('deleteStoredPhoto removes the file the normalized path names, not the raw padded string', async (t) => {
  t.after(() => nativeFiles.clear());
  const storage = new ExpoPrivateWardrobePhotoStorage(() => '418f0f4d-1d45-4ae7-a8f1-796e8297d3b4');
  nativeFiles.clear();
  nativeFiles.add(`file:///documents/${newPath}`);

  await storage.deleteStoredPhoto(` ${newPath} `);

  assert.equal(nativeFiles.has(`file:///documents/${newPath}`), false);
});

test('commitStagedPhoto copies a staged file to a managed path and rejects a missing staged file', async (t) => {
  t.after(() => nativeFiles.clear());
  const storage = new ExpoPrivateWardrobePhotoStorage(() => '418f0f4d-1d45-4ae7-a8f1-796e8297d3b4');
  nativeFiles.clear();
  await assert.rejects(
    () => storage.commitStagedPhoto(stagedPhoto),
    (error) => error instanceof WardrobePhotoValidationError,
  );
  assert.equal(nativeFiles.has(`file:///documents/${newPath}`), false);

  nativeFiles.add(`file:///cache/kuyara/wardrobe/staging/${stagedPhoto.id}.jpg`);
  const stored = await storage.commitStagedPhoto(stagedPhoto);
  assert.equal(stored.relativePath, newPath);
  assert.equal(stored.previewUri, `file:///documents/${newPath}`);
  assert.equal(nativeFiles.has(`file:///documents/${newPath}`), true);
});

test('stagePhoto rejects a source that is missing or outside the private cache', async (t) => {
  t.after(() => nativeFiles.clear());
  const storage = new ExpoPrivateWardrobePhotoStorage(() => '418f0f4d-1d45-4ae7-a8f1-796e8297d3b4');
  const outside = 'file:///documents/kuyara/wardrobe/photos/518f0f4d-1d45-4ae7-a8f1-796e8297d3b4.jpg';
  nativeFiles.clear();
  nativeFiles.add(outside);
  await assert.rejects(
    () => storage.stagePhoto({ uri: outside, width: 800, height: 600 }),
    (error) => error instanceof WardrobePhotoValidationError,
  );
  await assert.rejects(
    () => storage.stagePhoto({ uri: 'file:///cache/missing.jpg', width: 800, height: 600 }),
    (error) => error instanceof WardrobePhotoValidationError,
  );
  assert.equal(nativeFiles.has(outside), true, 'the outside file is left alone');
});

test('a deletion another phone made, landed by a sync pull, leaves the open Closet and removes the piece\'s photo', async () => {
  const events = [];
  const { controller, repo } = await readyController(events);
  assert.equal(controller.getSnapshot().items.length, 1);
  // The pull wrote the deletion marker outside the controller; the row keeps naming the photo.
  await repo.softDeleteItem();
  events.length = 0;

  await controller.reload();

  assert.deepEqual(controller.getSnapshot().items, []);
  assert.deepEqual(events, ['delete-old', 'clear-pending']);
});
