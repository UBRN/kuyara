import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type { GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';
import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { boardSwatchForClosetItem } from '@/features/wardrobe/domain/closet-board-swatch';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';

export type OwnPiece = Readonly<{
  id: string;
  garmentTypeId: GarmentTypeId;
  category: StructuralCategory;
  swatchId: GarmentSwatchId;
  /** The record's own name and photo, for the pickers' rows. */
  name: string | null;
  photoRelativePath: string | null;
}>;

/**
 * The reader's own Closet pieces detail offers for one slot: owned records whose type is among
 * the slot's catalog candidates, so gender and the slot already fit, each with the swatch it
 * paints the board in. A manual shortcut only: the candidates and their order stay the
 * catalog's, and a Closet record never becomes a candidate or reaches a recommendation.
 */
export function ownPiecesFor(
  items: readonly Pick<WardrobeItem,
    'id' | 'garmentTypeId' | 'entryState' | 'colorChoice' | 'colorFamily' | 'name' | 'photoRelativePath'>[],
  candidates: readonly Readonly<{ garmentTypeId: GarmentTypeId }>[],
  natural: (garmentTypeId: GarmentTypeId) => readonly GarmentSwatchId[],
): readonly OwnPiece[] {
  return items.flatMap(({ id, garmentTypeId, entryState, colorChoice, colorFamily, name, photoRelativePath }) => {
    const type = garmentTypeId ? getGarmentType(garmentTypeId) : undefined;
    if (!garmentTypeId || !type || entryState !== 'owned'
      || !candidates.some((candidate) => candidate.garmentTypeId === garmentTypeId)) return [];
    return [{
      id,
      garmentTypeId,
      category: type.structuralCategory,
      swatchId: boardSwatchForClosetItem({ colorChoice, colorFamily }, natural(garmentTypeId)),
      name,
      photoRelativePath,
    }];
  });
}
