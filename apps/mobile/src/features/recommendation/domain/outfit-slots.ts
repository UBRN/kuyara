import type {
  BodyRegion,
  LayerRole,
  StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';

/** The six body slots an outfit is composed of, in slot order. */
export const bodyOutfitSlots = Object.freeze([
  'primary_top',
  'bottom',
  'one_piece',
  'mid_layer',
  'outer_layer',
  'footwear',
] as const);

export type BodyOutfitSlot = (typeof bodyOutfitSlots)[number];

/**
 * The four slots an outfit may finish with. They are not composed: the six body slots are
 * arranged first, and one accessory per slot is attached to the finished outfit from the
 * weather requirements and that outfit's own formality. So they never make one option
 * different from another, and the garment board (ADR 0025) does not draw them.
 */
export const accessoryOutfitSlots = Object.freeze([
  'head',
  'neck',
  'hands',
  'handheld',
] as const);

export type AccessoryOutfitSlot = (typeof accessoryOutfitSlots)[number];

/** Every slot of an outfit, the body slots first. */
export const outfitSlots = Object.freeze([
  ...bodyOutfitSlots,
  ...accessoryOutfitSlots,
] as const);

export type OutfitSlot = (typeof outfitSlots)[number];

/** A one-piece is the whole body: it never stands with a top or a bottom. */
export function onePieceExcludes(left: OutfitSlot, right: OutfitSlot): boolean {
  const separate = (slot: OutfitSlot) => slot === 'primary_top' || slot === 'bottom';
  return (left === 'one_piece' && separate(right)) || (right === 'one_piece' && separate(left));
}

/** What a garment's slots are read from: its structure, the layers it can be worn as and the region it covers. */
export type SlotTraits = Readonly<{
  category: StructuralCategory;
  supportedLayerRoles: readonly LayerRole[];
  bodyRegion: BodyRegion | null;
}>;

/**
 * Whether a garment with these traits can dress one outfit slot: the one rule the composer,
 * the accessories, the manual mix and the worn record share. A carried accessory covers no
 * region, which is what makes the umbrella a `handheld` and nothing else.
 */
export function slotAccepts(slot: OutfitSlot, traits: SlotTraits): boolean {
  const roles = traits.supportedLayerRoles;
  switch (slot) {
    case 'primary_top': return traits.category === 'top'
      && (roles.includes('base') || roles.includes('standalone'));
    case 'bottom': return traits.category === 'bottom'
      && roles.includes('standalone');
    case 'one_piece': return traits.category === 'one_piece'
      && roles.includes('standalone');
    case 'mid_layer': return traits.category === 'top'
      && roles.includes('mid');
    case 'outer_layer': return (traits.category === 'top' || traits.category === 'outerwear')
      && roles.includes('outer');
    case 'footwear': return traits.category === 'footwear';
    case 'head': case 'neck': case 'hands': return traits.category === 'accessory'
      && traits.bodyRegion === slot;
    case 'handheld': return traits.category === 'accessory'
      && traits.bodyRegion === null;
    default: return false;
  }
}

/** Whether a catalog garment type can dress one outfit slot, by `slotAccepts`. */
export function garmentFitsSlot(slot: OutfitSlot, id: string): boolean {
  const type = getGarmentType(id);
  return type !== null && slotAccepts(slot, {
    category: type.structuralCategory,
    supportedLayerRoles: type.supportedLayerRoles,
    bodyRegion: type.bodyRegion,
  });
}
