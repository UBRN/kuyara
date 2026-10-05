import assert from 'node:assert/strict';
import test from 'node:test';

import { WardrobeApplicationController } from './application/wardrobe-application-controller.ts';
import { SqliteWardrobeLocalDataSource } from './data/sqlite-wardrobe-local-data-source.ts';
import { LocalWardrobeRepository } from './data/wardrobe-repository.ts';
import {
  orphanedWardrobePhotoMinimumAgeMs,
  orphanedWardrobePhotoPaths,
  staleStagedWardrobePhotoMinimumAgeMs,
} from './domain/wardrobe-photo-sweep.ts';
import { migrateDatabase } from '../../infrastructure/sqlite/migrations.ts';
import { NodeSqliteDatabase } from '../../../test/node-sqlite-database.mjs';

// The launch sweep that removes managed photo files nothing names: the real controller and
// repository over SQLite, with an in-memory stand-in for the photo files.

const hour = 60 * 60 * 1000;
const profileId = '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const otherProfileId = '218f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const startedAt = '2026-10-06T08:00:00.000Z';
const stagedPhoto = Object.freeze({
  id: '518f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  previewUri: 'file:///cache/kuyara/wardrobe/staging/staged.jpg',
});

function uuid(number) {
  return `${String(number).padStart(8, '0')}-1d45-4ae7-a8f1-796e8297d3b4`;
}

function photoPath(number) {
  return `kuyara/wardrobe/photos/${uuid(number)}.jpg`;
}

