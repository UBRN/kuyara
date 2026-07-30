import { z } from 'zod';

import { clothingPreferences } from '@/domain/preferences';

export const garmentTypeIds = Object.freeze([
  't_shirt',
  'long_sleeve_t_shirt',
  'shirt',
  'blouse',
  'sweatshirt',
  'hoodie',
  'sweater',
  'cardigan',
  'overshirt',
  'trousers',
  'jeans',
  'shorts',
  'skirt',
  'dress',
  'jumpsuit',
  'light_jacket',
  'trench_coat',
  'rain_jacket',
  'insulated_jacket',
  'coat',
  'sneakers',
  'closed_shoes',
  'ankle_boots',
  'weather_boots',
  'sandals',
  'beanie',
  'brimmed_hat',
  'scarf',
  'gloves',
  'umbrella',
] as const);

export const structuralCategories = Object.freeze([
  'top',
  'bottom',
  'one_piece',
  'outerwear',
  'footwear',
  'accessory',
] as const);

export const layerRoles = Object.freeze([
  'base',
  'mid',
  'outer',
  'standalone',
] as const);
export const bodyRegions = Object.freeze([
  'upper_body',
  'lower_body',
  'full_body',
  'feet',
  'head',
  'neck',
  'hands',
] as const);
export const thermalLevels = Object.freeze([
  'none',
  'light',
  'moderate',
  'high',
] as const);
export const waterProtections = Object.freeze([
  'none',
  'water_resistant',
  'waterproof',
] as const);
export const windProtections = Object.freeze([
  'none',
  'wind_resistant',
] as const);
export const breathabilityLevels = Object.freeze([
  'low',
  'moderate',
  'high',
] as const);
export const coverageLevels = Object.freeze([
  'none',
  'partial',
  'full',
] as const);
export const tractionSuitabilities = Object.freeze([
  'everyday',
  'enhanced',
] as const);
export const colorFamilies = Object.freeze([
  'black',
  'white',
  'gray',
  'brown',
  'beige',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'multicolor',
] as const);
export const garmentTypeStatuses = Object.freeze([
  'active',
  'deprecated',
] as const);

export const garmentTypeIdSchema = z.enum(garmentTypeIds);
export const structuralCategorySchema = z.enum(structuralCategories);
export const layerRoleSchema = z.enum(layerRoles);
export const bodyRegionSchema = z.enum(bodyRegions);
export const thermalLevelSchema = z.enum(thermalLevels);
export const waterProtectionSchema = z.enum(waterProtections);
export const windProtectionSchema = z.enum(windProtections);
export const breathabilitySchema = z.enum(breathabilityLevels);
export const coverageSchema = z.enum(coverageLevels);
export const tractionSuitabilitySchema = z.enum(tractionSuitabilities);
export const colorFamilySchema = z.enum(colorFamilies);
export const garmentTypeStatusSchema = z.enum(garmentTypeStatuses);
export const apparelPreferenceApplicabilitySchema = z.enum(clothingPreferences);

export type GarmentTypeId = z.infer<typeof garmentTypeIdSchema>;
export type StructuralCategory = z.infer<typeof structuralCategorySchema>;
export type LayerRole = z.infer<typeof layerRoleSchema>;
export type BodyRegion = z.infer<typeof bodyRegionSchema>;
export type ThermalLevel = z.infer<typeof thermalLevelSchema>;
export type WaterProtection = z.infer<typeof waterProtectionSchema>;
export type WindProtection = z.infer<typeof windProtectionSchema>;
export type Breathability = z.infer<typeof breathabilitySchema>;
export type Coverage = z.infer<typeof coverageSchema>;
export type TractionSuitability = z.infer<typeof tractionSuitabilitySchema>;
export type ColorFamily = z.infer<typeof colorFamilySchema>;
export type GarmentTypeStatus = z.infer<typeof garmentTypeStatusSchema>;

export type GarmentTypeNameKey =
  `catalog.garment_type.${GarmentTypeId}.name`;

export const garmentTypeSchema = z.object({
  typeId: garmentTypeIdSchema,
  structuralCategory: structuralCategorySchema,
  nameKey: z.string().regex(
    /^catalog\.garment_type\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*\.name$/,
  ),
  bodyRegion: bodyRegionSchema.nullable(),
  supportedLayerRoles: z.array(layerRoleSchema).readonly(),
  defaultThermalLevel: thermalLevelSchema.nullable(),
  defaultWaterProtection: waterProtectionSchema.nullable(),
  defaultWindProtection: windProtectionSchema.nullable(),
  defaultBreathability: breathabilitySchema.nullable(),
  defaultArmCoverage: coverageSchema.nullable(),
  defaultLegCoverage: coverageSchema.nullable(),
  defaultTractionSuitability: tractionSuitabilitySchema.nullable(),
  apparelPreferenceApplicability: z
    .array(apparelPreferenceApplicabilitySchema)
    .nonempty()
    .readonly(),
  status: garmentTypeStatusSchema,
  replacedByTypeId: garmentTypeIdSchema.nullable(),
}).strict();

type ParsedGarmentType = z.infer<typeof garmentTypeSchema>;
export type GarmentType = Readonly<
  Omit<ParsedGarmentType, 'nameKey'> & Readonly<{ nameKey: GarmentTypeNameKey }>
>;

export const garmentCatalogManifestSchema = z.object({
  catalogVersion: z.number().int().positive(),
  garmentTypes: z.array(garmentTypeSchema).readonly(),
}).strict();

type ParsedGarmentCatalogManifest = z.infer<typeof garmentCatalogManifestSchema>;
export type GarmentCatalogManifest = Readonly<
  Omit<ParsedGarmentCatalogManifest, 'garmentTypes'> &
    Readonly<{ garmentTypes: readonly GarmentType[] }>
>;

export const catalogAttributeValues = Object.freeze({
  structural_category: structuralCategories,
  layer_role: layerRoles,
  body_region: bodyRegions,
  thermal_level: thermalLevels,
  water_protection: waterProtections,
  wind_protection: windProtections,
  breathability: breathabilityLevels,
  coverage: coverageLevels,
  traction_suitability: tractionSuitabilities,
  apparel_preference_applicability: clothingPreferences,
});

type CatalogAttributeValues = typeof catalogAttributeValues;
type CatalogAttributeName = keyof CatalogAttributeValues;
type CatalogAttributeValue<Name extends CatalogAttributeName> =
  CatalogAttributeValues[Name][number];

export type CatalogAttributeMessageKey = {
  [Name in CatalogAttributeName]:
    `catalog.attribute.${Name}.${CatalogAttributeValue<Name>}`;
}[CatalogAttributeName];

export type ColorFamilyMessageKey = `catalog.color_family.${ColorFamily}`;
export type CatalogMessageKey =
  | GarmentTypeNameKey
  | CatalogAttributeMessageKey
  | ColorFamilyMessageKey;

export const catalogLocalizationKeys: readonly CatalogMessageKey[] = Object.freeze([
  ...garmentTypeIds.map(
    (typeId): GarmentTypeNameKey => `catalog.garment_type.${typeId}.name`,
  ),
  ...Object.entries(catalogAttributeValues).flatMap(([field, values]) =>
    values.map(
      (value) =>
        `catalog.attribute.${field}.${value}` as CatalogAttributeMessageKey,
    ),
  ),
  ...colorFamilies.map(
    (value): ColorFamilyMessageKey => `catalog.color_family.${value}`,
  ),
]);
