import type {
  ClothingPreference,
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';
import type { LocalProfileRecord } from '@/features/profile/data/local-profile-record';

export type PersistedOnboardingPreferences = Readonly<{
  clothingPreference: ClothingPreference;
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
}>;

export interface ProfileLocalDataSource {
  getOrCreateProfile(): Promise<LocalProfileRecord>;
  completeOnboarding(preferences: PersistedOnboardingPreferences): Promise<LocalProfileRecord>;
  updateClothingPreference(preference: ClothingPreference): Promise<LocalProfileRecord>;
  updateLanguagePreference(preference: LanguagePreference): Promise<LocalProfileRecord>;
  updateThemePreference(preference: ThemePreference): Promise<LocalProfileRecord>;
  updateNotificationsOptIn(optIn: boolean): Promise<LocalProfileRecord>;
}

export class ProfileDataSourceError extends Error {
  readonly code: 'missing-profile' | 'invalid-record' | 'write-failed';

  constructor(code: 'missing-profile' | 'invalid-record' | 'write-failed') {
    super('The local profile data operation failed.');
    this.name = 'ProfileDataSourceError';
    this.code = code;
  }
}
