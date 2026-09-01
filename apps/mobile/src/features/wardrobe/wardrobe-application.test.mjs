import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { garmentCatalog } from '../catalog/domain/garment-catalog.ts';
import {
  createWardrobeFormValues,
  hasWardrobeOverrides,
  isWardrobeRouteId,
  listSupportedWardrobeOverrides,
  mapWardrobeCreateValues,
  mapWardrobeUpdateValues,
  selectWardrobeGarmentType,
  validateWardrobeForm,
  wardrobeFormValuesEqual,
} from './application/wardrobe-form.ts';
import { WardrobeApplicationController } from './application/wardrobe-application-controller.ts';
import { messages } from '../../localization/messages.ts';

const profileId = '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const itemId = '118f0f4d-1d45-4ae7-a8f1-796e8297d3b4';

const item = Object.freeze({
  id: itemId,
  localProfileId: profileId,
  name: 'Everyday jacket',
  category: 'outerwear',
  garmentTypeId: 'rain_jacket',
  color: 'Legacy petrol',
  colorFamily: 'blue',
  thermalLevelOverride: 'moderate',
  waterProtectionOverride: 'water_resistant',
  windProtectionOverride: null,
  breathabilityOverride: 'high',
  armCoverageOverride: 'partial',
  legCoverageOverride: null,
  tractionSuitabilityOverride: null,
  photoRelativePath: 'wardrobe/private/jacket.jpg',
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:05:00.000Z',
  deletedAt: null,
});

test('wardrobe form requires a catalog type and maps only user-editable create fields', () => {
  const empty = createWardrobeFormValues();
  assert.equal(validateWardrobeForm(empty), 'garment-type-required');
  assert.equal(mapWardrobeCreateValues(empty), null);

  const selected = {
    ...selectWardrobeGarmentType(empty, 'rain_jacket'),
    name: '  City shell  ',
    colorFamily: 'blue',
    waterProtectionOverride: 'water_resistant',
  };
  assert.equal(validateWardrobeForm(selected), null);
  assert.deepEqual(mapWardrobeCreateValues(selected), {
    name: '  City shell  ',
    garmentTypeId: 'rain_jacket',
    colorFamily: 'blue',
    thermalLevelOverride: null,
    waterProtectionOverride: 'water_resistant',
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
  });
});

test('supported override controls derive from catalog defaults', () => {
  assert.deepEqual(
    listSupportedWardrobeOverrides('rain_jacket').map(({ field }) => field),
    [
      'thermalLevelOverride',
      'waterProtectionOverride',
      'windProtectionOverride',
      'breathabilityOverride',
      'armCoverageOverride',
    ],
  );
  assert.deepEqual(
    listSupportedWardrobeOverrides('umbrella').map(({ field }) => field),
    ['waterProtectionOverride'],
  );
  assert.deepEqual(listSupportedWardrobeOverrides(null), []);
  assert.equal(garmentCatalog.garmentTypes.length, 30);
});

test('edit values preserve overrides until type changes, then reset to new defaults', () => {
  const values = createWardrobeFormValues(item);
  assert.equal(hasWardrobeOverrides(values), true);
  assert.equal(wardrobeFormValuesEqual(values, createWardrobeFormValues(item)), true);
  assert.deepEqual(mapWardrobeUpdateValues({ ...values, name: 'Renamed' }), {
    name: 'Renamed',
    garmentTypeId: item.garmentTypeId,
    colorFamily: item.colorFamily,
    thermalLevelOverride: item.thermalLevelOverride,
    waterProtectionOverride: item.waterProtectionOverride,
    windProtectionOverride: item.windProtectionOverride,
    breathabilityOverride: item.breathabilityOverride,
    armCoverageOverride: item.armCoverageOverride,
    legCoverageOverride: item.legCoverageOverride,
    tractionSuitabilityOverride: item.tractionSuitabilityOverride,
  });

  const changed = selectWardrobeGarmentType(values, 'umbrella');
  assert.equal(changed.garmentTypeId, 'umbrella');
  assert.equal(hasWardrobeOverrides(changed), false);
  assert.equal(changed.name, item.name);
  assert.equal(changed.colorFamily, item.colorFamily);
});

test('update mapping clears unsupported overrides but never writes hidden legacy fields', () => {
  const values = selectWardrobeGarmentType(createWardrobeFormValues(item), 'umbrella');
  const payload = mapWardrobeUpdateValues(values);

  assert.deepEqual(payload, {
    name: item.name,
    garmentTypeId: 'umbrella',
    colorFamily: 'blue',
    thermalLevelOverride: null,
    waterProtectionOverride: null,
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
  });
  assert.equal('color' in payload, false);
  assert.equal('photoRelativePath' in payload, false);
  assert.equal('createdAt' in payload, false);
});

test('route IDs accept UUID v4 only', () => {
  assert.equal(isWardrobeRouteId(itemId), true);
  assert.equal(isWardrobeRouteId('not-a-uuid'), false);
  assert.equal(isWardrobeRouteId(['one', 'two']), false);
});

test('English and Turkish wardrobe copy has matching complete keys', () => {
  assert.deepEqual(
    Object.keys(messages.en.wardrobe).sort(),
    Object.keys(messages.tr.wardrobe).sort(),
  );
  assert.deepEqual(
    Object.keys(messages.en.wardrobe.attributeLabels).sort(),
    Object.keys(messages.tr.wardrobe.attributeLabels).sort(),
  );
  for (const language of ['en', 'tr']) {
    const copy = messages[language].wardrobe;
    assert.ok(copy.emptyAction);
    assert.ok(copy.typeRequiredError);
    assert.ok(copy.discardAction);
    assert.ok(copy.confirmDeleteAction);
    assert.ok(copy.notFoundTitle);
  }
});

