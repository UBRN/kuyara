import { listStructuralCategoriesForPreference } from '@/features/catalog/domain/garment-catalog';
import {
  structuralCategories,
  type StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import type { ClothingPreference } from '@/domain/preferences';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';

/**
 * The categories the Closet and Profile show: those the catalogue offers for the preference,
 * plus any holding a record, since a recorded piece is never hidden (product decisions).
 */
export function visibleClosetCategories(
  preference: ClothingPreference | null,
  items: readonly Pick<WardrobeItem, 'category'>[],
): readonly StructuralCategory[] {
  const offered = listStructuralCategoriesForPreference(preference);
  const held = new Set(items.map(({ category }) => category));
  return Object.freeze(
    structuralCategories.filter((category) => offered.includes(category) || held.has(category)),
  );
}

/** A route's requested category, or the first visible one when it names a hidden category. */
export function resolveVisibleCategory(
  visible: readonly StructuralCategory[],
  requested: StructuralCategory | undefined,
): StructuralCategory | undefined {
  return requested === undefined || visible.includes(requested) ? requested : visible[0];
}
