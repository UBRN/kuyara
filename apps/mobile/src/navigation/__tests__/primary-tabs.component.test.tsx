import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { useState } from 'react';
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
import {
  createPrimaryTabDefinitions,
  PrimaryTabBar,
  type PrimaryTabRouteName,
} from '@/navigation/primary-tab-bar';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual('react-native');

  function MockTabs() {
    return <MockText testID="primary-tabs-route">Primary tabs</MockText>;
  }

  function MockTabScreen() {
    return null;
  }

  MockTabs.Screen = MockTabScreen;

  return {
    Redirect: ({ href }: { href: string }) => (
      <MockText testID="route-redirect">{href}</MockText>
    ),
    Tabs: MockTabs,
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

function PrimaryTabBarHarness({
  language,
  onNavigate,
}: Readonly<{
  language: SupportedLanguage;
  onNavigate: (routeName: PrimaryTabRouteName) => void;
}>) {
  const [selectedRouteName, setSelectedRouteName] =
    useState<PrimaryTabRouteName>('(today)');
  const tabs = createPrimaryTabDefinitions(messages[language].navigation);

  return (
    <TestProviders language={language}>
      <PrimaryTabBar
        onLongPress={() => undefined}
        onSelect={(routeName) => {
          onNavigate(routeName);
          setSelectedRouteName(routeName);
        }}
        selectedRouteName={selectedRouteName}
        tabs={tabs}
      />
    </TestProviders>
  );
}

describe.each([
  ['en', ['Today', 'Weather', 'Wardrobe', 'Settings']],
  ['tr', ['Bugün', 'Hava', 'Gardırop', 'Ayarlar']],
] as const)('%s primary tabs', (language, expectedLabels) => {
  test('shows all localized controls with tab roles, names, and Today selected', async () => {
    const result = await render(
      <PrimaryTabBarHarness language={language} onNavigate={() => undefined} />,
    );

    for (const label of expectedLabels) {
      expect(result.getByRole('tab', { name: label })).toBeOnTheScreen();
    }
    expect(result.getByTestId('tab-today').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(result.getByTestId('tab-weather').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  test('keeps every visible tab label on one line so the bar cannot grow at accessibility text sizes', async () => {
    const result = await render(
      <PrimaryTabBarHarness language={language} onNavigate={() => undefined} />,
    );

    for (const label of expectedLabels) {
      const visibleLabel = result.getByText(label, { includeHiddenElements: true });

      expect(visibleLabel.props.numberOfLines).toBe(1);
      expect(visibleLabel.props.ellipsizeMode).toBe('tail');
      expect(visibleLabel.props.allowFontScaling).not.toBe(false);
    }
  });

  test('emits Wardrobe and Settings navigation intents and updates selected state', async () => {
    const onNavigate = jest.fn();
    const result = await render(
      <PrimaryTabBarHarness language={language} onNavigate={onNavigate} />,
    );

    await fireEvent.press(result.getByRole('tab', { name: expectedLabels[2] }));
    expect(onNavigate).toHaveBeenLastCalledWith('wardrobe');
    expect(result.getByTestId('tab-wardrobe').props.accessibilityState).toEqual({
      selected: true,
    });

    await fireEvent.press(result.getByRole('tab', { name: expectedLabels[3] }));
    expect(onNavigate).toHaveBeenLastCalledWith('settings');
    expect(result.getByTestId('tab-settings').props.accessibilityState).toEqual({
      selected: true,
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
