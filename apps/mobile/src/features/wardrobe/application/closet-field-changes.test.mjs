import assert from 'node:assert/strict';
import test from 'node:test';

import { closetFieldsChanged } from './closet-field-changes.ts';

function item(overrides = {}) {
  return {
    id: '118f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
    localProfileId: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
    name: 'City shell',
    category: 'outerwear',
    entryState: 'owned',
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
    photoRelativePath: null,
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T10:05:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

test('an identical resubmission reports no changed fields and no photo change', () => {
  const previous = item();
  const submitted = {
    name: previous.name,
    garmentTypeId: previous.garmentTypeId,
    colorFamily: previous.colorFamily,
    thermalLevelOverride: previous.thermalLevelOverride,
    waterProtectionOverride: previous.waterProtectionOverride,
    windProtectionOverride: previous.windProtectionOverride,
    breathabilityOverride: previous.breathabilityOverride,
    armCoverageOverride: previous.armCoverageOverride,
    legCoverageOverride: previous.legCoverageOverride,
    tractionSuitabilityOverride: previous.tractionSuitabilityOverride,
    entryState: previous.entryState,
  };

  assert.deepEqual(closetFieldsChanged(previous, submitted, false), []);
});

test('reports the garment type category, never a value', () => {
  const previous = item({ garmentTypeId: 'rain_jacket' });
  const changed = closetFieldsChanged(
    previous,
    { garmentTypeId: 'wool_coat' },
    false,
  );
  assert.deepEqual(changed, ['garment_type']);
});

test('trims whitespace before comparing the name, so it is not a false positive', () => {
  const previous = item({ name: 'City shell' });
  assert.deepEqual(
    closetFieldsChanged(previous, { name: '  City shell  ' }, false),
    [],
  );
});

test('an emptied name normalizes to null and is reported as changed', () => {
  const previous = item({ name: 'City shell' });
  assert.deepEqual(closetFieldsChanged(previous, { name: '   ' }, false), ['name']);
});

test('reports each of the seven override categories independently', () => {
  const previous = item();
  const changed = closetFieldsChanged(
    previous,
    {
      thermalLevelOverride: 'warm',
      waterProtectionOverride: 'waterproof',
      windProtectionOverride: 'windproof',
      breathabilityOverride: 'high',
      armCoverageOverride: 'full',
      legCoverageOverride: 'full',
      tractionSuitabilityOverride: 'high_traction',
    },
    false,
  );
  assert.deepEqual(changed, [
    'thermal_level_override',
    'water_protection_override',
    'wind_protection_override',
    'breathability_override',
    'arm_coverage_override',
    'leg_coverage_override',
    'traction_suitability_override',
  ]);
});

test('reports the ownership state change as `state`', () => {
  const previous = item({ entryState: 'owned' });
  assert.deepEqual(
    closetFieldsChanged(previous, { entryState: 'wanted' }, false),
    ['state'],
  );
});

test('reports a photo change independently of any field change', () => {
  const previous = item();
  assert.deepEqual(closetFieldsChanged(previous, {}, true), ['photo']);
});

test('a field the caller did not submit is treated as unchanged, not compared against undefined', () => {
  const previous = item({ colorFamily: 'blue' });
  assert.deepEqual(closetFieldsChanged(previous, {}, false), []);
});
