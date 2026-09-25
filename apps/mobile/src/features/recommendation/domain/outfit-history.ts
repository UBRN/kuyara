import { dressStyleSchema, outfitArchetypeIds } from '@kuyara/contracts';
import { z } from 'zod';

import { garmentTypeIdSchema } from '@/features/catalog/domain/garment-taxonomy';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import { outfitSlots } from '@/features/recommendation/domain/outfit-composition';

export const bareHistoryDayKeySchema = z.iso.date();
function validWornGarments(garments: Partial<Record<(typeof outfitSlots)[number], string>>): boolean {
  const hasOnePiece = Boolean(garments.one_piece);
  if (!garments.footwear || (hasOnePiece
    ? Boolean(garments.primary_top || garments.bottom)
    : !garments.primary_top || !garments.bottom)) return false;
  const ids = Object.values(garments);
  if (new Set(ids).size !== ids.length) return false;
  return Object.entries(garments).every(([slot, id]) => {
    const type = getGarmentType(id);
    if (!type) return false;
    switch (slot) {
      case 'primary_top': return type.structuralCategory === 'top'
        && (type.supportedLayerRoles.includes('base') || type.supportedLayerRoles.includes('standalone'));
      case 'bottom': return type.structuralCategory === 'bottom'
        && type.supportedLayerRoles.includes('standalone');
      case 'one_piece': return type.structuralCategory === 'one_piece'
        && type.supportedLayerRoles.includes('standalone');
      case 'mid_layer': return type.structuralCategory === 'top'
        && type.supportedLayerRoles.includes('mid');
      case 'outer_layer': return (type.structuralCategory === 'top' || type.structuralCategory === 'outerwear')
        && type.supportedLayerRoles.includes('outer');
      case 'footwear': return type.structuralCategory === 'footwear';
      case 'head': case 'neck': case 'hands': return type.structuralCategory === 'accessory'
        && type.bodyRegion === slot;
      case 'handheld': return type.structuralCategory === 'accessory'
        && type.bodyRegion === null;
      default: return false;
    }
  });
}
export const wornOutfitSchema = z.strictObject({
  garments: z.partialRecord(z.enum(outfitSlots), garmentTypeIdSchema).refine(validWornGarments),
  archetypeId: z.enum(outfitArchetypeIds),
  formality: dressStyleSchema,
  source: z.enum(['recommended', 'manual']),
});
export type WornOutfit = z.infer<typeof wornOutfitSchema>;

export type OutfitHistoryRecord = Readonly<{
  id: string;
  localProfileId: string;
  dayKey: string;
  outfit: WornOutfit;
  photoPath: string | null;
  wornAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>;

export interface OutfitHistoryRepository {
  get(localProfileId: string, dayKey: string): Promise<OutfitHistoryRecord | null>;
  list(localProfileId: string): Promise<readonly OutfitHistoryRecord[]>;
  lastSeven(localProfileId: string): Promise<readonly OutfitHistoryRecord[]>;
  log(localProfileId: string, dayKey: string, outfit: WornOutfit,
    photo?: HistoryPhotoChange): Promise<OutfitHistoryRecord>;
  softDelete(localProfileId: string, dayKey: string): Promise<boolean>;
}

export type HistoryPhotoChange =
  | Readonly<{ kind: 'keep' }>
  | Readonly<{ kind: 'remove' }>
  | Readonly<{ kind: 'replace'; stagedUri: string }>;

export interface HistoryPhotoStorage {
  copyStaged(stagedUri: string): Promise<string>;
  discardStaged(stagedUri: string): Promise<void>;
  deleteStored(relativePath: string): Promise<void>;
  resolveUri(relativePath: string | null): string | null;
}
