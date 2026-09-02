import { render, within } from '@testing-library/react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PrimaryTabsRouteLayout from '@/app/(tabs)/_layout';
import type { ProfileApplicationValue } from '@/features/profile/application/profile-context';
import { ProfileApplicationContext } from '@/features/profile/application/profile-context';
import type { LocalProfile } from '@/features/profile/domain/profile';
import { WardrobeListScreen } from '@/features/wardrobe/presentation/wardrobe-list-screen';
import { WeatherApplicationContext } from '@/features/weather/application/weather-application-context';
import { WeatherScreen } from '@/features/weather/presentation/weather-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { PrimaryTabs } from '@/navigation/primary-tabs';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('expo-router/unstable-native-tabs', () => {
  const { Text: MockText, View: MockView } = jest.requireActual('react-native');

  function MockNativeTabs({ children }: Readonly<{ children?: ReactNode }>) {
    return <MockView testID="primary-tabs-route">{children}</MockView>;
  }

  function MockTrigger({
    accessibilityLabel,
    children,
    name,
    testID,
  }: Readonly<{
    accessibilityLabel?: string;
    children?: ReactNode;
    name?: string;
    testID?: string;
  }>) {
    return (
      <MockView
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="tab"
        name={name}
        testID={testID}>
        {children}
      </MockView>
    );
  }

  function MockLabel({ children }: Readonly<{ children?: string }>) {
    return <MockText>{children}</MockText>;
  }

  function MockIcon() {
    return null;
  }

  MockTrigger.Icon = MockIcon;
  MockTrigger.Label = MockLabel;
  MockNativeTabs.Trigger = MockTrigger;

  return { NativeTabs: MockNativeTabs };
});

jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual('react-native');

  return {
    Redirect: ({ href }: { href: string }) => (
      <MockText testID="route-redirect">{href}</MockText>
    ),
  };
});

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function createProfile(onboardingCompleted: boolean): LocalProfile {
  return {
    id: 'profile-id',
    clothingPreference: onboardingCompleted ? 'womens' : null,
    languagePreference: 'system',
    themePreference: 'system',
    onboardingCompleted,
    notificationsOptIn: false,
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T10:00:00.000Z',
  };
}

function createProfileApplication(onboardingCompleted: boolean): ProfileApplicationValue {
  return {
    state: {
      status: 'ready',
      profile: createProfile(onboardingCompleted),
      isSaving: false,
    },
    completeOnboarding: async () => undefined,
    updateClothingPreference: async () => undefined,
    updateLanguagePreference: async () => undefined,
    updateThemePreference: async () => undefined,
    updateNotificationsOptIn: async () => undefined,
  };
}

function TestProviders({
  children,
  language,
  onboardingCompleted = true,
}: PropsWithChildren<{
  language: SupportedLanguage;
  onboardingCompleted?: boolean;
}>) {
  return (
    <ProfileApplicationContext.Provider
      value={createProfileApplication(onboardingCompleted)}>
      <LocalizationContext.Provider value={{ language, messages: messages[language] }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <WeatherApplicationContext.Provider value={{
            state: {
              status: 'ready', activeLocation: null, snapshot: null, freshness: null,
              permission: { kind: 'undetermined' }, locationFlow: 'idle',
              isSelectingLocation: false, isRefreshing: false, refreshFailure: null,
            },
            retry: async () => undefined,
            dismissLocationFlow: () => undefined,
            beginDeviceLocationSelection: async () => undefined,
            confirmDeviceLocationRequest: async () => undefined,
            openApplicationSettings: async () => undefined,
            selectManualLocation: async () => undefined,
            refresh: async () => undefined,
          }}>
            <SafeAreaProvider initialMetrics={initialMetrics}>
              {children}
            </SafeAreaProvider>
          </WeatherApplicationContext.Provider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
    </ProfileApplicationContext.Provider>
  );
}

describe.each([
  ['en', ['Today', 'Weather', 'Profile']],
  ['tr', ['Bugün', 'Hava', 'Profil']],
] as const)('%s primary tabs', (language, expectedLabels) => {
  test('declares exactly three localized native tabs in route order', async () => {
    const result = await render(
      <TestProviders language={language}>
        <PrimaryTabs />
      </TestProviders>,
    );
    const triggers = result.getAllByRole('tab');

    expect(triggers).toHaveLength(3);
    expect(
      triggers.map(({ props }) => ({
        accessibilityLabel: props.accessibilityLabel,
        name: props.name,
        testID: props.testID,
      })),
    ).toEqual([
      { accessibilityLabel: expectedLabels[0], name: '(today)', testID: 'tab-today' },
      { accessibilityLabel: expectedLabels[1], name: 'weather', testID: 'tab-weather' },
      { accessibilityLabel: expectedLabels[2], name: '(profile)', testID: 'tab-profile' },
    ]);
    expectedLabels.forEach((label, index) => {
      expect(within(triggers[index]).getByText(label)).toBeOnTheScreen();
    });
  });

  test('renders localized Weather and Wardrobe entry content', async () => {
    const weather = await render(
      <TestProviders language={language}>
        <WeatherScreen />
      </TestProviders>,
    );
    expect(weather.getByText(messages[language].weather.title)).toBeOnTheScreen();
    expect(
      weather.getByText(messages[language].weather.introduction),
    ).toBeOnTheScreen();
    await weather.unmount();

    const wardrobe = await render(
      <TestProviders language={language}>
        <WardrobeListScreen
          onAdd={() => undefined}
          onEdit={() => undefined}
          onRetry={() => undefined}
          state={{
            status: 'ready',
            items: [],
            isRefreshing: false,
            isMutating: false,
            hasRefreshError: false,
          }}
        />
      </TestProviders>,
    );
    expect(wardrobe.getByText(messages[language].wardrobe.title)).toBeOnTheScreen();
    expect(
      wardrobe.getByText(messages[language].wardrobe.emptyBody),
    ).toBeOnTheScreen();
  });
});

test('the tab route group preserves the onboarding gate', async () => {
  const incomplete = await render(
    <TestProviders language="en" onboardingCompleted={false}>
      <PrimaryTabsRouteLayout />
    </TestProviders>,
  );
  expect(incomplete.getByTestId('route-redirect').props.children).toBe('/onboarding');
  expect(incomplete.queryByTestId('primary-tabs-route')).not.toBeOnTheScreen();
  await incomplete.unmount();

  const complete = await render(
    <TestProviders language="en">
      <PrimaryTabsRouteLayout />
    </TestProviders>,
  );
  expect(complete.getByTestId('primary-tabs-route')).toBeOnTheScreen();
  expect(complete.queryByTestId('route-redirect')).not.toBeOnTheScreen();
});
