import {
  aiOptionSchema,
  aiRecommendV1RequestSchema,
  archetypeDayFromRequirements,
  insightSentenceSchema,
  aiV1OptionLimit,
  bodyRegions,
  breathabilityLevels,
  clothingPreferences,
  clothingRequirementSchema,
  colorFamilies,
  coverageLevels,
  dayKindSchema,
  dressStyleSchema,
  styleAestheticSchema,
  styleAestheticsLimit,
  garmentTypeIds,
  layerRoles,
  structuralCategories,
  thermalLevels,
  tractionSuitabilities,
  waterProtections,
  windProtections,
  weatherConditionCodes,
  type AiOption,
  type AiRecommendV1Request,
} from '@kuyara/contracts';
import { z } from 'zod';

import { defaultDressStyle, orderStyleAesthetics } from '@/features/profile/domain/profile';
import { garmentCatalogVersion } from '@/features/catalog/domain/garment-catalog';
import {
  composeOutfitPool,
  excludeOutfitOptions,
  outfitMatchesArchetype,
  outfitOptionId,
  type OutfitRecommendationInput,
} from '@/features/recommendation/application/recommend-outfits';
import { WorkerAiRecommendationMappingError } from '@/features/recommendation/application/recommendation-mapping-error';
import {
  assignedOutfitGarments,
  outfitGarments,
  type OutfitCandidate,
} from '@/features/recommendation/domain/outfit-composition';
import {
  deriveClothingRequirements,
  type ClothingRequirement,
  type ClothingRequirements,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';
import { sortByAestheticAffinity } from '@/features/recommendation/domain/aesthetic-affinity';
import { outfitCoverage } from '@/features/recommendation/domain/outfit-coverage';
import { dressingDayKeySchema } from '@/features/weather/domain/wardrobe-day';

export const recommendationContextSchema = z.strictObject({
  clothingPreference: z.enum(clothingPreferences),
  dressStyle: dressStyleSchema.optional(),
  styleAesthetics: z.array(styleAestheticSchema).max(styleAestheticsLimit).optional(),
  catalogVersion: z.number().int().min(1),
  dayVariant: z.number().int().min(0).max(6),
  // Optional, so a row persisted before the weekday rule still parses and keeps its label.
  dayKind: dayKindSchema.optional(),
  // The dressing-day key: a bare local date, or that date plus `:evening` for the hours
  // from 18:00 through 04:00. A row written before the evening window still parses.
  localDayKey: dressingDayKeySchema.optional(),
  paletteWeather: z.strictObject({
    temperatureC: z.number().finite(),
    condition: z.enum(weatherConditionCodes),
  }).optional(),
  requirements: z.array(clothingRequirementSchema).max(11),
  options: z.array(aiOptionSchema).max(aiV1OptionLimit),
  insightSentence: insightSentenceSchema.optional(),
  insightLocale: z.enum(['tr', 'en']).optional(),
  coverageStart: z.iso.datetime().optional(),
  coverageEnd: z.iso.datetime().optional(),
}).superRefine(({ options, insightSentence, insightLocale }, context) => {
  if (Boolean(insightSentence) !== Boolean(insightLocale)) {
    context.addIssue({
      code: 'custom', message: 'Insight sentence and locale must be stored together.',
      path: ['insightLocale'],
    });
  }
  const seen = new Set<string>();
  options.forEach(({ optionId }, index) => {
    if (seen.has(optionId)) {
      context.addIssue({
        code: 'custom',
        message: 'Option ids must be unique.',
        path: ['options', index, 'optionId'],
      });
    }
    seen.add(optionId);
  });
});


export const legacyCandidateSchema = z.strictObject({
  candidateKey: z.string().regex(/^[A-Za-z0-9:_-]{1,64}$/),
  source: z.enum(['catalog', 'wardrobe']),
  garmentTypeId: z.enum(garmentTypeIds),
  colorFamily: z.enum(colorFamilies).nullable(),
  properties: z.strictObject({
    category: z.enum(structuralCategories),
    bodyRegion: z.enum(bodyRegions).nullable(),
    supportedLayerRoles: z.array(z.enum(layerRoles)).max(4),
    thermalLevel: z.enum(thermalLevels).nullable(),
    waterProtection: z.enum(waterProtections).nullable(),
    windProtection: z.enum(windProtections).nullable(),
    breathability: z.enum(breathabilityLevels).nullable(),
    armCoverage: z.enum(coverageLevels).nullable(),
    legCoverage: z.enum(coverageLevels).nullable(),
    tractionSuitability: z.enum(tractionSuitabilities).nullable(),
  }),
});


export const legacyRecommendationContextSchema = z.strictObject({
  clothingPreference: z.enum(clothingPreferences),
  requirements: z.array(clothingRequirementSchema).max(8),
  candidates: z.array(legacyCandidateSchema).min(1).max(125),
});

export type RecommendationContext =
  | z.infer<typeof recommendationContextSchema>
  | z.infer<typeof legacyRecommendationContextSchema>;

export function toAiOption(outfit: OutfitCandidate): AiOption {
  const garments = assignedOutfitGarments(outfit);
  const outer = outfit.outerLayer?.garment.properties;
  const primary = outfit.body.kind === 'separates'
    ? outfit.body.primaryTop.garment
    : outfit.body.onePiece.garment;
  const parsed = aiOptionSchema.safeParse({
    optionId: outfitOptionId(outfit),
    formality: outfit.formality,
    garments: outfitGarments(outfit).map(({ slot, layerRole, garment }) => ({
      slot,
      layerRole,
      garmentTypeId: garment.garmentTypeId,
    })),
    traits: {
      hasMidLayer: outfit.midLayer !== null,
      hasOuterLayer: outfit.outerLayer !== null,
      outerThermalHigh: outer?.thermalLevel === 'high',
      outerWaterProtective:
        outer?.waterProtection === 'water_resistant' ||
        outer?.waterProtection === 'waterproof',
      windResistant: garments.some(
        ({ garment }) => garment.properties.windProtection === 'wind_resistant',
      ),
      tractionEnhanced:
        outfit.footwear.garment.properties.tractionSuitability === 'enhanced',
      breathabilityHigh: primary.properties.breathability === 'high',
    },
  });
  if (!parsed.success) throw new WorkerAiRecommendationMappingError();
  return parsed.data;
}

export function createRecommendationContext(
  input: OutfitRecommendationInput,
  localDayKey?: string,
): RecommendationContext {
  return createRecommendationContextWithPool(input, localDayKey).context;
}

export function createRecommendationContextWithPool(
  input: OutfitRecommendationInput,
  localDayKey?: string,
): Readonly<{
  context: RecommendationContext;
  poolOptionIds: readonly string[];
  /** The composed pool itself, in composition order; `poolOptionIds` are its ids. */
  pool?: readonly OutfitCandidate[];
}> {
  const departureAt = input.departureAt ?? input.now;
  const requirements = deriveClothingRequirements(input.snapshot, input.now, departureAt);
  const day = archetypeDayFromRequirements(requirements.requirements);
  const coverage = outfitCoverage(departureAt, input.snapshot.timeZone);
  const composition = composeOutfitPool(requirements, input.clothingPreference, input.dayVariant,
    input.recentWorn);
  const availableOutfits = composition.status === 'composed'
    ? excludeOutfitOptions(composition.outfits, input.excludedOutfits)
    : [];
  const parsed = recommendationContextSchema.safeParse({
    clothingPreference: input.clothingPreference,
    dressStyle: input.dressStyle ?? defaultDressStyle,
    ...(input.styleAesthetics?.length ? { styleAesthetics: orderStyleAesthetics(input.styleAesthetics) } : {}),
    catalogVersion: garmentCatalogVersion,
    dayVariant: input.dayVariant,
    dayKind: input.dayKind,
    localDayKey,
    paletteWeather: {
      temperatureC: input.snapshot.current.temperatureCelsius,
      condition: input.snapshot.current.condition,
    },
    ...(coverage ? { coverageStart: coverage.start, coverageEnd: coverage.end } : {}),
    requirements: requirements.requirements,
    options: sortByAestheticAffinity(availableOutfits, input.styleAesthetics ?? [],
      (outfit, id) => outfitMatchesArchetype(outfit, id, input.dayKind, day)).map(toAiOption),
  });
  if (!parsed.success) throw new WorkerAiRecommendationMappingError();
  return {
    context: parsed.data,
    poolOptionIds: composition.status === 'composed'
      ? composition.outfits.map(outfitOptionId)
      : [],
    pool: composition.status === 'composed' ? composition.outfits : [],
  };
}

export function aiRequestFromContext(
  context: RecommendationContext,
): AiRecommendV1Request | null {
  // A mild day derives no requirement and still reaches the AI tiers: the pool of composed
  // options is what decides whether there is anything to choose from, not the weather.
  if (!('options' in context) || context.options.length < 3) return null;
  const parsed = aiRecommendV1RequestSchema.safeParse({
    clothingPreference: context.clothingPreference,
    dressStyle: context.dressStyle,
    catalogVersion: context.catalogVersion,
    dayVariant: context.dayVariant,
    dayKind: context.dayKind,
    requirements: context.requirements,
    options: context.options,
  });
  if (!parsed.success) throw new WorkerAiRecommendationMappingError();
  return { ...parsed.data, ...('styleAesthetics' in context && context.styleAesthetics?.length
    ? { styleAesthetics: context.styleAesthetics }
    : {}) };
}

export function domainRequirements(context: RecommendationContext): ClothingRequirements {
  const requirements = Object.freeze(context.requirements.map((requirement) =>
    Object.freeze({
      ...requirement,
      reasonCodes: Object.freeze([...requirement.reasonCodes]),
    }) as ClothingRequirement,
  ));
  return Object.freeze({
    requirements,
    reasonCodes: Object.freeze([
      ...new Set(requirements.flatMap(({ reasonCodes }) => reasonCodes)),
    ]),
  });
}
