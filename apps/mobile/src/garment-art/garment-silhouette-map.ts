import type { ClothingPreference } from '@/domain/preferences';
import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';

import { silhouettes, type SilhouetteId } from './silhouettes';

// The drawing each type takes in either cut until that cut names its own.
const sharedDrawings = {
  t_shirt: 'g-tee', long_sleeve_t_shirt: 'g-long', shirt: 'g-shirt', blouse: 'x-blouse',
  sweatshirt: 'g-sweater', sweater: 'g-sweater', hoodie: 'g-hoodie', cardigan: 'g-cardigan',
  overshirt: 'g-shirt', trousers: 'g-trousers', jeans: 'g-jeans', leggings: 'g-leggings', shorts: 'g-shorts',
  skirt: 'g-skirt', dress: 'g-dress', jumpsuit: 'g-jumpsuit', light_jacket: 'g-jacket',
  trench_coat: 'g-trench', coat: 'x-coat', rain_jacket: 'g-rain', insulated_jacket: 'g-puffer',
  sneakers: 'g-sneaker', closed_shoes: 'g-dressshoe', ankle_boots: 'g-boot',
  weather_boots: 'g-boot', sandals: 'g-sandal', sleeveless_top: 'g-tank', beanie: 'g-beanie',
  brimmed_hat: 'g-hat', scarf: 'g-scarf', gloves: 'g-gloves', umbrella: 'g-umbrella',
  fleece: 'g-sweater', turtleneck: 'x-turtleneck', polo_shirt: 'x-polo', long_skirt: 'g-skirt',
  track_pants: 'g-trousers', knit_dress: 'g-dress', parka: 'g-parka', blazer: 'g-blazer',
  puffer_vest: 'g-vest', bomber_jacket: 'x-bomber', leather_jacket: 'x-leather',
  loafers: 'x-loafer', ballet_flats: 'g-flat', rain_boots: 'x-rainboot',
  cap: 'g-cap', balaclava: 'g-balaclava', neck_gaiter: 'g-scarf',
} as const satisfies Record<GarmentTypeId, SilhouetteId>;

/**
 * The drawing of every catalog type in each cut: a piece is drawn in the cut of the profile's
 * catalog, so a women's shirt and a men's shirt are two drawings. A cut's own drawing of a
 * type is `<base>-f` or `<base>-m` and shares its base's colourway (`colorwayKeyOf`).
 */
export const garmentSilhouetteIds: Readonly<Record<ClothingPreference, Readonly<Record<GarmentTypeId, SilhouetteId>>>> = {
  womens: { ...sharedDrawings },
  mens: { ...sharedDrawings },
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
