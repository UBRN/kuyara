import { useEffect, useState } from 'react';
import { AppState, I18nManager, NativeModules, Platform } from 'react-native';
import { getLocales, useLocales } from 'expo-localization';

import { type WindSpeedUnit, windSpeedUnitFor } from '@/domain/wind-speed';

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

// The clock follows the device's region, not the app's language: German then English shows
// English text but keeps Germany's 24-hour clock. iOS names the region in AppleLocale (with
// keyword suffixes such as "@calendar=gregorian", dropped here); a tag that carries none is
// no region. Without one, the first preferred language stands, as it did before the language
// pick skipped unsupported entries.
function regionLocale(tag: string | undefined): string | undefined {
  const candidate = tag?.split('@')[0]?.replace(/_/g, '-');
  return candidate && /^[A-Za-z]{2,3}(-[A-Za-z]{4})?-([A-Za-z]{2}|\d{3})(-|$)/.test(candidate)
    ? candidate
    : undefined;
}

function getDeviceClockLocale(settings: AppleSettings, fallback: string): string {
  if (Platform.OS === 'ios') {
    return regionLocale(firstString(settings?.AppleLocale))
      ?? firstString(settings?.AppleLanguages)
      ?? fallback;
  }
  return getLocales()[0]?.languageTag ?? fallback;
}

export function getDeviceHour12(deviceLocale = getDeviceLocale()): boolean {
  const settings = Platform.OS === 'ios' ? getAppleSettings() : undefined;
  return resolveDeviceHour12(settings, getDeviceClockLocale(settings, deviceLocale));
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

// The device's Measurement System setting; expo-localization re-reads it when the locale changes.
export function useDeviceWindSpeedUnit(): WindSpeedUnit {
  return windSpeedUnitFor(useLocales()[0]?.measurementSystem);
}
