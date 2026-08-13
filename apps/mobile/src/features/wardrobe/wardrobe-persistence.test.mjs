import assert from 'node:assert/strict';
import test from 'node:test';

import './wardrobe-application.test.mjs';

import {
  garmentCatalog,
  garmentCatalogVersion,
  GarmentCatalogValidationError,
  getGarmentType,
  listGarmentTypesForPreference,
  validateGarmentCatalog,
  validateGarmentCatalogLocalization,
} from '../catalog/domain/garment-catalog.ts';
import {
  apparelPreferenceApplicabilitySchema,
  bodyRegions,
  bodyRegionSchema,
  breathabilityLevels,
  breathabilitySchema,
  catalogLocalizationKeys,
  colorFamilies,
  colorFamilySchema,
  coverageLevels,
  coverageSchema,
  garmentTypeIds,
  garmentTypeIdSchema,
  garmentTypeSchema,
  garmentTypeStatuses,
  garmentTypeStatusSchema,
  layerRoles,
  layerRoleSchema,
  structuralCategories,
  structuralCategorySchema,
  thermalLevels,
  thermalLevelSchema,
  tractionSuitabilities,
  tractionSuitabilitySchema,
  waterProtections,
  waterProtectionSchema,
  windProtections,
  windProtectionSchema,
} from '../catalog/domain/garment-taxonomy.ts';
import { catalogMessages } from '../catalog/localization/catalog-messages.ts';
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
import { resolveEffectiveGarment } from './domain/effective-garment.ts';
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

test('taxonomy enums and garment schemas accept only canonical values', () => {
  const schemas = [
    [garmentTypeIds, garmentTypeIdSchema],
    [structuralCategories, structuralCategorySchema],
    [layerRoles, layerRoleSchema],
    [bodyRegions, bodyRegionSchema],
    [thermalLevels, thermalLevelSchema],
    [waterProtections, waterProtectionSchema],
    [windProtections, windProtectionSchema],
    [breathabilityLevels, breathabilitySchema],
    [coverageLevels, coverageSchema],
    [tractionSuitabilities, tractionSuitabilitySchema],
    [colorFamilies, colorFamilySchema],
    [garmentTypeStatuses, garmentTypeStatusSchema],
    [Object.freeze(['womens', 'mens']), apparelPreferenceApplicabilitySchema],
  ];

  for (const [values, schema] of schemas) {
    assert.equal(Object.isFrozen(values), true);
    for (const value of values) {
      assert.equal(schema.parse(value), value);
    }
    assert.equal(schema.safeParse('provider_specific_value').success, false);
  }

  assert.equal(
    garmentTypeSchema.safeParse(garmentCatalog.garmentTypes[0]).success,
    true,
  );
  assert.equal(
    garmentTypeSchema.safeParse({
      ...garmentCatalog.garmentTypes[0],
      defaultThermalLevel: 'extreme',
    }).success,
    false,
  );
});

test('canonical catalog is complete, immutable, versioned, and uses approved applicability', () => {
  const ids = garmentCatalog.garmentTypes.map(({ typeId }) => typeId);
  assert.equal(garmentCatalog.catalogVersion, garmentCatalogVersion);
  assert.deepEqual(ids, [...garmentTypeIds]);
  assert.equal(new Set(ids).size, garmentTypeIds.length);
  assert.equal(
    ids.every((typeId) => /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(typeId)),
    true,
  );
  assert.equal(Object.isFrozen(garmentCatalog), true);
  assert.equal(Object.isFrozen(garmentCatalog.garmentTypes), true);
  assert.equal(
    garmentCatalog.garmentTypes.every(
      (type) =>
        Object.isFrozen(type) &&
        Object.isFrozen(type.supportedLayerRoles) &&
        Object.isFrozen(type.apparelPreferenceApplicability),
    ),
    true,
  );

  const womensOnly = new Set(['blouse', 'skirt', 'dress']);
  for (const type of garmentCatalog.garmentTypes) {
    assert.deepEqual(
      [...type.apparelPreferenceApplicability],
      womensOnly.has(type.typeId) ? ['womens'] : ['womens', 'mens'],
    );
  }
  assert.deepEqual(
    getGarmentType('jumpsuit').apparelPreferenceApplicability,
    ['womens', 'mens'],
  );
  assert.equal(getGarmentType('future_type'), null);
  assert.deepEqual(
    listGarmentTypesForPreference('mens').map(({ typeId }) => typeId),
    garmentTypeIds.filter(
      (typeId) => !['blouse', 'skirt', 'dress'].includes(typeId),
    ),
  );
  assert.deepEqual(
    listGarmentTypesForPreference('womens').map(({ typeId }) => typeId),
    [...garmentTypeIds],
  );
});