test('wardrobe routes remain thin, virtualized, and free of SQLite or SQL access', async () => {
  const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8');
  const [indexRoute, newRoute, editRoute, form, list, routeComposition] =
    await Promise.all([
      source('../../app/(tabs)/(profile)/wardrobe/index.tsx'),
      source('../../app/(tabs)/(profile)/wardrobe/new.tsx'),
      source('../../app/(tabs)/(profile)/wardrobe/[id].tsx'),
      source('./presentation/wardrobe-item-form-screen.tsx'),
      source('./presentation/wardrobe-list-screen.tsx'),
      source('./presentation/wardrobe-item-routes.tsx'),
    ]);
  const routeSources = `${indexRoute}\n${newRoute}\n${editRoute}`;
  const presentationSources = `${form}\n${list}\n${routeComposition}`;

  const persistenceAccess = /expo-sqlite|\bSELECT\s+.+\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+wardrobe_items\b/i;
  assert.doesNotMatch(routeSources, persistenceAccess);
  assert.doesNotMatch(presentationSources, persistenceAccess);
  assert.match(list, /<Animated\.FlatList/);
  assert.match(routeComposition, /beforeRemove/);
  assert.match(routeComposition, /discardTitle/);
  assert.match(routeComposition, /garmentCatalog\.garmentTypes/);
  assert.doesNotMatch(routeComposition, /listGarmentTypesForPreference/);
  assert.match(form, /accessibilityRole="radio"|<WardrobeOption/);
  assert.match(form, /accessibilityRole="alert"/);
});

function createRepository(overrides = {}) {
  const calls = { create: 0, list: 0, get: 0, update: 0, delete: 0 };
  let resolveCreate;
  const createPromise = new Promise((resolve) => {
    resolveCreate = resolve;
  });
  const repository = {
    async listActiveItems(owner) {
      calls.list += 1;
      assert.equal(owner, profileId);
      return [item];
    },
    async getActiveItem(owner, id) {
      calls.get += 1;
      return owner === profileId && id === itemId ? item : null;
    },
    async createItem(input) {
      calls.create += 1;
      assert.equal(input.localProfileId, profileId);
      return createPromise;
    },
    async updateItem(input) {
      calls.update += 1;
      return { ...item, ...input };
    },
    async softDeleteItem(owner, id) {
      calls.delete += 1;
      return { ...item, localProfileId: owner, id, deletedAt: item.updatedAt };
    },
    async getItemIncludingDeleted() {
      return null;
    },
    ...overrides,
  };
  return { calls, repository, resolveCreate };
}

test('wardrobe controller loads active items and rejects invalid route IDs locally', async () => {
  const { calls, repository } = createRepository();
  const controller = new WardrobeApplicationController(profileId, async () => repository);
  await controller.initialize();

  assert.deepEqual(controller.getSnapshot(), {
    status: 'ready',
    items: [item],
    isRefreshing: false,
    isMutating: false,
    hasRefreshError: false,
  });
  assert.equal(await controller.getItem('invalid'), null);
  assert.equal(calls.get, 0);
  assert.equal(await controller.getItem(itemId), item);
  assert.equal(calls.get, 1);
});

test('controller coalesces rapid saves and refreshes persisted items once', async () => {
  const { calls, repository, resolveCreate } = createRepository();
  const controller = new WardrobeApplicationController(profileId, async () => repository);
  await controller.initialize();
  const input = { name: 'Rain shell', garmentTypeId: 'rain_jacket' };

  const first = controller.createItem(input);
  const second = controller.createItem(input);
  assert.equal(first, second);
  assert.equal(calls.create, 1);
  assert.equal(controller.getSnapshot().isMutating, true);
  resolveCreate(item);
  assert.equal(await first, item);
  assert.equal(calls.list, 2);
  assert.equal(controller.getSnapshot().isMutating, false);
});

test('controller exposes retryable list failures without discarding prior items', async () => {
  let fail = false;
  const { repository } = createRepository({
    async listActiveItems() {
      if (fail) {
        throw new Error('database unavailable');
      }
      return [item];
    },
  });
  const controller = new WardrobeApplicationController(profileId, async () => repository);
  await controller.initialize();
  fail = true;
  await controller.refresh();

  assert.deepEqual(controller.getSnapshot(), {
    status: 'ready',
    items: [item],
    isRefreshing: false,
    isMutating: false,
    hasRefreshError: true,
  });
});

test('a confirmed write remains successful when its follow-up list read fails', async () => {
  let failList = false;
  const { repository, resolveCreate } = createRepository({
    async listActiveItems() {
      if (failList) {
        throw new Error('refresh failed');
      }
      return [];
    },
  });
  const controller = new WardrobeApplicationController(profileId, async () => repository);
  await controller.initialize();
  failList = true;
  const creation = controller.createItem({ garmentTypeId: 'rain_jacket' });
  resolveCreate(item);

  assert.equal(await creation, item);
  assert.deepEqual(controller.getSnapshot(), {
    status: 'ready',
    items: [item],
    isRefreshing: false,
    isMutating: false,
    hasRefreshError: true,
  });
});

test('controller retries repository initialization after an initial load failure', async () => {
  const { repository } = createRepository();
  let attempts = 0;
  const controller = new WardrobeApplicationController(profileId, async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error('open failed');
    }
    return repository;
  });

  await controller.initialize();
  assert.deepEqual(controller.getSnapshot(), { status: 'error' });
  await controller.refresh();
  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(attempts, 2);
});
