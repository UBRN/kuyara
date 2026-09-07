import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
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
import { darkSemanticColors, lightSemanticColors, typography } from '@/theme/theme';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' }, platform: { ios: { buildNumber: '5' } } },
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
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

// ADR 0030: the root list is native, so its own header and row chrome (label, value,
// separator, chevron) are the system's and are not asserted on here beyond the value
// text kuyara supplies. The pushed picker screens (`settings-language-picker`,
// `settings-appearance-picker`) are unchanged by ADR 0030 and keep their own
// kuyara-drawn header, which this test still exercises through it.
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

  expect(await result.findByTestId('settings-language-row')).toBeOnTheScreen();
  expect(
    StyleSheet.flatten(result.getByTestId('settings-screen').props.style)
      .backgroundColor,
  ).toBe(lightSemanticColors.background);

  const sections = result.getAllByTestId(/^(settings-(primary|services|about-you)-group|expo-ui-section)$/);
  expect(sections.map((section) => section.props.testID)).toEqual([
    'settings-primary-group', 'settings-services-group', 'settings-about-you-group', 'expo-ui-section',
  ]);
  expect(result.getAllByTestId('expo-ui-host')).toHaveLength(1);
  expect(result.getAllByTestId('expo-ui-list')).toHaveLength(1);
  expect(within(result.getByTestId('settings-primary-group')).getByTestId('settings-theme-row')).toBeOnTheScreen();
  expect(within(result.getByTestId('settings-services-group')).getByTestId('settings-ai-status-row')).toBeOnTheScreen();
  expect(within(result.getByTestId('settings-about-you-group')).getByTestId('settings-clothing-row')).toBeOnTheScreen();
  expect(result.getByRole('header', { name: 'About you' })).toHaveStyle({
    color: lightSemanticColors.textSecondary,
    fontSize: typography.bodyStrong.fontSize,
  });
  expect(result.getAllByTestId('expo-ui-icon')).toHaveLength(5);
  expect(within(result.getByTestId('expo-ui-section')).getByText('Version 1.0.0 (5)')).toHaveStyle({
    color: lightSemanticColors.textSecondary,
    fontSize: typography.caption.fontSize,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  });
  expect(result.getByText(messages.en.preferences.languageEnglish)).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('settings-language-row'));
  expect(await result.findByTestId('settings-language-picker')).toBeOnTheScreen();

  await fireEvent.press(result.getByTestId('settings-language-tr'));
  await waitFor(() => {
    expect(result.getByTestId('settings-language-tr').props.accessibilityState.selected)
      .toBe(true);
  });

  await fireEvent.press(result.getByRole('button', { name: messages.tr.common.back }));
  expect(await result.findByText(messages.tr.preferences.languageTurkish)).toBeOnTheScreen();
  expect(result.getByText('Sürüm 1.0.0 (5)')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('settings-language-row'));
  expect(result.getByTestId('settings-language-tr').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(result.getByRole('button', { name: messages.tr.common.back }));

  expect(result.getByText(messages.tr.preferences.themeLight)).toBeOnTheScreen();
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

test('version templates omit an unavailable build without leaving empty parentheses', () => {
  expect(messages.en.settings.versionLine('1.0.0', null)).toBe('Version 1.0.0');
  expect(messages.tr.settings.versionLine('1.0.0')).toBe('Sürüm 1.0.0');
});
