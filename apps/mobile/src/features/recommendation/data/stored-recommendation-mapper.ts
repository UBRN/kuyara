import { archetypeDayFromRequirements, layerRoles, outfitArchetypeIds } from '@kuyara/contracts';
import { z } from 'zod';

import { defaultDressStyle } from '@/features/profile/domain/profile';
import {
  assignFallbackArchetypes,
  outfitMatchesArchetype,
  recommendedOutfit,
  type OutfitRecommendationSuccess,
} from '@/features/recommendation/application/recommend-outfits';
import {
  domainRequirements,
  legacyCandidateSchema,
  legacyRecommendationContextSchema,
  recommendationContextSchema,
  type RecommendationContext,
} from '@/features/recommendation/application/recommendation-context';
import { WorkerAiRecommendationMappingError } from '@/features/recommendation/application/recommendation-mapping-error';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
  type EffectiveGarmentCandidate,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  collectValidOutfits,
  outfitGarments,
  outfitSlots,
  type OutfitCandidate,
} from '@/features/recommendation/domain/outfit-composition';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';

// Contexts persisted between 2026-09-08's phase 1 and ADR 0031 carry the retired age band.
// No shipped build wrote one, but development databases did; a strict parse would otherwise
// throw and take the whole persisted recommendation down with it. ADR 0031: read as smart.
const retiredAgeBandKey = 'ageBand';

function normalizeRetiredContext(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!Object.hasOwn(record, retiredAgeBandKey)) return value;
  const { [retiredAgeBandKey]: _retired, ...rest } = record;
  return { ...rest, dressStyle: defaultDressStyle };
}

export function parseRecommendationContext(value: unknown): RecommendationContext {
  const current = recommendationContextSchema.safeParse(normalizeRetiredContext(value));
  if (current.success) {
    return { ...current.data, dressStyle: current.data.dressStyle ?? defaultDressStyle };
  }
  const legacy = legacyRecommendationContextSchema.safeParse(value);
  if (!legacy.success) throw new WorkerAiRecommendationMappingError();
  return legacy.data;
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
