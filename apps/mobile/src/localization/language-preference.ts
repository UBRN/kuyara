import type { LanguagePreference } from '@/domain/preferences';
import {
  resolveSupportedLanguage,
  type SupportedLanguage,
} from '@/localization/messages';

export function resolveLanguagePreference(
  preference: LanguagePreference,
  deviceLocale: string | null | undefined,
): SupportedLanguage {
  return preference === 'system' ? resolveSupportedLanguage(deviceLocale) : preference;
}
