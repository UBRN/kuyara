import { dateTimeFormat, numberFormat } from '@/domain/intl-format';
import { localeTag } from '@/localization/locale-tag';

/** A clock time in `timeZone`, in the reader's 12- or 24-hour convention. */
export function time(
  value: string,
  timeZone: string,
  language: 'en' | 'tr',
  hour12: boolean,
): string {
  return dateTimeFormat(localeTag(language), {
    // A padded hour reads as a stopwatch in the 12-hour convention ("02:00 PM"), so the
    // 12-hour label drops the padding the 24-hour one keeps.
    hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12, timeZone,
  }).format(new Date(value));
}

/** The weekday `value` falls on in `timeZone`. */
export function weekday(
  value: string,
  timeZone: string,
  language: 'en' | 'tr',
  length: 'short' | 'long',
): string {
  return dateTimeFormat(localeTag(language), {
    timeZone,
    weekday: length,
  }).format(new Date(value));
}

/** A 0 to 1 chance as a whole percentage. */
export function percentage(value: number, language: 'en' | 'tr'): string {
  return numberFormat(localeTag(language), {
    maximumFractionDigits: 0,
    style: 'percent',
  }).format(value);
}
