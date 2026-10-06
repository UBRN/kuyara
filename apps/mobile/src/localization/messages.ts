import { en } from '@/localization/messages/en';
import { tr } from '@/localization/messages/tr';
import type { AppMessages } from '@/localization/messages/types';

export type {
  AccountMessages,
  AppMessages,
  PreferenceMessages,
  TodayDayInsightKey,
  TodayMessages,
  TodayRequirementName,
  WalkthroughMessages,
} from '@/localization/messages/types';

export type SupportedLanguage = 'en' | 'tr';

export const messages: Readonly<Record<SupportedLanguage, AppMessages>> = Object.freeze({ en, tr });

export function resolveSupportedLanguage(locale: string | null | undefined): SupportedLanguage {
  return locale?.toLocaleLowerCase('en').startsWith('tr') ? 'tr' : 'en';
}

export function getMessages(locale: string | null | undefined): AppMessages {
  return messages[resolveSupportedLanguage(locale)];
}
