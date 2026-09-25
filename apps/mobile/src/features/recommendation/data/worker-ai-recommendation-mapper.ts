import {
  aiOptionSchema,
  aiRecommendV1RequestSchema,
  archetypeDayFromRequirements,
  aiRecommendV1SuccessSchema,
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
  garmentTypeIds,
  layerRoles,
  outfitArchetypeIds,
  picksAreMeaningfullyDifferent,
  structuralCategories,
  thermalLevels,
  tractionSuitabilities,
  waterProtections,
  windProtections,
  type AiOption,
  type AiRecommendV1Request,
  type AiRecommendV2Success,
  type OutfitArchetypeId,
} from '@kuyara/contracts';
import { z } from 'zod';

import { garmentCatalogVersion } from '@/features/catalog/domain/garment-catalog';
import {
  assignFallbackArchetypes,
  composeOutfitPool,
  excludeOutfitOptions,
  outfitOptionId,
  outfitMatchesArchetype,
  type OutfitRecommendationInput,
  type OutfitRecommendationSuccess,
  type RecommendedOutfit,
} from '@/features/recommendation/application/recommend-outfits';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
  type EffectiveGarmentCandidate,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  accessoryOutfitSlots,
  collectValidOutfits,
  outfitSlots,
  type AssignedOutfitGarment,
  type OutfitCandidate,
} from '@/features/recommendation/domain/outfit-composition';
import {
  deriveClothingRequirements,
  type ClothingRequirement,
  type ClothingRequirements,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type {
  AiGenerationMode,
  RecommendationGenerationMode,
} from '@/features/recommendation/domain/generation-mode';
import { validateInsightSentence } from '@/features/recommendation/domain/insight-sentence';
import { sortByAestheticAffinity } from '@/features/recommendation/domain/aesthetic-affinity';
import { outfitCoverage } from '@/features/recommendation/domain/outfit-coverage';

export class WorkerAiRecommendationMappingError extends Error {
  constructor() {
    super('The AI recommendation could not be mapped.');
    this.name = 'WorkerAiRecommendationMappingError';
  }
}

const recommendationContextSchema = z.strictObject({
  clothingPreference: z.enum(clothingPreferences),
  dressStyle: dressStyleSchema.optional(),
  styleAesthetics: z.array(styleAestheticSchema).max(3).optional(),
  catalogVersion: z.number().int().min(1),
  dayVariant: z.number().int().min(0).max(6),
  // Optional, so a row persisted before the weekday rule still parses and keeps its label.
  dayKind: dayKindSchema.optional(),
  // The dressing-day key: a bare local date, or that date plus `:evening` for the hours
  // from 18:00 through 04:00. A row written before the evening window still parses.
  localDayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}(:evening)?$/).optional(),
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

const legacyCandidateSchema = z.strictObject({
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

const legacyRecommendationContextSchema = z.strictObject({
  clothingPreference: z.enum(clothingPreferences),
  requirements: z.array(clothingRequirementSchema).max(8),
  candidates: z.array(legacyCandidateSchema).min(1).max(125),
});

export type RecommendationContext =
  | z.infer<typeof recommendationContextSchema>
  | z.infer<typeof legacyRecommendationContextSchema>;

// Contexts persisted between 2026-09-08's phase 1 and ADR 0031 carry the retired age band.
// No shipped build wrote one, but development databases did; a strict parse would otherwise
// throw and take the whole persisted recommendation down with it. ADR 0031: read as smart.
const retiredAgeBandKey = 'ageBand';

function normalizeRetiredContext(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!Object.hasOwn(record, retiredAgeBandKey)) return value;
  const { [retiredAgeBandKey]: _retired, ...rest } = record;
  return { ...rest, dressStyle: 'smart' };
}

function assignedGarments(outfit: OutfitCandidate): readonly AssignedOutfitGarment[] {
  return [
    ...(outfit.body.kind === 'separates'
      ? [outfit.body.primaryTop, outfit.body.bottom]
      : [outfit.body.onePiece]),
    outfit.midLayer,
    outfit.outerLayer,
    outfit.footwear,
  ].filter((garment): garment is AssignedOutfitGarment => garment !== null);
}

/**
 * Everything the option carries, the accessories after the six body slots and always in the
 * same slot order, because the round trip back from an option compares this list verbatim.
 * The traits above read the body alone: no accessory decides an archetype.
 */
function outfitGarments(outfit: OutfitCandidate): readonly AssignedOutfitGarment[] {
  return [
    ...assignedGarments(outfit),
    ...accessoryOutfitSlots.flatMap((slot) => {
      const accessory = outfit.accessories[slot];
      return accessory ? [accessory] : [];
    }),
  ];
}

function toAiOption(outfit: OutfitCandidate): AiOption {
  const garments = assignedGarments(outfit);
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
): Readonly<{ context: RecommendationContext; poolOptionIds: readonly string[] }> {
  const departureAt = input.departureAt ?? input.now;
  const requirements = deriveClothingRequirements(input.snapshot, input.now, departureAt);
  const coverage = outfitCoverage(departureAt, input.snapshot.timeZone);
  const composition = composeOutfitPool(requirements, input.clothingPreference, input.dayVariant,
    input.recentWorn);
  const availableOutfits = composition.status === 'composed'
    ? excludeOutfitOptions(composition.outfits, input.excludedOptionIds)
    : [];
  const parsed = recommendationContextSchema.safeParse({
    clothingPreference: input.clothingPreference,
    dressStyle: input.dressStyle ?? 'smart',
    ...(input.styleAesthetics?.length ? { styleAesthetics: [...input.styleAesthetics].sort() } : {}),
    catalogVersion: garmentCatalogVersion,
    dayVariant: input.dayVariant,
    dayKind: input.dayKind,
    localDayKey,
    ...(coverage ? { coverageStart: coverage.start, coverageEnd: coverage.end } : {}),
    requirements: requirements.requirements,
    options: sortByAestheticAffinity(availableOutfits, input.styleAesthetics ?? [],
      (outfit, id) => outfitMatchesArchetype(outfit, id, input.dayKind)).map(toAiOption),
  });
  if (!parsed.success) throw new WorkerAiRecommendationMappingError();
  return {
    context: parsed.data,
    poolOptionIds: composition.status === 'composed'
      ? composition.outfits.map(outfitOptionId)
      : [],
  };
}

export function createAiRecommendationRequest(
  input: OutfitRecommendationInput,
): AiRecommendV1Request {
  const request = aiRequestFromContext(createRecommendationContext(input));
  if (!request) throw new WorkerAiRecommendationMappingError();
  return request;
}

export function parseRecommendationContext(value: unknown): RecommendationContext {
  const current = recommendationContextSchema.safeParse(normalizeRetiredContext(value));
  if (current.success) {
    return { ...current.data, dressStyle: current.data.dressStyle ?? 'smart' };
  }
  const legacy = legacyRecommendationContextSchema.safeParse(value);
  if (!legacy.success) throw new WorkerAiRecommendationMappingError();
  return legacy.data;
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

function domainRequirements(context: RecommendationContext): ClothingRequirements {
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

function matchesOption(outfit: OutfitCandidate, option: AiOption): boolean {
  return JSON.stringify(toAiOption(outfit)) === JSON.stringify(option);
}

function outfitFromOption(
  requirements: ClothingRequirements,
  option: AiOption,
  clothingPreference: AiRecommendV1Request['clothingPreference'],
): OutfitCandidate {
  const candidates = option.garments.map(({ garmentTypeId }) =>
    evaluateGarmentEligibility(
      requirements,
      projectCatalogEffectiveGarment(garmentTypeId, clothingPreference),
    ));
  const composition = collectValidOutfits(requirements, candidates);
  const outfit = composition.status === 'composed'
    ? composition.outfits.find((candidate) => matchesOption(candidate, option))
    : undefined;
  if (!outfit) {
    throw new WorkerAiRecommendationMappingError();
  }
  return outfit;
}

function recommendedOutfit(
  outfit: OutfitCandidate,
  archetypeId: OutfitArchetypeId,
): RecommendedOutfit {
  return Object.freeze({
    ...outfit,
    optionId: outfitOptionId(outfit),
    archetypeId,
  });
}

// ADR 0034 section 7: one validation gate for both AI tiers. The closed candidate set, the
// archetype precondition and the shared distinctness rule are checked here, whichever
// executor produced the picks, and an answer that fails any of them is rejected whole.
export function mapWorkerAiRecommendation(
  request: AiRecommendV1Request,
  data: AiRecommendV2Success['data'],
  generationMode: AiGenerationMode = 'ai-assisted',
  insight?: Readonly<{ locale: 'tr' | 'en' }>,
): OutfitRecommendationSuccess {
  const validated = aiRecommendV1SuccessSchema.safeParse({ data });
  if (!validated.success) throw new WorkerAiRecommendationMappingError();
  const requirements = domainRequirements(request);
  const day = archetypeDayFromRequirements(requirements.requirements);
  const options = new Map(request.options.map((option) => [option.optionId, option]));
  const picked = validated.data.data.picks.map(({ optionId }) => options.get(optionId));
  if (!picked.every((option): option is AiOption => option !== undefined)) {
    throw new WorkerAiRecommendationMappingError();
  }
  if (!picksAreMeaningfullyDifferent(picked)) {
    throw new WorkerAiRecommendationMappingError();
  }
  const outfits = validated.data.data.picks.map(({ optionId, archetypeId }) => {
    const option = options.get(optionId);
    if (!option) throw new WorkerAiRecommendationMappingError();
    const outfit = outfitFromOption(
      requirements,
      option,
      request.clothingPreference,
    );
    if (!outfitMatchesArchetype(outfit, archetypeId, request.dayKind, day)) {
      throw new WorkerAiRecommendationMappingError();
    }
    return recommendedOutfit(outfit, archetypeId);
  });
  const sentence = generationMode === 'ai-assisted' && insight
    ? validateInsightSentence({
        sentence: data.insightSentence,
        locale: insight.locale,
      })
    : null;
  return Object.freeze({
    status: 'recommended',
    generationMode,
    ...(sentence && insight ? { insightSentence: sentence, insightLocale: insight.locale } : {}),
    requirements,
    outfits: Object.freeze(outfits),
  });
}

const storedGarmentSchema = z.strictObject({
  slot: z.enum(outfitSlots),
  layerRole: z.enum(layerRoles).nullable(),
  candidateKey: z.string().regex(/^[A-Za-z0-9:_-]{1,64}$/),
});
// A row written before the accessory slots carries five garments at most; one written after
// carries up to nine. Both parse, and neither needs a migration: the stored garments are
// candidate keys, and the composition they name is rebuilt from the same catalog.
const legacyStoredOutfitsSchema = z.array(z.array(storedGarmentSchema).min(2).max(9)).min(1).max(3);
const storedOutfitsSchema = z.array(z.strictObject({
  archetypeId: z.enum(outfitArchetypeIds),
  garments: z.array(storedGarmentSchema).min(2).max(9),
})).min(1).max(3);

type StoredGarment = z.infer<typeof storedGarmentSchema>;

function legacyDomainCandidate(
  candidate: z.infer<typeof legacyCandidateSchema>,
): EffectiveGarmentCandidate {
  return Object.freeze({
    candidateKey: candidate.candidateKey,
    source: candidate.source,
    garmentTypeId: candidate.garmentTypeId,
    properties: Object.freeze({
      ...candidate.properties,
      supportedLayerRoles: Object.freeze([...candidate.properties.supportedLayerRoles]),
    }),
  });
}

function storedOutfit(
  context: RecommendationContext,
  requirements: ClothingRequirements,
  garments: readonly StoredGarment[],
): OutfitCandidate {
  const candidates = garments.map(({ candidateKey }) => {
    if ('candidates' in context) {
      const candidate = context.candidates.find((item) => item.candidateKey === candidateKey);
      if (!candidate) throw new WorkerAiRecommendationMappingError();
      return evaluateGarmentEligibility(
        requirements,
        { status: 'ready', garment: legacyDomainCandidate(candidate) },
      );
    }
    const typeId = candidateKey.startsWith('catalog:')
      ? candidateKey.slice('catalog:'.length)
      : '';
    return evaluateGarmentEligibility(
      requirements,
      projectCatalogEffectiveGarment(typeId, context.clothingPreference),
    );
  });
  const composition = collectValidOutfits(requirements, candidates);
  const outfit = composition.status === 'composed'
    ? composition.outfits.find((candidate) => {
        const actual = outfitGarments(candidate).map(({ slot, layerRole, garment }) => ({
          slot,
          layerRole,
          candidateKey: garment.candidateKey,
        }));
        return JSON.stringify(actual) === JSON.stringify(garments);
      })
    : undefined;
  if (!outfit) {
    throw new WorkerAiRecommendationMappingError();
  }
  return outfit;
}

export function mapStoredRecommendation(
  context: RecommendationContext,
  value: unknown,
  generationMode: RecommendationGenerationMode,
): OutfitRecommendationSuccess {
  const requirements = domainRequirements(context);
  // The day the result was generated for, not today: a weekend result stays readable on the
  // Monday after, and a row written before this field parses as day-blind. The weather side
  // of the day comes from the stored context's own requirements for the same reason.
  const dayKind = 'options' in context ? context.dayKind : undefined;
  const day = archetypeDayFromRequirements(requirements.requirements);
  const current = storedOutfitsSchema.safeParse(value);
  if (current.success) {
    const outfits = current.data.map(({ archetypeId, garments }) => {
      const outfit = storedOutfit(context, requirements, garments);
      if (!outfitMatchesArchetype(outfit, archetypeId, dayKind, day)) {
        throw new WorkerAiRecommendationMappingError();
      }
      return recommendedOutfit(outfit, archetypeId);
    });
    return Object.freeze({
      status: 'recommended',
      generationMode,
      ...('insightSentence' in context && context.insightSentence
        ? { insightSentence: context.insightSentence, insightLocale: context.insightLocale } : {}),
      requirements,
      outfits: Object.freeze(outfits),
    });
  }

  const legacy = legacyStoredOutfitsSchema.safeParse(value);
  if (!legacy.success) throw new WorkerAiRecommendationMappingError();
  const outfits = legacy.data.map((garments) =>
    storedOutfit(context, requirements, garments));
  return Object.freeze({
    status: 'recommended',
    generationMode,
    requirements,
    outfits: assignFallbackArchetypes(outfits, requirements, undefined, dayKind),
  });
}

export function toStoredRecommendationOutfits(
  recommendation: OutfitRecommendationSuccess,
) {
  const stored = recommendation.outfits.map((outfit) => ({
    archetypeId: outfit.archetypeId,
    garments: outfitGarments(outfit).map(({ slot, layerRole, garment }) => ({
      slot,
      layerRole,
      candidateKey: garment.candidateKey,
    })),
  }));
  const validated = storedOutfitsSchema.safeParse(stored);
  if (!validated.success) throw new WorkerAiRecommendationMappingError();
  return validated.data;
}
