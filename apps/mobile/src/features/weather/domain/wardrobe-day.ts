import { z } from 'zod';

import {
  formatCalendarDateParts,
  shiftCalendarDateParts,
  type CalendarDateParts,
} from '@/domain/calendar-date';
import { zonedClock } from '@/domain/intl-format';

/**
 * The dressing day: the key for daily preferences and weather alerts.
 *
 * A calendar day is not what a person dresses for. Someone who leaves the house at 19:00
 * and comes home at 03:00 is dressed for one evening, not for the end of one date and the
 * start of another, so an open between midnight and 04:00 belongs to the evening it is
 * still part of. Outfit coverage is a separate window in recommendation/domain.
 *
 * This module is the only place the boundary exists. It is pure: it reads no clock, does no
 * I/O, knows no copy and no language, and the same input always gives the same window.
 */

export type WardrobeDayPeriod = 'day' | 'evening';

export type WardrobeDayWindow = Readonly<{
  /**
   * The instant the window closes: the next local midnight, or local 04:00. There is no
   * matching `start`, because the window opens at the caller's own `now` and every caller
   * already holds it.
   */
  end: string;
  period: WardrobeDayPeriod;
  /**
   * The identity of this dressing day: the bare local date while the period is `day`, and
   * that date plus `:evening` for the evening and the overnight hours that belong to it.
   * A day-period key is byte-identical to the local date key used before the dressing day
   * existed, so nothing that was stored under it has to be migrated or re-keyed.
   */
  key: string;
}>;

/**
 * The shape of a dressing-day key as it is stored and read back: the bare local date, or that
 * date plus `:evening`. The date part is only shape-checked, as persisted rows are.
 */
export const dressingDayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}(:evening)?$/);

/** What follows the date in the key of an evening dressing day. */
const eveningKeySuffix = ':evening';

/** Whether a dressing-day key names an evening (including the small hours that belong to it). */
export function isEveningDressingDayKey(key: string): boolean {
  return key.endsWith(eveningKeySuffix);
}

/** The bare local date a dressing-day key is built on: the evening shares its date's row. */
export function dressingDayDateKey(key: string): string {
  return isEveningDressingDayKey(key) ? key.slice(0, -eveningKeySuffix.length) : key;
}

/** The local hour from which the dressing day runs into the night. */
const eveningStartHour = 18;
/** The local hour the overnight stretch ends at, and the day period begins. */
const dayStartHour = 4;

type LocalTime = CalendarDateParts & Readonly<{ hour: number }>;

/** How far the zone's wall clock runs ahead of UTC at a given instant. */
function zoneOffsetMilliseconds(instant: number, timeZone: string): number {
  // The formatter has no milliseconds, so the offset is measured on a whole second.
  const aligned = Math.floor(instant / 1000) * 1000;
  const local = zonedClock(aligned, timeZone);
  return Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  ) - aligned;
}

/**
 * The instant at which a zone's wall clock reads the given local date and hour. The offset
 * is read twice because the first reading is taken at the wrong instant whenever the zone
 * changes offset inside the window, which is exactly what a daylight-saving night does.
 */
export function instantOfLocalHour(date: CalendarDateParts, hour: number, timeZone: string): number {
  const asIfUtc = Date.UTC(date.year, date.month - 1, date.day, hour);
  const firstGuess = asIfUtc - zoneOffsetMilliseconds(asIfUtc, timeZone);
  return asIfUtc - zoneOffsetMilliseconds(firstGuess, timeZone);
}

/**
 * The dressing-day key for a wall-clock reading, for callers that already hold one and have
 * no instant to convert. The device clock's own day is such a caller: the recommendation
 * signals are keyed to the day the person is living on their own phone.
 */
export function wardrobeDayKey(local: LocalTime): string {
  if (local.hour >= eveningStartHour) return `${formatCalendarDateParts(local)}${eveningKeySuffix}`;
  if (local.hour < dayStartHour) return `${formatCalendarDateParts(shiftCalendarDateParts(local, -1))}${eveningKeySuffix}`;
  return formatCalendarDateParts(local);
}

/** The dressing-day window used by daily preferences and weather alerts. */
export function wardrobeDayWindow(
  nowIso: string,
  timeZone: string,
): WardrobeDayWindow | null {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return null;

  try {
    const local = zonedClock(now, timeZone);
    const isEvening = local.hour >= eveningStartHour || local.hour < dayStartHour;
    // Before 04:00 the evening is the one that began yesterday, so it ends at 04:00 of the
    // date the clock already shows; after 18:00 it ends at 04:00 of the date to come.
    const endDate = local.hour < dayStartHour ? local : shiftCalendarDateParts(local, 1);
    const end = instantOfLocalHour(endDate, isEvening ? dayStartHour : 0, timeZone);

    return {
      end: new Date(end).toISOString(),
      period: isEvening ? 'evening' : 'day',
      key: wardrobeDayKey(local),
    };
  } catch {
    // An unknown zone is what lands here: `Intl` rejects one rather than guessing.
    return null;
  }
}

/**
 * The forecast hours of the dressing day that have not happened yet: those starting after
 * `now` and before the window closes. Every reading of "the rest of the day" (the outlook, the
 * day insight and the alert planner) takes its hours from here, so an hour starting exactly at
 * `now` is behind all of them.
 */
export function forecastHoursAhead<T extends Readonly<{ forecastAt: string }>>(
  hourly: readonly T[],
  now: number,
  window: Pick<WardrobeDayWindow, 'end'>,
): T[] {
  const windowEnd = Date.parse(window.end);
  return hourly.filter(({ forecastAt }) => {
    const forecast = Date.parse(forecastAt);
    return forecast > now && forecast < windowEnd;
  });
}
