import {
  aiOptionSchema,
  aiRecommendV1RequestSchema,
  aiRecommendV1SuccessSchema,
  aiV1OptionLimit,
  bodyRegions,
  breathabilityLevels,
  clothingPreferences,
  clothingRequirementSchema,
  colorFamilies,
  coverageLevels,
  garmentTypeIds,
  layerRoles,
  outfitArchetypeIds,
  structuralCategories,
  thermalLevels,
  tractionSuitabilities,
  waterProtections,
  windProtections,
  type AiOption,
  type AiRecommendV1Request,
  type AiRecommendV1Success,
  type OutfitArchetypeId,
} from '@kuyara/contracts';
import { z } from 'zod';

import {
  garmentCatalogVersion,
  listGarmentTypesForPreference,
} from '@/features/catalog/domain/garment-catalog';
import {
  assignFallbackArchetypes,
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
  type GarmentEligibilityResult,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  composeOutfit,
  composeOutfitOptions,
  type AssignedOutfitGarment,
  type OutfitCandidate,
} from '@/features/recommendation/domain/outfit-composition';
import {
  deriveClothingRequirements,
  type ClothingRequirement,
  type ClothingRequirements,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';

export class WorkerAiRecommendationMappingError extends Error {
  constructor() {
    super('The AI recommendation could not be mapped.');
    this.name = 'WorkerAiRecommendationMappingError';
  }
}

const recommendationContextSchema = z.object({
  clothingPreference: z.enum(clothingPreferences),
  catalogVersion: z.number().int().min(1),
  dayVariant: z.number().int().min(0).max(6),
  requirements: z.array(clothingRequirementSchema).max(8),
  options: z.array(aiOptionSchema).max(aiV1OptionLimit),
}).strict().superRefine(({ options }, context) => {
  const seen = new Set<string>();
  options.forEach(({ optionId }, index) => {
    if (seen.has(optionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Option ids must be unique.',
        path: ['options', index, 'optionId'],
      });
    }
    seen.add(optionId);
  });
});

const legacyCandidateSchema = z.object({
  candidateKey: z.string().regex(/^[A-Za-z0-9:_-]{1,64}$/),
  source: z.enum(['catalog', 'wardrobe']),
  garmentTypeId: z.enum(garmentTypeIds),
  colorFamily: z.enum(colorFamilies).nullable(),
  properties: z.object({
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
  }).strict(),
}).strict();

const legacyRecommendationContextSchema = z.object({
  clothingPreference: z.enum(clothingPreferences),
  requirements: z.array(clothingRequirementSchema).max(8),
  candidates: z.array(legacyCandidateSchema).min(1).max(125),
}).strict();

export type RecommendationContext =
  | z.infer<typeof recommendationContextSchema>
  | z.infer<typeof legacyRecommendationContextSchema>;

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

