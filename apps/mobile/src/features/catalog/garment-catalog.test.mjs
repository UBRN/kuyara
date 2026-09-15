import assert from 'node:assert/strict';
import test from 'node:test';

import {
  garmentCatalog,
  garmentCatalogVersion,
  GarmentCatalogValidationError,
  validateGarmentCatalog,
  validateGarmentCatalogLocalization,
} from './domain/garment-catalog.ts';
import { garmentTypeIds } from './domain/garment-taxonomy.ts';
import { catalogMessages } from './localization/catalog-messages.ts';

function cloneCatalog() {
  return structuredClone(garmentCatalog);
}

function indexOfType(manifest, typeId) {
  const index = manifest.garmentTypes.findIndex((type) => type.typeId === typeId);
  assert.notEqual(index, -1, `the catalog no longer defines ${typeId}`);
  return index;
}

function withType(typeId, patch) {
  const manifest = cloneCatalog();
  const index = indexOfType(manifest, typeId);
  manifest.garmentTypes[index] = { ...manifest.garmentTypes[index], ...patch };
  return manifest;
}

function assertRejected(manifest, because) {
  assert.throws(
    () => validateGarmentCatalog(manifest),
    GarmentCatalogValidationError,
    because,
  );
}

test('the shipped catalog satisfies its own validator', () => {
  assert.doesNotThrow(() => validateGarmentCatalog(cloneCatalog()));
  assert.equal(garmentCatalog.catalogVersion, garmentCatalogVersion);
  assert.equal(garmentCatalog.garmentTypes.length, garmentTypeIds.length);
});

test('identity: unknown ids, extra fields, a missing type and a drifted version are rejected', () => {
  assertRejected(withType('t_shirt', { typeId: 'sun_hat' }), 'unknown garment type id');
  assertRejected(withType('t_shirt', { fabricWeight: 'light' }), 'unknown garment field');

  const extraManifestField = cloneCatalog();
  extraManifestField.publishedAt = '2026-09-15';
  assertRejected(extraManifestField, 'unknown manifest field');

  const missingType = cloneCatalog();
  missingType.garmentTypes.splice(indexOfType(missingType, 'scarf'), 1);
  assertRejected(missingType, 'a taxonomy id without a definition');

  const driftedVersion = cloneCatalog();
  driftedVersion.catalogVersion = garmentCatalogVersion + 1;
  assertRejected(driftedVersion, 'a manifest version the code does not ship');
});

test('category: the body region has to match the structural category', () => {
  assertRejected(withType('t_shirt', { bodyRegion: 'feet' }), 'a top worn on the feet');
  assertRejected(withType('umbrella', { bodyRegion: 'head' }), 'a carried accessory given a body region');
});

test('coverage: arm and leg coverage follow the body region', () => {
  assertRejected(withType('trousers', { defaultArmCoverage: 'full' }), 'arm coverage on a lower-body type');
  assertRejected(withType('dress', { defaultLegCoverage: null }), 'a full-body type without leg coverage');
});

test('coverage: thermal level and breathability follow the body region too', () => {
  assertRejected(withType('umbrella', { defaultThermalLevel: 'light' }), 'warmth on a regionless accessory');
  assertRejected(withType('t_shirt', { defaultBreathability: null }), 'a worn type without breathability');
});

test('layering and traction: layer roles and traction belong to the right categories', () => {
  assertRejected(withType('sneakers', { supportedLayerRoles: ['base'] }), 'footwear given a layer role');
  assertRejected(withType('t_shirt', { supportedLayerRoles: [] }), 'a layerable type with no layer role');
  assertRejected(withType('sneakers', { defaultTractionSuitability: null }), 'footwear without traction');
  assertRejected(withType('t_shirt', { defaultTractionSuitability: 'everyday' }), 'traction on a top');
});

test('applicability: the preference list is non-empty and free of duplicates', () => {
  assertRejected(withType('blouse', { apparelPreferenceApplicability: [] }), 'a type nobody can wear');
  assertRejected(
    withType('t_shirt', { apparelPreferenceApplicability: ['womens', 'womens'] }),
    'a repeated preference',
  );
});

test('localization: the name key is derived from the type id', () => {
  assertRejected(
    withType('t_shirt', { nameKey: 'catalog.garment_type.shirt.name' }),
    'a name key pointing at another type',
  );
  assertRejected(withType('t_shirt', { nameKey: 'garment.t_shirt' }), 'a name key outside the namespace');
});

test('deprecation: the replacement graph stays acyclic and same-category', () => {
  assertRejected(
    withType('t_shirt', { replacedByTypeId: 'long_sleeve_t_shirt' }),
    'an active type with a replacement',
  );
  assertRejected(
    withType('t_shirt', { status: 'deprecated', replacedByTypeId: 't_shirt' }),
    'a type replaced by itself',
  );
  assertRejected(
    withType('t_shirt', { status: 'deprecated', replacedByTypeId: 'trousers' }),
    'a replacement in another structural category',
  );
  assert.doesNotThrow(() =>
    validateGarmentCatalog(
      withType('t_shirt', { status: 'deprecated', replacedByTypeId: 'long_sleeve_t_shirt' }),
    ),
  );
});

test('every garment type id is named in both Turkish and English', () => {
  for (const typeId of garmentTypeIds) {
    const nameKey = `catalog.garment_type.${typeId}.name`;
    for (const language of ['tr', 'en']) {
      const name = catalogMessages[language][nameKey];
      assert.equal(typeof name, 'string', `${language} is missing ${nameKey}`);
      assert.ok(name.trim().length > 0, `${language} has a blank ${nameKey}`);
    }
  }
});

test('localization validation rejects a blank translation', () => {
  const blankTurkish = {
    en: catalogMessages.en,
    tr: { ...catalogMessages.tr, 'catalog.garment_type.scarf.name': '   ' },
  };
  assert.throws(
    () => validateGarmentCatalogLocalization(garmentCatalog, blankTurkish),
    GarmentCatalogValidationError,
  );
});

test('the exported catalog is deep frozen', () => {
  assert.ok(Object.isFrozen(garmentCatalog));
  assert.ok(Object.isFrozen(garmentCatalog.garmentTypes));
  for (const type of garmentCatalog.garmentTypes) {
    assert.ok(Object.isFrozen(type), type.typeId);
    assert.ok(Object.isFrozen(type.supportedLayerRoles), type.typeId);
    assert.ok(Object.isFrozen(type.apparelPreferenceApplicability), type.typeId);
  }
  assert.throws(() => {
    garmentCatalog.garmentTypes[0].formality = 'formal';
  }, TypeError);
});
