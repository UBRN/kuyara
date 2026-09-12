import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';

export type GarmentOwnershipState = 'owned' | 'wanted' | 'none';

export type GarmentOwnershipMatch = Readonly<{
  state: GarmentOwnershipState;
  itemIds: readonly string[];
}>;

export function resolveGarmentOwnership(
  garmentTypeId: GarmentTypeId,
  items: readonly WardrobeItem[],
): GarmentOwnershipMatch {
  // The caller supplies active items, so soft-deleted rows are not filtered here.
  const matches = items.filter((item) => item.garmentTypeId === garmentTypeId);

  return {
    state: matches.some((item) => item.entryState === 'owned')
      ? 'owned'
      : matches.length > 0
        ? 'wanted'
        : 'none',
    itemIds: matches.map((item) => item.id),
  };
}