const settle = async () => {
  for (let turn = 0; turn < 3; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

function deferred() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

/** The photo files of one phone: relative path to modification time, plus what was asked of them. */
function createPhotoFiles(clock) {
  let nextPhoto = 1000;
  const photoFiles = {
    files: new Map(),
    deleteAttempts: [],
    stagingCutoffs: [],
    listCalls: 0,
    failList: false,
    failDeleteOf: () => false,
    failStagingSweep: false,
    commitModifiedAtMs: null,
    commitGate: null,
    listGate: null,
    reports: 0,
    manager: {
      async preparePhoto() { return stagedPhoto; },
      async commitStagedPhoto() {
        if (photoFiles.commitGate) await photoFiles.commitGate.promise;
        nextPhoto += 1;
        const relativePath = photoPath(nextPhoto);
        photoFiles.files.set(relativePath, photoFiles.commitModifiedAtMs ?? clock.ms);
        return { relativePath, previewUri: `file:///documents/${relativePath}` };
      },
      async discardStagedPhoto() {},
      async deleteStoredPhoto(relativePath) {
        photoFiles.deleteAttempts.push(relativePath);
        if (photoFiles.failDeleteOf(relativePath)) throw new Error('delete failed');
        photoFiles.files.delete(relativePath);
      },
      async listManagedPhotos() {
        photoFiles.listCalls += 1;
        if (photoFiles.listGate) await photoFiles.listGate.promise;
        if (photoFiles.failList) throw new Error('list failed');
        return [...photoFiles.files].map(([relativePath, modifiedAtMs]) => ({ relativePath, modifiedAtMs }));
      },
      async discardStaleStagedPhotos(modifiedBeforeMs) {
        photoFiles.stagingCutoffs.push(modifiedBeforeMs);
        if (photoFiles.failStagingSweep) throw new Error('staging sweep failed');
      },
      resolvePhotoUri(relativePath) { return relativePath ? `file:///documents/${relativePath}` : null; },
    },
  };
  return photoFiles;
}

async function createWorld(t) {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await database.runAsync(
    `INSERT INTO local_profiles (singleton_key, id, gender, language_preference,
       theme_preference, onboarding_completed, created_at, updated_at, deleted_at)
     VALUES (1, ?, 'woman', 'tr', 'dark', 1, ?, ?, NULL)`,
    [profileId, startedAt, startedAt],
  );
  const clock = { ms: Date.parse(startedAt) };
  const photoFiles = createPhotoFiles(clock);
  let nextItem = 0;

  return {
    database,
    clock,
    photoFiles,
    /** A new app launch over the same database and files: a controller that is initialized and idle. */
    async launch({ repositoryOverrides = {}, wait = true } = {}) {
      const repository = new LocalWardrobeRepository(new SqliteWardrobeLocalDataSource(database), {
        createId: () => uuid(2000 + nextItem++),
        now: () => new Date(clock.ms).toISOString(),
      });
      const wrapped = new Proxy(repository, {
        get(target, property) {
          if (property in repositoryOverrides) return repositoryOverrides[property];
          const value = target[property];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const controller = new WardrobeApplicationController(
        profileId,
        async () => wrapped,
        photoFiles.manager,
        () => { photoFiles.reports += 1; },
        () => new Date(clock.ms),
      );
      await controller.initialize();
      if (wait) await settle();
      return { controller, repository };
    },
    advanceHours(hours) { clock.ms += hours * hour; },
    async insertRow({ id, path, profile = profileId, deletedAt = null, createdAt = startedAt }) {
      await database.execAsync('PRAGMA foreign_keys = OFF');
      await database.runAsync(
        `INSERT INTO wardrobe_items (id, local_profile_id, category, garment_type_id, photo_relative_path,
           created_at, updated_at, deleted_at)
         VALUES (?, ?, 'top', 't_shirt', ?, ?, ?, ?)`,
        [id, profile, path, createdAt, startedAt, deletedAt],
      );
    },
  };
}

const replacePhoto = { kind: 'replace', stagedPhoto };
const create = (controller, change = replacePhoto) =>
  controller.createItem({ garmentTypeId: 't_shirt' }, change);

test('the orphan rule keeps named, young and undated files and lists only the old unnamed ones', () => {
  const now = Date.parse(startedAt);
  const old = now - orphanedWardrobePhotoMinimumAgeMs - 1;
  const files = [
    { relativePath: photoPath(1), modifiedAtMs: old },
    { relativePath: photoPath(2), modifiedAtMs: old },
    { relativePath: photoPath(3), modifiedAtMs: now - orphanedWardrobePhotoMinimumAgeMs },
    { relativePath: photoPath(4), modifiedAtMs: now - hour },
    { relativePath: photoPath(5), modifiedAtMs: null },
    { relativePath: photoPath(6), modifiedAtMs: now + hour },
    { relativePath: photoPath(7), modifiedAtMs: old },
  ];
  const named = [photoPath(2), `  ${photoPath(7).toUpperCase()} `];

  assert.deepEqual(orphanedWardrobePhotoPaths(files, named, now), [photoPath(1)]);
  assert.equal(staleStagedWardrobePhotoMinimumAgeMs, hour);
});

test('a photo left by a remove whose old file could not be deleted is removed on the next launch', async (t) => {
  const world = await createWorld(t);
  const first = await world.launch();
  const created = await create(first.controller);
  const oldPath = created.photoRelativePath;
  world.photoFiles.failDeleteOf = () => true;

  await first.controller.updateItem(created.id, {}, { kind: 'remove' });
  assert.equal(world.photoFiles.files.has(oldPath), true, 'the failed delete left the file');

  world.photoFiles.failDeleteOf = () => false;
  world.advanceHours(25);
  await world.launch();

  assert.equal(world.photoFiles.files.has(oldPath), false);
});

test('the previous photo of a replace whose delete failed is removed, and the new photo stays', async (t) => {
  const world = await createWorld(t);
  const first = await world.launch();
  const created = await create(first.controller);
  const oldPath = created.photoRelativePath;
  world.photoFiles.failDeleteOf = () => true;

  const updated = await first.controller.updateItem(created.id, {}, replacePhoto);
  assert.equal(world.photoFiles.files.has(oldPath), true);

  world.photoFiles.failDeleteOf = () => false;
  world.advanceHours(25);
  await world.launch();

  assert.equal(world.photoFiles.files.has(oldPath), false);
  assert.equal(world.photoFiles.files.has(updated.photoRelativePath), true);
});

test('the photo of a create whose write failed and whose cleanup failed is removed on the next launch', async (t) => {
  const world = await createWorld(t);
  const failing = await world.launch({
    repositoryOverrides: { createItem: async () => { throw new Error('write failed'); } },
  });
  world.photoFiles.failDeleteOf = () => true;

  await assert.rejects(() => create(failing.controller));
  assert.equal(world.photoFiles.files.size, 1);

  world.photoFiles.failDeleteOf = () => false;
  world.advanceHours(25);
  await world.launch();

  assert.equal(world.photoFiles.files.size, 0);
});

test('the new photo of an update whose write failed and whose cleanup failed is removed, the live one stays', async (t) => {
  const world = await createWorld(t);
  const first = await world.launch();
  const created = await create(first.controller);
  const failing = await world.launch({
    repositoryOverrides: { updateItem: async () => { throw new Error('write failed'); } },
  });
  world.photoFiles.failDeleteOf = () => true;

  await assert.rejects(() => failing.controller.updateItem(created.id, {}, replacePhoto));
  assert.equal(world.photoFiles.files.size, 2);

  world.photoFiles.failDeleteOf = () => false;
  world.advanceHours(25);
  await world.launch();

  assert.deepEqual([...world.photoFiles.files.keys()], [created.photoRelativePath]);
});

test('a copy the app was killed after, before the row was written, is removed on a later launch', async (t) => {
  const world = await createWorld(t);
  world.photoFiles.files.set(photoPath(1), world.clock.ms);
  await world.launch();
  assert.equal(world.photoFiles.files.has(photoPath(1)), true, 'a young file might belong to a save in progress');

  world.advanceHours(25);
  await world.launch();

  assert.equal(world.photoFiles.files.has(photoPath(1)), false);
});

test('files a row names, another profile names, or nothing can date survive the sweep', async (t) => {
  const world = await createWorld(t);
  const old = world.clock.ms - 48 * hour;
  const kept = {
    active: photoPath(1),
    otherProfile: photoPath(2),
    upperCaseName: photoPath(3),
    young: photoPath(4),
    undated: photoPath(5),
    deletedElsewhere: photoPath(6),
  };
  const orphan = photoPath(7);
  for (const path of [kept.active, kept.otherProfile, kept.upperCaseName, kept.deletedElsewhere, orphan]) {
    world.photoFiles.files.set(path, old);
  }
  world.photoFiles.files.set(kept.young, world.clock.ms - 23 * hour);
  world.photoFiles.files.set(kept.undated, null);
  await world.insertRow({ id: uuid(101), path: kept.active });
  await world.insertRow({ id: uuid(102), path: kept.otherProfile, profile: otherProfileId });
  await world.insertRow({ id: uuid(103), path: kept.upperCaseName.toUpperCase() });
  await world.insertRow({
    id: uuid(104), path: kept.deletedElsewhere, profile: otherProfileId, deletedAt: startedAt,
  });

  await world.launch();

  assert.deepEqual(
    [...world.photoFiles.files.keys()].sort(),
    Object.values(kept).sort(),
    'only the orphan was removed',
  );
});

test('a deleted piece still waiting for its photo to be removed keeps the file out of the sweep', async (t) => {
  const world = await createWorld(t);
  const tombstonePath = photoPath(1);
  world.photoFiles.files.set(tombstonePath, world.clock.ms - 48 * hour);
  await world.insertRow({ id: uuid(101), path: tombstonePath, deletedAt: startedAt });
  world.photoFiles.failDeleteOf = () => true;

  await world.launch();

  assert.deepEqual(world.photoFiles.deleteAttempts, [tombstonePath], 'only the pending cleanup tried');
  assert.equal(world.photoFiles.files.has(tombstonePath), true);
});

test('a row the mapper rejects still protects its photo from the sweep', async (t) => {
  const world = await createWorld(t);
  const path = photoPath(1);
  world.photoFiles.files.set(path, world.clock.ms - 48 * hour);
  await world.insertRow({ id: uuid(101), path, deletedAt: startedAt, createdAt: 'not a timestamp' });

  const { controller } = await world.launch();

  assert.equal(world.photoFiles.files.has(path), true);
  assert.equal(controller.getSnapshot().status, 'ready');
});

test('the sweep waits for a save in progress, and a create whose copy ran but whose row is not written keeps its file', async (t) => {
  const world = await createWorld(t);
  // A copy keeps the staged file's time, so the new file can already look old.
  world.photoFiles.commitModifiedAtMs = world.clock.ms - 48 * hour;
  const pendingListGate = deferred();
  const commitGate = deferred();
  world.photoFiles.commitGate = commitGate;
  const { controller } = await world.launch({
    wait: false,
    repositoryOverrides: {
      async listPendingPhotoCleanup() {
        await pendingListGate.promise;
        return [];
      },
    },
  });
  const saving = create(controller);
  await settle();

  pendingListGate.release();
  await settle();
  assert.equal(world.photoFiles.listCalls, 0, 'the sweep does not look while a save is in progress');

  commitGate.release();
  const created = await saving;
  await settle();

  assert.equal(world.photoFiles.listCalls, 1);
  assert.equal(world.photoFiles.files.has(created.photoRelativePath), true);
});

test('a save started during the sweep waits for it and then completes', async (t) => {
  const world = await createWorld(t);
  world.photoFiles.files.set(photoPath(1), world.clock.ms - 48 * hour);
  world.photoFiles.listGate = deferred();
  const { controller } = await world.launch();
  assert.equal(world.photoFiles.listCalls, 1, 'the sweep is listing');

  let saved = false;
  const saving = create(controller).then((created) => { saved = true; return created; });
  await settle();
  assert.equal(saved, false, 'the save waits');
  assert.equal(world.photoFiles.files.size, 1, 'it has not copied its photo yet');
  assert.equal(controller.getSnapshot().isMutating, true);

  world.photoFiles.listGate.release();
  const created = await saving;
  await settle();

  assert.equal(world.photoFiles.files.has(photoPath(1)), false, 'the orphan was removed');
  assert.equal(world.photoFiles.files.has(created.photoRelativePath), true);
  assert.equal(controller.getSnapshot().items.length, 1);
  assert.equal(controller.getSnapshot().isMutating, false);
});

test('a sweep that cannot list leaves the controller ready, reports once and does not stop a save', async (t) => {
  const world = await createWorld(t);
  world.photoFiles.files.set(photoPath(1), world.clock.ms - 48 * hour);
  world.photoFiles.failList = true;

  const { controller } = await world.launch();

  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(world.photoFiles.reports, 1);
  assert.equal(world.photoFiles.files.has(photoPath(1)), true);
  assert.deepEqual(world.photoFiles.stagingCutoffs.length, 1, 'the staging sweep still ran');
  const created = await create(controller);
  assert.equal(world.photoFiles.files.has(created.photoRelativePath), true);
});

test('a sweep whose database read fails leaves the controller ready, reports once and deletes nothing', async (t) => {
  const world = await createWorld(t);
  world.photoFiles.files.set(photoPath(1), world.clock.ms - 48 * hour);

  const { controller } = await world.launch({
    repositoryOverrides: { listPhotoPathsInUse: async () => { throw new Error('read failed'); } },
  });

  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(world.photoFiles.reports, 1);
  assert.deepEqual(world.photoFiles.deleteAttempts, []);
});

test('failing deletes are reported once for the whole sweep and the other orphans are still removed', async (t) => {
  const world = await createWorld(t);
  for (const number of [1, 2, 3]) world.photoFiles.files.set(photoPath(number), world.clock.ms - 48 * hour);
  world.photoFiles.failDeleteOf = (path) => path !== photoPath(3);

  const { controller } = await world.launch();

  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(world.photoFiles.reports, 1);
  assert.deepEqual([...world.photoFiles.files.keys()].sort(), [photoPath(1), photoPath(2)]);
});

test('the staging sweep asks for files older than an hour, and a failing one is reported once', async (t) => {
  const world = await createWorld(t);

  await world.launch();
  assert.deepEqual(world.photoFiles.stagingCutoffs, [world.clock.ms - hour]);
  assert.equal(world.photoFiles.reports, 0);

  world.photoFiles.failStagingSweep = true;
  const { controller } = await world.launch();
  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(world.photoFiles.reports, 1);
});

test('the sweep runs once per launch, not on every refresh', async (t) => {
  const world = await createWorld(t);
  const { controller } = await world.launch();
  assert.equal(world.photoFiles.listCalls, 1);

  await controller.refresh();
  await controller.reload();
  await settle();

  assert.equal(world.photoFiles.listCalls, 1);
});
