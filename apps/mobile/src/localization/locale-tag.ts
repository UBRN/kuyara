import type { SupportedLanguage } from '@/localization/messages';

// One English tag for every value the app formats. A date must not change convention
// with the day it falls on, the hourly rail must not disagree with the last-updated line
// about the 12-hour convention, and Today must not disagree with Weather about the
// decimal separator, so the mapping exists once.
export function localeTag(language: SupportedLanguage): 'en-GB' | 'tr-TR' {
  return language === 'tr' ? 'tr-TR' : 'en-GB';
}
