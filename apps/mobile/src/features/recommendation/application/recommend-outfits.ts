import type { OutfitArchetypeId } from '@kuyara/contracts';

import type { ClothingPreference } from '@/domain/preferences';
import { listGarmentTypesForPreference } from '@/features/catalog/domain/garment-catalog';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  composeOutfits,
  type OutfitCandidate,
  type OutfitCompositionFailure,
} from '@/features/recommendation/domain/outfit-composition';
import {
  deriveClothingRequirements,
  type ClothingRequirements,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type { WeatherSnapshot } from '@/features/weather/domain/weather';

export type OutfitRecommendationInput = Readonly<{
  snapshot: WeatherSnapshot;
  clothingPreference: ClothingPreference;
  dayVariant: number;
}>;

export type OutfitRecommendationSuccess = Readonly<{
  status: 'recommended';
  generationMode: RecommendationGenerationMode;
  requirements: ClothingRequirements;
  outfits: readonly RecommendedOutfit[];
}>;

export type RecommendedOutfit = OutfitCandidate & Readonly<{
  optionId: string;
  archetypeId: OutfitArchetypeId;
}>;

export type OutfitRecommendationUnavailable = Readonly<{
  status: 'unavailable';
  requirements: ClothingRequirements;
  failure: OutfitCompositionFailure;
}>;

export type OutfitRecommendationResult =
  | OutfitRecommendationSuccess
  | OutfitRecommendationUnavailable;

const fallbackArchetypeOrder = Object.freeze([
  'rain_ready',
  'snow_day',
  'cold_shield',
  'wind_guard',
  'layered_warmth',
  'in_between',
  'light_and_airy',
  'office_ready',
  'smart_casual',
  'on_the_move',
  'weekend_relaxed',
  'everyday_easy',
] as const satisfies readonly OutfitArchetypeId[]);

function assignedGarments(outfit: OutfitCandidate) {
  return [
    ...(outfit.body.kind === 'separates'
      ? [outfit.body.primaryTop, outfit.body.bottom]
      : [outfit.body.onePiece]),
    outfit.midLayer,
    outfit.outerLayer,
    outfit.footwear,
  ].filter((garment) => garment !== null);
}

export function outfitMatchesArchetype(
  outfit: OutfitCandidate,
  archetypeId: OutfitArchetypeId,
): boolean {
  const primary = outfit.body.kind === 'separates'
    ? outfit.body.primaryTop
    : outfit.body.onePiece;
  switch (archetypeId) {
    case 'rain_ready':
      return outfit.outerLayer?.garment.properties.waterProtection === 'water_resistant' ||
        outfit.outerLayer?.garment.properties.waterProtection === 'waterproof';
    case 'snow_day':
      return outfit.footwear.garment.properties.tractionSuitability === 'enhanced';
    case 'cold_shield':
      return outfit.outerLayer?.garment.properties.thermalLevel === 'high';
    case 'wind_guard':
      return assignedGarments(outfit).some(
        ({ garment }) => garment.properties.windProtection === 'wind_resistant',
      );
    case 'layered_warmth':
      return outfit.midLayer !== null && outfit.outerLayer !== null;
    case 'in_between':
      return outfit.midLayer !== null && outfit.outerLayer === null;
    case 'light_and_airy':
      return outfit.outerLayer === null &&
        primary.garment.properties.breathability === 'high';
    case 'office_ready':
      return outfit.formality === 'formal';
    case 'smart_casual':
      return outfit.formality === 'smart' || outfit.formality === 'formal';
    case 'on_the_move':
      return outfit.footwear.garment.garmentTypeId === 'sneakers';
    case 'weekend_relaxed':
      return outfit.formality === 'casual';
    case 'everyday_easy':
      return true;
  }
}

function hashCompositionKey(value: string, seed: number): string {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function outfitOptionId(outfit: OutfitCandidate): string {
  const candidate = outfit.compositionKey.replaceAll('|', ':');
  return /^[A-Za-z0-9:_-]{1,32}$/.test(candidate)
    ? candidate
    : `outfit:${hashCompositionKey(candidate, 0x811c9dc5)}${hashCompositionKey(candidate, 0x9e3779b9)}`;
}

export function assignFallbackArchetypes(
  outfits: readonly OutfitCandidate[],
): readonly RecommendedOutfit[] {
  const used = new Set<OutfitArchetypeId>();
  return Object.freeze(outfits.map((outfit) => {
    const archetypeId = fallbackArchetypeOrder.find(
      (candidate) => !used.has(candidate) && outfitMatchesArchetype(outfit, candidate),
    );
    if (!archetypeId) throw new Error('Distinct fallback archetypes are unavailable.');
    used.add(archetypeId);
    return Object.freeze({
      ...outfit,
      optionId: outfitOptionId(outfit),
      archetypeId,
    });
  }));
}

export function recommendOutfits(
  input: OutfitRecommendationInput,
): OutfitRecommendationResult {
  const requirements = deriveClothingRequirements(input.snapshot);
  const candidates = [
    ...listGarmentTypesForPreference(input.clothingPreference).map((type) =>
      evaluateGarmentEligibility(
        requirements,
        projectCatalogEffectiveGarment(type.typeId, input.clothingPreference),
      ),
    ),
  ];
  const composition = composeOutfits(requirements, candidates);

  return composition.status === 'failure'
    ? Object.freeze({
        status: 'unavailable',
        requirements,
        failure: composition,
      })
    : Object.freeze({
        status: 'recommended',
        generationMode: 'deterministic-fallback',
        requirements,
        outfits: assignFallbackArchetypes(composition.outfits),
      });
}
