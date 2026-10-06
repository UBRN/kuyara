import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';

import { silhouettes, type SilhouetteId } from './silhouettes';

export const garmentSilhouetteIds: Partial<Record<GarmentTypeId, SilhouetteId>> = {
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
};

export const categoryGlyphIds = {
  top: 'g-cat-top', bottom: 'g-cat-bottom', one_piece: 'g-cat-one_piece',
  outerwear: 'g-cat-outerwear', footwear: 'g-cat-footwear', accessory: 'g-cat-accessory',
} as const satisfies Record<StructuralCategory, SilhouetteId>;

export function resolveGarmentSilhouette(garmentTypeId: GarmentTypeId, category: StructuralCategory) {
  return silhouettes[garmentSilhouetteIds[garmentTypeId] ?? categoryGlyphIds[category]];
}
