import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import {
  breathabilityLevels,
  breathabilitySchema,
  colorFamilies,
  coverageLevels,
  coverageSchema,
  thermalLevels,
  thermalLevelSchema,
  tractionSuitabilities,
  tractionSuitabilitySchema,
  waterProtections,
  waterProtectionSchema,
  windProtections,
  windProtectionSchema,
  type Breathability,
  type ColorFamily,
  type Coverage,
  type GarmentType,
  type GarmentTypeId,
  type ThermalLevel,
  type TractionSuitability,
  type WaterProtection,
  type WindProtection,
} from '@/features/catalog/domain/garment-taxonomy';
import type {
  CreateWardrobeItemInput,
  UpdateWardrobeItemInput,
  WardrobeItem,
} from '@/features/wardrobe/domain/wardrobe-item';

export type WardrobeFormValues = Readonly<{
  name: string;
  garmentTypeId: GarmentTypeId | null;
  colorFamily: ColorFamily | null;
  thermalLevelOverride: ThermalLevel | null;
  waterProtectionOverride: WaterProtection | null;
  windProtectionOverride: WindProtection | null;
  breathabilityOverride: Breathability | null;
  armCoverageOverride: Coverage | null;
  legCoverageOverride: Coverage | null;
  tractionSuitabilityOverride: TractionSuitability | null;
}>;

export type WardrobeOverrideField = Exclude<
  keyof WardrobeFormValues,
  'name' | 'garmentTypeId' | 'colorFamily'
>;

export type WardrobeOverrideDefinition = Readonly<{
  field: WardrobeOverrideField;
  catalogAttribute:
    | 'thermal_level'
    | 'water_protection'
    | 'wind_protection'
    | 'breathability'
    | 'coverage'
    | 'traction_suitability';
  defaultField: keyof Pick<
    GarmentType,
    | 'defaultThermalLevel'
    | 'defaultWaterProtection'
    | 'defaultWindProtection'
    | 'defaultBreathability'
    | 'defaultArmCoverage'
    | 'defaultLegCoverage'
    | 'defaultTractionSuitability'
  >;
  values: readonly string[];
}>;

export const wardrobeOverrideDefinitions = Object.freeze([
  {
    field: 'thermalLevelOverride',
    catalogAttribute: 'thermal_level',
    defaultField: 'defaultThermalLevel',
    values: thermalLevels,
  },
  {
    field: 'waterProtectionOverride',
    catalogAttribute: 'water_protection',
    defaultField: 'defaultWaterProtection',
    values: waterProtections,
  },
  {
    field: 'windProtectionOverride',
    catalogAttribute: 'wind_protection',
    defaultField: 'defaultWindProtection',
    values: windProtections,
  },
  {
    field: 'breathabilityOverride',
    catalogAttribute: 'breathability',
    defaultField: 'defaultBreathability',
    values: breathabilityLevels,
  },
  {
    field: 'armCoverageOverride',
    catalogAttribute: 'coverage',
    defaultField: 'defaultArmCoverage',
    values: coverageLevels,
  },
  {
    field: 'legCoverageOverride',
    catalogAttribute: 'coverage',
    defaultField: 'defaultLegCoverage',
    values: coverageLevels,
  },
  {
    field: 'tractionSuitabilityOverride',
    catalogAttribute: 'traction_suitability',
    defaultField: 'defaultTractionSuitability',
    values: tractionSuitabilities,
  },
] as const satisfies readonly WardrobeOverrideDefinition[]);

const emptyValues: WardrobeFormValues = Object.freeze({
  name: '',
  garmentTypeId: null,
  colorFamily: null,
  thermalLevelOverride: null,
  waterProtectionOverride: null,
  windProtectionOverride: null,
  breathabilityOverride: null,
  armCoverageOverride: null,
  legCoverageOverride: null,
  tractionSuitabilityOverride: null,
});

export { colorFamilies };

export function createWardrobeFormValues(
  item?: WardrobeItem,
): WardrobeFormValues {
  if (!item) {
    return { ...emptyValues };
  }

  return {
    name: item.name ?? '',
    garmentTypeId: item.garmentTypeId,
    colorFamily: item.colorFamily,
    thermalLevelOverride: item.thermalLevelOverride,
    waterProtectionOverride: item.waterProtectionOverride,
    windProtectionOverride: item.windProtectionOverride,
    breathabilityOverride: item.breathabilityOverride,
    armCoverageOverride: item.armCoverageOverride,
    legCoverageOverride: item.legCoverageOverride,
    tractionSuitabilityOverride: item.tractionSuitabilityOverride,
  };
}

