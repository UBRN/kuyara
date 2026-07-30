import {
  isClothingPreference,
  isLanguagePreference,
  isThemePreference,
  type ClothingPreference,
  type LanguagePreference,
  type ThemePreference,
} from '@/domain/preferences';
import type { LocalProfileRecord } from '@/features/profile/data/local-profile-record';
import {
  ProfileDataSourceError,
  type ProfileLocalDataSource,
} from '@/features/profile/data/profile-local-data-source';
import type {
  LocalProfile,
  OnboardingPreferences,
} from '@/features/profile/domain/profile';

export interface ProfileRepository {
  getOrCreateProfile(): Promise<LocalProfile>;
  completeOnboarding(preferences: OnboardingPreferences): Promise<LocalProfile>;
  updateClothingPreference(preference: ClothingPreference): Promise<LocalProfile>;
  updateLanguagePreference(preference: LanguagePreference): Promise<LocalProfile>;
  updateThemePreference(preference: ThemePreference): Promise<LocalProfile>;
}

export class ProfileRepositoryError extends Error {
  readonly code: 'invalid-data' | 'unavailable';

  constructor(code: 'invalid-data' | 'unavailable') {
    super('The local profile operation could not be completed.');
    this.name = 'ProfileRepositoryError';
    this.code = code;
  }
}

class ProfileMappingError extends Error {}

function isUtcIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function mapRecord(record: LocalProfileRecord): LocalProfile {
  const hasValidClothingPreference =
    record.clothingPreference === null || isClothingPreference(record.clothingPreference);
  const hasValidCompletion =
    record.onboardingCompleted === 0 || record.onboardingCompleted === 1;
  const completedWithoutPreference =
    record.onboardingCompleted === 1 && record.clothingPreference === null;

  if (
    !record.id ||
    !hasValidClothingPreference ||
    !isLanguagePreference(record.languagePreference) ||
    !isThemePreference(record.themePreference) ||
    !hasValidCompletion ||
    completedWithoutPreference ||
    !isUtcIsoTimestamp(record.createdAt) ||
    !isUtcIsoTimestamp(record.updatedAt) ||
    record.deletedAt !== null
  ) {
    throw new ProfileMappingError();
  }

  return {
    id: record.id,
    clothingPreference: record.clothingPreference,
    languagePreference: record.languagePreference,
    themePreference: record.themePreference,
    onboardingCompleted: record.onboardingCompleted === 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class LocalProfileRepository implements ProfileRepository {
  private readonly dataSource: ProfileLocalDataSource;

  constructor(dataSource: ProfileLocalDataSource) {
    this.dataSource = dataSource;
  }

  getOrCreateProfile(): Promise<LocalProfile> {
    return this.execute(() => this.dataSource.getOrCreateProfile());
  }

  completeOnboarding(preferences: OnboardingPreferences): Promise<LocalProfile> {
    return this.execute(() => this.dataSource.completeOnboarding(preferences));
  }

  updateClothingPreference(preference: ClothingPreference): Promise<LocalProfile> {
    return this.execute(() => this.dataSource.updateClothingPreference(preference));
  }

  updateLanguagePreference(preference: LanguagePreference): Promise<LocalProfile> {
    return this.execute(() => this.dataSource.updateLanguagePreference(preference));
  }

  updateThemePreference(preference: ThemePreference): Promise<LocalProfile> {
    return this.execute(() => this.dataSource.updateThemePreference(preference));
  }

  private async execute(operation: () => Promise<LocalProfileRecord>): Promise<LocalProfile> {
    try {
      return mapRecord(await operation());
    } catch (error) {
      const code =
        error instanceof ProfileMappingError ||
        (error instanceof ProfileDataSourceError && error.code === 'invalid-record')
          ? 'invalid-data'
          : 'unavailable';
      throw new ProfileRepositoryError(code);
    }
  }
}
