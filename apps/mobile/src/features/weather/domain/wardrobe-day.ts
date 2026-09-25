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

/** The local hour from which the dressing day runs into the night. */
const eveningStartHour = 18;
/** The local hour the overnight stretch ends at, and the day period begins. */
const dayStartHour = 4;

type LocalDate = Readonly<{ year: number; month: number; day: number }>;
type LocalTime = LocalDate & Readonly<{ hour: number }>;
type LocalWallClock = LocalTime & Readonly<{ minute: number; second: number }>;

function localTimeAt(instant: number, timeZone: string): LocalWallClock {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

/** How far the zone's wall clock runs ahead of UTC at a given instant. */
function zoneOffsetMilliseconds(instant: number, timeZone: string): number {
  // The formatter has no milliseconds, so the offset is measured on a whole second.
  const aligned = Math.floor(instant / 1000) * 1000;
  const local = localTimeAt(aligned, timeZone);
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
function instantOfLocalHour(date: LocalDate, hour: number, timeZone: string): number {
  const asIfUtc = Date.UTC(date.year, date.month - 1, date.day, hour);
  const firstGuess = asIfUtc - zoneOffsetMilliseconds(asIfUtc, timeZone);
  return asIfUtc - zoneOffsetMilliseconds(firstGuess, timeZone);
}

function shiftLocalDate(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function localDateKey({ year, month, day }: LocalDate): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * The dressing-day key for a wall-clock reading, for callers that already hold one and have
 * no instant to convert. The device clock's own day is such a caller: the recommendation
 * signals are keyed to the day the person is living on their own phone.
 */
export function wardrobeDayKey(local: LocalTime): string {
  if (local.hour >= eveningStartHour) return `${localDateKey(local)}:evening`;
  if (local.hour < dayStartHour) return `${localDateKey(shiftLocalDate(local, -1))}:evening`;
  return localDateKey(local);
}

/** The dressing-day window used by daily preferences and weather alerts. */
export function wardrobeDayWindow(
  nowIso: string,
  timeZone: string,
): WardrobeDayWindow | null {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return null;

  try {
    const local = localTimeAt(now, timeZone);
    const isEvening = local.hour >= eveningStartHour || local.hour < dayStartHour;
    // Before 04:00 the evening is the one that began yesterday, so it ends at 04:00 of the
    // date the clock already shows; after 18:00 it ends at 04:00 of the date to come.
    const endDate = local.hour < dayStartHour ? local : shiftLocalDate(local, 1);
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
