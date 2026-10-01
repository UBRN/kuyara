import type { SupportedLanguage } from '@/localization/messages';
import { localeTag } from '@/localization/locale-tag';

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
  return new Intl.DateTimeFormat(localeTag(language), {
    timeZone: 'UTC',
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
  }).format(Date.UTC(2000, 0, 1, hour, minute));
}
