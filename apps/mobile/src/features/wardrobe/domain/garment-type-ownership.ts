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

/**
 * How many recorded days each owned Closet record was worn (ADR 0038), counted at read time.
 * A worn day stores catalog types without colour, so each type meets the Closet through
 * `matchPieceOwnership` with no colour family. The answer is kept only when it is certain:
 * when two or more owned records share the type, a worn day cannot say which one it was, so
 * none of them is counted. Wanted records are never worn. A record never worn is absent.
 */
export function closetWearCounts(
  items: readonly WardrobeItem[],
  wornDays: readonly (readonly GarmentTypeId[])[],
): ReadonlyMap<string, number> {
  const ownedByType = new Map<GarmentTypeId, number>();
  for (const item of items) {
    if (item.entryState === 'owned' && item.garmentTypeId) {
      ownedByType.set(item.garmentTypeId, (ownedByType.get(item.garmentTypeId) ?? 0) + 1);
    }
  }
  const counts = new Map<string, number>();
  const matched = new Map<GarmentTypeId, string | null>();
  for (const day of wornDays) {
    for (const typeId of new Set(day)) {
      if (!matched.has(typeId)) {
        const match = matchPieceOwnership(typeId, null, items);
        matched.set(typeId, match.kind === 'owned' && ownedByType.get(typeId) === 1 ? match.item.id : null);
      }
      const id = matched.get(typeId);
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}
