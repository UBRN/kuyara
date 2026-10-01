import { numberFormat } from '@/domain/intl-format';
import type { TemperatureUnit } from '@/localization/device-locale';
import { localeTag } from '@/localization/locale-tag';
import type { SupportedLanguage } from '@/localization/messages';

// Read through here by Today's presentation, which imports it from this module.
export { localeTag };

// Every temperature the app shows carries exactly one decimal, in the reader's own
// separator. A fixed decimal rather than a maximum one: a rail whose columns alternate
// between "22°" and "22,4°" changes width as it is scanned, and a hero that drops its
// decimal on the hour reads as a different measurement rather than the same one.
function oneDecimal(value: number, language: SupportedLanguage): string {
  // A measurement that rounds away to nothing from below would format as "-0,0", which
  // reads as a temperature under freezing when it is not one. Only that case is
  // flattened; -0,4 keeps its sign because -0,4 is genuinely below zero.
  const guarded = Math.round(Math.abs(value) * 10) === 0 ? 0 : value;
  return numberFormat(localeTag(language), {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(guarded);
}

export function formatTemperatureValue(
  value: number,
  language: SupportedLanguage,
  unit: TemperatureUnit,
): string {
  return oneDecimal(unit === 'fahrenheit' ? value * 9 / 5 + 32 : value, language);
}

export function formatTemperature(
  value: number,
  language: SupportedLanguage,
  unit: TemperatureUnit,
): string {
  return `${formatTemperatureValue(value, language, unit)}°`;
}

export function formatTemperatureDifference(
  differenceCelsius: number,
  language: SupportedLanguage,
  unit: TemperatureUnit,
): string {
  return `${oneDecimal(unit === 'fahrenheit' ? differenceCelsius * 9 / 5 : differenceCelsius, language)}°`;
}

export function formatWholeTemperature(
  valueCelsius: number,
  language: SupportedLanguage,
  unit: TemperatureUnit,
): string {
  return `${formatWholeTemperatureValue(valueCelsius, language, unit)}°${unit === 'fahrenheit' ? 'F' : 'C'}`;
}

export function formatWholeTemperatureValue(
  valueCelsius: number,
  language: SupportedLanguage,
  unit: TemperatureUnit,
): string {
  const converted = unit === 'fahrenheit' ? valueCelsius * 9 / 5 + 32 : valueCelsius;
  const rounded = Math.round(converted);
  const guarded = rounded === 0 ? 0 : rounded;
  return numberFormat(localeTag(language), {
    maximumFractionDigits: 0,
  }).format(guarded);
}
