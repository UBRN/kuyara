export const clothingPreferences = ['womens', 'mens'] as const;
export type ClothingPreference = (typeof clothingPreferences)[number];

export const languagePreferences = ['system', 'tr', 'en'] as const;
export type LanguagePreference = (typeof languagePreferences)[number];

export const themePreferences = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof themePreferences)[number];

export function isClothingPreference(value: unknown): value is ClothingPreference {
  return clothingPreferences.includes(value as ClothingPreference);
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return languagePreferences.includes(value as LanguagePreference);
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return themePreferences.includes(value as ThemePreference);
}
