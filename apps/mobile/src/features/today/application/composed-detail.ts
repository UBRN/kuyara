import type { DressStyle } from '@kuyara/contracts';

import { isClothingPreference } from '@/domain/preferences';
import type { GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';
import type {
  ComposeAroundInput,
  ComposedOption,
} from '@/features/recommendation/application/compose-around-pieces';
import {
  useComposeAroundPieces,
  type ComposeAroundPieces,
} from '@/features/recommendation/application/use-compose-around-pieces';
import type { RecommendationSnapshot } from '@/features/recommendation/data/recommendation-repository';
import { outfitGarments, swappableSlots, type SwappableSlot } from '@/features/recommendation/domain/manual-mix';
import {
  accessoryOutfitSlots,
  type OutfitCandidate,
  type OutfitSlot,
} from '@/features/recommendation/domain/outfit-composition';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type { ComposePiece } from '@/features/today/application/compose-selection';

/**
 * What compose around chosen pieces reads from the day Today was built for: its requirements,
 * profile preference, day seed and style, with the day's resolved dress style when there is
 * one. Null when the snapshot cannot say, and then nothing is composed.
 */
export function composeInputFor(
  snapshot: Pick<RecommendationSnapshot, 'clothingPreference' | 'dressStyle' | 'styleAesthetics' | 'dayVariant'> | null,
  requirements: ClothingRequirements | null,
  resolvedDressStyle: DressStyle | null,
): ComposeAroundInput | null {
  if (!snapshot || !requirements || snapshot.dayVariant === null) return null;
  const { clothingPreference } = snapshot;
  if (!isClothingPreference(clothingPreference)) return null;
  return {
    requirements,
    clothingPreference,
    dayVariant: snapshot.dayVariant,
    dressStyle: resolvedDressStyle ?? snapshot.dressStyle,
    styleAesthetics: snapshot.styleAesthetics,
  };
}

/** Compose around chosen pieces for one open detail, on the day `composeInputFor` reads. */
export function useDetailCompose(
  snapshot: Parameters<typeof composeInputFor>[0],
  requirements: ClothingRequirements | null,
  resolvedDressStyle: DressStyle | null,
): ComposeAroundPieces {
  return useComposeAroundPieces(composeInputFor(snapshot, requirements, resolvedDressStyle));
}

/** The pick's drawn pieces in slot order: what the compose sheet offers first. */
export function composePiecesOf(outfit: OutfitCandidate): readonly ComposePiece[] {
  const garments = outfitGarments(outfit);
  return swappableSlots.flatMap((slot) => {
    const garmentTypeId = garments[slot];
    return garmentTypeId === undefined ? [] : [{ slot, garmentTypeId }];
  });
}

export type ComposedDetail = Readonly<{
  /** Every slot that is not kuyara's pick: a different piece, a chosen colour, a changed finishing touch. */
  changedSlots: readonly OutfitSlot[];
  /** The reader's pieces still worn as chosen: their rows read "your choice". */
  pinnedSlots: readonly OutfitSlot[];
  /** Their colours, drawn as each piece's recorded swatch. */
  pieceColors: Readonly<Partial<Record<OutfitSlot, GarmentSwatchId>>>;
}>;

/**
 * A composed option as detail shows it against kuyara's pick. `editedSlots` are the slots the
 * reader changed on the composed outfit afterwards: a pinned piece changed there is no longer
 * the reader's chosen piece, so it loses its colour and its "your choice".
 */
export function composedDetail(
  pick: OutfitCandidate,
  shown: OutfitCandidate,
  option: ComposedOption,
  editedSlots: readonly SwappableSlot[],
): ComposedDetail {
  const pinnedSlots = option.pinnedSlots.filter((slot) => !editedSlots.includes(slot));
  const pieceColors: Partial<Record<OutfitSlot, GarmentSwatchId>> = {};
  for (const slot of pinnedSlots) {
    const swatchId = option.pieceColors[slot];
    if (swatchId !== undefined) pieceColors[slot] = swatchId;
  }
  const before = outfitGarments(pick);
  const after = outfitGarments(shown);
  const accessoryOf = (outfit: OutfitCandidate, slot: (typeof accessoryOutfitSlots)[number]) =>
    outfit.accessories[slot]?.garment.garmentTypeId;
  return {
    changedSlots: [
      ...swappableSlots.filter((slot) => before[slot] !== after[slot] || pieceColors[slot] !== undefined),
      ...accessoryOutfitSlots.filter((slot) => accessoryOf(pick, slot) !== accessoryOf(shown, slot)),
    ],
    pinnedSlots,
    pieceColors,
  };
}
