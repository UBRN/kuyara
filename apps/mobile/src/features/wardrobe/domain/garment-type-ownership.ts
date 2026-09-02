import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';

export type GarmentOwnershipState = 'owned' | 'wanted' | 'none';

export type GarmentOwnershipMatch = Readonly<{
  state: GarmentOwnershipState;
  itemId: string | null;
}>;

export function resolveGarmentOwnership(
  garmentTypeId: GarmentTypeId,
  items: readonly WardrobeItem[],
): GarmentOwnershipMatch {
  // The caller supplies active items, so soft-deleted rows are not filtered here.
  const match = items
    .filter((item) => item.garmentTypeId === garmentTypeId)
    .sort((left, right) => {
      if (left.entryState !== right.entryState) {
        return left.entryState === 'owned' ? -1 : 1;
      }

      return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
    })[0];

  return match
    ? { state: match.entryState, itemId: match.id }
    : { state: 'none', itemId: null };
}
