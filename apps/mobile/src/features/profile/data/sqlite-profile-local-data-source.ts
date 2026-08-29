import type {
  ClothingPreference,
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
  clothing_preference: string | null;
  language_preference: string;
  theme_preference: string;
  onboarding_completed: number;
  notifications_opt_in: number;
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
    clothing_preference,
    language_preference,
    theme_preference,
    onboarding_completed,
    notifications_opt_in,
    created_at,
    updated_at,
    deleted_at
  FROM local_profiles
  WHERE singleton_key = 1
`;

function mapRow(row: LocalProfileRow): LocalProfileRecord {
  return {
    id: row.id,
    clothingPreference: row.clothing_preference,
    languagePreference: row.language_preference,
    themePreference: row.theme_preference,
    onboardingCompleted: row.onboarding_completed,
    notificationsOptIn: row.notifications_opt_in,
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
            clothing_preference,
            language_preference,
            theme_preference,
            onboarding_completed,
            created_at,
            updated_at,
            deleted_at
          ) VALUES (1, ?, NULL, 'system', 'system', 0, ?, ?, NULL)
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
          clothing_preference = ?,
          language_preference = ?,
          theme_preference = ?,
          onboarding_completed = 1,
          updated_at = ?
        WHERE singleton_key = 1 AND deleted_at IS NULL
      `,
      [
        preferences.clothingPreference,
        preferences.languagePreference,
        preferences.themePreference,
      ],
    );
  }

  updateClothingPreference(preference: ClothingPreference): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `
        UPDATE local_profiles
        SET clothing_preference = ?, updated_at = ?
        WHERE singleton_key = 1 AND deleted_at IS NULL
      `,
      [preference],
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

  private async updateProfile(
    source: string,
    values: (string | number)[],
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