test('catalog validation rejects duplicates, invalid shapes, and replacement cycles', () => {
  const duplicate = structuredClone(garmentCatalog);
  duplicate.garmentTypes[1] = {
    ...duplicate.garmentTypes[1],
    typeId: 't_shirt',
    nameKey: 'catalog.garment_type.t_shirt.name',
  };
  assert.throws(
    () => validateGarmentCatalog(duplicate),
    GarmentCatalogValidationError,
  );

  const invalidShape = structuredClone(garmentCatalog);
  invalidShape.garmentTypes[0] = {
    ...invalidShape.garmentTypes[0],
    supportedLayerRoles: ['base', 'base'],
  };
  assert.throws(
    () => validateGarmentCatalog(invalidShape),
    GarmentCatalogValidationError,
  );

  const categoryMismatch = structuredClone(garmentCatalog);
  categoryMismatch.garmentTypes[0] = {
    ...categoryMismatch.garmentTypes[0],
    structuralCategory: 'bottom',
  };
  assert.throws(
    () => validateGarmentCatalog(categoryMismatch),
    GarmentCatalogValidationError,
  );

  const validDeprecation = structuredClone(garmentCatalog);
  validDeprecation.garmentTypes[0] = {
    ...validDeprecation.garmentTypes[0],
    status: 'deprecated',
    replacedByTypeId: 'long_sleeve_t_shirt',
  };
  assert.doesNotThrow(() => validateGarmentCatalog(validDeprecation));

  const cycle = structuredClone(validDeprecation);
  cycle.garmentTypes[1] = {
    ...cycle.garmentTypes[1],
    status: 'deprecated',
    replacedByTypeId: 't_shirt',
  };
  assert.throws(
    () => validateGarmentCatalog(cycle),
    GarmentCatalogValidationError,
  );
});

test('every catalog localization key is unique and present in English and Turkish', () => {
  assert.equal(
    new Set(catalogLocalizationKeys).size,
    catalogLocalizationKeys.length,
  );
  assert.doesNotThrow(() =>
    validateGarmentCatalogLocalization(garmentCatalog, catalogMessages),
  );

  const missingTurkish = {
    en: catalogMessages.en,
    tr: { ...catalogMessages.tr },
  };
  delete missingTurkish.tr['catalog.garment_type.t_shirt.name'];
  assert.throws(
    () => validateGarmentCatalogLocalization(garmentCatalog, missingTurkish),
    GarmentCatalogValidationError,
  );
});

