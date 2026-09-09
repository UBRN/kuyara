import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';

import { silhouettes, type SilhouetteId } from './silhouettes';

export const garmentSilhouetteIds: Partial<Record<GarmentTypeId, SilhouetteId>> = {
  t_shirt: 'g-tee', long_sleeve_t_shirt: 'g-long', shirt: 'g-shirt', blouse: 'g-shirt',
  sweatshirt: 'g-sweater', sweater: 'g-sweater', hoodie: 'g-hoodie', cardigan: 'g-cardigan',
  overshirt: 'g-shirt', trousers: 'g-trousers', jeans: 'g-jeans', leggings: 'g-leggings', shorts: 'g-shorts',
  skirt: 'g-skirt', dress: 'g-dress', jumpsuit: 'g-jumpsuit', light_jacket: 'g-jacket',
  trench_coat: 'g-trench', coat: 'g-trench', rain_jacket: 'g-rain', insulated_jacket: 'g-puffer',
  sneakers: 'g-sneaker', closed_shoes: 'g-dressshoe', ankle_boots: 'g-boot',
  weather_boots: 'g-boot', sandals: 'g-sandal', sleeveless_top: 'g-tank',
};

export const categoryGlyphIds = {
  top: 'g-cat-top', bottom: 'g-cat-bottom', one_piece: 'g-cat-one_piece',
  outerwear: 'g-cat-outerwear', footwear: 'g-cat-footwear', accessory: 'g-cat-accessory',
} as const satisfies Record<StructuralCategory, SilhouetteId>;

export function resolveGarmentSilhouette(garmentTypeId: GarmentTypeId, category: StructuralCategory) {
  return silhouettes[garmentSilhouetteIds[garmentTypeId] ?? categoryGlyphIds[category]];
}
