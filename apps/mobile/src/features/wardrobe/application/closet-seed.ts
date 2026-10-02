import type { ColorFamily, GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { CreateWardrobeItemInput, WardrobeEntryState } from '@/features/wardrobe/domain/wardrobe-item';

export type ClosetSeedPiece = Readonly<{ garmentTypeId: GarmentTypeId; colorFamily: ColorFamily | null }>;

/**
 * The records "Add this to my Closet" creates from an outfit's pieces: one per garment type,
 * the piece's catalog type and the colour family the outfit draws it in, all with the one
 * ownership the person chose, the same fields the detail's piece sheet saves for a new
 * record. Nothing else is inferred.
 */
export function closetSeedInputs(
  pieces: readonly ClosetSeedPiece[],
  entryState: WardrobeEntryState,
): readonly Omit<CreateWardrobeItemInput, 'localProfileId' | 'photoRelativePath'>[] {
  const seen = new Set<GarmentTypeId>();
  return Object.freeze(pieces.flatMap(({ garmentTypeId, colorFamily }) => {
    if (seen.has(garmentTypeId)) return [];
    seen.add(garmentTypeId);
    return [Object.freeze({ garmentTypeId, colorFamily, entryState })];
  }));
}
