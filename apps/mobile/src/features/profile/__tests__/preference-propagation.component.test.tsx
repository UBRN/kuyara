import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SettingsRoute from '@/app/(tabs)/(profile)/settings';
import AppearanceSettingsRoute from '@/app/(tabs)/(profile)/settings/appearance';
import LanguageSettingsRoute from '@/app/(tabs)/(profile)/settings/language';
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

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));

const mockRouter = jest.requireMock('expo-router').router as {
  back: jest.Mock;
  push: jest.Mock;
};

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

function MountedSettingsRoutes({ onMount }: Readonly<{ onMount: () => void }>) {
  const [route, setRoute] = useState<'appearance' | 'language' | 'settings'>('settings');

  useEffect(onMount, [onMount]);
  useEffect(() => {
    mockRouter.back.mockImplementation(() => setRoute('settings'));
    mockRouter.push.mockImplementation((path: string) => {
      if (path === '/settings/appearance') {
        setRoute('appearance');
      } else if (path === '/settings/language') {
        setRoute('language');
      }
    });
  }, []);

  return route === 'appearance'
    ? <AppearanceSettingsRoute />
    : route === 'language'
      ? <LanguageSettingsRoute />
      : <SettingsRoute />;
}

test('live preference changes propagate localized copy and dark semantic colors without remounting', async () => {
  mockProfile = createProfile();
  const onMount = jest.fn();
  const result = await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ProfileApplicationProvider>
        <MountedSettingsRoutes onMount={onMount} />
      </ProfileApplicationProvider>
    </SafeAreaProvider>,
  );

  expect(await result.findByText(messages.en.settings.title)).toBeOnTheScreen();
  expect(result.getByRole('button', { name: messages.en.common.back })).toBeOnTheScreen();
  expect(
    StyleSheet.flatten(result.getByTestId('settings-screen').props.style)
      .backgroundColor,
  ).toBe(lightSemanticColors.background);

  expect(result.getByRole('button', {
    name: `${messages.en.preferences.languageTitle}, ${messages.en.preferences.languageEnglish}`,
  })).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('settings-language-row'));
  expect(await result.findByTestId('settings-language-picker')).toBeOnTheScreen();

  await fireEvent.press(result.getByTestId('settings-language-tr'));
  await waitFor(() => {
    expect(result.getByTestId('settings-language-tr').props.accessibilityState.selected)
      .toBe(true);
  });

  await fireEvent.press(result.getByRole('button', { name: messages.tr.common.back }));
  expect(await result.findByText(messages.tr.settings.title)).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('settings-language-row'));
  expect(result.getByTestId('settings-language-tr').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(result.getByRole('button', { name: messages.tr.common.back }));

  expect(result.getByRole('button', {
    name: `${messages.tr.preferences.themeTitle}, ${messages.tr.preferences.themeLight}`,
  })).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('settings-theme-row'));

  await waitFor(() => {
    expect(
      result.getByTestId('settings-theme-dark').props.accessibilityState.disabled,
    ).toBe(false);
  });
  await fireEvent.press(result.getByTestId('settings-theme-dark'));

  await waitFor(() => {
    expect(
      StyleSheet.flatten(result.getByTestId('settings-appearance-picker').props.style)
        .backgroundColor,
    ).toBe(darkSemanticColors.background);
  });
  await fireEvent.press(result.getByRole('button', { name: messages.tr.common.back }));
  expect(
    StyleSheet.flatten(result.getByTestId('settings-screen').props.style)
      .backgroundColor,
  ).toBe(darkSemanticColors.background);
  expect(onMount).toHaveBeenCalledTimes(1);
});
