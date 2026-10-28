import {
  breathabilityLevels,
  coverageLevels,
  thermalLevels,
  tractionSuitabilities,
  waterProtections,
  windProtections,
  type GarmentType,
} from '@/features/catalog/domain/garment-taxonomy';

export type WardrobeOverrideField =
  | 'thermalLevelOverride'
  | 'waterProtectionOverride'
  | 'windProtectionOverride'
  | 'breathabilityOverride'
  | 'armCoverageOverride'
  | 'legCoverageOverride'
  | 'tractionSuitabilityOverride';

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

/** A piece may override only an attribute its garment type has a catalog default for. */
export function supportedWardrobeOverrides(type: GarmentType): readonly WardrobeOverrideDefinition[] {
  return wardrobeOverrideDefinitions.filter(({ defaultField }) => type[defaultField] !== null);
}
