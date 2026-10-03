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

/** A 0 to 1 chance as a whole percentage. */
export function percentage(value: number, language: SupportedLanguage): string {
  return numberFormat(localeTag(language), {
    maximumFractionDigits: 0,
    style: 'percent',
  }).format(value);
}
