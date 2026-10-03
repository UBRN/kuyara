import { calendarDateUtcMidnight } from '@/domain/calendar-date';
import { dateTimeFormat, numberFormat } from '@/domain/intl-format';
import { localeTag } from '@/localization/locale-tag';
import type { SupportedLanguage } from '@/localization/messages';

/** The weekday `value` falls on in `timeZone`. */
export function weekday(
  value: string,
  timeZone: string,
  language: SupportedLanguage,
  length: 'short' | 'long',
): string {
  return dateTimeFormat(localeTag(language), {
    timeZone,
    weekday: length,
  }).format(new Date(value));
}

/**
 * The weekday a `YYYY-MM-DD` forecast day names. The date is read in no zone, so a place west
 * of Greenwich cannot have its Thursday rendered as a Wednesday.
 */
export function dateKeyWeekday(
  dateKey: string,
  language: SupportedLanguage,
  length: 'short' | 'long',
): string {
  return weekday(calendarDateUtcMidnight(dateKey).toISOString(), 'UTC', language, length);
}

/** A 0 to 1 chance as a whole percentage. */
export function percentage(value: number, language: SupportedLanguage): string {
  return numberFormat(localeTag(language), {
    maximumFractionDigits: 0,
    style: 'percent',
  }).format(value);
}
