import {
  catalogLocalizationKeys,
  garmentCatalogManifestSchema,
  garmentTypeIds,
  type CatalogMessageKey,
  type GarmentCatalogManifest,
  type GarmentType,
  type GarmentTypeId,
  type GarmentTypeNameKey,
  type StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import type { ClothingPreference } from '@/domain/preferences';

export const garmentCatalogVersion = 2;

export class GarmentCatalogValidationError extends Error {
  constructor() {
    super('The garment catalog is invalid.');
    this.name = 'GarmentCatalogValidationError';
  }
}

type GarmentTypeDefinition = Omit<
  GarmentType,
  'nameKey' | 'status' | 'replacedByTypeId'
> & Readonly<{
  status?: GarmentType['status'];
  replacedByTypeId?: GarmentType['replacedByTypeId'];
}>;

function defineGarmentType(definition: GarmentTypeDefinition): GarmentType {
  return {
    ...definition,
    nameKey: `catalog.garment_type.${definition.typeId}.name`,
    status: definition.status ?? 'active',
    replacedByTypeId: definition.replacedByTypeId ?? null,
  };
}

const bothPreferences = ['womens', 'mens'] as const;
const womensPreference = ['womens'] as const;

const garmentTypeDefinitions = [
  defineGarmentType({
    typeId: 't_shirt',
    structuralCategory: 'top',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['base', 'standalone'],
    defaultThermalLevel: 'none',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'high',
    defaultArmCoverage: 'partial',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'casual',
  }),
  defineGarmentType({
    typeId: 'long_sleeve_t_shirt',
    structuralCategory: 'top',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['base', 'standalone'],
    defaultThermalLevel: 'light',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'high',
    defaultArmCoverage: 'full',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'casual',
  }),
  defineGarmentType({
    typeId: 'shirt',
    structuralCategory: 'top',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['base', 'standalone'],
    defaultThermalLevel: 'light',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: 'full',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'smart',
  }),
  defineGarmentType({
    typeId: 'blouse',
    structuralCategory: 'top',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['base', 'standalone'],
    defaultThermalLevel: 'light',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: 'partial',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: womensPreference,
    formality: 'smart',
  }),
  defineGarmentType({
    typeId: 'sweatshirt',
    structuralCategory: 'top',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['mid', 'standalone'],
    defaultThermalLevel: 'moderate',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: 'full',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'casual',
  }),
  defineGarmentType({
    typeId: 'hoodie',
    structuralCategory: 'top',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['mid', 'outer', 'standalone'],
    defaultThermalLevel: 'moderate',
    defaultWaterProtection: 'none',
    defaultWindProtection: 'none',
    defaultBreathability: 'moderate',
    defaultArmCoverage: 'full',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'casual',
  }),
  defineGarmentType({
    typeId: 'sweater',
    structuralCategory: 'top',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['mid', 'standalone'],
    defaultThermalLevel: 'moderate',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: 'full',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'smart',
  }),
  defineGarmentType({
    typeId: 'cardigan',
    structuralCategory: 'top',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['mid', 'standalone'],
    defaultThermalLevel: 'moderate',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: 'full',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'smart',
  }),
  defineGarmentType({
    typeId: 'overshirt',
    structuralCategory: 'top',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['mid', 'outer', 'standalone'],
    defaultThermalLevel: 'light',
    defaultWaterProtection: 'none',
    defaultWindProtection: 'none',
    defaultBreathability: 'moderate',
    defaultArmCoverage: 'full',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'casual',
  }),
  defineGarmentType({
    typeId: 'trousers',
    structuralCategory: 'bottom',
    bodyRegion: 'lower_body',
    supportedLayerRoles: ['standalone'],
    defaultThermalLevel: 'light',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: null,
    defaultLegCoverage: 'full',
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'formal',
  }),
  defineGarmentType({
    typeId: 'jeans',
    structuralCategory: 'bottom',
    bodyRegion: 'lower_body',
    supportedLayerRoles: ['standalone'],
    defaultThermalLevel: 'light',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'low',
    defaultArmCoverage: null,
    defaultLegCoverage: 'full',
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'casual',
  }),
  defineGarmentType({
    typeId: 'shorts',
    structuralCategory: 'bottom',
    bodyRegion: 'lower_body',
    supportedLayerRoles: ['standalone'],
    defaultThermalLevel: 'none',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'high',
    defaultArmCoverage: null,
    defaultLegCoverage: 'partial',
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'casual',
  }),
  defineGarmentType({
    typeId: 'skirt',
    structuralCategory: 'bottom',
    bodyRegion: 'lower_body',
    supportedLayerRoles: ['standalone'],
    defaultThermalLevel: 'light',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: null,
    defaultLegCoverage: 'partial',
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: womensPreference,
    formality: 'smart',
  }),
  defineGarmentType({
    typeId: 'dress',
    structuralCategory: 'one_piece',
    bodyRegion: 'full_body',
    supportedLayerRoles: ['standalone'],
    defaultThermalLevel: 'light',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: 'none',
    defaultLegCoverage: 'partial',
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: womensPreference,
    formality: 'formal',
  }),
  defineGarmentType({
    typeId: 'jumpsuit',
    structuralCategory: 'one_piece',
    bodyRegion: 'full_body',
    supportedLayerRoles: ['standalone'],
    defaultThermalLevel: 'light',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: 'partial',
    defaultLegCoverage: 'full',
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'smart',
  }),
  defineGarmentType({
    typeId: 'light_jacket',
    structuralCategory: 'outerwear',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['outer'],
    defaultThermalLevel: 'light',
    defaultWaterProtection: 'none',
    defaultWindProtection: 'wind_resistant',
    defaultBreathability: 'moderate',
    defaultArmCoverage: 'full',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'smart',
  }),
  defineGarmentType({
    typeId: 'trench_coat',
    structuralCategory: 'outerwear',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['outer'],
    defaultThermalLevel: 'moderate',
    defaultWaterProtection: 'water_resistant',
    defaultWindProtection: 'wind_resistant',
    defaultBreathability: 'low',
    defaultArmCoverage: 'full',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'formal',
  }),
  defineGarmentType({
    typeId: 'rain_jacket',
    structuralCategory: 'outerwear',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['outer'],
    defaultThermalLevel: 'light',
    defaultWaterProtection: 'waterproof',
    defaultWindProtection: 'wind_resistant',
    defaultBreathability: 'moderate',
    defaultArmCoverage: 'full',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'casual',
  }),
  defineGarmentType({
    typeId: 'insulated_jacket',
    structuralCategory: 'outerwear',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['outer'],
    defaultThermalLevel: 'high',
    defaultWaterProtection: 'water_resistant',
    defaultWindProtection: 'wind_resistant',
    defaultBreathability: 'low',
    defaultArmCoverage: 'full',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'casual',
  }),
  defineGarmentType({
    typeId: 'coat',
    structuralCategory: 'outerwear',
    bodyRegion: 'upper_body',
    supportedLayerRoles: ['outer'],
    defaultThermalLevel: 'high',
    defaultWaterProtection: 'none',
    defaultWindProtection: 'wind_resistant',
    defaultBreathability: 'low',
    defaultArmCoverage: 'full',
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'formal',
  }),
  defineGarmentType({
    typeId: 'sneakers',
    structuralCategory: 'footwear',
    bodyRegion: 'feet',
    supportedLayerRoles: [],
    defaultThermalLevel: 'light',
    defaultWaterProtection: 'none',
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: null,
    defaultLegCoverage: null,
    defaultTractionSuitability: 'everyday',
    apparelPreferenceApplicability: bothPreferences,
    formality: 'casual',
  }),
  defineGarmentType({
    typeId: 'closed_shoes',
    structuralCategory: 'footwear',
    bodyRegion: 'feet',
    supportedLayerRoles: [],
    defaultThermalLevel: 'light',
    defaultWaterProtection: 'none',
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: null,
    defaultLegCoverage: null,
    defaultTractionSuitability: 'everyday',
    apparelPreferenceApplicability: bothPreferences,
    formality: 'formal',
  }),
  defineGarmentType({
    typeId: 'ankle_boots',
    structuralCategory: 'footwear',
    bodyRegion: 'feet',
    supportedLayerRoles: [],
    defaultThermalLevel: 'moderate',
    defaultWaterProtection: 'none',
    defaultWindProtection: null,
    defaultBreathability: 'low',
    defaultArmCoverage: null,
    defaultLegCoverage: null,
    defaultTractionSuitability: 'everyday',
    apparelPreferenceApplicability: bothPreferences,
    formality: 'smart',
  }),
  defineGarmentType({
    typeId: 'weather_boots',
    structuralCategory: 'footwear',
    bodyRegion: 'feet',
    supportedLayerRoles: [],
    defaultThermalLevel: 'high',
    defaultWaterProtection: 'waterproof',
    defaultWindProtection: null,
    defaultBreathability: 'low',
    defaultArmCoverage: null,
    defaultLegCoverage: null,
    defaultTractionSuitability: 'enhanced',
    apparelPreferenceApplicability: bothPreferences,
    formality: 'casual',
  }),
  defineGarmentType({
    typeId: 'sandals',
    structuralCategory: 'footwear',
    bodyRegion: 'feet',
    supportedLayerRoles: [],
    defaultThermalLevel: 'none',
    defaultWaterProtection: 'none',
    defaultWindProtection: null,
    defaultBreathability: 'high',
    defaultArmCoverage: null,
    defaultLegCoverage: null,
    defaultTractionSuitability: 'everyday',
    apparelPreferenceApplicability: bothPreferences,
    formality: 'casual',
  }),
  defineGarmentType({
    typeId: 'beanie',
    structuralCategory: 'accessory',
    bodyRegion: 'head',
    supportedLayerRoles: [],
    defaultThermalLevel: 'moderate',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: null,
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'casual',
  }),
  defineGarmentType({
    typeId: 'brimmed_hat',
    structuralCategory: 'accessory',
    bodyRegion: 'head',
    supportedLayerRoles: [],
    defaultThermalLevel: 'none',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'high',
    defaultArmCoverage: null,
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'smart',
  }),
  defineGarmentType({
    typeId: 'scarf',
    structuralCategory: 'accessory',
    bodyRegion: 'neck',
    supportedLayerRoles: [],
    defaultThermalLevel: 'moderate',
    defaultWaterProtection: null,
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: null,
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'smart',
  }),
  defineGarmentType({
    typeId: 'gloves',
    structuralCategory: 'accessory',
    bodyRegion: 'hands',
    supportedLayerRoles: [],
    defaultThermalLevel: 'moderate',
    defaultWaterProtection: 'water_resistant',
    defaultWindProtection: null,
    defaultBreathability: 'moderate',
    defaultArmCoverage: null,
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'smart',
  }),
  defineGarmentType({
    typeId: 'umbrella',
    structuralCategory: 'accessory',
    bodyRegion: null,
    supportedLayerRoles: [],
    defaultThermalLevel: null,
    defaultWaterProtection: 'waterproof',
    defaultWindProtection: null,
    defaultBreathability: null,
    defaultArmCoverage: null,
    defaultLegCoverage: null,
    defaultTractionSuitability: null,
    apparelPreferenceApplicability: bothPreferences,
    formality: 'smart',
  }),
] as const;

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function hasExpectedCoverage(type: GarmentType): boolean {
  const needsArmCoverage =
    type.bodyRegion === 'upper_body' || type.bodyRegion === 'full_body';
  const needsLegCoverage =
    type.bodyRegion === 'lower_body' || type.bodyRegion === 'full_body';

  return (
    (needsArmCoverage
      ? type.defaultArmCoverage !== null
      : type.defaultArmCoverage === null) &&
    (needsLegCoverage
      ? type.defaultLegCoverage !== null
      : type.defaultLegCoverage === null)
  );
}

function hasExpectedCategoryShape(type: GarmentType): boolean {
  const expectedRegionByCategory: Readonly<
    Partial<Record<StructuralCategory, GarmentType['bodyRegion']>>
  > = {
    top: 'upper_body',
    bottom: 'lower_body',
    one_piece: 'full_body',
    outerwear: 'upper_body',
    footwear: 'feet',
  };

  if (type.structuralCategory === 'accessory') {
    if (type.typeId === 'umbrella') {
      return type.bodyRegion === null;
    }

    return (
      type.bodyRegion === 'head' ||
      type.bodyRegion === 'neck' ||
      type.bodyRegion === 'hands'
    );
  }

  return type.bodyRegion === expectedRegionByCategory[type.structuralCategory];
}

function validateReplacementGraph(types: readonly GarmentType[]): void {
  const byId = new Map(types.map((type) => [type.typeId, type]));

  for (const type of types) {
    if (type.status === 'active' && type.replacedByTypeId !== null) {
      throw new GarmentCatalogValidationError();
    }

    if (type.replacedByTypeId === null) {
      continue;
    }

    const replacement = byId.get(type.replacedByTypeId);
    if (
      !replacement ||
      replacement.typeId === type.typeId ||
      replacement.structuralCategory !== type.structuralCategory
    ) {
      throw new GarmentCatalogValidationError();
    }

    const visited = new Set<GarmentTypeId>([type.typeId]);
    let current: GarmentType | undefined = replacement;

    while (current?.replacedByTypeId) {
      if (visited.has(current.typeId)) {
        throw new GarmentCatalogValidationError();
      }

      visited.add(current.typeId);
      current = byId.get(current.replacedByTypeId);
      if (!current) {
        throw new GarmentCatalogValidationError();
      }
    }

    if (current && visited.has(current.typeId)) {
      throw new GarmentCatalogValidationError();
    }
  }
}

function deepFreeze<Value>(value: Value): Readonly<Value> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }

    if (!Object.isFrozen(value)) {
      Object.freeze(value);
    }
  }

  return value;
}

