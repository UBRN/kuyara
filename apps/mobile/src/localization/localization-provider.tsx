import { type PropsWithChildren, useMemo } from 'react';

import type { LanguagePreference } from '@/domain/preferences';
import { getDeviceHour12, getDeviceLocale, useDeviceTemperatureUnit } from '@/localization/device-locale';
import { resolveLanguagePreference } from '@/localization/language-preference';
import {
  LocalizationContext,
  type LocalizationValue,
} from '@/localization/localization-context';
import { getMessages } from '@/localization/messages';

type LocalizationProviderProps = PropsWithChildren<{
  preference?: LanguagePreference;
}>;

export function LocalizationProvider({
  children,
  preference = 'system',
}: LocalizationProviderProps) {
  const temperatureUnit = useDeviceTemperatureUnit();
  // Read on every render, outside the memo: the unit hook re-renders this provider when the
  // app returns to the foreground, and the 12/24-hour switch is re-read on that same pass.
  const deviceLocale = getDeviceLocale();
  const hour12 = getDeviceHour12(deviceLocale);
  const localization = useMemo<LocalizationValue>(() => {
    const language = resolveLanguagePreference(preference, deviceLocale);
    return {
      language,
      messages: getMessages(language),
      hour12,
      temperatureUnit,
    };
  }, [preference, deviceLocale, hour12, temperatureUnit]);

  return (
    <LocalizationContext value={localization}>{children}</LocalizationContext>
  );
}
