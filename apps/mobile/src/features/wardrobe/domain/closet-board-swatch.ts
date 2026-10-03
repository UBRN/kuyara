import { garmentSwatchIdSchema, type GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';

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
