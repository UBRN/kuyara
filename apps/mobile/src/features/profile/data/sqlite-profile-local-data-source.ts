import type {
  AnalyticsConsent,
  DressStyle,
  Gender,
  StyleAesthetic,
} from '@/features/profile/domain/profile';
import { namePromptVersion, orderStyleAesthetics, walkthroughVersion } from '@/features/profile/domain/profile';
import type {
  LanguagePreference,
  TemperatureUnitPreference,
  ThemePreference,
  WindSpeedUnitPreference,
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
  style_aesthetics: string;
  morning_sheet_enabled: number;
  easier_to_see: number;
  birth_date: string | null;
  display_name: string | null;
  name_prompt_version: number;
  walkthrough_version: number;
  swap_hint_shown: number;
  language_preference: string;
  theme_preference: string;
  temperature_unit: string;
  wind_speed_unit: string;
  onboarding_completed: number;
  notifications_opt_in: number;
  weather_alert_offer_shown: number;
  morning_briefing_opt_in: number;
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
    style_aesthetics,
    morning_sheet_enabled,
    easier_to_see,
    birth_date,
    display_name,
    name_prompt_version,
    walkthrough_version,
    swap_hint_shown,
    language_preference,
    theme_preference,
    temperature_unit,
    wind_speed_unit,
    onboarding_completed,
    notifications_opt_in,
    weather_alert_offer_shown,
    morning_briefing_opt_in,
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
    styleAesthetics: row.style_aesthetics,
    morningSheetEnabled: row.morning_sheet_enabled,
    easierToSee: row.easier_to_see,
    birthDate: row.birth_date,
    displayName: row.display_name,
    namePromptVersion: row.name_prompt_version,
    walkthroughVersion: row.walkthrough_version,
    swapHintShown: row.swap_hint_shown,
    languagePreference: row.language_preference,
    themePreference: row.theme_preference,
    temperatureUnitPreference: row.temperature_unit,
    windSpeedUnitPreference: row.wind_speed_unit,
    onboardingCompleted: row.onboarding_completed,
    notificationsOptIn: row.notifications_opt_in,
    weatherAlertOfferShown: row.weather_alert_offer_shown,
    morningBriefingOptIn: row.morning_briefing_opt_in,
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
          style_aesthetics = ?,
          birth_date = ?,
          display_name = ?,
          name_prompt_version = ?,
          onboarding_completed = 1,
          pending_sync = CASE
            WHEN gender IS ? AND dress_style IS ? AND style_aesthetics IS ? AND display_name IS ?
            THEN pending_sync ELSE 1
          END,
          updated_at = ?
        WHERE singleton_key = 1 AND deleted_at IS NULL
      `,
      [
        preferences.gender,
        preferences.dressStyle,
        JSON.stringify(orderStyleAesthetics(preferences.styleAesthetics ?? [])),
        preferences.birthDate,
        preferences.displayName ?? null,
        namePromptVersion,
        preferences.gender,
        preferences.dressStyle,
        JSON.stringify(orderStyleAesthetics(preferences.styleAesthetics ?? [])),
        preferences.displayName ?? null,
      ],
    );
  }

  updateGender(preference: Gender): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `
        UPDATE local_profiles
        SET gender = ?, pending_sync = CASE WHEN gender IS ? THEN pending_sync ELSE 1 END, updated_at = ?
        WHERE singleton_key = 1 AND deleted_at IS NULL
      `,
      [preference, preference],
    );
  }

  updateDressStyle(dressStyle: DressStyle): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `UPDATE local_profiles
       SET dress_style = ?, pending_sync = CASE WHEN dress_style IS ? THEN pending_sync ELSE 1 END, updated_at = ?
       WHERE singleton_key = 1 AND deleted_at IS NULL`,
      [dressStyle, dressStyle],
    );
  }

  updateStyleAesthetics(values: readonly StyleAesthetic[]): Promise<LocalProfileRecord> {
    const serialized = JSON.stringify(orderStyleAesthetics(values));

    return this.updateProfile(
      `UPDATE local_profiles
       SET style_aesthetics = ?, pending_sync = CASE WHEN style_aesthetics IS ? THEN pending_sync ELSE 1 END, updated_at = ?
       WHERE singleton_key = 1 AND deleted_at IS NULL`,
      [serialized, serialized],
    );
  }

  updateMorningSheetEnabled(enabled: boolean): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `UPDATE local_profiles SET morning_sheet_enabled = ?, updated_at = ?
       WHERE singleton_key = 1 AND deleted_at IS NULL`,
      [enabled ? 1 : 0],
    );
  }

  updateEasierToSee(enabled: boolean): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `UPDATE local_profiles SET easier_to_see = ?, updated_at = ?
       WHERE singleton_key = 1 AND deleted_at IS NULL`,
      [enabled ? 1 : 0],
    );
  }

  updateBirthDate(birthDate: string | null): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `UPDATE local_profiles SET birth_date = ?, updated_at = ?
       WHERE singleton_key = 1 AND deleted_at IS NULL`,
      [birthDate],
    );
  }

  updateDisplayName(displayName: string | null): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `UPDATE local_profiles
       SET display_name = ?, name_prompt_version = ?,
         pending_sync = CASE WHEN display_name IS ? THEN pending_sync ELSE 1 END, updated_at = ?
       WHERE singleton_key = 1 AND deleted_at IS NULL`,
      [displayName, namePromptVersion, displayName],
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

  updateTemperatureUnitPreference(preference: TemperatureUnitPreference): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `UPDATE local_profiles SET temperature_unit = ?, updated_at = ?
       WHERE singleton_key = 1 AND deleted_at IS NULL`,
      [preference],
    );
  }

  updateWindSpeedUnitPreference(preference: WindSpeedUnitPreference): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `UPDATE local_profiles SET wind_speed_unit = ?, updated_at = ?
       WHERE singleton_key = 1 AND deleted_at IS NULL`,
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

  updateMorningBriefingOptIn(optIn: boolean): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `
        UPDATE local_profiles
        SET morning_briefing_opt_in = ?, updated_at = ?
        WHERE singleton_key = 1 AND deleted_at IS NULL
      `,
      [optIn ? 1 : 0],
    );
  }

  markWeatherAlertOfferShown(): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `
        UPDATE local_profiles
        SET weather_alert_offer_shown = 1, updated_at = ?
        WHERE singleton_key = 1 AND deleted_at IS NULL
      `,
      [],
    );
  }

  // Phase 8: the tour's only write, the code version, whatever closed the offered tour.
  markWalkthroughSeen(): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `UPDATE local_profiles SET walkthrough_version = ?, updated_at = ?
       WHERE singleton_key = 1 AND deleted_at IS NULL`,
      [walkthroughVersion],
    );
  }

  markSwapHintShown(): Promise<LocalProfileRecord> {
    return this.updateProfile(
      `UPDATE local_profiles SET swap_hint_shown = 1, updated_at = ?
       WHERE singleton_key = 1 AND deleted_at IS NULL`,
      [],
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
