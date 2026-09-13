import * as Crypto from 'expo-crypto';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import {
  ProfileApplicationController,
  ProfileBootstrapError,
} from '@/features/profile/application/profile-application-controller';
import {
  ProfileApplicationContext,
  type ProfileApplicationValue,
} from '@/features/profile/application/profile-context';
import { usePerformanceTelemetry } from '@/features/analytics/application/use-performance-telemetry';
import { LocalProfileRepository } from '@/features/profile/data/profile-repository';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';
import { SqliteProfileLocalDataSource } from '@/features/profile/data/sqlite-profile-local-data-source';
import { openKuyaraDatabase } from '@/infrastructure/sqlite/expo-sqlite-database';
import { migrateDatabase } from '@/infrastructure/sqlite/migrations';
import { LocalizationProvider } from '@/localization/localization-provider';
import { KuyaraThemeProvider } from '@/theme/theme-provider';

async function loadProfileRepository() {
  let database;
  try {
    database = await openKuyaraDatabase();
  } catch (error) {
    throw new ProfileBootstrapError('database-open', error);
  }

  try {
    await migrateDatabase(database);
  } catch (error) {
    throw new ProfileBootstrapError('migration', error);
  }

  const dataSource = new SqliteProfileLocalDataSource(database, {
    createId: () => Crypto.randomUUID(),
    now: () => new Date().toISOString(),
  });

  return new LocalProfileRepository(dataSource);
}

export function ProfileApplicationProvider({ children }: PropsWithChildren) {
  // The port is a module singleton in the composition root and the no-op elsewhere, so this
  // identity never changes and the controller is never rebuilt.
  const telemetry = usePerformanceTelemetry();
  const controller = useMemo(
    () => new ProfileApplicationController(
      loadProfileRepository,
      (error) => telemetry.reportError(error),
    ),
    [telemetry],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.initialize();
  }, [controller]);

  const updateNotificationsOptIn = useCallback(
    (optIn: boolean) => controller.updateNotificationsOptIn(optIn),
    [controller],
  );
  const updateAnalyticsConsent = useCallback(
    (consent: AnalyticsConsent) => controller.updateAnalyticsConsent(consent),
    [controller],
  );

  const value = useMemo<ProfileApplicationValue>(
    () => ({
      state,
      retry: () => controller.retry(),
      completeOnboarding: (preferences) =>
        controller.completeOnboarding(preferences),
      updateGender: (gender) => controller.updateGender(gender),
      updateDressStyle: (dressStyle) => controller.updateDressStyle(dressStyle),
      updateBirthDate: (birthDate) => controller.updateBirthDate(birthDate),
      updateLanguagePreference: (preference) =>
        controller.updateLanguagePreference(preference),
      updateThemePreference: (preference) =>
        controller.updateThemePreference(preference),
      updateNotificationsOptIn,
      updateAnalyticsConsent,
    }),
    [controller, state, updateAnalyticsConsent, updateNotificationsOptIn],
  );

  const languagePreference =
    state.status === 'ready' ? state.profile.languagePreference : 'system';
  const themePreference =
    state.status === 'ready' ? state.profile.themePreference : 'system';

  return (
    <ProfileApplicationContext value={value}>
      <LocalizationProvider preference={languagePreference}>
        <KuyaraThemeProvider preference={themePreference}>
          {children}
        </KuyaraThemeProvider>
      </LocalizationProvider>
    </ProfileApplicationContext>
  );
}
