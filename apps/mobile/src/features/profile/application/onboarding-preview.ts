import { dressStyles } from '@kuyara/contracts';

import { listSelectableGarmentTypes } from '@/features/catalog/domain/garment-catalog';
import type { StructuralCategory, GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import {
  composeOutfitPool,
  outfitsInStyles,
  recommendOutfits,
  type RecommendedOutfit,
} from '@/features/recommendation/application/recommend-outfits';
import {
  assignedOutfitGarments,
  type OutfitCandidate,
  type OutfitSlot,
} from '@/features/recommendation/domain/outfit-composition';
import { deriveClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type { WeatherSnapshot } from '@/features/weather/domain/weather';
import {
  catalogPreferenceByGender,
  genderSchema,
  type DressStyle,
  type Gender,
  type StyleAesthetic,
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
  const pieces = (outfit: RecommendedOutfit | undefined) => previewPieces(outfit!);
  const byStyle = ({ casual, smart, formal }: Partial<Record<DressStyle, RecommendedOutfit>>) => (
    { casual: pieces(casual), smart: pieces(smart), formal: pieces(formal) });
  return { woman: byStyle(chosen.woman), man: byStyle(chosen.man) };
}

const previewPieces = (outfit: OutfitCandidate): readonly OnboardingPreviewPiece[] =>
  assignedOutfitGarments(outfit).map(({ slot, garment }) => ({
    slot,
    garmentTypeId: garment.garmentTypeId,
    category: garment.properties.category,
  }));

const womensTypes = new Set(listSelectableGarmentTypes('womens').map(({ typeId }) => typeId));

/**
 * The outfit the preview draws on the place's weather before a gender is chosen: the first of
 * the casual outfits the rules offer the men's catalog, whose straight cut unisex clothing is
 * drawn in, that the women's catalog carries piece for piece. Null when none does; the
 * preview then keeps its unisex sample.
 */
export function onboardingUnisexOutfit(snapshot: WeatherSnapshot): readonly OnboardingPreviewPiece[] | null {
  const result = recommendOutfits({
    snapshot,
    now: snapshot.current.observedAt,
    clothingPreference: catalogPreferenceByGender.man,
    dressStyle: 'casual',
    dayVariant: 0,
  });
  if (result.status !== 'recommended') return null;
  const outfit = result.outfits.find((candidate) =>
    assignedOutfitGarments(candidate).every(({ garment }) => womensTypes.has(garment.garmentTypeId)));
  return outfit ? previewPieces(outfit) : null;
}

/**
 * What a style tap on onboarding's styles step draws: an outfit in the chosen styles for the
 * gender and dress style on the place's weather, the first in the order the styles give, that
 * is not the outfit already on the plate. Styles reorder outfits within the dress style's
 * formality and remove none, so the rules' first outfit often stays where it is; the plate shows
 * one the styles favour instead of standing still. Null when no style is chosen or no other
 * outfit of the day is in those styles: the plate keeps what it shows.
 */
export function onboardingStyledOutfit(
  snapshot: WeatherSnapshot,
  gender: Gender,
  dressStyle: DressStyle,
  styleAesthetics: readonly StyleAesthetic[],
  shown: readonly OnboardingPreviewPiece[],
): readonly OnboardingPreviewPiece[] | null {
  if (styleAesthetics.length === 0) return null;
  const at = snapshot.current.observedAt;
  const requirements = deriveClothingRequirements(snapshot, at, at);
  const pool = composeOutfitPool(requirements, catalogPreferenceByGender[gender], 0);
  if (pool.status !== 'composed') return null;
  const shownKey = shown.map(({ garmentTypeId }) => garmentTypeId).join(',');
  const next = outfitsInStyles(pool.outfits, { dressStyle, styleAesthetics }, requirements)
    .map(previewPieces)
    .find((pieces) => pieces.map(({ garmentTypeId }) => garmentTypeId).join(',') !== shownKey);
  return next ?? null;
}
