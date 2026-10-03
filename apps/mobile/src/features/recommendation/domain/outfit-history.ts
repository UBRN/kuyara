import { dressStyleSchema, outfitArchetypeIds } from '@kuyara/contracts';
import { z } from 'zod';

import { calendarDateKeySchema } from '@/domain/calendar-date';
import { garmentSwatchIdSchema } from '@/features/catalog/domain/garment-swatch';
import { garmentTypeIdSchema } from '@/features/catalog/domain/garment-taxonomy';
import {
  assignedOutfitGarments,
  garmentFitsSlot,
  onePieceExcludes,
  outfitSlots,
  type OutfitCandidate,
  type OutfitSlot,
} from '@/features/recommendation/domain/outfit-composition';
import { dressingDayDateKey } from '@/features/weather/domain/wardrobe-day';

export const bareHistoryDayKeySchema = calendarDateKeySchema;
function validWornGarments(garments: Partial<Record<OutfitSlot, string>>): boolean {
  const worn = outfitSlots.filter((slot) => garments[slot]);
  if (!garments.footwear || worn.some((left) => worn.some((right) => onePieceExcludes(left, right)))) return false;
  if (!garments.one_piece && (!garments.primary_top || !garments.bottom)) return false;
  const ids = Object.values(garments);
  if (new Set(ids).size !== ids.length) return false;
  return Object.entries(garments).every(([slot, id]) => garmentFitsSlot(slot as OutfitSlot, id));
}
export const wornOutfitSchema = z.strictObject({
  garments: z.partialRecord(z.enum(outfitSlots), garmentTypeIdSchema).refine(validWornGarments),
  archetypeId: z.enum(outfitArchetypeIds),
  formality: dressStyleSchema,
  source: z.enum(['recommended', 'manual']),
});
export type WornOutfit = z.infer<typeof wornOutfitSchema>;

/** The bare-date day a dressing-day key records under: the evening's looks join their date's. */
export function historyDayKey(dressingDayKey: string): string {
  return bareHistoryDayKeySchema.parse(dressingDayDateKey(dressingDayKey));
}

/**
 * An outfit as the worn record "Wore this today" writes (ADR 0038): `manual` when the
 * reader changed a piece of kuyara's pick on detail, which keeps the pick's archetype.
 */
export function wornOutfitFrom(
  outfit: OutfitCandidate & Readonly<{ archetypeId: WornOutfit['archetypeId'] }>,
  source: WornOutfit['source'] = 'recommended',
): WornOutfit {
  const assigned = [
    ...assignedOutfitGarments(outfit),
    ...Object.values(outfit.accessories).filter((garment) => garment !== null),
  ];
  return wornOutfitSchema.parse({
    garments: Object.fromEntries(assigned.map(({ slot, garment }) => [slot, garment.garmentTypeId])),
    archetypeId: outfit.archetypeId,
    formality: outfit.formality,
    source,
  });
}

/**
 * The palette swatch each piece of a worn day was drawn in, by slot (migration 24). Display
 * data for History only: it never reaches a recommendation, the AI request, analytics or logs.
 */
export const wornPieceColorsSchema = z.partialRecord(z.enum(outfitSlots), garmentSwatchIdSchema);
export type WornPieceColors = z.infer<typeof wornPieceColorsSchema>;

/**
 * A day's piece colours as History can use them, or null: when they are missing or do not
 * parse, are empty, or colour a slot the day did not wear. Null draws the day in History's
 * fixed scheme, as every day recorded before migration 24 is drawn.
 */
export function wornPieceColorsFor(outfit: WornOutfit, colors: unknown): WornPieceColors | null {
  const parsed = wornPieceColorsSchema.safeParse(colors);
  if (!parsed.success) return null;
  const slots = Object.keys(parsed.data);
  return slots.length > 0 && slots.every((slot) => slot in outfit.garments) ? parsed.data : null;
}

/** Whether two worn records dress the same pieces in the same slots. */
export function sameWornGarments(a: WornOutfit, b: WornOutfit): boolean {
  const keys = new Set([...Object.keys(a.garments), ...Object.keys(b.garments)]) as Set<keyof WornOutfit['garments']>;
  return [...keys].every((slot) => a.garments[slot] === b.garments[slot]);
}

/** Whether a day's looks already hold this outfit: "Wore this today" never records one twice. */
export function wornAlready(looks: readonly WornOutfit[], outfit: WornOutfit): boolean {
  return looks.some((look) => sameWornGarments(look, outfit));
}

export type HistoryDay<Look> = Readonly<{ dayKey: string; looks: readonly Look[] }>;

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * History's days (ADR 0038): the newest date first, and under one date its looks in the order
 * they were worn, morning first. A day can hold several looks; History, the week's look back
 * and the Closet's worn days all count and order days through this one grouping.
 */
export function historyDays<Look extends Readonly<{ dayKey: string; wornAt: string }>>(
  looks: readonly Look[],
): readonly HistoryDay<Look>[] {
  const days = new Map<string, Look[]>();
  for (const look of [...looks].sort((a, b) => byText(b.dayKey, a.dayKey) || byText(a.wornAt, b.wornAt))) {
    const day = days.get(look.dayKey);
    if (day) day.push(look);
    else days.set(look.dayKey, [look]);
  }
  return [...days].map(([dayKey, dayLooks]) => ({ dayKey, looks: dayLooks }));
}

export type OutfitHistoryRecord = Readonly<{
  id: string;
  localProfileId: string;
  dayKey: string;
  outfit: WornOutfit;
  /** Null for a day recorded before migration 24, or whose stored colours do not parse. */
  pieceColors: WornPieceColors | null;
  photoPath: string | null;
  wornAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>;

export interface OutfitHistoryRepository {
  /** The day's live looks, morning first. */
  day(localProfileId: string, dayKey: string): Promise<readonly OutfitHistoryRecord[]>;
  /** Every live look, the newest date first and morning first within a date. */
  list(localProfileId: string): Promise<readonly OutfitHistoryRecord[]>;
  /** The seven most recently worn live looks, latest first. */
  lastSeven(localProfileId: string): Promise<readonly OutfitHistoryRecord[]>;
  /**
   * Records a look worn on the day: a new row, unless the day already holds a look with the same
   * pieces, which is kept as it is (a photo change still applies to it). `pieceColors` are the
   * swatches the look was drawn in; null records it without them. Every write states them.
   */
  log(localProfileId: string, dayKey: string, outfit: WornOutfit,
    photo: HistoryPhotoChange, pieceColors: WornPieceColors | null): Promise<OutfitHistoryRecord>;
  softDelete(localProfileId: string, id: string): Promise<boolean>;
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
