import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import {
  NO_ACCESSORY_EDITS,
  normalizeAccessoryEdits,
  type AccessoryEdits,
} from '@/features/recommendation/domain/manual-accessories';
import {
  normalizeSwaps,
  type OutfitSwaps,
  type RemovableSlot,
  type SwappableSlot,
} from '@/features/recommendation/domain/manual-mix';
import type { AccessoryOutfitSlot, OutfitCandidate } from '@/features/recommendation/domain/outfit-composition';

/** What the reader changed on one open outfit, against kuyara's pick: the one transient edit state. */
export type ManualEdits = Readonly<{ swaps: OutfitSwaps; accessories: AccessoryEdits }>;

export const NO_MANUAL_EDITS: ManualEdits = Object.freeze({
  swaps: Object.freeze({}),
  accessories: NO_ACCESSORY_EDITS,
});

/** Every edit that changes nothing is dropped, so what remains is exactly what differs from the pick. */
export function normalizeManualEdits(outfit: OutfitCandidate, edits: ManualEdits): ManualEdits {
  return Object.freeze({
    swaps: normalizeSwaps(outfit, edits.swaps),
    accessories: normalizeAccessoryEdits(outfit, edits.accessories),
  });
}

/** A piece in a slot; on a layer slot kuyara left free it adds the layer. */
export function withPiece(outfit: OutfitCandidate, edits: ManualEdits, slot: SwappableSlot, id: GarmentTypeId): ManualEdits {
  return normalizeManualEdits(outfit, { ...edits, swaps: { ...edits.swaps, [slot]: id } });
}

/** A mid or an outer layer taken off. */
export function withLayerOff(outfit: OutfitCandidate, edits: ManualEdits, slot: RemovableSlot): ManualEdits {
  return normalizeManualEdits(outfit, { ...edits, swaps: { ...edits.swaps, [slot]: null } });
}

/**
 * The slot's accessory taken off, kuyara's or one the reader added. Where kuyara chose none,
 * taking the added one off is the same as never adding it.
 */
export function withAccessoryOff(outfit: OutfitCandidate, edits: ManualEdits, slot: AccessoryOutfitSlot): ManualEdits {
  const { [slot]: _edit, ...rest } = edits.accessories;
  return normalizeManualEdits(outfit, {
    ...edits,
    accessories: outfit.accessories[slot] === null ? rest : { ...rest, [slot]: null },
  });
}

/** An accessory in a slot. */
export function withAccessory(outfit: OutfitCandidate, edits: ManualEdits, slot: AccessoryOutfitSlot, id: GarmentTypeId): ManualEdits {
  return normalizeManualEdits(outfit, { ...edits, accessories: { ...edits.accessories, [slot]: id } });
}

/** Every finishing touch of kuyara's that was taken off or replaced given back; added ones stay. */
export function withAccessoriesPutBack(outfit: OutfitCandidate, edits: ManualEdits): ManualEdits {
  return normalizeManualEdits(outfit, {
    ...edits,
    accessories: Object.fromEntries(Object.entries(edits.accessories).filter(([slot]) =>
      outfit.accessories[slot as AccessoryOutfitSlot] === null)),
  });
}
