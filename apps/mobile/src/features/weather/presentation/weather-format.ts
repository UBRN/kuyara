import { calendarDateUtcMidnight } from '@/domain/calendar-date';
import { dateTimeFormat } from '@/domain/intl-format';
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

/**
 * Whether a chance is worth showing: one that `formatPercentage` would write as "0%" says nothing a
 * dry hour or day does not, so it is left out like a zero. Both round half away from zero.
 */
export function showsChance(value: number): boolean {
  return Math.round(value * 100) > 0;
}
