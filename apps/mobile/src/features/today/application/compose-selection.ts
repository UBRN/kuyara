import type { ClothingPreference } from '@/domain/preferences';
import { listGarmentTypesForPreference } from '@/features/catalog/domain/garment-catalog';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { ComposePin } from '@/features/recommendation/application/compose-around-pieces';
import { swappableSlots } from '@/features/recommendation/domain/manual-mix';
import { composedOptionLimit, type OutfitPin } from '@/features/recommendation/domain/outfit-composition';
import { garmentFitsSlot } from '@/features/recommendation/domain/outfit-history';
import { boardSwatchForClosetSolid } from '@/features/wardrobe/domain/closet-board-swatch';

export type ComposeSlot = OutfitPin['slot'];

/** One catalog piece the compose sheet can tick: a slot and the garment that wears it. */
export type ComposePiece = Readonly<{ slot: ComposeSlot; garmentTypeId: GarmentTypeId }>;

/** A ticked piece and the Closet solid colour the reader gave it, if any. */
export type ComposeChoice = ComposePiece & Readonly<{ colorId: string | null }>;

export type ComposeSelection = readonly ComposeChoice[];

const isSeparate = (slot: ComposeSlot) => slot === 'primary_top' || slot === 'bottom';

// One piece to a slot, and a one-piece never stands with a top or a bottom.
function conflicts(left: ComposeSlot, right: ComposeSlot): boolean {
  return left === right
    || (left === 'one_piece' && isSeparate(right))
    || (right === 'one_piece' && isSeparate(left));
}

const samePiece = (choice: ComposePiece, piece: ComposePiece) =>
  choice.slot === piece.slot && choice.garmentTypeId === piece.garmentTypeId;

export function isComposePieceChosen(selection: ComposeSelection, piece: ComposePiece): boolean {
  return selection.some((choice) => samePiece(choice, piece));
}

/**
 * Whether a tick on the piece does anything: a chosen piece can always be let go, and a new
 * one fits while fewer than three pieces stay chosen once it has replaced what it conflicts with.
 */
export function canChooseComposePiece(selection: ComposeSelection, piece: ComposePiece): boolean {
  if (isComposePieceChosen(selection, piece)) return true;
  return selection.filter((choice) => !conflicts(choice.slot, piece.slot)).length < composedOptionLimit;
}

/**
 * A tick: lets a chosen piece go, or chooses a new one in place of every piece it conflicts
 * with (the later tick wins). Past three pieces the selection stays as it was.
 */
export function toggleComposeChoice(selection: ComposeSelection, piece: ComposePiece): ComposeSelection {
  if (isComposePieceChosen(selection, piece)) return selection.filter((choice) => !samePiece(choice, piece));
  if (!canChooseComposePiece(selection, piece)) return selection;
  return [
    ...selection.filter((choice) => !conflicts(choice.slot, piece.slot)),
    { slot: piece.slot, garmentTypeId: piece.garmentTypeId, colorId: null },
  ];
}

/** Gives the chosen piece of `slot` a Closet solid colour, or takes it away with `null`. */
export function colorComposeChoice(
  selection: ComposeSelection,
  slot: ComposeSlot,
  colorId: string | null,
): ComposeSelection {
  if (!selection.some((choice) => choice.slot === slot)) return selection;
  return selection.map((choice) => (choice.slot === slot ? { ...choice, colorId } : choice));
}

/**
 * The pins compose reads. A Closet colour reaches the board only here, as its board swatch,
 * and only paints the drawing; a colour that maps to no swatch leaves the piece unpainted.
 */
export function composePins(selection: ComposeSelection): readonly ComposePin[] {
  return selection.map(({ slot, garmentTypeId, colorId }) => {
    const swatchId = colorId === null ? null : boardSwatchForClosetSolid(colorId);
    return swatchId === null ? { slot, garmentTypeId } : { slot, garmentTypeId, swatchId };
  });
}

export type ComposeCatalogGroup = Readonly<{ slot: ComposeSlot; garmentTypeIds: readonly GarmentTypeId[] }>;

/**
 * "Choose another piece": every active catalog piece the profile's clothing preference
 * offers, by the slot it can wear, in the board's slot order. A piece that fits two slots (a
 * sweater is a top or a mid layer) is listed under both. The Closet never supplies a piece.
 */
export function composeCatalog(preference: ClothingPreference): readonly ComposeCatalogGroup[] {
  const types = listGarmentTypesForPreference(preference).filter(({ status }) => status === 'active');
  return swappableSlots.flatMap((slot) => {
    const garmentTypeIds = types.filter(({ typeId }) => garmentFitsSlot(slot, typeId)).map(({ typeId }) => typeId);
    return garmentTypeIds.length > 0 ? [{ slot, garmentTypeIds }] : [];
  });
}
