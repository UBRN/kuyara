import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type {
  BodyRegion,
  Breathability,
  ColorFamily,
  Coverage,
  GarmentType,
  GarmentTypeId,
  GarmentTypeNameKey,
  LayerRole,
  StructuralCategory,
  ThermalLevel,
  TractionSuitability,
  WaterProtection,
  WindProtection,
} from '@/features/catalog/domain/garment-taxonomy';
import type { ClothingPreference } from '@/domain/preferences';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';

type WardrobeItemIdentity = Readonly<{
  id: string;
  localProfileId: string;
  name: string | null;
  category: StructuralCategory;
  color: string | null;
  photoRelativePath: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>;

export type LegacyEffectiveGarment = WardrobeItemIdentity & Readonly<{
  garmentTypeId: null;
}>;

export type ResolvedGarment = WardrobeItemIdentity & Readonly<{
  garmentTypeId: GarmentTypeId;
  nameKey: GarmentTypeNameKey;
  colorFamily: ColorFamily | null;
  bodyRegion: BodyRegion | null;
  supportedLayerRoles: readonly LayerRole[];
  thermalLevel: ThermalLevel | null;
  waterProtection: WaterProtection | null;
  windProtection: WindProtection | null;
  breathability: Breathability | null;
  armCoverage: Coverage | null;
  legCoverage: Coverage | null;
  tractionSuitability: TractionSuitability | null;
  apparelPreferenceApplicability: readonly ClothingPreference[];
  catalogStatus: GarmentType['status'];
  replacedByTypeId: GarmentTypeId | null;
}>;

export type EffectiveGarmentResolution =
  | Readonly<{ status: 'legacy'; garment: LegacyEffectiveGarment }>
  | Readonly<{ status: 'resolved'; garment: ResolvedGarment }>
  | Readonly<{ status: 'invalid-data' }>;

type GarmentTypeLookup = (typeId: string) => GarmentType | null;

function identityFromItem(item: WardrobeItem): WardrobeItemIdentity {
  return {
    id: item.id,
    localProfileId: item.localProfileId,
    name: item.name,
    category: item.category,
    color: item.color,
    photoRelativePath: item.photoRelativePath,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt,
  };
}

function hasApplicableOverrides(item: WardrobeItem, type: GarmentType): boolean {
  return (
    (type.defaultThermalLevel !== null || item.thermalLevelOverride === null) &&
    (type.defaultWaterProtection !== null ||
      item.waterProtectionOverride === null) &&
    (type.defaultWindProtection !== null || item.windProtectionOverride === null) &&
    (type.defaultBreathability !== null || item.breathabilityOverride === null) &&
    (type.defaultArmCoverage !== null || item.armCoverageOverride === null) &&
    (type.defaultLegCoverage !== null || item.legCoverageOverride === null) &&
    (type.defaultTractionSuitability !== null ||
      item.tractionSuitabilityOverride === null)
  );
}

export function resolveEffectiveGarment(
  item: WardrobeItem,
  lookupGarmentType: GarmentTypeLookup = getGarmentType,
): EffectiveGarmentResolution {
  const identity = identityFromItem(item);

  if (item.garmentTypeId === null) {
    const hasUnexpectedTaxonomyValue =
      item.colorFamily !== null ||
      item.thermalLevelOverride !== null ||
      item.waterProtectionOverride !== null ||
      item.windProtectionOverride !== null ||
      item.breathabilityOverride !== null ||
      item.armCoverageOverride !== null ||
      item.legCoverageOverride !== null ||
      item.tractionSuitabilityOverride !== null;

    return hasUnexpectedTaxonomyValue
      ? { status: 'invalid-data' }
      : {
          status: 'legacy',
          garment: { ...identity, garmentTypeId: null },
        };
  }

  const type = lookupGarmentType(item.garmentTypeId);
  if (
    !type ||
    type.structuralCategory !== item.category ||
    !hasApplicableOverrides(item, type)
  ) {
    return { status: 'invalid-data' };
  }

  return {
    status: 'resolved',
    garment: {
      ...identity,
      garmentTypeId: item.garmentTypeId,
      nameKey: type.nameKey,
      colorFamily: item.colorFamily,
      bodyRegion: type.bodyRegion,
      supportedLayerRoles: type.supportedLayerRoles,
      thermalLevel: item.thermalLevelOverride ?? type.defaultThermalLevel,
      waterProtection:
        item.waterProtectionOverride ?? type.defaultWaterProtection,
      windProtection: item.windProtectionOverride ?? type.defaultWindProtection,
      breathability: item.breathabilityOverride ?? type.defaultBreathability,
      armCoverage: item.armCoverageOverride ?? type.defaultArmCoverage,
      legCoverage: item.legCoverageOverride ?? type.defaultLegCoverage,
      tractionSuitability:
        item.tractionSuitabilityOverride ?? type.defaultTractionSuitability,
      apparelPreferenceApplicability: type.apparelPreferenceApplicability,
      catalogStatus: type.status,
      replacedByTypeId: type.replacedByTypeId,
    },
  };
}
