import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Linking, Share, StyleSheet } from 'react-native';
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
import type { DressStyle, Gender, StyleAesthetic } from '@/features/profile/domain/profile';
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
jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { BottomSheet: ({ children, index }: { children: React.ReactNode; index: number }) =>
    index >= 0 ? React.createElement(View, null, children) : null };
});

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
let mockUpdateFailure:
  'appearance' | 'dress-style' | 'gender' | 'language' | 'style-aesthetics' | null = null;
let mockStyleSaveCalls = 0;
let mockStyleSaveBarrier: Promise<void> | null = null;

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

    updateStyleAesthetics = async (styleAesthetics: readonly StyleAesthetic[]) => {
      mockStyleSaveCalls += 1;
      if (mockStyleSaveBarrier) await mockStyleSaveBarrier;
      if (mockUpdateFailure === 'style-aesthetics') throw new Error('save failed');
      mockProfile = { ...mockProfile, styleAesthetics: JSON.stringify(styleAesthetics) };
      return mockProfile;
    };

    updateMorningSheetEnabled = async (enabled: boolean) => {
      mockProfile = { ...mockProfile, morningSheetEnabled: enabled ? 1 : 0 };
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
  mockStyleSaveCalls = 0;
  mockStyleSaveBarrier = null;
});

function createProfile(): LocalProfileRecord {
  return {
    id: 'profile-id',
    gender: 'woman',
    dressStyle: 'smart',
    birthDate: null,
    displayName: null,
    namePromptVersion: 0,
    languagePreference: 'en',
    themePreference: 'light',
    onboardingCompleted: 1,
    notificationsOptIn: 0,
    weatherAlertOfferShown: 0,
    morningBriefingOptIn: 0,
    morningSheetEnabled: 1,
    styleAesthetics: '[]',
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
test('live preferences and support propagate localized behavior without remounting', async () => {
  mockProfile = createProfile();
  const onMount = jest.fn();
  const analytics = new RecordingProductAnalytics();
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
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

  const sections = result.getAllByTestId(/^(settings-(appearance|notifications|profile|help|about)-group|expo-ui-section)$/);
  expect(sections.map((section) => section.props.testID)).toEqual([
    'settings-appearance-group', 'settings-notifications-group', 'settings-profile-group',
    'settings-help-group', 'settings-about-group', 'expo-ui-section',
  ]);
  expect(result.getAllByTestId('expo-ui-host')).toHaveLength(1);
  expect(result.getAllByTestId('expo-ui-list')).toHaveLength(1);
  expect(within(result.getByTestId('settings-appearance-group')).getByTestId('settings-theme-row')).toBeOnTheScreen();
  expect(within(result.getByTestId('settings-about-group')).getByTestId('settings-service-providers-row')).toBeOnTheScreen();
  expect(within(result.getByTestId('settings-about-group')).getByTestId('settings-privacy-row')).toBeOnTheScreen();
  // The Privacy row is a door, not a status: it carries glyph, label and chevron and no
  // trailing value, so an unanswered consent sheet is never reported as a setting.
  expect(result.queryByTestId('settings-privacy-row-value-stacked')).not.toBeOnTheScreen();
  expect(result.queryByText(messages.en.analytics.statusNotAsked)).not.toBeOnTheScreen();
  expect(result.getByText(messages.en.analytics.privacyTitle)).toBeOnTheScreen();
  expect(result.getByText(messages.en.settings.supportRow)).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('settings-support-row'));
  expect(openURL).toHaveBeenLastCalledWith('https://ubrn.github.io/kuyara/support?lang=en');
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  await fireEvent.press(result.getByTestId('settings-share-row'));
  expect(share).toHaveBeenLastCalledWith({
    message: messages.en.settings.shareText,
    url: 'https://apps.apple.com/app/kuyara/id6806664440',
  });
  await fireEvent.press(result.getByTestId('settings-rate-row'));
  expect(openURL).toHaveBeenLastCalledWith('https://apps.apple.com/app/kuyara/id6806664440?action=write-review');
  const ratingStars = result.getAllByTestId('expo-ui-image')
    .filter((image) => image.props.systemName === 'star.fill');
  expect(ratingStars).toHaveLength(5);
  expect(ratingStars.every((star) => star.props.modifiers.some(
    (modifier: { $type: string }) => modifier.$type === 'accessibilityHidden',
  ))).toBe(true);
  await fireEvent.press(result.getByTestId('settings-licence-row'));
  expect(openURL).toHaveBeenLastCalledWith('https://polyformproject.org/licenses/noncommercial/1.0.0');
  expect(within(result.getByTestId('settings-profile-group')).getByTestId('settings-gender-row')).toBeOnTheScreen();
  expect(within(result.getByTestId('settings-profile-group')).getByTestId('settings-dress-style-row')).toBeOnTheScreen();
  expect(within(result.getByTestId('settings-profile-group')).getByTestId('settings-birth-date-row')).toBeOnTheScreen();
  expect(within(result.getByTestId('settings-language-row')).getByTestId('expo-ui-picker').props.selection).toBe('en');
  expect(within(result.getByTestId('settings-theme-row')).getByTestId('expo-ui-picker').props.selection).toBe('light');
  expect(within(result.getByTestId('settings-gender-row')).getByTestId('expo-ui-picker').props.selection).toBe('woman');
  expect(within(result.getByTestId('settings-dress-style-row')).getByTestId('expo-ui-picker').props.selection).toBe('smart');
  expect(result.getByText(messages.en.preferences.genderWoman)).toBeOnTheScreen();
  expect(result.getByText(messages.en.preferences.dressStyleSmart)).toBeOnTheScreen();
  expect(result.getByText(messages.en.onboarding.birthDateNotSet)).toBeOnTheScreen();
  expect(result.getByTestId('settings-style-preferences-row')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('settings-style-preferences-row'));
  await fireEvent.press(result.getByTestId('settings-style-option-classic'));
  await fireEvent.press(result.getByTestId('settings-style-option-minimal'));
  await fireEvent.press(result.getByTestId('settings-style-done'));
  await waitFor(() => expect(mockProfile.styleAesthetics).toBe('["classic","minimal"]'));
  await fireEvent(result.getByTestId('settings-morning-question-row-toggle'), 'valueChange', false);
  await waitFor(() => expect(mockProfile.morningSheetEnabled).toBe(0));
  expect(result.getByRole('header', { name: messages.en.settings.profileHeading })).toHaveStyle({
    color: lightSemanticColors.textSecondary,
    fontSize: typography.bodyStrong.fontSize,
  });
  expect(result.getAllByTestId('expo-ui-icon').length).toBeGreaterThanOrEqual(5);
  expect(result.getByTestId('settings-brand-name')).toHaveStyle({
    color: lightSemanticColors.brandPrimary,
    fontSize: typography.display.fontSize,
  });
  expect(result.getByTestId('settings-brand-name').props).toMatchObject({
    adjustsFontSizeToFit: true,
    numberOfLines: 1,
  });
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
  expect(result.getByText(messages.tr.settings.supportRow)).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('settings-support-row'));
  expect(openURL).toHaveBeenLastCalledWith('https://ubrn.github.io/kuyara/tr/support?lang=tr');
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
  openURL.mockRestore();
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
    expect(within(result.getByTestId('settings-appearance-group'))
      .getByText(messages.en.settings.saveError)).toBeOnTheScreen();
  });
  expect(within(result.getByTestId('settings-profile-group'))
    .queryByText(messages.en.settings.saveError)).toBeNull();
  expect(within(result.getByTestId('settings-theme-row')).getByTestId('expo-ui-picker').props.selection).toBe('light');

  mockUpdateFailure = 'gender';
  await fireEvent(within(result.getByTestId('settings-gender-row')).getByTestId('expo-ui-picker'), 'selectionChange', 'man');

  await waitFor(() => {
    expect(within(result.getByTestId('settings-profile-group'))
      .getByText(messages.en.settings.saveError)).toBeOnTheScreen();
  });
  expect(within(result.getByTestId('settings-appearance-group'))
    .queryByText(messages.en.settings.saveError)).toBeNull();
  expect(within(result.getByTestId('settings-gender-row')).getByTestId('expo-ui-picker').props.selection).toBe('woman');
});

