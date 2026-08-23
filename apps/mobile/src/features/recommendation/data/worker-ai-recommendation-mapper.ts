import {
  aiCandidateSchema,
  aiRecommendV1RequestSchema,
  aiRecommendV1SuccessSchema,
  aiOutfitSchema,
  aiV1CandidateLimit,
  clothingPreferences,
  clothingRequirementSchema,
  type AiOutfit,
  type AiRecommendV1Request,
  type AiRecommendV1Success,
} from '@kuyara/contracts';
import { z } from 'zod';

import { listGarmentTypesForPreference } from '@/features/catalog/domain/garment-catalog';
import type {
  OutfitRecommendationInput,
  OutfitRecommendationSuccess,
} from '@/features/recommendation/application/recommend-outfits';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
  projectWardrobeEffectiveGarment,
  type EffectiveGarmentCandidate,
  type GarmentEligibilityResult,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  composeOutfit,
  type AssignedOutfitGarment,
  type OutfitCandidate,
} from '@/features/recommendation/domain/outfit-composition';
import {
  deriveClothingRequirements,
  type ClothingRequirement,
  type ClothingRequirements,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';

export class WorkerAiRecommendationMappingError extends Error {
  constructor() {
    super('The AI recommendation could not be mapped.');
    this.name = 'WorkerAiRecommendationMappingError';
  }
}

const recommendationContextSchema = z.object({
  clothingPreference: z.enum(clothingPreferences),
  requirements: z.array(clothingRequirementSchema).max(8),
  candidates: z.array(aiCandidateSchema).min(1),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  value.candidates.forEach(({ candidateKey }, index) => {
    if (seen.has(candidateKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Candidate keys must be unique.',
        path: ['candidates', index, 'candidateKey'],
      });
    }
    seen.add(candidateKey);
  });
});

export type RecommendationContext = z.infer<typeof recommendationContextSchema>;

function requestCandidate(
  garment: EffectiveGarmentCandidate,
  colorFamily: WardrobeItem['colorFamily'],
) {
  return {
    candidateKey: garment.candidateKey,
    source: garment.source,
    garmentTypeId: garment.garmentTypeId,
    colorFamily,
    properties: {
      ...garment.properties,
      supportedLayerRoles: [...garment.properties.supportedLayerRoles],
    },
  };
}

export function createAiRecommendationRequest(
  input: OutfitRecommendationInput,
): AiRecommendV1Request {
  const parsed = aiRecommendV1RequestSchema.safeParse(
    createRecommendationContext(input),
  );
  if (!parsed.success) throw new WorkerAiRecommendationMappingError();
  return parsed.data;
}

export function createRecommendationContext(
  input: OutfitRecommendationInput,
): RecommendationContext {
  const requirements = deriveClothingRequirements(input.snapshot);
  const wardrobeByKey = new Map(
    input.wardrobeItems.map((item) => [`wardrobe:${item.id}`, item]),
  );
  const projections = [
    ...listGarmentTypesForPreference(input.clothingPreference).map((type) =>
      projectCatalogEffectiveGarment(type.typeId, input.clothingPreference),
    ),
    ...input.wardrobeItems.map((item) => projectWardrobeEffectiveGarment(item)),
  ];
  const candidates = projections.flatMap((projection) =>
    projection.status === 'ready'
      ? [requestCandidate(
          projection.garment,
          wardrobeByKey.get(projection.garment.candidateKey)?.colorFamily ?? null,
        )]
      : [],
  );
  const parsed = recommendationContextSchema.safeParse({
    clothingPreference: input.clothingPreference,
    requirements: requirements.requirements,
    candidates,
  });
  if (!parsed.success) throw new WorkerAiRecommendationMappingError();
  return parsed.data;
}

export function parseRecommendationContext(value: unknown): RecommendationContext {
  const parsed = recommendationContextSchema.safeParse(value);
  if (!parsed.success) throw new WorkerAiRecommendationMappingError();
  return parsed.data;
}

