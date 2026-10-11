import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';

// Garment types a stylist never sends together. Formality and the layer order are the only
// other "goes together" rules the composer has, and every pair below sits within one formality
// step, so without this table the weather grid showed them in about a third of its trios.

const summerPieces = ['sleeveless_top', 'shorts', 'sandals'] as const satisfies readonly GarmentTypeId[];
const winterPieces = [
  'parka', 'insulated_jacket', 'coat', 'fleece', 'knit_dress', 'weather_boots',
] as const satisfies readonly GarmentTypeId[];
const tailoring = [
  'shirt', 'blouse', 'turtleneck', 'loafers', 'ballet_flats', 'ankle_boots', 'rain_boots',
  'leather_jacket', 'trench_coat', 'coat', 'blazer',
] as const satisfies readonly GarmentTypeId[];
const skirtsAndDresses = [
  'skirt', 'long_skirt', 'dress', 'knit_dress', 'jumpsuit',
] as const satisfies readonly GarmentTypeId[];
const boots = ['ankle_boots', 'weather_boots', 'rain_boots'] as const satisfies readonly GarmentTypeId[];

const pairKey = (left: GarmentTypeId, right: GarmentTypeId) =>
  left < right ? `${left}|${right}` : `${right}|${left}`;

const incompatiblePairs: ReadonlySet<string> = new Set([
  ...summerPieces.flatMap((summer) => winterPieces.map((winter) => pairKey(summer, winter))),
  ...tailoring.map((piece) => pairKey('track_pants', piece)),
  ...skirtsAndDresses.map((piece) => pairKey('fleece', piece)),
  ...boots.map((boot) => pairKey('shorts', boot)),
]);

/** The primary tops a hoodie is never pulled over as a mid layer: bulk on bulk. */
const hoodieNeverOver: ReadonlySet<GarmentTypeId> = new Set(['fleece', 'sweatshirt', 'sweater', 'cardigan']);

/** Whether two garment types are never worn in one outfit, whichever slots they fill. */
export function isIncompatibleGarmentPair(left: GarmentTypeId, right: GarmentTypeId): boolean {
  return incompatiblePairs.has(pairKey(left, right));
}

/** Whether a garment type is a summer piece, worn only on a day whose insulation is not mandatory. */
export function isSummerPiece(garmentTypeId: GarmentTypeId): boolean {
  return (summerPieces as readonly GarmentTypeId[]).includes(garmentTypeId);
}

/** Whether a mid layer is never pulled over this primary top. */
export function isIncompatibleMidLayer(midLayer: GarmentTypeId, primaryTop: GarmentTypeId): boolean {
  return midLayer === 'hoodie' && hoodieNeverOver.has(primaryTop);
}
