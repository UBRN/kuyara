import { I18nManager, NativeModules, Platform } from 'react-native';

type AppleSettings = Record<string, unknown> | undefined;

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
}

function getAppleSettings(): AppleSettings {
  const settingsManager = NativeModules.SettingsManager as
    | {
        settings?: Record<string, unknown>;
        getConstants?: () => { settings?: Record<string, unknown> };
      }
    | undefined;
  return settingsManager?.settings ?? settingsManager?.getConstants?.().settings;
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
    const appleLanguage = firstString(settings?.AppleLanguages);
    const appleLocale = firstString(settings?.AppleLocale);

    if (appleLanguage) {
      return appleLanguage;
    }

    if (appleLocale) {
      return appleLocale;
    }
  }

  return (
    I18nManager.getConstants().localeIdentifier ??
    Intl.DateTimeFormat().resolvedOptions().locale
  );
}

export function getDeviceHour12(deviceLocale = getDeviceLocale()): boolean {
  return resolveDeviceHour12(
    Platform.OS === 'ios' ? getAppleSettings() : undefined,
    deviceLocale,
  );
}
