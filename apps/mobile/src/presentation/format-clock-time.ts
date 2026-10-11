import { dateTimeFormat, getDeviceTimeZone, zonedClock } from '@/domain/intl-format';
import type { SupportedLanguage } from '@/localization/messages';
import { localeTag } from '@/localization/locale-tag';

/**
 * A clock time written the way the device's clock is set: 24-hour with a zero-padded hour, or
 * 12-hour with the language's own day-period marker. `timeZone` names the zone it is read in;
 * without one the device's own zone reads it.
 */
export function formatClockTime(
  instant: string | number,
  language: SupportedLanguage,
  hour12: boolean,
  timeZone?: string,
): string {
  return dateTimeFormat(localeTag(language), {
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
    timeZone,
  }).format(new Date(instant));
}

/** Turkish names the part of the day before a 12-hour time; the clock's own "ÖÖ" and "ÖS" read as an abbreviation in a sentence. */
function turkishDayPart(hour: number): string {
  if (hour >= 22 || hour < 6) return 'gece';
  if (hour < 12) return 'sabah';
  if (hour === 12) return 'öğle';
  return hour < 18 ? 'öğleden sonra' : 'akşam';
}

/** The part of the day and the 12-hour digits Turkish says for an instant. */
function turkishTwelveHour(instant: string | number, timeZone?: string): Readonly<{ dayPart: string; digits: string }> {
  const { hour, minute } = zonedClock(new Date(instant).getTime(), timeZone || getDeviceTimeZone() || 'UTC');
  return { dayPart: turkishDayPart(hour), digits: `${hour % 12 || 12}:${String(minute).padStart(2, '0')}` };
}

/**
 * A clock time as a sentence says it. English keeps the clock's own form. Turkish keeps the
 * 24-hour form and, on a 12-hour clock, puts the part of the day in front of the digits
 * ("akşam 5:00") where the clock itself prints "ÖS 5:00".
 */
export function formatNaturalClockTime(
  instant: string | number,
  language: SupportedLanguage,
  hour12: boolean,
  timeZone?: string,
): string {
  if (language !== 'tr' || !hour12) return formatClockTime(instant, language, hour12, timeZone);
  const { dayPart, digits } = turkishTwelveHour(instant, timeZone);
  return `${dayPart} ${digits}`;
}

/**
 * The natural time with Turkish "saat" in front of the digits ("saat 17:00", "akşam saat
 * 5:00"), for a sentence that says "around" a time.
 */
export function formatSpokenClockTime(
  instant: string | number,
  language: SupportedLanguage,
  hour12: boolean,
  timeZone?: string,
): string {
  if (language !== 'tr') return formatClockTime(instant, language, hour12, timeZone);
  if (!hour12) return `saat ${formatClockTime(instant, language, hour12, timeZone)}`;
  const { dayPart, digits } = turkishTwelveHour(instant, timeZone);
  return `${dayPart} saat ${digits}`;
}

/**
 * A fixed wall-clock time (quiet hours, the morning briefing's hour) written the way the
 * device's clock is set, as every alert body writes its crossing time. It names no instant,
 * so it is formatted in UTC from the hour and minute themselves and no zone can move it.
 * A sentence passes the natural or spoken formatter in place of the clock's own form.
 */
export function formatWallClockTime(
  { hour, minute }: Readonly<{ hour: number; minute: number }>,
  language: SupportedLanguage,
  hour12: boolean,
  format: typeof formatClockTime = formatClockTime,
): string {
  return format(Date.UTC(2000, 0, 1, hour, minute), language, hour12, 'UTC');
}

/**
 * When something was last updated, read against the viewer's own clock and calendar: the
 * device time zone, the time alone on the viewer's current local day, and the locale's short
 * date and time otherwise, so "06:05" never reads as minutes old. The line is a sentence, so
 * Turkish on a 12-hour clock names the part of the day ("akşam 7:05").
 */
export function formatLastUpdated(
  instant: string,
  language: SupportedLanguage,
  hour12: boolean,
  now: number,
): string {
  const updated = new Date(instant);
  if (updated.toDateString() === new Date(now).toDateString()) {
    return formatNaturalClockTime(instant, language, hour12);
  }
  if (language === 'tr' && hour12) {
    const date = dateTimeFormat(localeTag(language), { dateStyle: 'short' }).format(updated);
    return `${date} ${formatNaturalClockTime(instant, language, hour12)}`;
  }
  return dateTimeFormat(localeTag(language), { dateStyle: 'short', timeStyle: 'short', hour12 }).format(updated);
}