export function wardrobeFormValuesEqual(
  left: WardrobeFormValues,
  right: WardrobeFormValues,
): boolean {
  return (Object.keys(emptyValues) as (keyof WardrobeFormValues)[]).every(
    (key) => left[key] === right[key],
  );
}

export function hasWardrobeOverrides(values: WardrobeFormValues): boolean {
  return wardrobeOverrideDefinitions.some(({ field }) => values[field] !== null);
}

export function selectWardrobeGarmentType(
  values: WardrobeFormValues,
  garmentTypeId: GarmentTypeId,
): WardrobeFormValues {
  return {
    ...values,
    garmentTypeId,
    thermalLevelOverride: null,
    waterProtectionOverride: null,
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
  };
}

export function setWardrobeOverrideValue(
  values: WardrobeFormValues,
  field: WardrobeOverrideField,
  value: string | null,
): WardrobeFormValues {
  switch (field) {
    case 'thermalLevelOverride':
      return {
        ...values,
        thermalLevelOverride: value === null ? null : thermalLevelSchema.parse(value),
      };
    case 'waterProtectionOverride':
      return {
        ...values,
        waterProtectionOverride:
          value === null ? null : waterProtectionSchema.parse(value),
      };
    case 'windProtectionOverride':
      return {
        ...values,
        windProtectionOverride:
          value === null ? null : windProtectionSchema.parse(value),
      };
    case 'breathabilityOverride':
      return {
        ...values,
        breathabilityOverride:
          value === null ? null : breathabilitySchema.parse(value),
      };
    case 'armCoverageOverride':
      return {
        ...values,
        armCoverageOverride: value === null ? null : coverageSchema.parse(value),
      };
    case 'legCoverageOverride':
      return {
        ...values,
        legCoverageOverride: value === null ? null : coverageSchema.parse(value),
      };
    case 'tractionSuitabilityOverride':
      return {
        ...values,
        tractionSuitabilityOverride:
          value === null ? null : tractionSuitabilitySchema.parse(value),
      };
  }
}

export function listSupportedWardrobeOverrides(
  garmentTypeId: GarmentTypeId | null,
): readonly WardrobeOverrideDefinition[] {
  const garmentType = garmentTypeId ? getGarmentType(garmentTypeId) : null;
  if (!garmentType) {
    return [];
  }

  return wardrobeOverrideDefinitions.filter(
    ({ defaultField }) => garmentType[defaultField] !== null,
  );
}

export function validateWardrobeForm(
  values: WardrobeFormValues,
): 'garment-type-required' | null {
  return values.garmentTypeId && getGarmentType(values.garmentTypeId)
    ? null
    : 'garment-type-required';
}

function visibleFields(
  values: WardrobeFormValues,
  garmentTypeId: GarmentTypeId,
) {
  const supported = new Set(
    listSupportedWardrobeOverrides(values.garmentTypeId).map(({ field }) => field),
  );

  return {
    name: values.name,
    garmentTypeId,
    colorFamily: values.colorFamily,
    thermalLevelOverride: supported.has('thermalLevelOverride')
      ? values.thermalLevelOverride
      : null,
    waterProtectionOverride: supported.has('waterProtectionOverride')
      ? values.waterProtectionOverride
      : null,
    windProtectionOverride: supported.has('windProtectionOverride')
      ? values.windProtectionOverride
      : null,
    breathabilityOverride: supported.has('breathabilityOverride')
      ? values.breathabilityOverride
      : null,
    armCoverageOverride: supported.has('armCoverageOverride')
      ? values.armCoverageOverride
      : null,
    legCoverageOverride: supported.has('legCoverageOverride')
      ? values.legCoverageOverride
      : null,
    tractionSuitabilityOverride: supported.has('tractionSuitabilityOverride')
      ? values.tractionSuitabilityOverride
      : null,
  };
}

export function mapWardrobeCreateValues(
  values: WardrobeFormValues,
): Omit<CreateWardrobeItemInput, 'localProfileId'> | null {
  const { garmentTypeId } = values;
  if (!garmentTypeId || !getGarmentType(garmentTypeId)) {
    return null;
  }

  return visibleFields(values, garmentTypeId);
}

export function mapWardrobeUpdateValues(
  values: WardrobeFormValues,
): Omit<UpdateWardrobeItemInput, 'id' | 'localProfileId'> | null {
  const { garmentTypeId } = values;
  if (!garmentTypeId || !getGarmentType(garmentTypeId)) {
    return null;
  }

  return visibleFields(values, garmentTypeId);
}

export function isWardrobeRouteId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