test('create generates a UUID and maps a profile-owned item across domain and persistence', async (t) => {
  const { database, repository } = await createRepository(t);

  const item = await repository.createItem({
    localProfileId: profileId,
    name: '  Yağmurluk  ',
    garmentTypeId: 'rain_jacket',
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
    garmentTypeId: 'rain_jacket',
    color: 'Petrol',
    colorFamily: null,
    thermalLevelOverride: null,
    waterProtectionOverride: null,
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
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
    garmentTypeId: row.garment_type_id,
    color: row.color,
    colorFamily: row.color_family,
    thermalLevelOverride: row.thermal_level_override,
    waterProtectionOverride: row.water_protection_override,
    windProtectionOverride: row.wind_protection_override,
    breathabilityOverride: row.breathability_override,
    armCoverageOverride: row.arm_coverage_override,
    legCoverageOverride: row.leg_coverage_override,
    tractionSuitabilityOverride: row.traction_suitability_override,
    photoRelativePath: row.photo_relative_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }), item);
  assert.equal('photo_relative_path' in row, true);
  assert.equal('photo' in row, false);
});

test('taxonomy fields round-trip and update distinguishes omission from clearing an override', async (t) => {
  const { database, repository, setTime } = await createRepository(t);
  const item = await repository.createItem({
    localProfileId: profileId,
    name: 'Teknik Yağmurluk',
    category: 'outerwear',
    garmentTypeId: 'rain_jacket',
    color: 'Petrol mavisi',
    colorFamily: 'blue',
    thermalLevelOverride: 'moderate',
    waterProtectionOverride: 'water_resistant',
    windProtectionOverride: 'none',
    breathabilityOverride: 'high',
    armCoverageOverride: 'partial',
  });

  assert.equal(item.thermalLevelOverride, 'moderate');
  assert.equal(item.waterProtectionOverride, 'water_resistant');
  setTime(updatedAt);
  const updated = await repository.updateItem({
    id: item.id,
    localProfileId: profileId,
    thermalLevelOverride: null,
    colorFamily: 'green',
  });
  const row = await database.getFirstAsync(
    `
      SELECT garment_type_id, color_family, thermal_level_override,
             water_protection_override, wind_protection_override,
             breathability_override, arm_coverage_override,
             leg_coverage_override, traction_suitability_override
      FROM wardrobe_items WHERE id = ?
    `,
    [item.id],
  );

  assert.equal(updated.thermalLevelOverride, null);
  assert.equal(updated.waterProtectionOverride, 'water_resistant');
  assert.equal(updated.colorFamily, 'green');
  const resolved = resolveEffectiveGarment(updated);
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.garment.thermalLevel, 'light');
  assert.deepEqual({ ...row }, {
    garment_type_id: 'rain_jacket',
    color_family: 'green',
    thermal_level_override: null,
    water_protection_override: 'water_resistant',
    wind_protection_override: 'none',
    breathability_override: 'high',
    arm_coverage_override: 'partial',
    leg_coverage_override: null,
    traction_suitability_override: null,
  });
});

test('new items require a canonical type and reject type, category, or property mismatches', async (t) => {
  const { repository } = await createRepository(t);

  await assert.rejects(
    () => repository.createItem({
      localProfileId: profileId,
      category: 'top',
    }),
    assertRepositoryError('invalid-input'),
  );
  await assert.rejects(
    () => repository.createItem({
      localProfileId: profileId,
      category: 'bottom',
      garmentTypeId: 't_shirt',
    }),
    assertRepositoryError('invalid-input'),
  );
  await assert.rejects(
    () => repository.createItem({
      localProfileId: profileId,
      category: 'top',
      garmentTypeId: 't_shirt',
      legCoverageOverride: 'full',
    }),
    assertRepositoryError('invalid-input'),
  );
  await assert.rejects(
    () => repository.createItem({
      localProfileId: profileId,
      category: 'top',
      garmentTypeId: 'provider_type',
    }),
    assertRepositoryError('invalid-input'),
  );
});

