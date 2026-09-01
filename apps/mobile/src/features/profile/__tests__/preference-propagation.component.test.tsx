import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SettingsRoute from '@/app/(tabs)/(profile)/settings';
import type {
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';
import { ProfileApplicationProvider } from '@/features/profile/application/profile-application-provider';
import type { LocalProfileRecord } from '@/features/profile/data/local-profile-record';
import { messages } from '@/localization/messages';
import { darkSemanticColors, lightSemanticColors } from '@/theme/theme';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('@/infrastructure/sqlite/expo-sqlite-database', () => ({
  openKuyaraDatabase: async () => ({}),
}));

jest.mock('@/infrastructure/sqlite/migrations', () => ({
  migrateDatabase: async () => undefined,
}));

jest.mock('@/features/notifications/application/notification-context', () => ({
  useNotificationApplication: () => ({
    state: { permission: { kind: 'undetermined' }, isBusy: false },
    setOptIn: async () => 'enabled',
    sendTestNotification: async () => true,
    openApplicationSettings: async () => undefined,
  }),
}));

let mockProfile = createProfile();

jest.mock('@/features/profile/data/sqlite-profile-local-data-source', () => ({
  SqliteProfileLocalDataSource: class {
    getOrCreateProfile = async () => mockProfile;

    updateLanguagePreference = async (languagePreference: LanguagePreference) =>
      (mockProfile = { ...mockProfile, languagePreference });

    updateThemePreference = async (themePreference: ThemePreference) =>
      (mockProfile = { ...mockProfile, themePreference });
  },
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function createProfile(): LocalProfileRecord {
  return {
    id: 'profile-id',
    clothingPreference: 'womens',
    languagePreference: 'en',
    themePreference: 'light',
    onboardingCompleted: 1,
    notificationsOptIn: 0,
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T10:00:00.000Z',
    deletedAt: null,
  };
}

function MountedSettingsRoute({ onMount }: Readonly<{ onMount: () => void }>) {
  useEffect(onMount, [onMount]);
  return <SettingsRoute />;
}

test('live preference changes propagate localized copy and dark semantic colors without remounting', async () => {
  mockProfile = createProfile();
  const onMount = jest.fn();
  const result = await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ProfileApplicationProvider>
        <MountedSettingsRoute onMount={onMount} />
      </ProfileApplicationProvider>
    </SafeAreaProvider>,
  );

  expect(await result.findByText(messages.en.settings.title)).toBeOnTheScreen();
  expect(
    StyleSheet.flatten(result.getByTestId('settings-screen').props.style)
      .backgroundColor,
  ).toBe(lightSemanticColors.background);

  await fireEvent.press(result.getByTestId('settings-language-tr'));
  expect(await result.findByText(messages.tr.settings.title)).toBeOnTheScreen();

  await waitFor(() => {
    expect(
      result.getByTestId('settings-theme-dark').props.accessibilityState.disabled,
    ).toBe(false);
  });
  await fireEvent.press(result.getByTestId('settings-theme-dark'));

  await waitFor(() => {
    expect(
      StyleSheet.flatten(result.getByTestId('settings-screen').props.style)
        .backgroundColor,
    ).toBe(darkSemanticColors.background);
  });
  expect(onMount).toHaveBeenCalledTimes(1);
});
