import { numberFormat } from '@/domain/intl-format';
import { localeTag } from '@/localization/locale-tag';
import type { SupportedLanguage } from '@/localization/messages';

/** A 0 to 1 ratio, such as a chance of rain, as a whole percentage in the reader's own form. */
export function formatPercentage(ratio: number, language: SupportedLanguage): string {
  return numberFormat(localeTag(language), {
    maximumFractionDigits: 0,
    style: 'percent',
  }).format(ratio);
}
