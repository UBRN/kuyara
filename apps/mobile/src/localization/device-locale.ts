import { useEffect, useState } from 'react';
import { AppState, I18nManager, NativeModules, Platform } from 'react-native';
import { getLocales, useLocales } from 'expo-localization';

type AppleSettings = Record<string, unknown> | undefined;
export type TemperatureUnit = 'celsius' | 'fahrenheit';

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

// The device's preferred languages in order; the app's own languages are English and Turkish.
// The first one the app supports decides, as it does for the system's own permission prompts
// and share sheet, so German then Turkish reads Turkish here too. With none supported the
// first stands (English is the fallback downstream).
export function firstSupportedLocale(candidates: readonly string[]): string | undefined {
  return candidates.find((tag) => {
    const language = tag.split(/[-_]/)[0]?.toLowerCase();
    return language === 'en' || language === 'tr';
  }) ?? candidates[0];
}

function getAppleSettings(): AppleSettings {
  const settingsManager = NativeModules.SettingsManager as
    | {
        settings?: Record<string, unknown>;
        getConstants?: () => { settings?: Record<string, unknown> };
      }
    | undefined;
  return settingsManager?.getConstants
    ? settingsManager.getConstants().settings
    : settingsManager?.settings;
}

function isEnabled(value: unknown): boolean {
  return value === true || value === 1;
}

// iOS writes one of these keys into the settings dictionary when the user moves the
// 24-Hour Time switch away from what the region implies; neither key is present while the
// switch follows the region, which is also every Android case.
export function resolveDeviceHour12(settings: AppleSettings, deviceLocale: string): boolean {
  if (isEnabled(settings?.AppleICUForce24HourTime)) return false;
  if (isEnabled(settings?.AppleICUForce12HourTime)) return true;

  const { hour12, hourCycle } = new Intl.DateTimeFormat(deviceLocale, {
    hour: 'numeric',
  }).resolvedOptions();
  if (hourCycle) return hourCycle === 'h11' || hourCycle === 'h12';
  return hour12 === true;
}

export function getDeviceLocale(): string {
  if (Platform.OS === 'ios') {
    const settings = getAppleSettings();
    const appleLanguage = firstSupportedLocale(strings(settings?.AppleLanguages));
    const appleLocale = firstString(settings?.AppleLocale);

    if (appleLanguage) {
      return appleLanguage;
    }

    if (appleLocale) {
      return appleLocale;
    }
  }

  return (
    firstSupportedLocale(strings(getLocales().map((locale) => locale.languageTag)))
    ?? I18nManager.getConstants().localeIdentifier
    ?? Intl.DateTimeFormat().resolvedOptions().locale
  );
}

export function getDeviceHour12(deviceLocale = getDeviceLocale()): boolean {
  return resolveDeviceHour12(
    Platform.OS === 'ios' ? getAppleSettings() : undefined,
    deviceLocale,
  );
}

export function resolveDeviceTemperatureUnit(
  settings: AppleSettings,
  locales: readonly Readonly<{ temperatureUnit?: unknown }>[],
): TemperatureUnit {
  if (settings?.AppleTemperatureUnit === 'Fahrenheit') return 'fahrenheit';
  if (settings?.AppleTemperatureUnit === 'Celsius') return 'celsius';
  const localeUnit = locales[0]?.temperatureUnit;
  return localeUnit === 'fahrenheit' || localeUnit === 'celsius'
    ? localeUnit
    : 'celsius';
}

export function getDeviceTemperatureUnit(): TemperatureUnit {
  return resolveDeviceTemperatureUnit(
    Platform.OS === 'ios' ? getAppleSettings() : undefined,
    getLocales(),
  );
}

export function useDeviceTemperatureUnit(): TemperatureUnit {
  const locales = useLocales();
  const [, refresh] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);
  return resolveDeviceTemperatureUnit(
    Platform.OS === 'ios' ? getAppleSettings() : undefined,
    locales,
  );
}
