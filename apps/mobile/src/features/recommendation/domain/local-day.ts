import type { DayKind } from '@kuyara/contracts';
import { calendarDateParts, calendarDateUtcMidnight, shiftCalendarDateParts } from '@/domain/calendar-date';
import {
  dressingDayDateKey,
  instantOfLocalHour,
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
 * The kind of a `YYYY-MM-DD` calendar date, read from the date itself in no zone: a forecast
 * day or a history day is the weekday it names wherever the device is.
 */
export function dateKeyDayKind(dateKey: string): DayKind {
  const weekday = calendarDateUtcMidnight(dateKey).getUTCDay();
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

/** The hour tomorrow's preview is chosen for, on the place's clock: a typical time to leave. */
const previewDepartureHour = 8;

/**
 * The morning following an evening dressing day: 08:00 on the date after the key's own date,
 * which stays the same for the whole evening, small hours included (the key keeps the evening's
 * date until 04:00). It is read from the key alone, never from a clock, so a place keeping
 * another time than the device cannot move it in the middle of an evening and claim a second
 * preview. The returned date carries that calendar day for the variant, kind and key; the actual
 * departure instant is `previewDepartureAt`.
 */
export function nextMorningAfterEvening(key: string): Date | null {
  if (!isEveningDressingDayKey(key)) return null;
  const { year, month, day } = shiftCalendarDateParts(
    calendarDateParts(dressingDayDateKey(key)), 1);
  return new Date(year, month - 1, day, previewDepartureHour);
}

/**
 * The instant the preview is chosen for: 08:00 on the place's own clock on that coming morning.
 * The outfit window and its sentence are read in the place's zone, so the departure is too;
 * 08:00 on the device's clock would open the window at another hour whenever the place keeps a
 * different time. Null for a day-period key or an unknown zone.
 */
export function previewDepartureAt(key: string, timeZone: string): string | null {
  const morning = nextMorningAfterEvening(key);
  if (!morning) return null;
  try {
    return new Date(instantOfLocalHour({
      year: morning.getFullYear(), month: morning.getMonth() + 1, day: morning.getDate(),
    }, previewDepartureHour, timeZone)).toISOString();
  } catch {
    return null;
  }
}
