import type { ColorFamily, GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';

/**
 * How one recommended piece meets the user's Closet (O7). Shown on outfit detail only,
 * never on Today, and never a recommendation input.
 * - `owned`: an owned record of the same type in the piece's colour family. A record or a
 *   piece without a colour family matches on type alone, because nothing says they differ.
 * - `similar`: owned records of the same type exist, every one in another colour family.
 * - `wanted`: no owned record of the type, but a wanted one.
 */
export type PieceOwnershipMatch =
  | Readonly<{ kind: 'owned' | 'similar' | 'wanted'; item: WardrobeItem }>
  | Readonly<{ kind: 'none' }>;

export function matchPieceOwnership(
  garmentTypeId: GarmentTypeId,
  pieceColorFamily: ColorFamily | null,
  items: readonly WardrobeItem[],
): PieceOwnershipMatch {
  // The caller supplies active items, so soft-deleted rows are not filtered here.
  const sameType = items.filter((item) => item.garmentTypeId === garmentTypeId);
  const owned = sameType.filter((item) => item.entryState === 'owned');
  const exact = owned.find((item) => pieceColorFamily === null || item.colorFamily === null ||
    item.colorFamily === pieceColorFamily);
  if (exact) return { kind: 'owned', item: exact };
  if (owned[0]) return { kind: 'similar', item: owned[0] };
  const wanted = sameType.find((item) => item.entryState === 'wanted');
  return wanted ? { kind: 'wanted', item: wanted } : { kind: 'none' };
}
