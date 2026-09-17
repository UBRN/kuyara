import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SettingsRoute from '@/app/(tabs)/(profile)/settings';
import BirthDateSettingsRoute from '@/app/(tabs)/(profile)/settings/birth-date';
import type {
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';
import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { NotificationApplicationProvider } from '@/features/notifications/application/notification-application-provider';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import type { DressStyle, Gender } from '@/features/profile/domain/profile';
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
  useFocusEffect: () => undefined,
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
let mockUpdateFailure: 'appearance' | 'dress-style' | 'gender' | 'language' | null = null;

jest.mock('@/features/profile/data/sqlite-profile-local-data-source', () => ({
  SqliteProfileLocalDataSource: class {
    getOrCreateProfile = async () => mockProfile;

    updateLanguagePreference = async (languagePreference: LanguagePreference) => {
      if (mockUpdateFailure === 'language') throw new Error('save failed');
      mockProfile = { ...mockProfile, languagePreference };
      return mockProfile;
    };

    updateThemePreference = async (themePreference: ThemePreference) => {
      if (mockUpdateFailure === 'appearance') throw new Error('save failed');
      mockProfile = { ...mockProfile, themePreference };
      return mockProfile;
    };

    updateGender = async (gender: Gender) => {
      if (mockUpdateFailure === 'gender') throw new Error('save failed');
      mockProfile = { ...mockProfile, gender };
      return mockProfile;
    };

    updateDressStyle = async (dressStyle: DressStyle) => {
      if (mockUpdateFailure === 'dress-style') throw new Error('save failed');
      mockProfile = { ...mockProfile, dressStyle };
      return mockProfile;
    };

    updateBirthDate = async (birthDate: string | null) =>
      (mockProfile = { ...mockProfile, birthDate });
  },
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

afterEach(() => {
  mockUpdateFailure = null;
});

function createProfile(): LocalProfileRecord {
  return {
    id: 'profile-id',
    gender: 'woman',
    dressStyle: 'smart',
    birthDate: null,
    languagePreference: 'en',
    themePreference: 'light',
    onboardingCompleted: 1,
    notificationsOptIn: 0,
    weatherAlertOfferShown: 0,
    morningBriefingOptIn: 0,
    analyticsConsent: 'undecided',
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T10:00:00.000Z',
    deletedAt: null,
  };
}

function MountedSettingsRoutes({ onMount }: Readonly<{ onMount: () => void }>) {
  const [route, setRoute] = useState<'birth-date' | 'settings'>('settings');

  useEffect(onMount, [onMount]);
  useEffect(() => {
    mockRouter.back.mockImplementation(() => setRoute('settings'));
    mockRouter.push.mockImplementation((path: string) => {
      if (path === '/settings/birth-date') {
        setRoute('birth-date');
      }
    });
  }, []);

  // The Settings root reads the OS notification permission so its Notifications row can
  // say Off while the stored opt-in is on, which is what this provider supplies here.
  return (
    <NotificationApplicationProvider
      gateway={notificationGateway}
      notificationsOptIn
      persistOptIn={async () => undefined}
      weatherAlertScheduler={{ reschedule: async () => undefined }}>
      {route === 'birth-date' ? <BirthDateSettingsRoute /> : <SettingsRoute />}
    </NotificationApplicationProvider>
  );
}

const notificationGateway = {
  getPermissionState: async () => ({ kind: 'granted' }) as const,
  requestPermission: async () => ({ kind: 'granted' }) as const,
  openApplicationSettings: async () => undefined,
  cancelScheduledWeatherAlerts: async () => true,
  scheduleWeatherAlert: async () => true,
  subscribeToResponses: () => () => undefined,
};

// ADR 0030: the root list and the four preference pickers are native. These tests assert
// the strings and selected tags kuyara supplies, while the system owns row and menu chrome.
test('live preference changes propagate localized copy and dark semantic colors without remounting', async () => {
  mockProfile = createProfile();
  const onMount = jest.fn();
  const analytics = new RecordingProductAnalytics();
  const result = await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ProfileApplicationProvider>
        <ProductAnalyticsProvider
          analytics={analytics}
          firstUseStore={new InMemoryFirstUseStore()}>
          <MountedSettingsRoutes onMount={onMount} />
        </ProductAnalyticsProvider>
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
  expect(within(result.getByTestId('settings-services-group')).getByTestId('settings-privacy-row')).toBeOnTheScreen();
  // The Privacy row is a door, not a status: it carries glyph, label and chevron and no
  // trailing value, so an unanswered consent sheet is never reported as a setting.
  expect(result.queryByTestId('settings-privacy-row-value-stacked')).not.toBeOnTheScreen();
  expect(result.queryByText(messages.en.analytics.statusNotAsked)).not.toBeOnTheScreen();
  expect(result.getByText(messages.en.analytics.privacyTitle)).toBeOnTheScreen();
  expect(within(result.getByTestId('settings-about-you-group')).getByTestId('settings-gender-row')).toBeOnTheScreen();
  expect(within(result.getByTestId('settings-about-you-group')).getByTestId('settings-dress-style-row')).toBeOnTheScreen();
  expect(within(result.getByTestId('settings-about-you-group')).getByTestId('settings-birth-date-row')).toBeOnTheScreen();
  expect(within(result.getByTestId('settings-language-row')).getByTestId('expo-ui-picker').props.selection).toBe('en');
  expect(within(result.getByTestId('settings-theme-row')).getByTestId('expo-ui-picker').props.selection).toBe('light');
  expect(within(result.getByTestId('settings-gender-row')).getByTestId('expo-ui-picker').props.selection).toBe('woman');
  expect(within(result.getByTestId('settings-dress-style-row')).getByTestId('expo-ui-picker').props.selection).toBe('smart');
  expect(result.getByText(messages.en.preferences.genderWoman)).toBeOnTheScreen();
  expect(result.getByText(messages.en.preferences.dressStyleSmart)).toBeOnTheScreen();
  expect(result.getByText(messages.en.onboarding.birthDateNotSet)).toBeOnTheScreen();
  expect(result.getByRole('header', { name: 'About you' })).toHaveStyle({
    color: lightSemanticColors.textSecondary,
    fontSize: typography.bodyStrong.fontSize,
  });
  expect(result.getAllByTestId('expo-ui-icon')).toHaveLength(4);
  expect(within(result.getByTestId('expo-ui-section')).getByText('Version 1.0.0 (5)')).toHaveStyle({
    color: lightSemanticColors.textSecondary,
    fontSize: typography.caption.fontSize,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  });
  expect(result.getByText(messages.en.preferences.languageEnglish)).toBeOnTheScreen();
  await fireEvent(within(result.getByTestId('settings-language-row')).getByTestId('expo-ui-picker'), 'selectionChange', 'en');
  expect(analytics.captures).toEqual([]);

  await fireEvent(within(result.getByTestId('settings-language-row')).getByTestId('expo-ui-picker'), 'selectionChange', 'tr');
  await waitFor(() => {
    expect(within(result.getByTestId('settings-language-row')).getByTestId('expo-ui-picker').props.selection).toBe('tr');
  });
  expect(mockProfile.languagePreference).toBe('tr');
  expect(await result.findByText(messages.tr.preferences.languageTurkish)).toBeOnTheScreen();
  expect(result.getByText('Sürüm 1.0.0 (5)')).toBeOnTheScreen();

  expect(result.getByText(messages.tr.preferences.themeLight)).toBeOnTheScreen();
  await fireEvent(within(result.getByTestId('settings-theme-row')).getByTestId('expo-ui-picker'), 'selectionChange', 'dark');

  await waitFor(() => {
    expect(
      StyleSheet.flatten(result.getByTestId('settings-screen').props.style)
        .backgroundColor,
    ).toBe(darkSemanticColors.background);
  });
  expect(onMount).toHaveBeenCalledTimes(1);

  await waitFor(() => expect(analytics.names()).toEqual([
    'setting_changed',
    'feature_used_first_time',
    'setting_changed',
    'feature_used_first_time',
  ]));
  expect(analytics.captures.map((capture) => capture.properties)).toEqual([
    { schema_version: 3, setting_name: 'language', new_value: 'tr' },
    { schema_version: 3, feature_name: 'language_override' },
    { schema_version: 3, setting_name: 'appearance_theme', new_value: 'dark' },
    { schema_version: 3, feature_name: 'appearance_override' },
  ]);
});

test('personal preferences keep their order and birth date can be cleared to null', async () => {
  mockProfile = { ...createProfile(), birthDate: '1994-03-14' };
  const analytics = new RecordingProductAnalytics();
  const result = await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ProfileApplicationProvider>
        <ProductAnalyticsProvider
          analytics={analytics}
          firstUseStore={new InMemoryFirstUseStore()}>
          <MountedSettingsRoutes onMount={() => undefined} />
        </ProductAnalyticsProvider>
      </ProfileApplicationProvider>
    </SafeAreaProvider>,
  );

  await result.findByTestId('settings-gender-row');
  expect(result.getByText(new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(new Date(1994, 2, 14)))).toBeOnTheScreen();
  expect(within(result.getByTestId('settings-gender-row')).getByTestId('expo-ui-picker').props.options).toEqual([
    { label: messages.en.preferences.genderWoman, value: 'woman' },
    { label: messages.en.preferences.genderMan, value: 'man' },
  ]);
  await fireEvent(within(result.getByTestId('settings-gender-row')).getByTestId('expo-ui-picker'), 'selectionChange', 'man');
  expect(await result.findByText(messages.en.preferences.genderMan)).toBeOnTheScreen();

  expect(within(result.getByTestId('settings-dress-style-row')).getByTestId('expo-ui-picker').props.options).toEqual([
    { label: messages.en.preferences.dressStyleCasual, value: 'casual' },
    { label: messages.en.preferences.dressStyleSmart, value: 'smart' },
    { label: messages.en.preferences.dressStyleFormal, value: 'formal' },
  ]);
  await fireEvent(within(result.getByTestId('settings-dress-style-row')).getByTestId('expo-ui-picker'), 'selectionChange', 'formal');
  expect(await result.findByText(messages.en.preferences.dressStyleFormal)).toBeOnTheScreen();

  await fireEvent.press(result.getByTestId('settings-birth-date-row'));
  expect(await result.findByTestId('settings-birth-date')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('settings-birth-date-clear'));
  await waitFor(() => expect(mockProfile.birthDate).toBeNull());

  // Neither `gender` nor `birth_date` is an allowed analytics property value (taxonomy
  // 5.9), so both events carry `setting_name` only; `dress_style` carries the value chosen.
  await waitFor(() => expect(analytics.names()).toEqual([
    'setting_changed',
    'setting_changed',
    'setting_changed',
  ]));
  expect(analytics.captures.map((capture) => capture.properties)).toEqual([
    { schema_version: 3, setting_name: 'gender' },
    { schema_version: 3, setting_name: 'dress_style', new_value: 'formal' },
    { schema_version: 3, setting_name: 'birth_date' },
  ]);
});

test('preference save errors replace the footer for the affected Settings group', async () => {
  mockProfile = createProfile();
  const result = await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ProfileApplicationProvider>
        <ProductAnalyticsProvider
          analytics={new RecordingProductAnalytics()}
          firstUseStore={new InMemoryFirstUseStore()}>
          <MountedSettingsRoutes onMount={() => undefined} />
        </ProductAnalyticsProvider>
      </ProfileApplicationProvider>
    </SafeAreaProvider>,
  );

  await result.findByTestId('settings-language-row');
  mockUpdateFailure = 'appearance';
  await fireEvent(within(result.getByTestId('settings-theme-row')).getByTestId('expo-ui-picker'), 'selectionChange', 'dark');

  await waitFor(() => {
    expect(within(result.getByTestId('settings-primary-group'))
      .getByText(messages.en.settings.saveError)).toBeOnTheScreen();
  });
  expect(within(result.getByTestId('settings-about-you-group'))
    .getByText(messages.en.settings.aboutYouFooter)).toBeOnTheScreen();
  expect(within(result.getByTestId('settings-theme-row')).getByTestId('expo-ui-picker').props.selection).toBe('light');

  mockUpdateFailure = 'gender';
  await fireEvent(within(result.getByTestId('settings-gender-row')).getByTestId('expo-ui-picker'), 'selectionChange', 'man');

  await waitFor(() => {
    expect(within(result.getByTestId('settings-about-you-group'))
      .getByText(messages.en.settings.saveError)).toBeOnTheScreen();
  });
  expect(within(result.getByTestId('settings-primary-group'))
    .queryByText(messages.en.settings.saveError)).toBeNull();
  expect(within(result.getByTestId('settings-about-you-group'))
    .queryByText(messages.en.settings.aboutYouFooter)).toBeNull();
  expect(within(result.getByTestId('settings-gender-row')).getByTestId('expo-ui-picker').props.selection).toBe('woman');
});

test('version templates omit an unavailable build without leaving empty parentheses', () => {
  expect(messages.en.settings.versionLine('1.0.0', null)).toBe('Version 1.0.0');
  expect(messages.tr.settings.versionLine('1.0.0')).toBe('Sürüm 1.0.0');
});

test('the version line stays the last root element when no version is configured', async () => {
  const expoConfig = Constants.expoConfig;
  Constants.expoConfig = null;
  const result = await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ProfileApplicationProvider>
        <ProductAnalyticsProvider
          analytics={new RecordingProductAnalytics()}
          firstUseStore={new InMemoryFirstUseStore()}>
          <MountedSettingsRoutes onMount={() => undefined} />
        </ProductAnalyticsProvider>
      </ProfileApplicationProvider>
    </SafeAreaProvider>,
  );

  expect(await result.findByTestId('settings-language-row')).toBeOnTheScreen();
  expect(within(result.getByTestId('expo-ui-section')).getByText(messages.en.settings.developmentBuild))
    .toBeOnTheScreen();
  Constants.expoConfig = expoConfig;
});
