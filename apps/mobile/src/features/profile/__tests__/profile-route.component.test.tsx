import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProductAnalyticsContext } from '@/features/analytics/application/use-product-analytics';
import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { FirstUseTracker } from '@/features/analytics/application/first-use-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { ProfileApplicationContext, type ProfileApplicationValue } from '@/features/profile/application/profile-context';
import {
  WardrobeApplicationContext,
  type WardrobeApplicationValue,
} from '@/features/wardrobe/application/wardrobe-application-context';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const actualReact = jest.requireActual('react') as typeof import('react');
  return {
    Stack: { Screen: () => null },
    useFocusEffect: (callback: () => void | (() => void)) =>
      actualReact.useEffect(callback, [callback]),
    useRouter: () => ({ push: mockPush }),
  };
});
jest.mock('@/features/analytics/data/observe-performance-telemetry', () => ({
  ...jest.requireActual('@/features/analytics/data/observe-performance-telemetry'),
  useObserveInteractiveMark: () => jest.fn(),
}));

// eslint-disable-next-line import/first
import ProfileRoute from '@/app/(tabs)/(profile)/profile';

const wardrobe = {
  state: { status: 'ready', items: [], isRefreshing: false, isMutating: false, refreshFailure: null },
  refresh: async () => undefined,
  getItem: async () => null,
  preparePhoto: async () => null,
  discardStagedPhoto: async () => undefined,
  resolvePhotoUri: () => null,
} as unknown as WardrobeApplicationValue;

function profileValue(displayName: string | null): ProfileApplicationValue {
  return {
    state: {
      status: 'ready', isSaving: false,
      profile: {
        id: 'profile-id', gender: 'woman', dressStyle: 'smart', birthDate: null,
        displayName, namePromptVersion: 1, clothingPreference: 'womens',
        languagePreference: 'en', themePreference: 'light', onboardingCompleted: true,
        notificationsOptIn: false, weatherAlertOfferShown: false,
        morningBriefingOptIn: false, analyticsConsent: 'undecided',
        createdAt: '2026-09-09T08:00:00.000Z', updatedAt: '2026-09-09T08:00:00.000Z',
      },
    },
    retry: jest.fn(async () => undefined),
    completeOnboarding: jest.fn(async () => undefined),
    updateGender: jest.fn(async () => undefined),
    updateDressStyle: jest.fn(async () => undefined),
    updateBirthDate: jest.fn(async () => undefined),
    updateDisplayName: jest.fn(async () => undefined),
    updateLanguagePreference: jest.fn(async () => undefined),
    updateThemePreference: jest.fn(async () => undefined),
    updateNotificationsOptIn: jest.fn(async () => undefined),
    updateMorningBriefingOptIn: jest.fn(async () => undefined),
    markWeatherAlertOfferShown: jest.fn(async () => undefined),
    updateAnalyticsConsent: jest.fn(async () => undefined),
  };
}

function Providers({ children, displayName }: PropsWithChildren<{ displayName: string | null }>) {
  const analytics = new RecordingProductAnalytics();
  return (
    <LocalizationContext value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext value={lightTheme}>
        <ProductAnalyticsContext value={{
          analytics,
          errorEpisodes: new ErrorEpisodeTracker(
            (name, properties, options) => analytics.capture(name, properties, options),
            () => new Date().toISOString(),
          ),
          firstUses: new FirstUseTracker(new InMemoryFirstUseStore()),
          retries: new RetryCounter(),
        }}>
          <ProfileApplicationContext value={profileValue(displayName)}>
            <WardrobeApplicationContext value={wardrobe}>
              <SafeAreaProvider initialMetrics={{
                frame: { x: 0, y: 0, width: 390, height: 844 },
                insets: { top: 47, right: 0, bottom: 34, left: 0 },
              }}>
                {children}
              </SafeAreaProvider>
            </WardrobeApplicationContext>
          </ProfileApplicationContext>
        </ProductAnalyticsContext>
      </KuyaraThemeContext>
    </LocalizationContext>
  );
}

test('Profile shows a personalized Closet heading without a location row', async () => {
  const result = await render(
    <Providers displayName="Utku">
      <ProfileRoute />
    </Providers>,
  );

  expect(result.getByText("Utku's Closet")).toBeOnTheScreen();
  expect(result.queryByTestId('profile-location-row')).toBeNull();
});

test('Profile keeps the plain Closet heading without a name', async () => {
  const result = await render(
    <Providers displayName={null}>
      <ProfileRoute />
    </Providers>,
  );

  expect(result.getByText(messages.en.profile.wardrobeTitle)).toBeOnTheScreen();
});

// P5 stability list: the History row opens History inside the Profile stack.
test('the History row opens History', async () => {
  const result = await render(
    <Providers displayName={null}>
      <ProfileRoute />
    </Providers>,
  );

  await fireEvent.press(result.getByTestId('profile-history-row'));
  expect(mockPush).toHaveBeenCalledWith('/history');
});
