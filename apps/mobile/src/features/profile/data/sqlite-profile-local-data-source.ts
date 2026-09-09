import type {
  AnalyticsConsent,
  DressStyle,
  Gender,
} from '@/features/profile/domain/profile';
import type {
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';
import type { LocalProfileRecord } from '@/features/profile/data/local-profile-record';
import {
  ProfileDataSourceError,
  type PersistedOnboardingPreferences,
  type ProfileLocalDataSource,
} from '@/features/profile/data/profile-local-data-source';
import type {
  SqliteDatabase,
  SqliteExecutor,
} from '@/infrastructure/sqlite/sqlite-database';

type LocalProfileRow = Readonly<{
  id: string;
  gender: string | null;
  dress_style: string | null;
  birth_date: string | null;
  language_preference: string;
  theme_preference: string;
  onboarding_completed: number;
  notifications_opt_in: number;
  analytics_consent: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}>;

type LocalProfileDependencies = Readonly<{
  createId: () => string;
  now: () => string;
}>;

const selectProfileSql = `
  SELECT
    id,
    gender,
    dress_style,
    birth_date,
    language_preference,
    theme_preference,
    onboarding_completed,
    notifications_opt_in,
    analytics_consent,
    created_at,
    updated_at,
    deleted_at
  FROM local_profiles
  WHERE singleton_key = 1
`;

function mapRow(row: LocalProfileRow): LocalProfileRecord {
  return {
    id: row.id,
    gender: row.gender,
    dressStyle: row.dress_style,
    birthDate: row.birth_date,
    languagePreference: row.language_preference,
    themePreference: row.theme_preference,
    onboardingCompleted: row.onboarding_completed,
    notificationsOptIn: row.notifications_opt_in,
    analyticsConsent: row.analytics_consent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

async function readProfile(database: SqliteExecutor): Promise<LocalProfileRecord | null> {
  const row = await database.getFirstAsync<LocalProfileRow>(selectProfileSql);
  return row ? mapRow(row) : null;
}

export class SqliteProfileLocalDataSource implements ProfileLocalDataSource {
  private initializationPromise: Promise<LocalProfileRecord> | null = null;
  private readonly database: SqliteDatabase;
  private readonly dependencies: LocalProfileDependencies;

  constructor(
    database: SqliteDatabase,
    dependencies: LocalProfileDependencies,
  ) {
    this.database = database;
    this.dependencies = dependencies;
  }

  getOrCreateProfile(): Promise<LocalProfileRecord> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.createProfileIfMissing().catch((error) => {
        this.initializationPromise = null;
        throw error;
      });
    }

    return this.initializationPromise;
  }

  private async createProfileIfMissing(): Promise<LocalProfileRecord> {
    let profile: LocalProfileRecord | null = null;

    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      profile = await readProfile(transaction);

      if (profile) {
        return;
      }

      const id = this.dependencies.createId();
      const now = this.dependencies.now();

      await transaction.runAsync(
        `
          INSERT OR IGNORE INTO local_profiles (
            singleton_key,
            id,
            gender,
            dress_style,
            birth_date,
            language_preference,
            theme_preference,
            onboarding_completed,
            created_at,
            updated_at,
            deleted_at
          ) VALUES (1, ?, NULL, NULL, NULL, 'system', 'system', 0, ?, ?, NULL)
        `,
        [id, now, now],
      );

      profile = await readProfile(transaction);
    });

    if (!profile) {
      throw new ProfileDataSourceError('missing-profile');
    }

    return profile;
  }

  completeOnboarding(
    preferences: PersistedOnboardingPreferences,
  ): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `
        UPDATE local_profiles
        SET
          gender = ?,
          dress_style = ?,
          birth_date = ?,
          onboarding_completed = 1,
          updated_at = ?
        WHERE singleton_key = 1 AND deleted_at IS NULL
      `,
      [
        preferences.gender,
        preferences.dressStyle,
        preferences.birthDate,
      ],
    );
  }

  updateGender(preference: Gender): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `
        UPDATE local_profiles
        SET gender = ?, updated_at = ?
        WHERE singleton_key = 1 AND deleted_at IS NULL
      `,
      [preference],
    );
  }

  updateDressStyle(dressStyle: DressStyle): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `UPDATE local_profiles SET dress_style = ?, updated_at = ?
       WHERE singleton_key = 1 AND deleted_at IS NULL`,
      [dressStyle],
    );
  }

  updateBirthDate(birthDate: string | null): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `UPDATE local_profiles SET birth_date = ?, updated_at = ?
       WHERE singleton_key = 1 AND deleted_at IS NULL`,
      [birthDate],
    );
  }

  updateLanguagePreference(preference: LanguagePreference): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `
        UPDATE local_profiles
        SET language_preference = ?, updated_at = ?
        WHERE singleton_key = 1 AND deleted_at IS NULL
      `,
      [preference],
    );
  }

  updateThemePreference(preference: ThemePreference): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `
        UPDATE local_profiles
        SET theme_preference = ?, updated_at = ?
        WHERE singleton_key = 1 AND deleted_at IS NULL
      `,
      [preference],
    );
  }

  updateNotificationsOptIn(optIn: boolean): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `
        UPDATE local_profiles
        SET notifications_opt_in = ?, updated_at = ?
        WHERE singleton_key = 1 AND deleted_at IS NULL
      `,
      [optIn ? 1 : 0],
    );
  }

  updateAnalyticsConsent(consent: AnalyticsConsent): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `
        UPDATE local_profiles
        SET analytics_consent = ?, updated_at = ?
        WHERE singleton_key = 1 AND deleted_at IS NULL
      `,
      [consent],
    );
  }

  private async updateProfile(
    source: string,
    values: (string | number | null)[],
  ): Promise<LocalProfileRecord> {
    let profile: LocalProfileRecord | null = null;

    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      const result = await transaction.runAsync(source, [
        ...values,
        this.dependencies.now(),
      ]);

      if (result.changes !== 1) {
        throw new ProfileDataSourceError('write-failed');
      }

      profile = await readProfile(transaction);
    });

    if (!profile) {
      throw new ProfileDataSourceError('missing-profile');
    }

    this.initializationPromise = Promise.resolve(profile);
    return profile;
  }
}
