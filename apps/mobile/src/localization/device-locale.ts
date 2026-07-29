import { I18nManager, NativeModules, Platform } from 'react-native';

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
}

export function getDeviceLocale(): string {
  if (Platform.OS === 'ios') {
    const settingsManager = NativeModules.SettingsManager as
      | {
          settings?: Record<string, unknown>;
          getConstants?: () => { settings?: Record<string, unknown> };
        }
      | undefined;
    const settings = settingsManager?.settings ?? settingsManager?.getConstants?.().settings;
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
