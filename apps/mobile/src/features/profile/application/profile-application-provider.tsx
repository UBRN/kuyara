import * as Crypto from 'expo-crypto';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import { ProfileApplicationController } from '@/features/profile/application/profile-application-controller';
import {
  ProfileApplicationContext,
  type ProfileApplicationValue,
} from '@/features/profile/application/profile-context';
import { LocalProfileRepository } from '@/features/profile/data/profile-repository';
import { SqliteProfileLocalDataSource } from '@/features/profile/data/sqlite-profile-local-data-source';
import { openKuyaraDatabase } from '@/infrastructure/sqlite/expo-sqlite-database';
import { migrateDatabase } from '@/infrastructure/sqlite/migrations';
import { LocalizationProvider } from '@/localization/localization-provider';
import { KuyaraThemeProvider } from '@/theme/theme-provider';

async function loadProfileRepository() {
  const database = await openKuyaraDatabase();
  await migrateDatabase(database);

  const dataSource = new SqliteProfileLocalDataSource(database, {
    createId: () => Crypto.randomUUID(),
    now: () => new Date().toISOString(),
  });

  return new LocalProfileRepository(dataSource);
}

export function ProfileApplicationProvider({ children }: PropsWithChildren) {
  const controller = useMemo(
    () => new ProfileApplicationController(loadProfileRepository),
    [],
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

  const value = useMemo<ProfileApplicationValue>(
    () => ({
      state,
      completeOnboarding: (preferences) =>
        controller.completeOnboarding(preferences),
      updateClothingPreference: (preference) =>
        controller.updateClothingPreference(preference),
      updateLanguagePreference: (preference) =>
        controller.updateLanguagePreference(preference),
      updateThemePreference: (preference) =>
        controller.updateThemePreference(preference),
      updateNotificationsOptIn,
    }),
    [controller, state, updateNotificationsOptIn],
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