test('released version 2 rows remain readable as unclassified legacy items', async (t) => {
  const { database, repository, setTime } = await createRepository(t);
  await database.runAsync(
    `
      INSERT INTO wardrobe_items (
        id, local_profile_id, name, category, color, photo_relative_path,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, 'Eski Kazak', 'top', 'Lacivert', NULL, ?, ?, NULL)
    `,
    [itemIds[2], profileId, createdAt, createdAt],
  );

  const legacy = await repository.getActiveItem(profileId, itemIds[2]);
  assert.deepEqual(legacy, {
    id: itemIds[2],
    localProfileId: profileId,
    name: 'Eski Kazak',
    category: 'top',
    garmentTypeId: null,
    color: 'Lacivert',
    colorFamily: null,
    thermalLevelOverride: null,
    waterProtectionOverride: null,
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
    photoRelativePath: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  });

  setTime(updatedAt);
  const deleted = await repository.softDeleteItem(profileId, itemIds[2]);
  assert.equal(deleted.deletedAt, updatedAt);
  assert.equal(await repository.getActiveItem(profileId, itemIds[2]), null);
});

test('unknown IDs and persisted type-category mismatches fail without changing rows', async (t) => {
  const { database, repository } = await createRepository(t);
  await database.runAsync(
    `
      INSERT INTO wardrobe_items (
        id, local_profile_id, name, category, color, photo_relative_path,
        created_at, updated_at, deleted_at, garment_type_id
      ) VALUES (?, ?, 'Gelecek Tür', 'top', NULL, NULL, ?, ?, NULL, 'future_type')
    `,
    [itemIds[2], profileId, createdAt, createdAt],
  );
  await database.runAsync(
    `
      INSERT INTO wardrobe_items (
        id, local_profile_id, name, category, color, photo_relative_path,
        created_at, updated_at, deleted_at, garment_type_id
      ) VALUES (?, ?, 'Yanlış Kategori', 'bottom', NULL, NULL, ?, ?, NULL, 't_shirt')
    `,
    [itemIds[1], profileId, createdAt, createdAt],
  );

  await assert.rejects(
    () => repository.getActiveItem(profileId, itemIds[2]),
    assertRepositoryError('invalid-data'),
  );
  await assert.rejects(
    () => repository.getActiveItem(profileId, itemIds[1]),
    assertRepositoryError('invalid-data'),
  );
  const rows = await database.getAllAsync(
    'SELECT id, garment_type_id, category FROM wardrobe_items ORDER BY id',
  );
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    {
      id: itemIds[2],
      garment_type_id: 'future_type',
      category: 'top',
    },
    {
      id: itemIds[1],
      garment_type_id: 't_shirt',
      category: 'bottom',
    },
  ].sort((left, right) => left.id.localeCompare(right.id)));
});

test('catalog applicability never prevents ownership of a valid canonical type', async (t) => {
  const { database, repository } = await createRepository(t);
  await database.runAsync(
    "UPDATE local_profiles SET clothing_preference = 'mens' WHERE id = ?",
    [profileId],
  );

  const dress = await repository.createItem({
    localProfileId: profileId,
    category: 'one_piece',
    garmentTypeId: 'dress',
    name: 'Elbise',
  });

  assert.equal(dress.garmentTypeId, 'dress');
  assert.deepEqual(getGarmentType('dress').apparelPreferenceApplicability, ['womens']);
  assert.equal(resolveEffectiveGarment(dress).status, 'resolved');
});

test('effective garment resolution prefers overrides and otherwise uses catalog defaults', async (t) => {
  const { repository } = await createRepository(t);
  const item = await repository.createItem({
    localProfileId: profileId,
    category: 'outerwear',
    garmentTypeId: 'rain_jacket',
    colorFamily: 'blue',
    thermalLevelOverride: 'moderate',
    waterProtectionOverride: 'water_resistant',
    windProtectionOverride: 'none',
  });

  const result = resolveEffectiveGarment(item);
  assert.equal(result.status, 'resolved');
  assert.equal(result.garment.thermalLevel, 'moderate');
  assert.equal(result.garment.waterProtection, 'water_resistant');
  assert.equal(result.garment.windProtection, 'none');
  assert.equal(result.garment.breathability, 'moderate');
  assert.equal(result.garment.armCoverage, 'full');
  assert.equal(result.garment.legCoverage, null);
  assert.deepEqual(result.garment.apparelPreferenceApplicability, ['womens', 'mens']);
});

