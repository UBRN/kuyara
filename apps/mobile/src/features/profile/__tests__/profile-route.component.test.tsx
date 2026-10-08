import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProductAnalyticsContext } from '@/features/analytics/application/use-product-analytics';
import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { FirstUseTracker } from '@/features/analytics/application/first-use-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { InMemoryWithdrawnIdentifierStore } from '@/features/analytics/data/in-memory-withdrawn-identifier-store';
import { ProfileApplicationContext, type ProfileApplicationValue } from '@/features/profile/application/profile-context';
import {
  WardrobeApplicationContext,
  type WardrobeApplicationValue,
} from '@/features/wardrobe/application/wardrobe-application-context';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const mockPush = jest.fn();
// These tests cover screens other than the account screens, so they stay independent of the account switch.
jest.mock('@/features/account/application/account-screens-flag', () => ({ ACCOUNT_SCREENS_ENABLED: false }));
jest.mock('expo-router', () => {
  const actualReact = jest.requireActual('react') as typeof import('react');
  return {
    Stack: { Screen: () => null },
    useFocusEffect: (callback: () => void | (() => void)) =>
      actualReact.useEffect(callback, [callback]),
    useIsFocused: () => true,
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

function profileValue(displayName: string | null, men = false): ProfileApplicationValue {
  return {
    state: {
      status: 'ready', isSaving: false,
      profile: {
        id: 'profile-id', gender: men ? 'man' : 'woman', dressStyle: 'smart', birthDate: null,
        displayName, namePromptVersion: 1, clothingPreference: men ? 'mens' : 'womens',
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

function Providers({
  children,
  displayName,
  men = false,
  wardrobeValue = wardrobe,
}: PropsWithChildren<{ displayName: string | null; men?: boolean; wardrobeValue?: WardrobeApplicationValue }>) {
  const analytics = new RecordingProductAnalytics();
  return (
    <LocalizationContext value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext value={lightTheme}>
        <ProductAnalyticsContext value={{
          analytics,
          errorEpisodes: new ErrorEpisodeTracker(
            (name, properties, options) => analytics.capture(name, properties, options),
            () => new Date().toISOString(),
            () => true,
          ),
          firstUses: new FirstUseTracker(new InMemoryFirstUseStore(), () => true),
          retries: new RetryCounter(),
          withdrawnIdentifiers: new InMemoryWithdrawnIdentifierStore(),
        }}>
          <ProfileApplicationContext value={profileValue(displayName, men)}>
            <WardrobeApplicationContext value={wardrobeValue}>
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
    <Providers displayName="Deniz">
      <ProfileRoute />
    </Providers>,
  );

  expect(result.getByText('Deniz’s Closet')).toBeOnTheScreen();
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

test('a quick double tap on the History row opens History once', async () => {
  mockPush.mockClear();
  const result = await render(
    <Providers displayName={null}>
      <ProfileRoute />
    </Providers>,
  );

  await fireEvent.press(result.getByTestId('profile-history-row'));
  await fireEvent.press(result.getByTestId('profile-history-row'));
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith('/history');
});

// O9: a category cell opens the Closet on that category.
test('a category cell opens the Closet on its category', async () => {
  const withShoes = {
    ...wardrobe,
    state: {
      status: 'ready',
      items: [{
        id: '118f0f4d-1d45-4ae7-a8f1-796e8297d3b4', category: 'footwear', entryState: 'owned',
        garmentTypeId: 'sneakers', colorFamily: null, name: null, photoRelativePath: null,
        createdAt: '2026-09-09T08:00:00.000Z',
      }],
      isRefreshing: false,
      isMutating: false,
      refreshFailure: null,
    },
  } as unknown as WardrobeApplicationValue;
  const result = await render(
    <Providers displayName={null} wardrobeValue={withShoes}>
      <ProfileRoute />
    </Providers>,
  );

  await fireEvent.press(result.getByTestId('profile-category-footwear'));
  expect(mockPush).toHaveBeenCalledWith({ params: { category: 'footwear' }, pathname: '/wardrobe' });
});

// The empty Closet's Add a piece opens the add form directly, with no category.
test('the empty Closet Add a piece opens the add form', async () => {
  mockPush.mockClear();
  const result = await render(
    <Providers displayName={null}>
      <ProfileRoute />
    </Providers>,
  );

  await fireEvent.press(result.getByTestId('profile-add-piece-button'));
  expect(mockPush).toHaveBeenCalledWith('/wardrobe/new');
  expect(mockPush).toHaveBeenCalledTimes(1);
});

function closetHolding(categories: readonly ('footwear' | 'one_piece')[]): WardrobeApplicationValue {
  return {
    ...wardrobe,
    state: {
      status: 'ready',
      items: categories.map((category, index) => ({
        id: `${index + 1}18f0f4d-1d45-4ae7-a8f1-796e8297d3b4`, category, entryState: 'owned',
        garmentTypeId: category === 'footwear' ? 'sneakers' : 'dress', colorFamily: null, name: null,
        photoRelativePath: null, createdAt: '2026-09-09T08:00:00.000Z',
      })),
      isRefreshing: false,
      isMutating: false,
      refreshFailure: null,
    },
  } as unknown as WardrobeApplicationValue;
}

// Product decisions: One-piece is hidden only while a mens profile holds no one-piece record.
test.each([
  ['a mens profile with no one-piece record', true, ['footwear'], 5],
  ['a mens profile holding a one-piece record', true, ['footwear', 'one_piece'], 6],
  ['a womens profile', false, ['footwear'], 6],
] as const)('%s shows its category cells', async (_name, men, held, cells) => {
  const result = await render(
    <Providers displayName={null} men={men} wardrobeValue={closetHolding(held)}>
      <ProfileRoute />
    </Providers>,
  );

  const shown = ['top', 'bottom', 'one_piece', 'outerwear', 'footwear', 'accessory']
    .filter((category) => result.queryByTestId(`profile-category-${category}`) !== null);
  expect(shown).toHaveLength(cells);
  expect(shown.includes('one_piece')).toBe(cells === 6);
  expect(result.queryAllByTestId('profile-category-spacer', { includeHiddenElements: true }))
    .toHaveLength(cells === 6 ? 0 : 1);
});
