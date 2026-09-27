import { createContext, use } from 'react';

import type {
  AppMessages,
  SupportedLanguage,
} from '@/localization/messages';
import type { TemperatureUnit } from '@/localization/device-locale';

export type LocalizationValue = Readonly<{
  language: SupportedLanguage;
  messages: AppMessages;
  /**
   * The device's 12/24-hour clock setting, which the user sets independently of the
   * application language. Screens read it from here so they never touch a native module.
   */
  hour12: boolean;
  temperatureUnit?: TemperatureUnit;
}>;

export const LocalizationContext = createContext<LocalizationValue | null>(null);

export function useLocalizationContext(): LocalizationValue & { temperatureUnit: TemperatureUnit } {
  const localization = use(LocalizationContext);

  if (!localization) {
    throw new Error('useLocalization must be used within LocalizationProvider');
  }

  return { ...localization, temperatureUnit: localization.temperatureUnit ?? 'celsius' };
}
