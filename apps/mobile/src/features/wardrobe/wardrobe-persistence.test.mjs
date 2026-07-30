import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapWardrobeCategoryFromRecord,
  mapWardrobeCategoryToRecord,
  mapWardrobeItemRecord,
} from './data/wardrobe-item-mapper.ts';
import {
  LocalWardrobeRepository,
  WardrobeRepositoryError,
} from './data/wardrobe-repository.ts';
import { SqliteWardrobeLocalDataSource } from './data/sqlite-wardrobe-local-data-source.ts';
import { wardrobeItemCategories } from './domain/wardrobe-item.ts';
import { migrateDatabase } from '../../infrastructure/sqlite/migrations.ts';
import { NodeSqliteDatabase } from '../../../test/node-sqlite-database.mjs';

const profileId = '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const otherProfileId = '218f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const itemIds = [
  '118f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  '318f0f4d-1d45-4ae7-b8f1-796e8297d3b4',
  '418f0f4d-1d45-4ae7-88f1-796e8297d3b4',
];
const createdAt = '2026-07-30T10:00:00.000Z';
const updatedAt = '2026-07-30T10:05:00.000Z';

async function insertProfile(database) {
  await database.runAsync(
    `
      INSERT INTO local_profiles (
        singleton_key, id, clothing_preference, language_preference,
        theme_preference, onboarding_completed, created_at, updated_at, deleted_at
      ) VALUES (1, ?, 'womens', 'tr', 'dark', 1, ?, ?, NULL)
    `,
    [profileId, createdAt, createdAt],
  );
}

async function createRepository(t, options = {}) {
  const database = options.database ?? new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await insertProfile(database);
  let idIndex = 0;
  let currentTime = createdAt;
  const dataSource = new SqliteWardrobeLocalDataSource(database);
  const repository = new LocalWardrobeRepository(dataSource, {
    createId: () => itemIds[idIndex++] ?? itemIds[itemIds.length - 1],
    now: () => currentTime,
  });

  return {
    database,
    dataSource,
    repository,
    setTime: (value) => {
      currentTime = value;
    },
  };
}

function assertRepositoryError(code) {
  return (error) =>
    error instanceof WardrobeRepositoryError &&
    error.code === code &&
    !/SQLITE|wardrobe_items|photo_relative_path/i.test(error.message);
}

