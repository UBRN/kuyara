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

export type ClosetCategorySummary = Readonly<{
  count: number;
  wanted: number;
  newest: WardrobeItem | null;
}>;

function newestOf(items: readonly WardrobeItem[]): WardrobeItem | null {
  return items.reduce<WardrobeItem | null>(
    (newest, item) => (newest === null || item.createdAt > newest.createdAt ? item : newest),
    null,
  );
}

/**
 * Per category: how many records it holds (owned plus wanted), how many of those are wanted,
 * and the piece that draws it: the newest owned one, or the newest wanted one when nothing
 * there is owned. Counts derive from the records, never a count table.
 */
export function summarizeClosetCategories(
  items: readonly WardrobeItem[],
): Readonly<Record<StructuralCategory, ClosetCategorySummary>> {
  return Object.fromEntries(
    structuralCategories.map((category) => {
      const inCategory = items.filter((item) => item.category === category);
      const owned = inCategory.filter((item) => item.entryState === 'owned');
      return [
        category,
        {
          count: inCategory.length,
          wanted: inCategory.length - owned.length,
          newest: newestOf(owned) ?? newestOf(inCategory),
        },
      ];
    }),
  ) as Record<StructuralCategory, ClosetCategorySummary>;
}

/** The owned records, then the wanted ones, each newest first. */
export function splitClosetByEntryState(
  items: readonly WardrobeItem[],
): Readonly<{ owned: readonly WardrobeItem[]; wanted: readonly WardrobeItem[] }> {
  const newestFirst = (entryState: WardrobeItem['entryState']) =>
    items
      .filter((item) => item.entryState === entryState)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { owned: newestFirst('owned'), wanted: newestFirst('wanted') };
}

/**
 * The category a Closet opens on without one requested: the first, in catalogue order, that
 * holds a wanted piece when the Wanted section is asked for, else the first that holds
 * anything, else the first category.
 */
export function resolveDefaultClosetCategory(
  items: readonly WardrobeItem[],
  revealWanted: boolean,
  categories: readonly StructuralCategory[] = structuralCategories,
): StructuralCategory {
  const holds = (predicate: (item: WardrobeItem) => boolean) =>
    categories.find((category) =>
      items.some((item) => item.category === category && predicate(item)),
    );
  return (
    (revealWanted ? holds((item) => item.entryState === 'wanted') : undefined)
    ?? holds(() => true)
    ?? categories[0]
  );
}
