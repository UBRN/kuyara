import type { ClothingPreference } from '@/domain/preferences';
import { listGarmentTypesForPreference } from '@/features/catalog/domain/garment-catalog';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
  projectWardrobeEffectiveGarment,
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
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import type { WeatherSnapshot } from '@/features/weather/domain/weather';

export type OutfitRecommendationInput = Readonly<{
  snapshot: WeatherSnapshot;
  wardrobeItems: readonly WardrobeItem[];
  clothingPreference: ClothingPreference;
}>;

export type OutfitRecommendationSuccess = Readonly<{
  status: 'recommended';
  generationMode: RecommendationGenerationMode;
  requirements: ClothingRequirements;
  outfits: readonly OutfitCandidate[];
}>;

export type OutfitRecommendationUnavailable = Readonly<{
  status: 'unavailable';
  requirements: ClothingRequirements;
  failure: OutfitCompositionFailure;
}>;

export type OutfitRecommendationResult =
  | OutfitRecommendationSuccess
  | OutfitRecommendationUnavailable;

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
    ...input.wardrobeItems.map((item) =>
      evaluateGarmentEligibility(
        requirements,
        projectWardrobeEffectiveGarment(item),
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
        outfits: composition.outfits,
      });
}