export function aiRequestFromContext(
  context: RecommendationContext,
): AiRecommendV1Request | null {
  if (
    context.requirements.length === 0 ||
    context.candidates.length > aiV1CandidateLimit
  ) return null;
  const parsed = aiRecommendV1RequestSchema.safeParse(context);
  if (!parsed.success) throw new WorkerAiRecommendationMappingError();
  return parsed.data;
}

function domainRequirements(
  request: RecommendationContext,
): ClothingRequirements {
  const requirements = Object.freeze(request.requirements.map((requirement) =>
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

function domainCandidate(
  candidate: AiRecommendV1Request['candidates'][number],
): EffectiveGarmentCandidate {
  return Object.freeze({
    candidateKey: candidate.candidateKey,
    source: candidate.source,
    garmentTypeId: candidate.garmentTypeId,
    properties: Object.freeze({
      ...candidate.properties,
      supportedLayerRoles: Object.freeze([
        ...candidate.properties.supportedLayerRoles,
      ]),
    }),
  });
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

const storedOutfitsSchema = z.array(aiOutfitSchema).min(1).max(3);

function matchesWorkerOutfit(
  outfit: OutfitCandidate,
  workerOutfit: AiOutfit,
): boolean {
  const assigned = assignedGarments(outfit);
  return assigned.length === workerOutfit.length && workerOutfit.every((expected) =>
    assigned.some((actual) =>
      actual.slot === expected.slot &&
      actual.layerRole === expected.layerRole &&
      actual.garment.candidateKey === expected.candidateKey,
    ),
  );
}

export function mapWorkerAiRecommendation(
  request: AiRecommendV1Request,
  data: AiRecommendV1Success['data'],
): OutfitRecommendationSuccess {
  const validated = aiRecommendV1SuccessSchema.safeParse({ data });
  if (!validated.success) throw new WorkerAiRecommendationMappingError();

  return mapRecommendationOutfits(
    request,
    validated.data.data.outfits,
    'ai-assisted',
  );
}

export function mapStoredRecommendation(
  request: RecommendationContext,
  outfits: unknown,
  generationMode: RecommendationGenerationMode,
): OutfitRecommendationSuccess {
  const validated = storedOutfitsSchema.safeParse(outfits);
  if (!validated.success) throw new WorkerAiRecommendationMappingError();
  return mapRecommendationOutfits(request, validated.data, generationMode);
}

function mapRecommendationOutfits(
  request: RecommendationContext,
  workerOutfits: readonly AiOutfit[],
  generationMode: RecommendationGenerationMode,
): OutfitRecommendationSuccess {

  const requirements = domainRequirements(request);
  const eligibleByKey = new Map<string, GarmentEligibilityResult>(
    request.candidates.map((candidate) => {
      const result = evaluateGarmentEligibility(
        requirements,
        { status: 'ready', garment: domainCandidate(candidate) },
      );
      return [candidate.candidateKey, result];
    }),
  );

  const outfits = workerOutfits.map((workerOutfit) => {
    const candidates = workerOutfit.map(({ candidateKey }) =>
      eligibleByKey.get(candidateKey),
    );
    if (candidates.some((candidate) => !candidate)) {
      throw new WorkerAiRecommendationMappingError();
    }
    const composition = composeOutfit(
      requirements,
      candidates as readonly GarmentEligibilityResult[],
    );
    if (
      composition.status !== 'composed' ||
      !matchesWorkerOutfit(composition.outfit, workerOutfit)
    ) {
      throw new WorkerAiRecommendationMappingError();
    }
    return composition.outfit;
  });

  return Object.freeze({
    status: 'recommended',
    generationMode,
    requirements,
    outfits: Object.freeze(outfits),
  });
}

export function toStoredRecommendationOutfits(
  recommendation: OutfitRecommendationSuccess,
): readonly AiOutfit[] {
  const outfits = recommendation.outfits.map((outfit) =>
    assignedGarments(outfit).map(({ slot, layerRole, garment }) => ({
      slot,
      layerRole,
      candidateKey: garment.candidateKey,
    })),
  );
  const validated = storedOutfitsSchema.safeParse(outfits);
  if (!validated.success) throw new WorkerAiRecommendationMappingError();
  return validated.data;
}
