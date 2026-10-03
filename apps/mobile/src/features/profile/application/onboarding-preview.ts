import { dressStyles } from '@kuyara/contracts';

import type { StructuralCategory, GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import {
  recommendOutfits,
  type RecommendedOutfit,
} from '@/features/recommendation/application/recommend-outfits';
import {
  assignedOutfitGarments,
  type OutfitSlot,
} from '@/features/recommendation/domain/outfit-composition';
import type { WeatherSnapshot } from '@/features/weather/domain/weather';
import {
  catalogPreferenceByGender,
  genderSchema,
  type DressStyle,
  type Gender,
} from '@/features/profile/domain/profile';

export type OnboardingPreviewPiece = Readonly<{
  slot: OutfitSlot;
  garmentTypeId: GarmentTypeId;
  category: StructuralCategory;
}>;

export type OnboardingPreviewOutfits = Readonly<
  Record<Gender, Readonly<Record<DressStyle, readonly OnboardingPreviewPiece[]>>>
>;

/**
 * The outfits the onboarding preview draws for each gender and dress style on the chosen
 * place's weather, so a hot day never shows a coat. Each choice draws one of the three outfits
 * the device's deterministic recommendation offers it, the first one that no neighbouring
 * choice already draws (the same gender in another style, or the same style for the other
 * gender, in the order the steps list them), so every tap on the gender and dress style steps
 * still changes the board where the day allows it; when all three are taken, the first.
 * The snapshot's own observation is the moment, so no clock is read, and the Closet, the
 * history and the AI tiers stay out. Null when the rules compose nothing for a choice; the
 * preview then keeps its sample outfits.
 */
export function onboardingPreviewOutfits(snapshot: WeatherSnapshot): OnboardingPreviewOutfits | null {
  const chosen: Record<Gender, Partial<Record<DressStyle, RecommendedOutfit>>> = { woman: {}, man: {} };
  for (const gender of genderSchema.options) {
    for (const dressStyle of dressStyles) {
      const result = recommendOutfits({
        snapshot,
        now: snapshot.current.observedAt,
        clothingPreference: catalogPreferenceByGender[gender],
        dressStyle,
        dayVariant: 0,
      });
      if (result.status !== 'recommended' || result.outfits.length === 0) return null;
      const taken = new Set([
        ...Object.values(chosen[gender]),
        ...genderSchema.options.map((other) => chosen[other][dressStyle]),
      ].flatMap((outfit) => (outfit ? [outfit.compositionKey] : [])));
      chosen[gender][dressStyle] = result.outfits.find((outfit) => !taken.has(outfit.compositionKey))
        ?? result.outfits[0];
    }
  }
  const pieces = (outfit: RecommendedOutfit | undefined): readonly OnboardingPreviewPiece[] =>
    assignedOutfitGarments(outfit!).map(({ slot, garment }) => ({
      slot,
      garmentTypeId: garment.garmentTypeId,
      category: garment.properties.category,
    }));
  const byStyle = ({ casual, smart, formal }: Partial<Record<DressStyle, RecommendedOutfit>>) => (
    { casual: pieces(casual), smart: pieces(smart), formal: pieces(formal) });
  return { woman: byStyle(chosen.woman), man: byStyle(chosen.man) };
}
