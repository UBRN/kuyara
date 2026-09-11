import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { FirstUseTracker } from '@/features/analytics/application/first-use-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import { ProductAnalyticsContext } from '@/features/analytics/application/use-product-analytics';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { ProfileApplicationContext } from '@/features/profile/application/profile-context';
import type { LocalProfile } from '@/features/profile/domain/profile';
import { RecommendationApplicationContext } from '@/features/recommendation/application/recommendation-application-context';
import type { RecommendationApplicationState } from '@/features/recommendation/application/recommendation-application-controller';
import { todayScreenState, todayActiveLocation } from '@/features/today/__tests__/fixtures';
import { WardrobeApplicationContext } from '@/features/wardrobe/application/wardrobe-application-context';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import {
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/ui/native-menu', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const {
    Pressable,
    Text,
    View,
  } = jest.requireActual('react-native') as typeof import('react-native');

  return {
    NativeMenu: ({
      accessibilityHint,
      accessibilityLabel,
      children,
      items,
      onSelect,
      testID,
    }: Readonly<{
      accessibilityHint?: string;
      accessibilityLabel: string;
      children: React.ReactNode;
      items: readonly Readonly<{ id: string; label: string; selected?: boolean }>[];
      onSelect: (id: string) => void;
      testID?: string;
    }>) => {
      const [open, setOpen] = React.useState(false);
      return (
        <View>
          <Pressable
            accessible
            accessibilityHint={accessibilityHint}
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            onPress={() => setOpen(true)}
            testID={testID}>
            {children}
          </Pressable>
          {open ? items.map((item) => (
            <Pressable
              accessibilityRole="button"
              key={item.id}
              onPress={() => {
                setOpen(false);
                if (!item.selected) onSelect(item.id);
              }}>
              <Text>{item.label}</Text>
            </Pressable>
          )) : null}
        </View>
      );
    },
  };
});

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: { id?: string } = {};

jest.mock('expo-router', () => {
  const actualReact = jest.requireActual('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => actualReact.useEffect(callback, [callback]),
    useIsFocused: () => true,
    useRouter: () => ({ push: mockPush, back: mockBack }),
    useLocalSearchParams: () => mockParams,
  };
});

const todayRecommendation = todayScreenState.snapshot.recommendation;
if (todayRecommendation.status !== 'recommended') {
  throw new Error('Expected the Today fixture to contain a recommendation.');
}

function weatherValue(overrides: Partial<Extract<WeatherApplicationValue['state'], { status: 'ready' }>> = {}) {
  const state = {
    status: 'ready' as const,
    activeLocation: todayActiveLocation,
    snapshot: todayScreenState.snapshot.weather,
    freshness: 'fresh' as const,
    permission: { kind: 'undetermined' as const },
    locationFlow: 'idle' as const,
    isSelectingLocation: false,
    isRefreshing: false,
    refreshFailure: null,
    ...overrides,
  };
  const value: WeatherApplicationValue = {
    state,
    retry: jest.fn(async () => undefined),
    dismissLocationFlow: jest.fn(),
    beginDeviceLocationSelection: jest.fn(async () => undefined),
    confirmDeviceLocationRequest: jest.fn(async () => undefined),
    openApplicationSettings: jest.fn(async () => undefined),
    selectManualLocation: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    getSnapshot: () => value.state,
  };
  return value;
}

function recommendationReady(
  overrides: Partial<Extract<RecommendationApplicationState, { status: 'ready' }>> = {},
): RecommendationApplicationState {
  if (todayRecommendation.status !== 'recommended') {
    throw new Error('Expected the Today fixture to contain a recommendation.');
  }
  return {
    status: 'ready',
    isRefreshing: false,
    lastFailure: null,
    snapshot: {
      id: 'recommendation-one',
      localProfileId: 'profile-one',
      weatherSnapshotId: todayScreenState.snapshot.weather.id,
      locationKey: todayScreenState.snapshot.activeLocation.locationKey,
      clothingPreference: 'womens',
      dressStyle: 'smart',
      dayVariant: 0,
      localDayKey: '2026-08-13',
      generationMode: todayRecommendation.generationMode,
      recommendation: todayRecommendation,
      createdAt: '2026-08-13T06:00:00.000Z',
      updatedAt: '2026-08-13T06:00:00.000Z',
    },
    ...overrides,
  };
}

