import { type PropsWithChildren, useMemo } from 'react';

import type {
  LanguagePreference,
  TemperatureUnitPreference,
  WindSpeedUnitPreference,
} from '@/domain/preferences';
import { temperatureUnitFor } from '@/domain/temperature-unit';
import {
  getDeviceHour12,
  getDeviceLocale,
  useDeviceTemperatureUnit,
  useWindSpeedUnit,
} from '@/localization/device-locale';
import { resolveLanguagePreference } from '@/localization/language-preference';
import {
  LocalizationContext,
  type LocalizationValue,
} from '@/localization/localization-context';
import { getMessages } from '@/localization/messages';

type LocalizationProviderProps = PropsWithChildren<{
  preference?: LanguagePreference;
  temperatureUnitPreference?: TemperatureUnitPreference;
  windSpeedUnitPreference?: WindSpeedUnitPreference;
}>;

export function LocalizationProvider({
  children,
  preference = 'system',
  temperatureUnitPreference = 'system',
  windSpeedUnitPreference = 'system',
}: LocalizationProviderProps) {
  const temperatureUnit = temperatureUnitFor(temperatureUnitPreference, useDeviceTemperatureUnit());
  const windSpeedUnit = useWindSpeedUnit(windSpeedUnitPreference);
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
      windSpeedUnit,
    };
  }, [preference, deviceLocale, hour12, temperatureUnit, windSpeedUnit]);

  return (
    <LocalizationContext value={localization}>{children}</LocalizationContext>
  );
}
