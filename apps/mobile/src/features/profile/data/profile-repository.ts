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
  analyticsConsentSchema,
  genderSchema,
  dressStyleSchema,
  isStoredBirthDate,
  isValidBirthDate,
  normalizeDisplayName,
  sortedStyleAesthetics,
  styleAestheticsSchema,
  type AnalyticsConsent,
  type Gender,
  type DressStyle,
  type Profile,
  type OnboardingPreferences,
  type StyleAesthetic,
} from '@/features/profile/domain/profile';

export interface ProfileRepository {
  getOrCreateProfile(): Promise<Profile>;
  completeOnboarding(preferences: OnboardingPreferences): Promise<Profile>;
  updateGender(preference: Gender): Promise<Profile>;
  updateDressStyle(dressStyle: DressStyle): Promise<Profile>;
  updateStyleAesthetics(values: readonly StyleAesthetic[]): Promise<Profile>;
  updateMorningSheetEnabled(enabled: boolean): Promise<Profile>;
  updateBirthDate(birthDate: string | null): Promise<Profile>;
  updateDisplayName(displayName: string | null): Promise<Profile>;
  updateLanguagePreference(preference: LanguagePreference): Promise<Profile>;
  updateThemePreference(preference: ThemePreference): Promise<Profile>;
  updateNotificationsOptIn(optIn: boolean): Promise<Profile>;
  updateMorningBriefingOptIn(optIn: boolean): Promise<Profile>;
  markWeatherAlertOfferShown(): Promise<Profile>;
  updateAnalyticsConsent(consent: AnalyticsConsent): Promise<Profile>;
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

function validatedDisplayName(value: string | null): string | null {
  try { return normalizeDisplayName(value); }
  catch { throw new ProfileMappingError(); }
}

function isUtcIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function readStyleAesthetics(raw: string | undefined): readonly StyleAesthetic[] {
  try { return sortedStyleAesthetics(JSON.parse(raw ?? '[]')); }
  catch { return []; }
}

function mapRecord(record: LocalProfileRecord): Profile {
  const hasValidGender =
    record.gender === null || genderSchema.safeParse(record.gender).success;
  const hasValidDressStyle =
    record.dressStyle === null || dressStyleSchema.safeParse(record.dressStyle).success;
  const hasValidCompletion =
    record.onboardingCompleted === 0 || record.onboardingCompleted === 1;
  const hasValidNotificationsOptIn =
    record.notificationsOptIn === 0 || record.notificationsOptIn === 1;
  const hasValidOfferShown =
    record.weatherAlertOfferShown === 0 || record.weatherAlertOfferShown === 1;
  const hasValidMorningBriefingOptIn =
    record.morningBriefingOptIn === 0 || record.morningBriefingOptIn === 1;
  const hasValidMorningSheetEnabled =
    record.morningSheetEnabled === undefined ||
    record.morningSheetEnabled === 0 || record.morningSheetEnabled === 1;
  const hasValidAnalyticsConsent =
    analyticsConsentSchema.safeParse(record.analyticsConsent).success;
  const hasValidDisplayName = (() => {
    try { return normalizeDisplayName(record.displayName) === record.displayName; }
    catch { return false; }
  })();
  const completedWithoutPreference =
    record.onboardingCompleted === 1 &&
    (record.gender === null || record.dressStyle === null);

  if (
    !record.id ||
    !hasValidGender ||
    !hasValidDressStyle ||
    !isStoredBirthDate(record.birthDate) ||
    !isLanguagePreference(record.languagePreference) ||
    !isThemePreference(record.themePreference) ||
    !hasValidCompletion ||
    !hasValidNotificationsOptIn ||
    !hasValidOfferShown ||
    !hasValidMorningBriefingOptIn ||
    !hasValidMorningSheetEnabled ||
    !hasValidAnalyticsConsent ||
    !hasValidDisplayName ||
    !Number.isInteger(record.namePromptVersion) ||
    record.namePromptVersion < 0 ||
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
    dressStyle: record.dressStyle === null ? null : dressStyleSchema.parse(record.dressStyle),
    styleAesthetics: readStyleAesthetics(record.styleAesthetics),
    morningSheetEnabled: record.morningSheetEnabled !== 0,
    birthDate: record.birthDate,
    displayName: record.displayName,
    namePromptVersion: record.namePromptVersion,
    languagePreference: record.languagePreference,
    themePreference: record.themePreference,
    onboardingCompleted: record.onboardingCompleted === 1,
    notificationsOptIn: record.notificationsOptIn === 1,
    weatherAlertOfferShown: record.weatherAlertOfferShown === 1,
    morningBriefingOptIn: record.morningBriefingOptIn === 1,
    analyticsConsent: analyticsConsentSchema.parse(record.analyticsConsent),
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

  completeOnboarding(preferences: OnboardingPreferences): Promise<Profile> {
    return this.execute(() => {
      if (
        !genderSchema.safeParse(preferences.gender).success ||
        !dressStyleSchema.safeParse(preferences.dressStyle).success ||
        !styleAestheticsSchema.safeParse(preferences.styleAesthetics ?? []).success ||
        !isValidBirthDate(preferences.birthDate, this.now())
      ) throw new ProfileMappingError();
      return this.dataSource.completeOnboarding({
        ...preferences,
        styleAesthetics: sortedStyleAesthetics(preferences.styleAesthetics ?? []),
        displayName: validatedDisplayName(preferences.displayName ?? null),
      });
    });
  }

  updateGender(preference: Gender): Promise<Profile> {
    return this.execute(() => {
      if (!genderSchema.safeParse(preference).success) throw new ProfileMappingError();
      return this.dataSource.updateGender(preference);
    });
  }

  updateDressStyle(dressStyle: DressStyle): Promise<Profile> {
    return this.execute(() => {
      if (!dressStyleSchema.safeParse(dressStyle).success) throw new ProfileMappingError();
      return this.dataSource.updateDressStyle(dressStyle);
    });
  }

  updateStyleAesthetics(values: readonly StyleAesthetic[]): Promise<Profile> {
    return this.execute(() => {
      if (!styleAestheticsSchema.safeParse(values).success) throw new ProfileMappingError();
      return this.dataSource.updateStyleAesthetics(sortedStyleAesthetics(values));
    });
  }

  updateMorningSheetEnabled(enabled: boolean): Promise<Profile> {
    return this.execute(() => this.dataSource.updateMorningSheetEnabled(enabled));
  }

  updateBirthDate(birthDate: string | null): Promise<Profile> {
    return this.execute(() => {
      if (!isValidBirthDate(birthDate, this.now())) throw new ProfileMappingError();
      return this.dataSource.updateBirthDate(birthDate);
    });
  }

  updateDisplayName(displayName: string | null): Promise<Profile> {
    return this.execute(() => this.dataSource.updateDisplayName(validatedDisplayName(displayName)));
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

  updateMorningBriefingOptIn(optIn: boolean): Promise<Profile> {
    return this.execute(() => this.dataSource.updateMorningBriefingOptIn(optIn));
  }

  markWeatherAlertOfferShown(): Promise<Profile> {
    return this.execute(() => this.dataSource.markWeatherAlertOfferShown());
  }

  updateAnalyticsConsent(consent: AnalyticsConsent): Promise<Profile> {
    return this.execute(() => {
      if (!analyticsConsentSchema.safeParse(consent).success) throw new ProfileMappingError();
      return this.dataSource.updateAnalyticsConsent(consent);
    });
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
