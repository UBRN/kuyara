import { dateTimeFormat } from '@/domain/intl-format';
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

/**
 * A fixed wall-clock time (quiet hours, the morning briefing's hour) written the way the
 * device's clock is set, as every alert body writes its crossing time. It names no instant,
 * so it is formatted in UTC from the hour and minute themselves and no zone can move it.
 */
export function formatWallClockTime(
  { hour, minute }: Readonly<{ hour: number; minute: number }>,
  language: SupportedLanguage,
  hour12: boolean,
): string {
  return formatClockTime(Date.UTC(2000, 0, 1, hour, minute), language, hour12, 'UTC');
}

/**
 * When something was last updated, read against the viewer's own clock and calendar: the
 * device time zone, the time alone on the viewer's current local day, and the locale's short
 * date and time otherwise, so "06:05" never reads as minutes old.
 */
export function formatLastUpdated(
  instant: string,
  language: SupportedLanguage,
  hour12: boolean,
  now: number,
): string {
  const updated = new Date(instant);
  if (updated.toDateString() === new Date(now).toDateString()) {
    return formatClockTime(instant, language, hour12);
  }
  return dateTimeFormat(localeTag(language), { dateStyle: 'short', timeStyle: 'short', hour12 }).format(updated);
}
