import type { DayKind } from '@kuyara/contracts';
import { zonedClock } from '@/domain/intl-format';

import {
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

/**
 * Whether a dressing day is the one the profile was set up on. Setup has just asked how the
 * user dresses, so that day counts as answered: its day question is not asked again and the
 * day resolves to the setup answer.
 */
export function isSetupDressingDay(profileCreatedAt: string, dressingDayKey: string): boolean {
  return localDayKey(new Date(profileCreatedAt)) === dressingDayKey;
}

/** The hour tomorrow's preview is chosen for, on the place's clock: a typical time to leave. */
const previewDepartureHour = 8;

/**
 * The morning following an evening on the place's clock. Between midnight and 04:00 it is
 * the coming morning; otherwise it is the next date. The returned date carries that calendar
 * day for the variant, kind and key. The actual departure instant is `previewDepartureAt`.
 */
export function nextMorningAfterEvening(
  key: string,
  timeZone: string,
  nowIso: string,
): Date | null {
  if (!isEveningDressingDayKey(key)) return null;
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return null;
  try {
    const place = zonedClock(now, timeZone);
    return new Date(place.year, place.month - 1,
      place.day + (place.hour < 4 ? 0 : 1), previewDepartureHour);
  } catch {
    return null;
  }
}

/**
 * The instant the preview is chosen for: 08:00 on the place's own coming morning. The outfit
 * window and its sentence are read in the place's zone,
 * so the departure is too; 08:00 on the device's clock would open the window at another hour
 * whenever the place keeps a different time. Null for a day-period key or an unknown zone.
 */
export function previewDepartureAt(key: string, timeZone: string, nowIso: string): string | null {
  const morning = nextMorningAfterEvening(key, timeZone, nowIso);
  if (!morning) return null;
  try {
    return new Date(instantOfLocalHour({
      year: morning.getFullYear(), month: morning.getMonth() + 1, day: morning.getDate(),
    }, previewDepartureHour, timeZone)).toISOString();
  } catch {
    return null;
  }
}
