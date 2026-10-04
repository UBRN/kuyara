export const clothingPreferences = ['womens', 'mens'] as const;
export type ClothingPreference = (typeof clothingPreferences)[number];

/** The languages the app is written in, and the locales a request names. */
export const supportedLanguages = ['en', 'tr'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

const languagePreferences = ['system', 'tr', 'en'] as const;
export type LanguagePreference = (typeof languagePreferences)[number];

const themePreferences = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof themePreferences)[number];

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return languagePreferences.includes(value as LanguagePreference);
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return themePreferences.includes(value as ThemePreference);
}

// Device-only unit choices. System follows the device: its Temperature setting for temperature
// and its Measurement System for wind speed.
export const temperatureUnitPreferences = ['system', 'celsius', 'fahrenheit'] as const;
export type TemperatureUnitPreference = (typeof temperatureUnitPreferences)[number];

export const windSpeedUnitPreferences = ['system', 'kmh', 'mph'] as const;
export type WindSpeedUnitPreference = (typeof windSpeedUnitPreferences)[number];

export function isTemperatureUnitPreference(value: unknown): value is TemperatureUnitPreference {
  return temperatureUnitPreferences.includes(value as TemperatureUnitPreference);
}

export function isWindSpeedUnitPreference(value: unknown): value is WindSpeedUnitPreference {
  return windSpeedUnitPreferences.includes(value as WindSpeedUnitPreference);
}
