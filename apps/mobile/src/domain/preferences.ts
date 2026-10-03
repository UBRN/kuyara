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
