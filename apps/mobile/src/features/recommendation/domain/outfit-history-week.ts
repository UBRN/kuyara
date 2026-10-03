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

/** One worn look; a day can hold several. */
export type WeekSummaryLook = Readonly<{
  dayKey: string;
  outfit: WornOutfit;
  pieceColors: WornPieceColors | null;
}>;

/** What a worn day was dressed for, read from its pieces' catalog properties. */
export type DressedFor = 'rain' | 'cold' | 'light';

export type WeekSummary = Readonly<{
  /** How many of those days carry a worn record; at least one. */
  days: number;
  /**
   * Days per kind, in the order rain, cold, light; a kind with no day is left out. A day with
   * several looks counts once toward each kind any of its looks was dressed for.
   */
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
  /** The days it was worn on, counted once a day however many of the day's looks wore it. */
  days: Set<string>;
  lastDay: string;
  lastSlot: Slot;
  swatches: Map<GarmentSwatchId, Set<string>>;
};

const latest = (days: ReadonlySet<string>) => [...days].reduce((a, b) => (b > a ? b : a));

const catalogIndex = (id: GarmentTypeId) => garmentTypeIds.indexOf(id);

// Most days first; a tie goes to the piece worn most recently, then to the catalog's own
// order (tops before bottoms before shoes before accessories), so the same week always
// names the same piece.
function morePresent(a: PieceTally, b: PieceTally): number {
  return b.days.size - a.days.size
    || (a.lastDay === b.lastDay ? 0 : a.lastDay > b.lastDay ? -1 : 1)
    || catalogIndex(a.garmentTypeId) - catalogIndex(b.garmentTypeId);
}

function mostFrequentSwatch(tally: PieceTally): GarmentSwatchId | null {
  let best: Readonly<{ id: GarmentSwatchId; days: number; lastDay: string }> | null = null;
  for (const [id, swatchDays] of tally.swatches) {
    const days = swatchDays.size;
    const lastDay = latest(swatchDays);
    if (!best || days > best.days || (days === best.days && lastDay > best.lastDay)) best = { id, days, lastDay };
  }
  return best?.id ?? null;
}

/**
 * The week's summary for the Sunday evening the dressing-day key names, or null: outside
 * that window, or when none of the week's seven days carries a worn record.
 */
export function weekSummary(
  looks: readonly WeekSummaryLook[],
  dressingDayKey: string,
): WeekSummary | null {
  const week = summaryWeek(dressingDayKey);
  if (!week) return null;
  const inWeek = new Set(week);
  const weekLooks = looks.filter(({ dayKey }) => inWeek.has(dayKey));
  if (weekLooks.length === 0) return null;

  const kindDays = new Map<DressedFor, Set<string>>();
  const pieces = new Map<GarmentTypeId, PieceTally>();
  for (const { dayKey, outfit, pieceColors } of weekLooks) {
    for (const kind of dressedFor(outfit)) kindDays.set(kind, (kindDays.get(kind) ?? new Set()).add(dayKey));
    // A worn record never repeats a piece (its schema refuses it); the sets count each piece
    // and each of its colours once a day across the day's looks.
    for (const [slot, id] of Object.entries(outfit.garments) as [Slot, GarmentTypeId | undefined][]) {
      if (!id) continue;
      const tally = pieces.get(id)
        ?? { garmentTypeId: id, days: new Set<string>(), lastDay: dayKey, lastSlot: slot, swatches: new Map() };
      tally.days.add(dayKey);
      if (dayKey >= tally.lastDay) { tally.lastDay = dayKey; tally.lastSlot = slot; }
      const swatch = pieceColors?.[slot];
      if (swatch) tally.swatches.set(swatch, (tally.swatches.get(swatch) ?? new Set()).add(dayKey));
      pieces.set(id, tally);
    }
  }

  const [top] = [...pieces.values()].sort(morePresent);
  return {
    days: new Set(weekLooks.map(({ dayKey }) => dayKey)).size,
    dressedFor: kinds.flatMap((kind) => {
      const days = kindDays.get(kind)?.size;
      return days ? [{ kind, days }] : [];
    }),
    mostWorn: top && top.days.size >= 2
      ? { garmentTypeId: top.garmentTypeId, slot: top.lastSlot, days: top.days.size, swatchId: mostFrequentSwatch(top) }
      : null,
  };
}