test('create generates a UUID and maps a profile-owned item across domain and persistence', async (t) => {
  const { database, repository } = await createRepository(t);

  const item = await repository.createItem({
    localProfileId: profileId,
    name: '  Yağmurluk  ',
    category: 'outerwear',
    color: '  Petrol  ',
    photoRelativePath: 'wardrobe/photos/raincoat.jpg',
  });
  const row = await database.getFirstAsync('SELECT * FROM wardrobe_items WHERE id = ?', [item.id]);

  assert.match(item.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(item, {
    id: itemIds[0],
    localProfileId: profileId,
    name: 'Yağmurluk',
    category: 'outerwear',
    color: 'Petrol',
    photoRelativePath: 'wardrobe/photos/raincoat.jpg',
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  });
  assert.deepEqual(mapWardrobeItemRecord({
    id: row.id,
    localProfileId: row.local_profile_id,
    name: row.name,
    category: row.category,
    color: row.color,
    photoRelativePath: row.photo_relative_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }), item);
  assert.equal('photo_relative_path' in row, true);
  assert.equal('photo' in row, false);
});

test('category mapping is explicit and round-trips every stable persistence value', () => {
  for (const category of wardrobeItemCategories) {
    const stored = mapWardrobeCategoryToRecord(category);
    assert.equal(mapWardrobeCategoryFromRecord(stored), category);
  }
});

test('active reads and lists are isolated by local profile ID', async (t) => {
  const { repository } = await createRepository(t);
  const first = await repository.createItem({
    localProfileId: profileId,
    category: 'top',
    name: 'Kazak',
  });
  const second = await repository.createItem({
    localProfileId: profileId,
    category: 'bottom',
    name: 'Pantolon',
  });

  assert.equal((await repository.getActiveItem(profileId, first.id)).name, 'Kazak');
  assert.equal(await repository.getActiveItem(otherProfileId, first.id), null);
  assert.deepEqual(await repository.listActiveItems(otherProfileId), []);
  assert.deepEqual(
    (await repository.listActiveItems(profileId)).map(({ id }) => id),
    [first.id, second.id].sort(),
  );
  await assert.rejects(
    () => repository.updateItem({
      id: first.id,
      localProfileId: otherProfileId,
      name: 'Başkasının parçası',
    }),
    assertRepositoryError('not-found'),
  );
  assert.equal((await repository.getActiveItem(profileId, first.id)).name, 'Kazak');
});

test('update changes only mutable fields and preserves identity, owner, and creation time', async (t) => {
  const { database, repository, setTime } = await createRepository(t);
  const original = await repository.createItem({
    localProfileId: profileId,
    name: 'Mont',
    category: 'outerwear',
    color: 'Lacivert',
  });
  setTime(updatedAt);

  const updated = await repository.updateItem({
    id: original.id,
    localProfileId: profileId,
    name: 'Hafif Mont',
    category: 'top',
    color: null,
    photoRelativePath: 'wardrobe/photos/light-jacket.webp',
  });
  const row = await database.getFirstAsync(
    'SELECT id, local_profile_id, created_at, updated_at FROM wardrobe_items WHERE id = ?',
    [original.id],
  );

  assert.deepEqual(updated, {
    ...original,
    name: 'Hafif Mont',
    category: 'top',
    color: null,
    photoRelativePath: 'wardrobe/photos/light-jacket.webp',
    updatedAt,
  });
  assert.deepEqual({ ...row }, {
    id: original.id,
    local_profile_id: profileId,
    created_at: createdAt,
    updated_at: updatedAt,
  });
});

test('soft delete atomically timestamps the row and excludes it from active operations', async (t) => {
  const { repository, setTime } = await createRepository(t);
  const item = await repository.createItem({
    localProfileId: profileId,
    category: 'footwear',
    name: 'Bot',
  });
  setTime(updatedAt);

  const deleted = await repository.softDeleteItem(profileId, item.id);

  assert.equal(deleted.deletedAt, updatedAt);
  assert.equal(deleted.updatedAt, updatedAt);
  assert.equal(await repository.getActiveItem(profileId, item.id), null);
  assert.deepEqual(await repository.listActiveItems(profileId), []);
  assert.deepEqual(await repository.getItemIncludingDeleted(profileId, item.id), deleted);
  await assert.rejects(
    () => repository.updateItem({
      id: item.id,
      localProfileId: profileId,
      name: 'Silinmiş Bot',
    }),
    assertRepositoryError('not-found'),
  );
  await assert.rejects(
    () => repository.softDeleteItem(profileId, item.id),
    assertRepositoryError('not-found'),
  );
});

test('missing items have explicit null-read and not-found write behavior', async (t) => {
  const { repository } = await createRepository(t);
  const missingId = itemIds[2];

  assert.equal(await repository.getActiveItem(profileId, missingId), null);
  assert.equal(await repository.getItemIncludingDeleted(profileId, missingId), null);
  await assert.rejects(
    () => repository.updateItem({ id: missingId, localProfileId: profileId, color: 'Mavi' }),
    assertRepositoryError('not-found'),
  );
  await assert.rejects(
    () => repository.softDeleteItem(profileId, missingId),
    assertRepositoryError('not-found'),
  );
});

test('relative photo paths are accepted and empty paths are stored as null', async (t) => {
  const { repository } = await createRepository(t);
  const withPhoto = await repository.createItem({
    localProfileId: profileId,
    category: 'one_piece',
    photoRelativePath: 'wardrobe/2026/dress.jpeg',
  });
  const withoutPhoto = await repository.createItem({
    localProfileId: profileId,
    category: 'accessory',
    photoRelativePath: '   ',
  });

  assert.equal(withPhoto.photoRelativePath, 'wardrobe/2026/dress.jpeg');
  assert.equal(withoutPhoto.photoRelativePath, null);
});

test('absolute paths, URIs, backslashes, and parent traversal are rejected', async (t) => {
  const { database, repository } = await createRepository(t);
  const invalidPaths = [
    '/private/item.jpg',
    'file:///private/item.jpg',
    'https://example.com/item.jpg',
    '../item.jpg',
    'wardrobe/../item.jpg',
    'C:\\wardrobe\\item.jpg',
    'wardrobe\\item.jpg',
  ];

  for (const photoRelativePath of invalidPaths) {
    await assert.rejects(
      () => repository.createItem({
        localProfileId: profileId,
        category: 'top',
        photoRelativePath,
      }),
      assertRepositoryError('invalid-input'),
    );
  }

  const count = await database.getFirstAsync('SELECT COUNT(*) AS count FROM wardrobe_items');
  assert.equal(count.count, 0);
});

test('create and update keep user values in bound parameters', async (t) => {
  const database = new NodeSqliteDatabase();
  const writes = [];
  const trackedDatabase = {
    execAsync: database.execAsync.bind(database),
    runAsync: database.runAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    getAllAsync: database.getAllAsync.bind(database),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) =>
        task({
          execAsync: transaction.execAsync.bind(transaction),
          runAsync: (source, params) => {
            writes.push({ source, params });
            return transaction.runAsync(source, params);
          },
          getFirstAsync: transaction.getFirstAsync.bind(transaction),
          getAllAsync: transaction.getAllAsync.bind(transaction),
        }),
      ),
    close: () => database.close(),
  };
  const { repository, setTime } = await createRepository(t, { database: trackedDatabase });
  const hostileValue = "Palto'); DROP TABLE wardrobe_items; --";

  const item = await repository.createItem({
    localProfileId: profileId,
    category: 'outerwear',
    name: hostileValue,
  });
  setTime(updatedAt);
  await repository.updateItem({
    id: item.id,
    localProfileId: profileId,
    color: hostileValue,
  });

  const itemWrites = writes.filter(({ source }) =>
    /INSERT INTO wardrobe_items|UPDATE wardrobe_items/.test(source),
  );
  const table = await database.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'wardrobe_items'",
  );
  assert.equal(itemWrites.length, 2);
  assert.equal(itemWrites.every(({ params }) => Array.isArray(params)), true);
  assert.equal(itemWrites.every(({ source }) => !source.includes(hostileValue)), true);
  assert.equal(itemWrites.every(({ params }) => params.includes(hostileValue)), true);
  assert.equal(table.name, 'wardrobe_items');
});

