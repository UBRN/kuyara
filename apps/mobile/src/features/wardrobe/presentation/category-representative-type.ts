import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';

// One recognisable piece per category: the picker's category tiles draw it, and before a
// type is chosen the add form's dashed placeholder draws it for the category being added to.
export const CATEGORY_REPRESENTATIVE_TYPE: Readonly<Record<StructuralCategory, GarmentTypeId>> = {
  top: 'shirt',
  bottom: 'jeans',
  one_piece: 'dress',
  outerwear: 'coat',
  footwear: 'sneakers',
  accessory: 'beanie',
};