function wardrobeValue(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    state: { status: 'ready' as const, items: [] as readonly WardrobeItem[], isRefreshing: false, isMutating: false, refreshFailure: null },
    refresh: jest.fn(async () => undefined),
    getItem: jest.fn(async () => null),
    preparePhoto: jest.fn(async () => null),
    discardStagedPhoto: jest.fn(async () => undefined),
    resolvePhotoUri: jest.fn(() => null),
    createItem: jest.fn(async () => ({}) as WardrobeItem),
    updateItem: jest.fn(async () => ({}) as WardrobeItem),
    softDeleteItem: jest.fn(async () => ({}) as WardrobeItem),
    ...overrides,
  };
}

function wardrobeItem(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  return {
    id: 'item-one', localProfileId: 'profile-one', name: null, category: 'outerwear',
    entryState: 'owned', garmentTypeId: 'jumpsuit', color: null, colorFamily: null,
    thermalLevelOverride: null, waterProtectionOverride: null, windProtectionOverride: null,
    breathabilityOverride: null, armCoverageOverride: null, legCoverageOverride: null,
    tractionSuitabilityOverride: null, photoRelativePath: null,
    createdAt: '2026-08-13T06:00:00.000Z', updatedAt: '2026-08-13T06:00:00.000Z', deletedAt: null,
    ...overrides,
  };
}

function profileValue(profile: Partial<LocalProfile> = {}) {
  const state = {
    status: 'ready' as const,
    isSaving: false,
    profile: {
      id: 'profile-one',
      gender: 'woman' as const,
      dressStyle: 'smart' as const,
      birthDate: null,
      languagePreference: 'system' as const,
      themePreference: 'system' as const,
      onboardingCompleted: true,
      notificationsOptIn: false,
      analyticsConsent: 'granted' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      clothingPreference: 'womens' as const,
      ...profile,
    },
  };
  return {
    state,
    completeOnboarding: jest.fn(async () => undefined),
    updateGender: jest.fn(async () => undefined),
    updateDressStyle: jest.fn(async () => undefined),
    updateBirthDate: jest.fn(async () => undefined),
    updateLanguagePreference: jest.fn(async () => undefined),
    updateThemePreference: jest.fn(async () => undefined),
    updateNotificationsOptIn: jest.fn(async () => undefined),
    updateAnalyticsConsent: jest.fn(async () => undefined),
  };
}

function createProductAnalytics() {
  const analytics = new RecordingProductAnalytics();
  return {
    analytics,
    errorEpisodes: new ErrorEpisodeTracker(
      (name, properties, options) => analytics.capture(name, properties, options),
      () => new Date().toISOString(),
    ),
    firstUses: new FirstUseTracker(new InMemoryFirstUseStore()),
    retries: new RetryCounter(),
  };
}

function Providers({
  children,
  weather,
  recommendation,
  recommendationRefresh = jest.fn(async () => null),
  reevaluateLocalDay = jest.fn(),
  wardrobe,
  profile,
  productAnalytics,
}: PropsWithChildren<{
  weather: WeatherApplicationValue;
  recommendation: RecommendationApplicationState;
  recommendationRefresh?: () => Promise<null>;
  reevaluateLocalDay?: () => void;
  wardrobe: ReturnType<typeof wardrobeValue>;
  profile: ReturnType<typeof profileValue>;
  productAnalytics: ReturnType<typeof createProductAnalytics>;
}>) {
  return (
    <LocalizationContext value={{ language: 'en', messages: messages.en }}>
      <KuyaraThemeContext value={lightTheme}>
        <ProductAnalyticsContext value={productAnalytics}>
          <ProfileApplicationContext value={profile}>
            <WeatherApplicationContext value={weather}>
              <RecommendationApplicationContext value={{
                state: recommendation,
                refresh: recommendationRefresh,
                reevaluateLocalDay,
              }}>
                <WardrobeApplicationContext value={wardrobe as never}>
                  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }}>
                    {children}
                  </SafeAreaProvider>
                </WardrobeApplicationContext>
              </RecommendationApplicationContext>
            </WeatherApplicationContext>
          </ProfileApplicationContext>
        </ProductAnalyticsContext>
      </KuyaraThemeContext>
    </LocalizationContext>
  );
}

