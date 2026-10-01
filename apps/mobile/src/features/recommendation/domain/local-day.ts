import type { DayKind } from '@kuyara/contracts';

import {
  dressingDayDateKey,
  isEveningDressingDayKey,
  wardrobeDayKey,
} from '@/features/weather/domain/wardrobe-day';

/**
 * The device-local day rules the recommendation signals are keyed to. Every function takes
 * the date it reads: the clock is read at the edge (composition and presentation) and passed
 * in, so the same date always gives the same key, variant and kind.
 */

/** The day of the year modulo seven, which gives each weekday a different outfit variant. */
export function localDayVariant(date: Date): number {
  const dayOfYear = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(date.getFullYear(), 0, 0)) /
      (24 * 60 * 60 * 1000),
  );
  return dayOfYear % 7;
}

// Saturday and Sunday are the weekend; everything else is a weekday. Read from the device's
// own local date, so a traveller's day matches the day they are dressing for.
export function localDayKind(date: Date): DayKind {
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6 ? 'weekend' : 'weekday';
}

/**
 * The dressing day the device clock is in: the bare local date until 18:00, and that date
 * plus `:evening` from 18:00 through 04:00 the next morning. It keeps its name, its type and
 * its place in the signals, so the existing `local-day-changed` trigger fires at 04:00
 * and at 18:00 instead of at midnight, and a key written by an older build still matches.
 */
export function localDayKey(date: Date): string {
  return wardrobeDayKey({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
  });
}

/** The local hour tomorrow's preview is chosen for: a typical time to leave the house. */
const previewDepartureHour = 8;

/**
 * The morning that follows an evening dressing day, as the device-local instant its preview is
 * chosen for: 08:00 on the date after the evening's own date, so `localDayKey` of the result is
 * the next bare-date dressing day. Null for a day-period key, which has no evening preview.
 */
export function nextMorningAfterEvening(key: string): Date | null {
  if (!isEveningDressingDayKey(key)) return null;
  const [year, month, day] = dressingDayDateKey(key).split('-').map(Number);
  return new Date(year, month - 1, day + 1, previewDepartureHour);
}
