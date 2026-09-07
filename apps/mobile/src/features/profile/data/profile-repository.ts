import {
  isLanguagePreference,
  isThemePreference,
  type LanguagePreference,
  type ThemePreference,
} from '@/domain/preferences';
import type { LocalProfileRecord } from '@/features/profile/data/local-profile-record';
import {
  ProfileDataSourceError,
  type ProfileLocalDataSource,
} from '@/features/profile/data/profile-local-data-source';
import {
  genderSchema,
  isStoredBirthDate,
  isValidBirthDate,
  type Gender,
  type Profile,
  type ProfileOnboardingPreferences,
} from '@/features/profile/domain/profile';

export interface ProfileRepository {
  getOrCreateProfile(): Promise<Profile>;
  completeOnboarding(preferences: ProfileOnboardingPreferences): Promise<Profile>;
  updateGender(preference: Gender): Promise<Profile>;
  updateBirthDate(birthDate: string | null): Promise<Profile>;
  updateLanguagePreference(preference: LanguagePreference): Promise<Profile>;
  updateThemePreference(preference: ThemePreference): Promise<Profile>;
  updateNotificationsOptIn(optIn: boolean): Promise<Profile>;
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

function mapRecord(record: LocalProfileRecord): Profile {
  const hasValidGender =
    record.gender === null || genderSchema.safeParse(record.gender).success;
  const hasValidCompletion =
    record.onboardingCompleted === 0 || record.onboardingCompleted === 1;
  const hasValidNotificationsOptIn =
    record.notificationsOptIn === 0 || record.notificationsOptIn === 1;
  const completedWithoutPreference =
    record.onboardingCompleted === 1 && record.gender === null;

  if (
    !record.id ||
    !hasValidGender ||
    !isStoredBirthDate(record.birthDate) ||
    !isLanguagePreference(record.languagePreference) ||
    !isThemePreference(record.themePreference) ||
    !hasValidCompletion ||
    !hasValidNotificationsOptIn ||
    completedWithoutPreference ||
    !isUtcIsoTimestamp(record.createdAt) ||
    !isUtcIsoTimestamp(record.updatedAt) ||
    record.deletedAt !== null
  ) {
    throw new ProfileMappingError();
  }

  return {
    id: record.id,
    gender: record.gender === null ? null : genderSchema.parse(record.gender),
    birthDate: record.birthDate,
    languagePreference: record.languagePreference,
    themePreference: record.themePreference,
    onboardingCompleted: record.onboardingCompleted === 1,
    notificationsOptIn: record.notificationsOptIn === 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class LocalProfileRepository implements ProfileRepository {
  private readonly dataSource: ProfileLocalDataSource;

  private readonly now: () => Date;

  constructor(dataSource: ProfileLocalDataSource, now: () => Date = () => new Date()) {
    this.dataSource = dataSource;
    this.now = now;
  }

  getOrCreateProfile(): Promise<Profile> {
    return this.execute(() => this.dataSource.getOrCreateProfile());
  }

  completeOnboarding(preferences: ProfileOnboardingPreferences): Promise<Profile> {
    return this.execute(() => {
      if (!genderSchema.safeParse(preferences.gender).success) throw new ProfileMappingError();
      return this.dataSource.completeOnboarding(preferences);
    });
  }

  updateGender(preference: Gender): Promise<Profile> {
    return this.execute(() => {
      if (!genderSchema.safeParse(preference).success) throw new ProfileMappingError();
      return this.dataSource.updateGender(preference);
    });
  }

  updateBirthDate(birthDate: string | null): Promise<Profile> {
    return this.execute(() => {
      if (!isValidBirthDate(birthDate, this.now())) throw new ProfileMappingError();
      return this.dataSource.updateBirthDate(birthDate);
    });
  }

  updateLanguagePreference(preference: LanguagePreference): Promise<Profile> {
    return this.execute(() => this.dataSource.updateLanguagePreference(preference));
  }

  updateThemePreference(preference: ThemePreference): Promise<Profile> {
    return this.execute(() => this.dataSource.updateThemePreference(preference));
  }

  updateNotificationsOptIn(optIn: boolean): Promise<Profile> {
    return this.execute(() => this.dataSource.updateNotificationsOptIn(optIn));
  }

  private async execute(operation: () => Promise<LocalProfileRecord>): Promise<Profile> {
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