test('repository rejects invalid stored data without exposing persistence details', async () => {
  const invalidRecord = {
    id: itemIds[0],
    localProfileId: profileId,
    name: null,
    category: 'provider-specific-category',
    color: null,
    photoRelativePath: '/private/secret-photo.jpg',
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  const invalidRepository = new LocalWardrobeRepository({
    listActiveItems: async () => [invalidRecord],
  }, {
    createId: () => itemIds[0],
    now: () => createdAt,
  });

  await assert.rejects(
    () => invalidRepository.listActiveItems(profileId),
    assertRepositoryError('invalid-data'),
  );
});

test('repository sanitizes SQLite failures and does not leak wardrobe content or paths', async () => {
  const failingRepository = new LocalWardrobeRepository({
    createItem: async () => {
      throw new Error('SQLITE_CONSTRAINT wardrobe_items /private/secret-photo.jpg');
    },
  }, {
    createId: () => itemIds[0],
    now: () => createdAt,
  });

  await assert.rejects(
    () => failingRepository.createItem({
      localProfileId: profileId,
      category: 'top',
      name: 'Gizli gardırop içeriği',
    }),
    (error) =>
      assertRepositoryError('unavailable')(error) &&
      !error.message.includes('Gizli') &&
      !error.message.includes('/private/'),
  );
});
