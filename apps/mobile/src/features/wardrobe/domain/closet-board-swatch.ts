import { garmentSwatchIdSchema, type GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';
import type { ColorFamily } from '@/features/catalog/domain/garment-taxonomy';
import {
  closetSolidSwatches,
  findClosetColorOption,
  nearestClosetSolid,
  type ClosetColorChoice,
} from '@/features/wardrobe/domain/closet-color-options';

/**
 * The Closet solids whose board swatch carries another id. Every other solid keeps its id on
 * the board; `closet-board-swatch.test.mjs` pins that all 33 land on a distinct board swatch
 * of the same colour. Board swatch ids are stored by History, so this table only ever maps
 * onto them and never renames one.
 */
const renamedSolids = Object.freeze({
  tan_leather: 'tan',
  light_grey: 'lightgrey',
  heather_grey: 'heather',
  indigo_denim: 'indigo',
  mid_wash_denim: 'midwash',
  light_wash_denim: 'lightwash',
  oxford_blue: 'oxford',
  sky_blue: 'skyblue',
  black_denim: 'blackdenim',
  forest_green: 'forest',
  rain_yellow: 'rainyellow',
  tomato_red: 'tomato',
  dusty_rose: 'dustyrose',
} as const satisfies Record<string, GarmentSwatchId>);

/**
 * The board swatch a Closet solid colour paints a garment drawing in, or null for a pattern,
 * a two-colour option or an id this build does not know. The one owner of that mapping: a
 * colour chosen on detail reaches the board only through it, as a piece's recorded swatch,
 * and never enters selection.
 */
export function boardSwatchForClosetSolid(closetColorId: string): GarmentSwatchId | null {
  const id = Object.hasOwn(renamedSolids, closetColorId)
    ? renamedSolids[closetColorId as keyof typeof renamedSolids]
    : closetColorId;
  const parsed = garmentSwatchIdSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
}

const solids = closetSolidSwatches.map((solid) => ({ ...solid, swatchId: boardSwatchForClosetSolid(solid.id)! }));

/** The 33 board swatches in the Closet palette's order: detail's "More colours". */
export const boardSwatchesInClosetOrder: readonly GarmentSwatchId[] = solids.map(({ swatchId }) => swatchId);

/** The Closet solid a board swatch is painted from, so a swatch is named by the Closet's colour name. */
export function closetSolidForBoardSwatch(swatchId: GarmentSwatchId): (typeof closetSolidSwatches)[number]['id'] {
  return solids.find((solid) => solid.swatchId === swatchId)!.id;
}

/**
 * The board swatch a Closet piece is worn in on detail, for a drawing whose own colours are
 * `natural`, most natural first: a solid in its own swatch, a custom colour in the nearest
 * one, and a pattern, a two-colour option or a record with only a family in the first swatch
 * of that family, the drawing's own colours first. Nothing else falls back to the drawing's
 * first colour.
 */
export function boardSwatchForClosetItem(
  item: Readonly<{ colorChoice?: ClosetColorChoice | null; colorFamily: ColorFamily | null }>,
  natural: readonly GarmentSwatchId[],
): GarmentSwatchId {
  const choice = item.colorChoice;
  if (choice?.kind === 'custom') return boardSwatchForClosetSolid(nearestClosetSolid(choice.hex).id)!;
  const solid = choice ? boardSwatchForClosetSolid(choice.id) : null;
  if (solid) return solid;
  const family = (choice ? findClosetColorOption(choice.id)?.family : null) ?? item.colorFamily;
  const familyOf = (swatchId: GarmentSwatchId) => solids.find((one) => one.swatchId === swatchId)!.family;
  return [...natural, ...boardSwatchesInClosetOrder].find((swatchId) => familyOf(swatchId) === family) ?? natural[0];
}