test('a failed style save keeps the sheet open with the chosen styles and says so', async () => {
  mockProfile = createProfile();
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
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

  await fireEvent.press(await result.findByTestId('settings-style-preferences-row'));
  await fireEvent.press(result.getByTestId('settings-style-option-classic'));
  await fireEvent.press(result.getByTestId('settings-style-option-sporty'));
  mockUpdateFailure = 'style-aesthetics';
  await fireEvent.press(result.getByTestId('settings-style-done'));

  await waitFor(() => {
    expect(result.getByTestId('settings-style-save-error'))
      .toHaveTextContent(messages.en.settings.saveError);
  });
  expect(announce).toHaveBeenCalledWith(messages.en.settings.saveError);
  expect(result.getByTestId('settings-style-option-classic').props.accessibilityState.checked).toBe(true);
  expect(result.getByTestId('settings-style-option-sporty').props.accessibilityState.checked).toBe(true);
  expect(mockProfile.styleAesthetics).toBe(createProfile().styleAesthetics);
  expect(within(result.getByTestId('settings-profile-group'))
    .queryByText(messages.en.settings.saveError)).toBeNull();

  mockUpdateFailure = null;
  await fireEvent.press(result.getByTestId('settings-style-done'));
  await waitFor(() => expect(mockProfile.styleAesthetics).toBe('["classic","sporty"]'));
  await waitFor(() => expect(result.queryByTestId('settings-style-done')).toBeNull());
  announce.mockRestore();
});

test('two immediate Done presses while aesthetics save is pending make one update call', async () => {
  mockProfile = createProfile();
  let release!: () => void;
  mockStyleSaveBarrier = new Promise<void>((resolve) => { release = resolve; });
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
  await fireEvent.press(await result.findByTestId('settings-style-preferences-row'));
  const done = result.getByTestId('settings-style-done');
  await act(async () => {
    fireEvent.press(done);
    fireEvent.press(done);
  });
  expect(mockStyleSaveCalls).toBe(1);
  await act(async () => { release(); });
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
