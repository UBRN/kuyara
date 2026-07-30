import type {
  ClothingPreference,
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';

export type LocalProfile = Readonly<{
  id: string;
  clothingPreference: ClothingPreference | null;
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type OnboardingPreferences = Readonly<{
  clothingPreference: ClothingPreference;
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
}>;