test('effective garment resolution preserves legacy state and rejects missing or mismatched types', () => {
  const baseItem = {
    id: itemIds[0],
    localProfileId: profileId,
    name: 'Kazak',
    category: 'top',
    garmentTypeId: null,
    color: 'Mavi',
    colorFamily: null,
    thermalLevelOverride: null,
    waterProtectionOverride: null,
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
    photoRelativePath: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };

  const legacy = resolveEffectiveGarment(baseItem);
  assert.deepEqual(legacy, {
    status: 'legacy',
    garment: {
      id: itemIds[0],
      localProfileId: profileId,
      name: 'Kazak',
      category: 'top',
      garmentTypeId: null,
      color: 'Mavi',
      photoRelativePath: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    },
  });

  const typed = { ...baseItem, garmentTypeId: 'sweater' };
  assert.deepEqual(
    resolveEffectiveGarment(typed, () => null),
    { status: 'invalid-data' },
  );
  assert.deepEqual(
    resolveEffectiveGarment({ ...typed, category: 'bottom' }),
    { status: 'invalid-data' },
  );

  const deprecatedSweater = {
    ...getGarmentType('sweater'),
    status: 'deprecated',
    replacedByTypeId: 'cardigan',
  };
  const deprecated = resolveEffectiveGarment(typed, () => deprecatedSweater);
  assert.equal(deprecated.status, 'resolved');
  assert.equal(deprecated.garment.catalogStatus, 'deprecated');
  assert.equal(deprecated.garment.replacedByTypeId, 'cardigan');
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
    garmentTypeId: 'sweater',
    name: 'Kazak',
  });
  const second = await repository.createItem({
    localProfileId: profileId,
    category: 'bottom',
    garmentTypeId: 'trousers',
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
    garmentTypeId: 'light_jacket',
    color: 'Lacivert',
  });
  setTime(updatedAt);

  const updated = await repository.updateItem({
    id: original.id,
    localProfileId: profileId,
    name: 'Hafif Mont',
    garmentTypeId: 'overshirt',
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
    garmentTypeId: 'overshirt',
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

test('soft delete atomically clears the photo path, timestamps the row, and excludes it from active operations', async (t) => {
  const { repository, setTime } = await createRepository(t);
  const item = await repository.createItem({
    localProfileId: profileId,
    category: 'footwear',
    garmentTypeId: 'weather_boots',
    name: 'Bot',
    photoRelativePath: 'kuyara/wardrobe/photos/518f0f4d-1d45-4ae7-a8f1-796e8297d3b4.jpg',
  });
  setTime(updatedAt);

  const deleted = await repository.softDeleteItem(profileId, item.id);

  assert.equal(deleted.deletedAt, updatedAt);
  assert.equal(deleted.updatedAt, updatedAt);
  assert.equal(deleted.photoRelativePath, null);
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
    garmentTypeId: 'dress',
    photoRelativePath: 'wardrobe/2026/dress.jpeg',
  });
  const withoutPhoto = await repository.createItem({
    localProfileId: profileId,
    category: 'accessory',
    garmentTypeId: 'umbrella',
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
        garmentTypeId: 't_shirt',
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
    garmentTypeId: 'coat',
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
    category: 'top',
    garmentTypeId: 't_shirt',
    color: null,
    colorFamily: null,
    thermalLevelOverride: 'provider-specific-level',
    waterProtectionOverride: null,
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
    photoRelativePath: null,
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
      garmentTypeId: 't_shirt',
      name: 'Gizli gardırop içeriği',
    }),
    (error) =>
      assertRepositoryError('unavailable')(error) &&
      !error.message.includes('Gizli') &&
      !error.message.includes('/private/'),
  );
});
