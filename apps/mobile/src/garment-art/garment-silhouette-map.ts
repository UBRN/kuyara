import type { ClothingPreference } from '@/domain/preferences';
import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';

import { silhouettes, type SilhouetteId } from './silhouettes';

// The accessories keep one drawing in both cuts.
const accessoryDrawings = {
  beanie: 'g-beanie', brimmed_hat: 'g-hat', cap: 'g-cap', balaclava: 'g-balaclava',
  scarf: 'g-scarf', neck_gaiter: 'g-scarf', gloves: 'g-gloves', umbrella: 'g-umbrella',
} as const satisfies Partial<Record<GarmentTypeId, SilhouetteId>>;

const womensDrawings = {
  t_shirt: 'g-tee-f', long_sleeve_t_shirt: 'g-long-f', sleeveless_top: 'g-tank-f', shirt: 'g-shirt-f',
  overshirt: 'g-overshirt-f', polo_shirt: 'x-polo-f', blouse: 'x-blouse-f', sweater: 'g-sweater-f',
  sweatshirt: 'g-sweatshirt-f', fleece: 'g-fleece-f', cardigan: 'g-cardigan-f', turtleneck: 'x-turtleneck-f',
  hoodie: 'g-hoodie-f', trousers: 'g-trousers-f', track_pants: 'g-trackpants-f', jeans: 'g-jeans-f',
  shorts: 'g-shorts-f', skirt: 'g-skirt-f', long_skirt: 'g-longskirt-f', leggings: 'g-leggings-f',
  dress: 'g-dress-f', knit_dress: 'g-knitdress-f', jumpsuit: 'g-jumpsuit-f', light_jacket: 'g-jacket-f',
  trench_coat: 'g-trench-f', rain_jacket: 'g-rain-f', insulated_jacket: 'g-puffer-f', coat: 'x-coat-f',
  parka: 'g-parka-f', blazer: 'g-blazer-f', puffer_vest: 'g-vest-f', bomber_jacket: 'x-bomber-f',
  leather_jacket: 'x-leather-f', sneakers: 'g-sneaker-f', closed_shoes: 'g-dressshoe-f', ankle_boots: 'g-boot-f',
  weather_boots: 'g-weatherboot-f', sandals: 'g-sandal-f', loafers: 'x-loafer-f', rain_boots: 'x-rainboot-f',
  ballet_flats: 'g-flat-f',
} as const satisfies Partial<Record<GarmentTypeId, SilhouetteId>>;

const mensDrawings = {
  t_shirt: 'g-tee-m', long_sleeve_t_shirt: 'g-long-m', sleeveless_top: 'g-tank-m', shirt: 'g-shirt-m',
  overshirt: 'g-overshirt-m', polo_shirt: 'x-polo-m', sweater: 'g-sweater-m', sweatshirt: 'g-sweatshirt-m',
  fleece: 'g-fleece-m', cardigan: 'g-cardigan-m', turtleneck: 'x-turtleneck-m', hoodie: 'g-hoodie-m',
  trousers: 'g-trousers-m', track_pants: 'g-trackpants-m', jeans: 'g-jeans-m', shorts: 'g-shorts-m',
  light_jacket: 'g-jacket-m', trench_coat: 'g-trench-m', rain_jacket: 'g-rain-m', insulated_jacket: 'g-puffer-m',
  coat: 'x-coat-m', parka: 'g-parka-m', blazer: 'g-blazer-m', puffer_vest: 'g-vest-m', bomber_jacket: 'x-bomber-m',
  leather_jacket: 'x-leather-m', sneakers: 'g-sneaker-m', closed_shoes: 'g-dressshoe-m', ankle_boots: 'g-boot-m',
  weather_boots: 'g-weatherboot-m', sandals: 'g-sandal-m', loafers: 'x-loafer-m', rain_boots: 'x-rainboot-m',
} as const satisfies Partial<Record<GarmentTypeId, SilhouetteId>>;

/**
 * The drawing of every catalog type in each cut: a piece is drawn in the cut of the profile's
 * catalog, so a women's shirt and a men's shirt are two drawings. A cut's own drawing of a
 * type is `<base>-f` or `<base>-m` and shares its base's colourway (`colorwayKeyOf`). A
 * women's-only type keeps its women's drawing in the men's cut, so a piece recorded under the
 * other gender is still drawn.
 */
export const garmentSilhouetteIds: Readonly<Record<ClothingPreference, Readonly<Record<GarmentTypeId, SilhouetteId>>>> = {
  womens: { ...womensDrawings, ...accessoryDrawings },
  mens: { ...womensDrawings, ...mensDrawings, ...accessoryDrawings },
};

export const categoryGlyphIds = {
  top: 'g-cat-top', bottom: 'g-cat-bottom', one_piece: 'g-cat-one_piece',
  outerwear: 'g-cat-outerwear', footwear: 'g-cat-footwear', accessory: 'g-cat-accessory',
} as const satisfies Record<StructuralCategory, SilhouetteId>;

/** The drawing a type takes in a cut; undefined for a type this build does not know. */
export function garmentSilhouetteIdFor(garmentTypeId: GarmentTypeId, cut: ClothingPreference): SilhouetteId | undefined {
  return garmentSilhouetteIds[cut][garmentTypeId];
}

export function resolveGarmentSilhouette(garmentTypeId: GarmentTypeId, category: StructuralCategory, cut: ClothingPreference) {
  return silhouettes[garmentSilhouetteIdFor(garmentTypeId, cut) ?? categoryGlyphIds[category]];
}

/** The colourway a drawing is painted from: a cut's `-f` or `-m` drawing takes its base's. */
export function colorwayKeyOf(silhouetteId: string): string {
  return silhouetteId.replace(/-[fm]$/, '');
}
