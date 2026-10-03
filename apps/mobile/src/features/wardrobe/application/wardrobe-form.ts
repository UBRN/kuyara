import { isUuidV4 } from '@/domain/record-identity';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import {
  breathabilityLevels,
  colorFamilies,
  coverageLevels,
  structuralCategorySchema,
  thermalLevels,
  tractionSuitabilities,
  waterProtections,
  windProtections,
  type Breathability,
  type ColorFamily,
  type Coverage,
  type GarmentType,
  type GarmentTypeId,
  type StructuralCategory,
  type ThermalLevel,
  type TractionSuitability,
  type WaterProtection,
  type WindProtection,
} from '@/features/catalog/domain/garment-taxonomy';
import type { ClosetColorChoice } from '@/features/wardrobe/domain/closet-color-options';
import {
  wardrobeEntryStateSchema,
  type CreateWardrobeItemInput,
  type UpdateWardrobeItemInput,
  type WardrobeEntryState,
  type WardrobeItem,
} from '@/features/wardrobe/domain/wardrobe-item';

export type WardrobeFormValues = Readonly<{
  name: string;
  garmentTypeId: GarmentTypeId | null;
  colorFamily: ColorFamily | null;
  /** O8: the palette option or custom colour; `null` for a family-only record. */
  colorChoice: ClosetColorChoice | null;
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
  'name' | 'garmentTypeId' | 'colorFamily' | 'colorChoice'
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
  colorChoice: null,
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
    colorChoice: item.colorChoice ?? null,
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
    (key) => key === 'colorChoice'
      ? sameClosetColorChoice(left.colorChoice, right.colorChoice)
      : left[key] === right[key],
  );
}

export function sameClosetColorChoice(
  left: ClosetColorChoice | null | undefined,
  right: ClosetColorChoice | null | undefined,
): boolean {
  if (!left || !right) return (left ?? null) === (right ?? null);
  return left.kind === 'option'
    ? right.kind === 'option' && left.id === right.id
    : right.kind === 'custom' && left.hex === right.hex;
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

  return values.colorChoice
    ? { ...visibleFields(values, garmentTypeId), colorChoice: values.colorChoice }
    : visibleFields(values, garmentTypeId);
}

/**
 * The update payload. A palette choice is sent only when it differs from `initialValues`':
 * an untouched colour leaves the key out, so the repository keeps the stored choice, an
 * option this build does not know included (O8).
 */
export function mapWardrobeUpdateValues(
  values: WardrobeFormValues,
  initialValues?: WardrobeFormValues,
): Omit<UpdateWardrobeItemInput, 'id' | 'localProfileId'> | null {
  const { garmentTypeId } = values;
  if (!garmentTypeId || !getGarmentType(garmentTypeId)) {
    return null;
  }

  const choiceChanged = values.colorChoice !== null &&
    !sameClosetColorChoice(values.colorChoice, initialValues?.colorChoice ?? null);
  return choiceChanged
    ? { ...visibleFields(values, garmentTypeId), colorChoice: values.colorChoice }
    : visibleFields(values, garmentTypeId);
}

export function isWardrobeRouteId(value: unknown): value is string {
  return typeof value === 'string' && isUuidV4(value);
}

// The Closet carries its category and the section to reveal into the add flow and back
// through route params.
// A param is an untrusted string, and the stored enum is locale-independent, so it is
// validated against the same schema the record uses and anything else is dropped rather
// than repaired: the caller then falls back to its own default.
export function parseWardrobeEntryStateParam(
  value: unknown,
): WardrobeEntryState | undefined {
  const parsed = wardrobeEntryStateSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** The Closet's category route param (O9), validated the same way. */
export function parseStructuralCategoryParam(value: unknown): StructuralCategory | undefined {
  const parsed = structuralCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