export function validateGarmentCatalog(input: unknown): GarmentCatalogManifest {
  const result = garmentCatalogManifestSchema.safeParse(input);
  if (!result.success) {
    throw new GarmentCatalogValidationError();
  }

  const manifest = result.data as GarmentCatalogManifest;
  const ids = manifest.garmentTypes.map(({ typeId }) => typeId);
  if (
    manifest.catalogVersion !== garmentCatalogVersion ||
    manifest.garmentTypes.length !== garmentTypeIds.length ||
    hasDuplicates(ids) ||
    garmentTypeIds.some((typeId) => !ids.includes(typeId))
  ) {
    throw new GarmentCatalogValidationError();
  }

  for (const type of manifest.garmentTypes) {
    const expectedNameKey: GarmentTypeNameKey =
      `catalog.garment_type.${type.typeId}.name`;
    const layeringApplies =
      type.structuralCategory !== 'footwear' &&
      type.structuralCategory !== 'accessory';

    if (
      type.nameKey !== expectedNameKey ||
      hasDuplicates(type.supportedLayerRoles) ||
      hasDuplicates(type.apparelPreferenceApplicability) ||
      !hasExpectedCategoryShape(type) ||
      !hasExpectedCoverage(type) ||
      (layeringApplies
        ? type.supportedLayerRoles.length === 0
        : type.supportedLayerRoles.length !== 0) ||
      (type.structuralCategory === 'footwear'
        ? type.defaultTractionSuitability === null
        : type.defaultTractionSuitability !== null) ||
      (type.bodyRegion === null
        ? type.defaultBreathability !== null || type.defaultThermalLevel !== null
        : type.defaultBreathability === null || type.defaultThermalLevel === null)
    ) {
      throw new GarmentCatalogValidationError();
    }
  }

  validateReplacementGraph(manifest.garmentTypes);
  return deepFreeze(manifest) as GarmentCatalogManifest;
}