// Import the routes after all mocks above are set up.
// eslint-disable-next-line import/first
import TodayRoute from '@/app/(tabs)/(today)/index';
// eslint-disable-next-line import/first
import OutfitDetailRoute from '@/app/(tabs)/(today)/[id]';

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  mockParams = {};
});

test('Today reports screen_viewed and recommendation_viewed once while a recommendation is loaded', async () => {
  const productAnalytics = createProductAnalytics();
  await render(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  const names = productAnalytics.analytics.captures.map((capture) => capture.name);
  expect(names.filter((name) => name === 'screen_viewed')).toHaveLength(1);
  expect(names.filter((name) => name === 'recommendation_viewed')).toHaveLength(1);
  const viewed = productAnalytics.analytics.captures.find((c) => c.name === 'recommendation_viewed');
  expect(viewed?.properties).toEqual({
    schema_version: 1,
    generation_mode: todayRecommendation.generationMode === 'ai-assisted' ? 'ai_assisted' : 'deterministic_fallback',
    cache_state: 'fresh',
    outfit_count: 3,
    dress_style: 'smart',
    age_bucket: 'unknown',
  });
});

test('a successful pull-to-refresh regenerates after weather and reports manual refresh, not retry', async () => {
  const productAnalytics = createProductAnalytics();
  const order: string[] = [];
  const weather = {
    ...weatherValue(),
    refresh: jest.fn(async () => { order.push('weather'); }),
  };
  const recommendationRefresh = jest.fn(async () => {
    order.push('recommendation');
    return null;
  });
  const result = await render(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={recommendationReady()}
      recommendationRefresh={recommendationRefresh}
      wardrobe={wardrobeValue()}
      weather={weather}>
      <TodayRoute />
    </Providers>,
  );
  productAnalytics.analytics.captures.length = 0;

  const refreshControl = result.getByTestId('today-screen').props.refreshControl;
  refreshControl.props.onRefresh();

  await waitFor(() => expect(recommendationRefresh).toHaveBeenCalledTimes(1));

  expect(order).toEqual(['weather', 'recommendation']);
  expect(productAnalytics.analytics.captures.map((c) => c.name)).toContain('manual_refresh_triggered');
  expect(productAnalytics.analytics.captures.map((c) => c.name)).not.toContain('retry_after_failure_triggered');
});

test('focusing Today asks the recommendation provider to re-evaluate the local day', async () => {
  const reevaluateLocalDay = jest.fn();
  await render(
    <Providers
      productAnalytics={createProductAnalytics()}
      profile={profileValue()}
      recommendation={recommendationReady()}
      reevaluateLocalDay={reevaluateLocalDay}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  expect(reevaluateLocalDay).toHaveBeenCalledTimes(1);
});

test('recommendation refresh and failure state reaches Today while the last outfit remains visible', async () => {
  const props = {
    productAnalytics: createProductAnalytics(),
    profile: profileValue(),
    wardrobe: wardrobeValue(),
    weather: weatherValue(),
  };
  const result = await render(
    <Providers {...props} recommendation={recommendationReady({ isRefreshing: true })}>
      <TodayRoute />
    </Providers>,
  );

  expect(result.getByTestId('today-freshness')).toHaveTextContent(
    messages.en.today.refreshingStatus,
  );
  expect(result.getByTestId('today-screen').props.refreshControl.props.refreshing).toBe(true);
  expect(result.getByTestId('today-archetype')).toBeOnTheScreen();

  await result.rerender(
    <Providers {...props} recommendation={recommendationReady({ lastFailure: 'unavailable' })}>
      <TodayRoute />
    </Providers>,
  );
  expect(result.getByTestId('today-freshness')).toHaveTextContent(/Couldn't refresh/);
  expect(result.getByTestId('today-archetype')).toBeOnTheScreen();
});

test('refreshing while Today shows stale weather and a failed attempt reports retry_after_failure_triggered', async () => {
  const productAnalytics = createProductAnalytics();
  // `refreshFailed` on an otherwise-loaded state: the last attempt failed but a snapshot
  // still renders, which is the only Today state that both shows a failure and keeps the
  // pull-to-refresh control (the fully unavailable state has no refresh control at all).
  const failingWeather = weatherValue({ refreshFailure: 'offline' });
  const result = await render(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={failingWeather}>
      <TodayRoute />
    </Providers>,
  );
  productAnalytics.analytics.captures.length = 0;

  const refreshControl = result.getByTestId('today-screen').props.refreshControl;
  refreshControl.props.onRefresh();

  await waitFor(() => expect(
    productAnalytics.analytics.captures.some((c) => c.name === 'retry_after_failure_triggered'),
  ).toBe(true));
  const retry = productAnalytics.analytics.captures.find((c) => c.name === 'retry_after_failure_triggered');
  expect(retry?.properties).toEqual({
    schema_version: 1, surface: 'today', attempt_number: 1, result: 'failure',
  });
  expect(productAnalytics.analytics.captures.some((c) => c.name === 'manual_refresh_triggered')).toBe(false);
});

test('leaving Today resets its retry attempt counter', async () => {
  const productAnalytics = createProductAnalytics();
  productAnalytics.retries.nextAttempt('today');
  const result = await render(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  await result.unmount();
  expect(productAnalytics.retries.nextAttempt('today')).toBe(1);
});

test('a fully unavailable Today buffers error_shown until recovery, which emits both events', async () => {
  const productAnalytics = createProductAnalytics();
  const unavailableWeather = weatherValue({ snapshot: null, freshness: null, refreshFailure: 'offline' });
  const result = await render(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={unavailableWeather}>
      <TodayRoute />
    </Providers>,
  );

  // Taxonomy 5.10: a captured event is immutable, so the failure is buffered rather than
  // emitted until recovery or a flush; nothing named `error_shown` reaches the network yet.
  expect(productAnalytics.analytics.captures.some((c) => c.name === 'error_shown')).toBe(false);

  productAnalytics.analytics.captures.length = 0;
  await result.rerender(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  const shown = productAnalytics.analytics.captures.find((c) => c.name === 'error_shown');
  expect(shown?.properties).toEqual({
    schema_version: 1, surface: 'today', failure_category: 'offline', occurrence_count: 1,
  });
  expect(productAnalytics.analytics.captures).toContainEqual({
    name: 'error_recovered',
    properties: { schema_version: 1, surface: 'today', failure_category: 'offline' },
    options: undefined,
  });
  // `error_shown` is emitted before `error_recovered` for the same pair (taxonomy 5.10).
  const names = productAnalytics.analytics.captures.map((c) => c.name);
  expect(names.indexOf('error_shown')).toBeLessThan(names.indexOf('error_recovered'));
});

test('a visible recommendation failure uses only the recommendation error surface', async () => {
  const productAnalytics = createProductAnalytics();
  const result = await render(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={{ status: 'ready', snapshot: null, isRefreshing: false, lastFailure: 'unavailable' }}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  await result.rerender(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  const errors = productAnalytics.analytics.captures.filter(
    ({ name }) => name === 'error_shown' || name === 'error_recovered',
  );
  expect(errors.map(({ properties }) => properties)).toEqual([
    { schema_version: 1, surface: 'recommendation', failure_category: 'unavailable', occurrence_count: 1 },
    { schema_version: 1, surface: 'recommendation', failure_category: 'unavailable' },
  ]);
});

test('opening an outfit reports screen_viewed and outfit_detail_opened with its position and archetype', async () => {
  mockParams = { id: 'outfit-2' };
  const productAnalytics = createProductAnalytics();
  await render(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue({ dressStyle: 'formal', birthDate: '1990-01-01' })}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <OutfitDetailRoute />
    </Providers>,
  );

  const names = productAnalytics.analytics.captures.map((capture) => capture.name);
  expect(names.filter((name) => name === 'screen_viewed')).toHaveLength(1);
  const opened = productAnalytics.analytics.captures.find((c) => c.name === 'outfit_detail_opened');
  expect(opened?.properties).toEqual({
    schema_version: 1,
    outfit_position: 2,
    archetype: todayRecommendation.outfits[1].archetypeId,
    generation_mode: todayRecommendation.generationMode === 'ai-assisted' ? 'ai_assisted' : 'deterministic_fallback',
    dress_style: 'formal',
    age_bucket: '35_44',
  });
});

test('recomputing a focused outfit detail does not reopen the same suggestion', async () => {
  mockParams = { id: 'outfit-2' };
  const productAnalytics = createProductAnalytics();
  const result = await render(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <OutfitDetailRoute />
    </Providers>,
  );

  await result.rerender(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue({ birthDate: '1990-01-01' })}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <OutfitDetailRoute />
    </Providers>,
  );

  expect(productAnalytics.analytics.names().filter((name) => name === 'outfit_detail_opened'))
    .toHaveLength(1);
});

test('setting ownership from outfit detail creates the Closet entry with entry_point outfit_detail', async () => {
  mockParams = { id: 'outfit-1' };
  const productAnalytics = createProductAnalytics();
  const created = wardrobeItem();
  const wardrobe = wardrobeValue({ createItem: jest.fn(async () => created) });
  const result = await render(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobe}
      weather={weatherValue()}>
      <OutfitDetailRoute />
    </Providers>,
  );

  await fireEvent.press(result.getByTestId('outfit-detail-caption-jumpsuit'));
  await fireEvent.press(result.getByRole('button', { name: messages.en.today.ownershipOwnedAction }));

  expect(wardrobe.createItem).toHaveBeenCalledWith({ garmentTypeId: 'jumpsuit', entryState: 'owned' });
  const createdCapture = productAnalytics.analytics.captures.find((c) => c.name === 'closet_item_created');
  expect(createdCapture?.properties).toEqual({
    schema_version: 1,
    state: 'owned',
    garment_type_id: 'jumpsuit',
    has_photo: false,
    entry_point: 'outfit_detail',
    dress_style: 'smart',
    age_bucket: 'unknown',
  });
  expect(productAnalytics.analytics.captures.some((c) => c.name === 'feature_used_first_time')).toBe(true);
});

test('setting ownership from outfit detail updates the existing Closet entry', async () => {
  mockParams = { id: 'outfit-1' };
  const productAnalytics = createProductAnalytics();
  const existing = wardrobeItem({ entryState: 'wanted' });
  const wardrobe = wardrobeValue({
    state: {
      status: 'ready', items: [existing], isRefreshing: false, isMutating: false,
      refreshFailure: null,
    },
    updateItem: jest.fn(async () => ({ ...existing, entryState: 'owned' })),
  });
  const result = await render(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobe}
      weather={weatherValue()}>
      <OutfitDetailRoute />
    </Providers>,
  );

  await fireEvent.press(result.getByTestId('outfit-detail-caption-jumpsuit'));
  await fireEvent.press(result.getByRole('button', { name: messages.en.today.ownershipOwnedAction }));

  expect(wardrobe.updateItem).toHaveBeenCalledWith('item-one', { entryState: 'owned' });
  expect(productAnalytics.analytics.captures).toContainEqual({
    name: 'closet_item_updated',
    properties: {
      schema_version: 1,
      fields_changed: ['state'],
      garment_type_id: 'jumpsuit',
      entry_point: 'outfit_detail',
    },
    options: undefined,
  });
});
