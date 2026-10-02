import { calendarDateParts, formatCalendarDateParts } from '@/domain/calendar-date';
import type { GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import { garmentTypeIds, type GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { WornOutfit, WornPieceColors } from '@/features/recommendation/domain/outfit-history';
import type { outfitSlots } from '@/features/recommendation/domain/outfit-composition';
import { dressingDayDateKey, isEveningDressingDayKey } from '@/features/weather/domain/wardrobe-day';

/**
 * History's Sunday-evening look back at the week (ADR 0038). Derived on read from the worn
 * records the reader already has: nothing is stored, counted toward a goal or sent anywhere.
 * Pure: the caller passes the dressing-day key it read at the edge.
 */

type Slot = (typeof outfitSlots)[number];

export type WeekSummaryDay = Readonly<{
  dayKey: string;
  outfit: WornOutfit;
  pieceColors: WornPieceColors | null;
}>;

/** What a worn day was dressed for, read from its pieces' catalog properties. */
export type DressedFor = 'rain' | 'cold' | 'light';

export type WeekSummary = Readonly<{
  /** How many of those days carry a worn record; at least one. */
  days: number;
  /** Days per kind, in the order rain, cold, light; a kind with no day is left out. */
  dressedFor: readonly Readonly<{ kind: DressedFor; days: number }>[];
  /**
   * The piece worn on the most days, when one came back (two days or more). It carries the
   * slot and swatch it was most recently worn in with its most frequent colour, so it can be
   * drawn as the reader saw it; the swatch is null when none of its days kept colours.
   */
  mostWorn: Readonly<{
    garmentTypeId: GarmentTypeId;
    slot: Slot;
    days: number;
    swatchId: GarmentSwatchId | null;
  }> | null;
}>;

const DAYS_IN_WEEK = 7;
const kinds: readonly DressedFor[] = ['rain', 'cold', 'light'];

/**
 * The seven bare dates ending on a Sunday, when the dressing day is that Sunday's evening
 * (from 18:00 until the dressing day turns at 04:00 on Monday); null at any other time.
 */
export function summaryWeek(dressingDayKey: string): readonly string[] | null {
  if (!isEveningDressingDayKey(dressingDayKey)) return null;
  const { year, month, day } = calendarDateParts(dressingDayDateKey(dressingDayKey));
  if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() !== 0) return null;
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day - (DAYS_IN_WEEK - 1 - index)));
    return formatCalendarDateParts({
      year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    });
  });
}

/**
 * Rain when a piece is waterproof, cold when a piece is highly insulating, light when no
 * piece is waterproof or more than lightly warm. A sweater day counts toward no kind, and a
 * rainy cold day counts toward both.
 */
export function dressedFor(outfit: WornOutfit): readonly DressedFor[] {
  const types = Object.values(outfit.garments).flatMap((id) => {
    const type = id ? getGarmentType(id) : undefined;
    return type ? [type] : [];
  });
  const rain = types.some((type) => type.defaultWaterProtection === 'waterproof');
  const cold = types.some((type) => type.defaultThermalLevel === 'high');
  const light = !rain && types.every((type) =>
    type.defaultThermalLevel === null || type.defaultThermalLevel === 'none' || type.defaultThermalLevel === 'light');
  return kinds.filter((kind) => (kind === 'rain' ? rain : kind === 'cold' ? cold : light));
}

type PieceTally = {
  garmentTypeId: GarmentTypeId;
  days: number;
  lastDay: string;
  lastSlot: Slot;
  swatches: Map<GarmentSwatchId, Readonly<{ days: number; lastDay: string }>>;
};

const catalogIndex = (id: GarmentTypeId) => garmentTypeIds.indexOf(id);

// Most days first; a tie goes to the piece worn most recently, then to the catalog's own
// order (tops before bottoms before shoes before accessories), so the same week always
// names the same piece.
function morePresent(a: PieceTally, b: PieceTally): number {
  return b.days - a.days
    || (a.lastDay === b.lastDay ? 0 : a.lastDay > b.lastDay ? -1 : 1)
    || catalogIndex(a.garmentTypeId) - catalogIndex(b.garmentTypeId);
}

function mostFrequentSwatch(tally: PieceTally): GarmentSwatchId | null {
  let best: Readonly<{ id: GarmentSwatchId; days: number; lastDay: string }> | null = null;
  for (const [id, { days, lastDay }] of tally.swatches) {
    if (!best || days > best.days || (days === best.days && lastDay > best.lastDay)) best = { id, days, lastDay };
  }
  return best?.id ?? null;
}

/**
 * The week's summary for the Sunday evening the dressing-day key names, or null: outside
 * that window, or when none of the week's seven days carries a worn record.
 */
export function weekSummary(
  records: readonly WeekSummaryDay[],
  dressingDayKey: string,
): WeekSummary | null {
  const week = summaryWeek(dressingDayKey);
  if (!week) return null;
  const inWeek = new Set(week);
  const days = new Map<string, WeekSummaryDay>();
  for (const record of records) if (inWeek.has(record.dayKey)) days.set(record.dayKey, record);
  if (days.size === 0) return null;

  const kindDays = new Map<DressedFor, number>();
  const pieces = new Map<GarmentTypeId, PieceTally>();
  for (const { dayKey, outfit, pieceColors } of days.values()) {
    for (const kind of dressedFor(outfit)) kindDays.set(kind, (kindDays.get(kind) ?? 0) + 1);
    // A worn record never repeats a piece (its schema refuses it), so each piece counts once a day.
    for (const [slot, id] of Object.entries(outfit.garments) as [Slot, GarmentTypeId | undefined][]) {
      if (!id) continue;
      const tally = pieces.get(id)
        ?? { garmentTypeId: id, days: 0, lastDay: dayKey, lastSlot: slot, swatches: new Map() };
      tally.days += 1;
      if (dayKey >= tally.lastDay) { tally.lastDay = dayKey; tally.lastSlot = slot; }
      const swatch = pieceColors?.[slot];
      if (swatch) {
        const kept = tally.swatches.get(swatch);
        tally.swatches.set(swatch, {
          days: (kept?.days ?? 0) + 1,
          lastDay: kept && kept.lastDay > dayKey ? kept.lastDay : dayKey,
        });
      }
      pieces.set(id, tally);
    }
  }

  const [top] = [...pieces.values()].sort(morePresent);
  return {
    days: days.size,
    dressedFor: kinds.flatMap((kind) => {
      const count = kindDays.get(kind);
      return count ? [{ kind, days: count }] : [];
    }),
    mostWorn: top && top.days >= 2
      ? { garmentTypeId: top.garmentTypeId, slot: top.lastSlot, days: top.days, swatchId: mostFrequentSwatch(top) }
      : null,
  };
}