export function validateGarmentCatalogLocalization(
  catalog: GarmentCatalogManifest,
  messagesByLanguage: Readonly<
    Record<'en' | 'tr', Readonly<Partial<Record<CatalogMessageKey, string>>>>
  >,
): void {
  if (hasDuplicates(catalogLocalizationKeys)) {
    throw new GarmentCatalogValidationError();
  }

  const requiredKeys = new Set<CatalogMessageKey>(catalogLocalizationKeys);
  for (const type of catalog.garmentTypes) {
    requiredKeys.add(type.nameKey);
  }

  for (const language of ['en', 'tr'] as const) {
    for (const key of requiredKeys) {
      const message = messagesByLanguage[language][key];
      if (typeof message !== 'string' || message.trim().length === 0) {
        throw new GarmentCatalogValidationError();
      }
    }
  }
}

export const garmentCatalog = validateGarmentCatalog({
  catalogVersion: garmentCatalogVersion,
  garmentTypes: garmentTypeDefinitions,
});

const garmentTypesById = new Map(
  garmentCatalog.garmentTypes.map((type) => [type.typeId, type]),
);

export function getGarmentType(typeId: string): GarmentType | null {
  return garmentTypesById.get(typeId as GarmentTypeId) ?? null;
}

export function listGarmentTypesForPreference(
  preference: ClothingPreference,
): readonly GarmentType[] {
  return Object.freeze(
    garmentCatalog.garmentTypes.filter(({ apparelPreferenceApplicability }) =>
      apparelPreferenceApplicability.includes(preference),
    ),
  );
}