function toAiOption(outfit: OutfitCandidate): AiOption {
  const garments = assignedGarments(outfit);
  const outer = outfit.outerLayer?.garment.properties;
  const primary = outfit.body.kind === 'separates'
    ? outfit.body.primaryTop.garment
    : outfit.body.onePiece.garment;
  const parsed = aiOptionSchema.safeParse({
    optionId: outfitOptionId(outfit),
    formality: outfit.formality,
    garments: garments.map(({ slot, layerRole, garment }) => ({
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
): RecommendationContext {
  const requirements = deriveClothingRequirements(input.snapshot);
  const candidates = listGarmentTypesForPreference(input.clothingPreference).map(
    (type) => evaluateGarmentEligibility(
      requirements,
      projectCatalogEffectiveGarment(type.typeId, input.clothingPreference),
    ),
  );
  const composition = composeOutfitOptions(
    requirements,
    candidates,
    input.dayVariant,
  );
  const parsed = recommendationContextSchema.safeParse({
    clothingPreference: input.clothingPreference,
    catalogVersion: garmentCatalogVersion,
    dayVariant: input.dayVariant,
    requirements: requirements.requirements,
    options: composition.status === 'composed'
      ? composition.outfits.map(toAiOption)
      : [],
  });
  if (!parsed.success) throw new WorkerAiRecommendationMappingError();
  return parsed.data;
}

export function createAiRecommendationRequest(
  input: OutfitRecommendationInput,
): AiRecommendV1Request {
  const request = aiRequestFromContext(createRecommendationContext(input));
  if (!request) throw new WorkerAiRecommendationMappingError();
  return request;
}

export function parseRecommendationContext(value: unknown): RecommendationContext {
  const current = recommendationContextSchema.safeParse(value);
  if (current.success) return current.data;
  const legacy = legacyRecommendationContextSchema.safeParse(value);
  if (!legacy.success) throw new WorkerAiRecommendationMappingError();
  return legacy.data;
}

export function aiRequestFromContext(
  context: RecommendationContext,
): AiRecommendV1Request | null {
  if (
    !('options' in context) ||
    context.requirements.length === 0 ||
    context.options.length < 3
  ) return null;
  const parsed = aiRecommendV1RequestSchema.safeParse(context);
  if (!parsed.success) throw new WorkerAiRecommendationMappingError();
  return parsed.data;
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
  const composition = composeOutfit(requirements, candidates);
  if (composition.status !== 'composed' || !matchesOption(composition.outfit, option)) {
    throw new WorkerAiRecommendationMappingError();
  }
  return composition.outfit;
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

export function mapWorkerAiRecommendation(
  request: AiRecommendV1Request,
  data: AiRecommendV1Success['data'],
): OutfitRecommendationSuccess {
  const validated = aiRecommendV1SuccessSchema.safeParse({ data });
  if (!validated.success) throw new WorkerAiRecommendationMappingError();
  const requirements = domainRequirements(request);
  const options = new Map(request.options.map((option) => [option.optionId, option]));
  const outfits = validated.data.data.picks.map(({ optionId, archetypeId }) => {
    const option = options.get(optionId);
    if (!option) throw new WorkerAiRecommendationMappingError();
    const outfit = outfitFromOption(
      requirements,
      option,
      request.clothingPreference,
    );
    if (!outfitMatchesArchetype(outfit, archetypeId)) {
      throw new WorkerAiRecommendationMappingError();
    }
    return recommendedOutfit(outfit, archetypeId);
  });
  return Object.freeze({
    status: 'recommended',
    generationMode: 'ai-assisted',
    requirements,
    outfits: Object.freeze(outfits),
  });
}

const storedGarmentSchema = z.object({
  slot: z.enum(['primary_top', 'bottom', 'one_piece', 'mid_layer', 'outer_layer', 'footwear']),
  layerRole: z.enum(layerRoles).nullable(),
  candidateKey: z.string().regex(/^[A-Za-z0-9:_-]{1,64}$/),
}).strict();
const legacyStoredOutfitsSchema = z.array(z.array(storedGarmentSchema).min(2).max(5)).min(1).max(3);
const storedOutfitsSchema = z.array(z.object({
  archetypeId: z.enum(outfitArchetypeIds),
  garments: z.array(storedGarmentSchema).min(2).max(5),
}).strict()).min(1).max(3);

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
  const composition = composeOutfit(requirements, candidates);
  if (composition.status !== 'composed') throw new WorkerAiRecommendationMappingError();
  const actual = assignedGarments(composition.outfit).map(({ slot, layerRole, garment }) => ({
    slot,
    layerRole,
    candidateKey: garment.candidateKey,
  }));
  if (JSON.stringify(actual) !== JSON.stringify(garments)) {
    throw new WorkerAiRecommendationMappingError();
  }
  return composition.outfit;
}

export function mapStoredRecommendation(
  context: RecommendationContext,
  value: unknown,
  generationMode: RecommendationGenerationMode,
): OutfitRecommendationSuccess {
  const requirements = domainRequirements(context);
  const current = storedOutfitsSchema.safeParse(value);
  if (current.success) {
    const outfits = current.data.map(({ archetypeId, garments }) => {
      const outfit = storedOutfit(context, requirements, garments);
      if (!outfitMatchesArchetype(outfit, archetypeId)) {
        throw new WorkerAiRecommendationMappingError();
      }
      return recommendedOutfit(outfit, archetypeId);
    });
    return Object.freeze({
      status: 'recommended',
      generationMode,
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
    outfits: assignFallbackArchetypes(outfits),
  });
}

export function toStoredRecommendationOutfits(
  recommendation: OutfitRecommendationSuccess,
) {
  const stored = recommendation.outfits.map((outfit) => ({
    archetypeId: outfit.archetypeId,
    garments: assignedGarments(outfit).map(({ slot, layerRole, garment }) => ({
      slot,
      layerRole,
      candidateKey: garment.candidateKey,
    })),
  }));
  const validated = storedOutfitsSchema.safeParse(stored);
  if (!validated.success) throw new WorkerAiRecommendationMappingError();
  return validated.data;
}
