import { createContext, use } from 'react';

import type {
  AppMessages,
  SupportedLanguage,
} from '@/localization/messages';

export type LocalizationValue = Readonly<{
  language: SupportedLanguage;
  messages: AppMessages;
}>;

export const LocalizationContext = createContext<LocalizationValue | null>(null);

export function useLocalizationContext(): LocalizationValue {
  const localization = use(LocalizationContext);

  if (!localization) {
    throw new Error('useLocalization must be used within LocalizationProvider');
  }

  return localization;
}
