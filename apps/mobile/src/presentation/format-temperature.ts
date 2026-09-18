import type { SupportedLanguage } from '@/localization/messages';

// One English tag for every value the app formats. A date must not change convention
// with the day it falls on, the hourly rail must not disagree with the last-updated line
// about the 12-hour convention, and Today must not disagree with Weather about the
// decimal separator, so the mapping exists once.
export function localeTag(language: SupportedLanguage): 'en-GB' | 'tr-TR' {
  return language === 'tr' ? 'tr-TR' : 'en-GB';
}

// Every temperature the app shows carries exactly one decimal, in the reader's own
// separator. A fixed decimal rather than a maximum one: a rail whose columns alternate
// between "22°" and "22,4°" changes width as it is scanned, and a hero that drops its
// decimal on the hour reads as a different measurement rather than the same one.
export function formatTemperatureValue(
  value: number,
  language: SupportedLanguage,
): string {
  // A measurement that rounds away to nothing from below would format as "-0,0", which
  // reads as a temperature under freezing when it is not one. Only that case is
  // flattened; -0,4 keeps its sign because -0,4 is genuinely below zero.
  const guarded = Math.round(Math.abs(value) * 10) === 0 ? 0 : value;
  return new Intl.NumberFormat(localeTag(language), {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(guarded);
}

export function formatTemperature(value: number, language: SupportedLanguage): string {
  return `${formatTemperatureValue(value, language)}°`;
}
