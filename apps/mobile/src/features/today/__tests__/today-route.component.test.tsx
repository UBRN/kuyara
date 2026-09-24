import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { FirstUseTracker } from '@/features/analytics/application/first-use-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import { AnalyticsConsentTriggerContext } from '@/features/analytics/application/analytics-consent-trigger';
import { ProductAnalyticsContext } from '@/features/analytics/application/use-product-analytics';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import {
  NotificationApplicationContext,
  type NotificationApplicationValue,
} from '@/features/notifications/application/notification-context';
import type { WeatherAlertOffer } from '@/features/notifications/domain/weather-alert-offer';
import { ProfileApplicationContext } from '@/features/profile/application/profile-context';
import type { LocalProfile } from '@/features/profile/domain/profile';
import { RecommendationApplicationContext } from '@/features/recommendation/application/recommendation-application-context';
import type { RecommendationApplicationState } from '@/features/recommendation/application/recommendation-application-controller';
import { todayActiveLocation, todayOutfitId, todayScreenState } from '@/features/today/__tests__/fixtures';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
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
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      canGoBack: () => true,
      replace: jest.fn(),
    }),
    useLocalSearchParams: () => mockParams,
  };
});

// The Observe adapter resolves to its no-op binding under Jest, so the interactive mark is
// observed here rather than through the native module.
// The offer's own rule is tested in `weather-alert-offer.test.mjs`; what the route owns is
// handing the decided offer to Today and wiring its two actions.
const mockAcceptOffer = jest.fn(async () => ({ outcome: 'enabled' } as const));
const mockDismissOffer = jest.fn(async () => undefined);
let mockOffer: WeatherAlertOffer = { kind: 'none' };
jest.mock('@/features/notifications/application/use-weather-alert-offer', () => ({
  useWeatherAlertOffer: () => ({
    offer: mockOffer,
    acceptOffer: mockAcceptOffer,
    dismissOffer: mockDismissOffer,
  }),
}));

const mockMarkInteractive = jest.fn();
jest.mock('@/features/analytics/data/observe-performance-telemetry', () => ({
  ...jest.requireActual('@/features/analytics/data/observe-performance-telemetry'),
  useObserveInteractiveMark: () => mockMarkInteractive,
}));

const todayRecommendation = todayScreenState.snapshot.recommendation;

// The garment the first offered outfit leads with, read from the presentation the detail
// screen renders rather than written down, so a change in the engine's offer order moves the
// caption lookups and the Closet entry they create with it.
const firstDetailGarmentTypeId = (() => {
  const presentation = createTodayPresentation(todayScreenState, 'en', false, Date.now());
  if (presentation.kind !== 'loaded') throw new Error('Expected loaded Today presentation.');
  return presentation.suggestions[0].pieces[0].garmentTypeId;
})();
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
    revalidateFreshness: jest.fn(async () => undefined),
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
    phase: null,
    exhausted: false,
    showFirstGenerationOverlay: false,
    snapshot: {
      id: 'recommendation-one',
      localProfileId: 'profile-one',
      weatherSnapshotId: todayScreenState.snapshot.weather.id,
      locationKey: todayScreenState.snapshot.activeLocation.locationKey,
      clothingPreference: 'womens',
      dressStyle: 'smart',
      catalogVersion: 4,
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
    revalidateFreshness: jest.fn(async () => undefined),
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
    entryState: 'owned', garmentTypeId: firstDetailGarmentTypeId, color: null, colorFamily: null,
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
      displayName: null,
      namePromptVersion: 1,
      languagePreference: 'system' as const,
      themePreference: 'system' as const,
      onboardingCompleted: true,
      notificationsOptIn: false,
      weatherAlertOfferShown: false,
      morningBriefingOptIn: false,
      analyticsConsent: 'granted' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      clothingPreference: 'womens' as const,
      ...profile,
    },
  };
  return {
    state,
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

const mockOpenApplicationSettings = jest.fn(async () => undefined);
function notificationValue(): NotificationApplicationValue {
  return {
    state: {
      permission: { kind: 'undetermined' },
      optedIn: false,
      isBusy: false,
    },
    setOptIn: jest.fn(async () => ({ outcome: 'enabled' as const })),
    requestPermission: jest.fn(async () => ({ outcome: 'enabled' as const })),
    openApplicationSettings: mockOpenApplicationSettings,
    weatherAlertScheduler: { reschedule: jest.fn(async () => undefined) },
  } as unknown as NotificationApplicationValue;
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
  recommendationRegenerate = jest.fn(async () => null),
  reevaluateLocalDay = jest.fn(),
  wardrobe,
  profile,
  productAnalytics,
  markRecommendationShown = jest.fn(),
}: PropsWithChildren<{
  weather: WeatherApplicationValue;
  recommendation: RecommendationApplicationState;
  recommendationRefresh?: () => Promise<null>;
  recommendationRegenerate?: () => Promise<null>;
  reevaluateLocalDay?: () => void;
  wardrobe: ReturnType<typeof wardrobeValue>;
  profile: ReturnType<typeof profileValue>;
  productAnalytics: ReturnType<typeof createProductAnalytics>;
  markRecommendationShown?: () => void;
}>) {
  return (
    <LocalizationContext value={{ language: 'en', messages: messages.en , hour12: false }}>
      <KuyaraThemeContext value={lightTheme}>
        <ProductAnalyticsContext value={productAnalytics}>
          <AnalyticsConsentTriggerContext value={{
            recommendationShown: false,
            markRecommendationShown,
          }}>
            <ProfileApplicationContext value={profile}>
            <NotificationApplicationContext value={notificationValue()}>
            <WeatherApplicationContext value={weather}>
              <RecommendationApplicationContext value={{
                state: recommendation,
                onDeviceAvailability: null,
                refresh: recommendationRefresh,
                skipWait: jest.fn(async () => null),
                regenerate: recommendationRegenerate,
                reevaluateLocalDay,
              }}>
                <WardrobeApplicationContext value={wardrobe as never}>
                  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }}>
                    {children}
                  </SafeAreaProvider>
                </WardrobeApplicationContext>
              </RecommendationApplicationContext>
            </WeatherApplicationContext>
            </NotificationApplicationContext>
            </ProfileApplicationContext>
          </AnalyticsConsentTriggerContext>
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
  mockMarkInteractive.mockClear();
  mockAcceptOffer.mockClear();
  mockDismissOffer.mockClear();
  mockOffer = { kind: 'none' };
  mockParams = {};
});

test('Today offers the alert opt-in once, and each action answers the offer', async () => {
  mockOffer = { kind: 'offer', ruleId: 'precipitation_onset' };
  const acceptAnalytics = createProductAnalytics();
  const render1 = await render(
    <Providers
      productAnalytics={acceptAnalytics}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  expect(render1.getByTestId('today-alert-offer-message'))
    .toHaveTextContent(messages.en.notifications.offer.sentences.precipitation_onset);
  await act(async () => {
    fireEvent.press(render1.getByTestId('today-alert-offer-accept'));
  });
  expect(mockAcceptOffer).toHaveBeenCalledTimes(1);
  expect(mockDismissOffer).not.toHaveBeenCalled();
  // Taxonomy 5.13: how the offer was answered and which reason it named, nothing else,
  // followed by exactly the events the Settings Notifications route reports for the same
  // opt-in. Accepting turns both kinds on, so both preferences really changed.
  await waitFor(() => expect(acceptAnalytics.analytics.names()
    .filter((name) => name !== 'screen_viewed' && name !== 'recommendation_viewed'))
    .toEqual([
      'weather_alert_offer_resolved',
      'notification_permission_resolved',
      'setting_changed',
      'setting_changed',
      'feature_used_first_time',
    ]));
  expect(acceptAnalytics.analytics.captures
    .filter(({ name }) => name !== 'screen_viewed' && name !== 'recommendation_viewed')
    .map(({ properties }) => properties)).toEqual([
    { schema_version: 3, outcome: 'accepted', kind: 'precipitation_onset' },
    { schema_version: 3, outcome: 'enabled' },
    { schema_version: 3, setting_name: 'notifications_enabled', new_value: true },
    { schema_version: 3, setting_name: 'morning_briefing_enabled', new_value: true },
    { schema_version: 3, feature_name: 'notifications' },
  ]);
  // ADR 0004: an accepted offer ends on the Notifications surface, where both kinds are on.
  expect(mockPush).toHaveBeenCalledWith('/settings/notifications');

  mockOffer = { kind: 'offer', ruleId: 'morning_briefing' };
  const dismissAnalytics = createProductAnalytics();
  const render2 = await render(
    <Providers
      productAnalytics={dismissAnalytics}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );
  await act(async () => {
    fireEvent.press(render2.getByTestId('today-alert-offer-dismiss'));
  });
  expect(mockDismissOffer).toHaveBeenCalledTimes(1);
  expect(dismissAnalytics.analytics.captures
    .filter(({ name }) => name === 'weather_alert_offer_resolved')
    .map(({ properties }) => properties)).toEqual([
    { schema_version: 3, outcome: 'dismissed', kind: 'morning_briefing' },
  ]);
});

test('an existing profile sees the versioned name sheet and Not now resolves it', async () => {
  const profile = profileValue({ namePromptVersion: 0 });
  const markRecommendationShown = jest.fn();
  const screen = await render(
    <Providers productAnalytics={createProductAnalytics()} profile={profile}
      recommendation={recommendationReady()} wardrobe={wardrobeValue()} weather={weatherValue()}
      markRecommendationShown={markRecommendationShown}>
      <TodayRoute />
    </Providers>,
  );
  expect(screen.getByText(messages.en.onboarding.nameTitle)).toBeOnTheScreen();
  expect(markRecommendationShown).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('name-sheet-dismiss'));
  await waitFor(() => expect(profile.updateDisplayName).toHaveBeenCalledWith(null));
});

test('Today releases its name prompt when saving the dismissal gate fails', async () => {
  const profile = profileValue({ namePromptVersion: 0 });
  profile.updateDisplayName.mockRejectedValueOnce(new Error('database failed'));
  const screen = await render(
    <Providers productAnalytics={createProductAnalytics()} profile={profile}
      recommendation={recommendationReady()} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  await fireEvent.press(screen.getByTestId('name-sheet-dismiss'));

  await waitFor(() => expect(screen.queryByText(messages.en.onboarding.nameTitle)).toBeNull());
  expect(screen.queryByTestId('name-save-error')).toBeNull();
});

test('Today greets a named profile without opening the name sheet', async () => {
  const screen = await render(
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ displayName: 'Utku', namePromptVersion: 1 })}
      recommendation={recommendationReady()} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );
  expect(screen.getByTestId('today-greeting')).toHaveTextContent('Welcome back, Utku');
  expect(screen.queryByText(messages.en.onboarding.nameTitle)).toBeNull();
});

test('Today shows no alert offer when no alert would have fired', async () => {
  const result = await render(
    <Providers
      productAnalytics={createProductAnalytics()}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  expect(result.queryByTestId('today-alert-offer')).toBeNull();
});

test('Today marks itself interactive once, with the coarse presentation kind', async () => {
  const view = await render(
    <Providers
      productAnalytics={createProductAnalytics()}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  expect(mockMarkInteractive).toHaveBeenCalledTimes(1);
  expect(mockMarkInteractive).toHaveBeenCalledWith({ state: 'loaded' });

  // A later render, even one that changes the presentation, must not move the mark.
  await act(async () => {
    view.rerender(
      <Providers
        productAnalytics={createProductAnalytics()}
        profile={profileValue()}
        recommendation={recommendationReady({ isRefreshing: true })}
        wardrobe={wardrobeValue()}
        weather={weatherValue({ isRefreshing: true })}>
        <TodayRoute />
      </Providers>,
    );
  });

  expect(mockMarkInteractive).toHaveBeenCalledTimes(1);
});

test('Today marks itself interactive on its first presentation even when that is the loading one', async () => {
  await render(
    <Providers
      productAnalytics={createProductAnalytics()}
      profile={profileValue()}
      recommendation={{ status: 'loading' }}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  expect(mockMarkInteractive).toHaveBeenCalledTimes(1);
  expect(mockMarkInteractive).toHaveBeenCalledWith({ state: 'loading' });
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
    schema_version: 3,
    generation_mode: todayRecommendation.generationMode === 'ai-assisted' ? 'ai_assisted' : 'deterministic_fallback',
    cache_state: 'fresh',
    outfit_count: 3,
    dress_style: 'smart',
    age_bucket: 'unknown',
  });
});

test('Today marks a rendered recommendation for the consent gate once', async () => {
  const markRecommendationShown = jest.fn();
  const props = {
    markRecommendationShown,
    productAnalytics: createProductAnalytics(),
    profile: profileValue({ analyticsConsent: 'undecided' }),
    wardrobe: wardrobeValue(),
    weather: weatherValue(),
  };
  const result = await render(
    <Providers {...props} recommendation={recommendationReady()}>
      <TodayRoute />
    </Providers>,
  );

  expect(markRecommendationShown).toHaveBeenCalledTimes(1);
  await result.rerender(
    <Providers {...props} recommendation={recommendationReady({ isRefreshing: true })}>
      <TodayRoute />
    </Providers>,
  );
  expect(markRecommendationShown).toHaveBeenCalledTimes(1);
});

test('the first recommendation refresh shows loading without reporting an error episode', async () => {
  const productAnalytics = createProductAnalytics();
  const props = {
    productAnalytics,
    profile: profileValue(),
    wardrobe: wardrobeValue(),
    weather: weatherValue(),
  };
  const result = await render(
    <Providers
      {...props}
      recommendation={{ status: 'ready', snapshot: null, isRefreshing: true, lastFailure: null, phase: null, exhausted: false, showFirstGenerationOverlay: true }}>
      <TodayRoute />
    </Providers>,
  );

  expect(result.getByTestId('today-loading-screen', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(result.getByTestId('first-generation-overlay')).toBeOnTheScreen();
  expect(result.queryByTestId('today-unavailable-screen')).not.toBeOnTheScreen();

  await result.rerender(
    <Providers {...props} recommendation={recommendationReady()}>
      <TodayRoute />
    </Providers>,
  );
  const errorEvents = productAnalytics.analytics.captures.filter(
    ({ name }) => name === 'error_shown' || name === 'error_recovered',
  );
  expect(errorEvents).toHaveLength(0);
});

test('a background recommendation refresh keeps Today inline', async () => {
  const result = await render(
    <Providers
      productAnalytics={createProductAnalytics()}
      profile={profileValue()}
      recommendation={recommendationReady({ isRefreshing: true, phase: 'asking-stylist' })}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );
  expect(result.queryByTestId('first-generation-overlay')).toBeNull();
  expect(result.getByTestId('today-freshness')).toHaveTextContent(messages.en.today.phase['asking-stylist']);
});

test('a successful pull-to-refresh regenerates after weather and reports manual refresh, not retry', async () => {
  const productAnalytics = createProductAnalytics();
  const order: string[] = [];
  const weather = {
    ...weatherValue(),
    refresh: jest.fn(async () => { order.push('weather'); }),
    revalidateFreshness: jest.fn(async () => undefined),
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
  await act(async () => refreshControl.props.onRefresh());

  await waitFor(() => expect(recommendationRefresh).toHaveBeenCalledTimes(1));

  expect(order).toEqual(['weather', 'recommendation']);
  expect(productAnalytics.analytics.captures.map((c) => c.name)).toContain('manual_refresh_triggered');
  expect(productAnalytics.analytics.captures.map((c) => c.name)).not.toContain('retry_after_failure_triggered');
});

test('one pull stays refreshing until weather and recommendation have both settled', async () => {
  let resolveWeather!: () => void;
  let resolveRecommendation!: (value: null) => void;
  const weatherRefresh = new Promise<void>((resolve) => { resolveWeather = resolve; });
  const recommendationRefreshPromise = new Promise<null>((resolve) => {
    resolveRecommendation = resolve;
  });
  const weather = {
    ...weatherValue(),
    refresh: jest.fn(() => weatherRefresh),
  };
  const recommendationRefresh = jest.fn(() => recommendationRefreshPromise);
  const result = await render(
    <Providers
      productAnalytics={createProductAnalytics()}
      profile={profileValue()}
      recommendation={recommendationReady()}
      recommendationRefresh={recommendationRefresh}
      wardrobe={wardrobeValue()}
      weather={weather}>
      <TodayRoute />
    </Providers>,
  );

  await act(async () => result.getByTestId('today-screen').props.refreshControl.props.onRefresh());
  await waitFor(() => expect(
    result.getByTestId('today-screen').props.refreshControl.props.refreshing,
  ).toBe(true));

  await act(async () => resolveWeather());
  await waitFor(() => expect(recommendationRefresh).toHaveBeenCalledTimes(1));
  expect(result.getByTestId('today-screen').props.refreshControl.props.refreshing).toBe(true);

  await act(async () => resolveRecommendation(null));
  await waitFor(() => expect(
    result.getByTestId('today-screen').props.refreshControl.props.refreshing,
  ).toBe(false));
});

test('a failed weather refresh with the same snapshot skips recommendation regeneration', async () => {
  const productAnalytics = createProductAnalytics();
  const weather = weatherValue({ refreshFailure: 'offline' });
  const recommendationRefresh = jest.fn(async () => null);
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

  await act(async () => result.getByTestId('today-screen').props.refreshControl.props.onRefresh());
  await waitFor(() => expect(
    productAnalytics.analytics.captures.some(({ name }) => name === 'retry_after_failure_triggered'),
  ).toBe(true));

  expect(weather.refresh).toHaveBeenCalledTimes(1);
  expect(recommendationRefresh).not.toHaveBeenCalled();
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

test('focusing outfit detail re-evaluates the local day and weather freshness', async () => {
  mockParams = { id: todayOutfitId(1) };
  const reevaluateLocalDay = jest.fn();
  const weather = weatherValue();

  await render(
    <Providers
      productAnalytics={createProductAnalytics()}
      profile={profileValue()}
      recommendation={recommendationReady()}
      reevaluateLocalDay={reevaluateLocalDay}
      wardrobe={wardrobeValue()}
      weather={weather}>
      <OutfitDetailRoute />
    </Providers>,
  );

  expect(reevaluateLocalDay).toHaveBeenCalledTimes(1);
  expect(weather.revalidateFreshness).toHaveBeenCalledTimes(1);
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

test('an exhausted recommendation hides the regenerate action and caption from Today', async () => {
  const result = await render(
    <Providers
      productAnalytics={createProductAnalytics()}
      profile={profileValue()}
      recommendation={recommendationReady({ exhausted: true })}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  expect(result.getByTestId('today-archetype')).toBeOnTheScreen();
  expect(result.queryByTestId('today-regenerate')).toBeNull();
  expect(result.queryByTestId('today-regenerate-caption')).toBeNull();
  expect(result.queryByRole('button', { name: messages.en.today.regenerateAction })).toBeNull();
});

test('refreshing while Today shows stale weather and a failed attempt reports retry_after_failure_triggered', async () => {
  const productAnalytics = createProductAnalytics();
  // `refreshFailed` on an otherwise-loaded state: the last attempt failed but a snapshot
  // still renders, so retry must preserve the visible recommendation while it refreshes.
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
  await act(async () => refreshControl.props.onRefresh());

  await waitFor(() => expect(
    productAnalytics.analytics.captures.some((c) => c.name === 'retry_after_failure_triggered'),
  ).toBe(true));
  const retry = productAnalytics.analytics.captures.find((c) => c.name === 'retry_after_failure_triggered');
  expect(retry?.properties).toEqual({
    schema_version: 3, surface: 'today', attempt_number: 1, result: 'failure',
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
    schema_version: 3, surface: 'today', failure_category: 'offline', occurrence_count: 1,
  });
  expect(productAnalytics.analytics.captures).toContainEqual({
    name: 'error_recovered',
    properties: { schema_version: 3, surface: 'today', failure_category: 'offline' },
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
      recommendation={{ status: 'ready', snapshot: null, isRefreshing: false, lastFailure: 'unavailable', phase: null, exhausted: false, showFirstGenerationOverlay: false }}
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
    { schema_version: 3, surface: 'recommendation', failure_category: 'unavailable', occurrence_count: 1 },
    { schema_version: 3, surface: 'recommendation', failure_category: 'unavailable' },
  ]);
});

test('opening an outfit reports screen_viewed and outfit_detail_opened with its position and archetype', async () => {
  mockParams = { id: todayOutfitId(2) };
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
    schema_version: 3,
    outfit_position: 2,
    archetype: todayRecommendation.outfits[1].archetypeId,
    generation_mode: todayRecommendation.generationMode === 'ai-assisted' ? 'ai_assisted' : 'deterministic_fallback',
    dress_style: 'formal',
    age_bucket: '35_44',
  });
});

test('Today opens outfit detail by the outfit\'s stable option id', async () => {
  const result = await render(
    <Providers
      productAnalytics={createProductAnalytics()}
      profile={profileValue()}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  await fireEvent.press(result.getByTestId('today-archetype'));

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/[id]', params: { id: todayOutfitId(1) } });
});

test('a regeneration finishing under an open detail keeps the same outfit or shows none, never another', async () => {
  mockParams = { id: todayOutfitId(1) };
  if (todayRecommendation.status !== 'recommended') throw new Error('fixture');
  const props = {
    productAnalytics: createProductAnalytics(),
    profile: profileValue(),
    wardrobe: wardrobeValue(),
    weather: weatherValue(),
  };
  const result = await render(
    <Providers {...props} recommendation={recommendationReady()}>
      <OutfitDetailRoute />
    </Providers>,
  );
  expect(result.getByRole('header', { name: messages.en.recommendation.archetypes.rain_ready }))
    .toBeOnTheScreen();

  // The same outfit at a different position is still the opened outfit.
  const [first, second, third] = todayRecommendation.outfits;
  const reordered = recommendationReady();
  if (reordered.status !== 'ready' || !reordered.snapshot) throw new Error('fixture');
  await result.rerender(
    <Providers {...props} recommendation={{
      ...reordered,
      snapshot: {
        ...reordered.snapshot,
        recommendation: { ...todayRecommendation, outfits: [second, first, third] },
      },
    }}>
      <OutfitDetailRoute />
    </Providers>,
  );
  expect(result.getByRole('header', { name: messages.en.recommendation.archetypes.rain_ready }))
    .toBeOnTheScreen();

  // An outfit the new snapshot no longer offers is not replaced by whichever sits at its position.
  await result.rerender(
    <Providers {...props} recommendation={{
      ...reordered,
      snapshot: {
        ...reordered.snapshot,
        recommendation: { ...todayRecommendation, outfits: [second, third] },
      },
    }}>
      <OutfitDetailRoute />
    </Providers>,
  );
  expect(result.queryByTestId('outfit-detail-board')).not.toBeOnTheScreen();
  expect(result.queryByRole('header', { name: messages.en.recommendation.archetypes.snow_day }))
    .not.toBeOnTheScreen();
  await fireEvent.press(result.getByRole('button', { name: messages.en.today.backAction }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('recomputing a focused outfit detail does not reopen the same suggestion', async () => {
  mockParams = { id: todayOutfitId(2) };
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
  mockParams = { id: todayOutfitId(1) };
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

  await fireEvent.press(result.getByTestId(`outfit-detail-caption-${firstDetailGarmentTypeId}`));
  await fireEvent.press(result.getByRole('button', { name: messages.en.today.ownershipOwnedAction }));

  expect(wardrobe.createItem)
    .toHaveBeenCalledWith({ garmentTypeId: firstDetailGarmentTypeId, entryState: 'owned' });
  const createdCapture = productAnalytics.analytics.captures.find((c) => c.name === 'closet_item_created');
  expect(createdCapture?.properties).toEqual({
    schema_version: 3,
    state: 'owned',
    garment_type_id: firstDetailGarmentTypeId,
    has_photo: false,
    entry_point: 'outfit_detail',
    dress_style: 'smart',
    age_bucket: 'unknown',
  });
  expect(productAnalytics.analytics.captures.some((c) => c.name === 'feature_used_first_time')).toBe(true);
});

test('setting ownership from outfit detail updates the existing Closet entry', async () => {
  mockParams = { id: todayOutfitId(1) };
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

  await fireEvent.press(result.getByTestId(`outfit-detail-caption-${firstDetailGarmentTypeId}`));
  await fireEvent.press(result.getByRole('button', { name: messages.en.today.ownershipOwnedAction }));

  expect(wardrobe.updateItem).toHaveBeenCalledWith('item-one', { entryState: 'owned' });
  expect(productAnalytics.analytics.captures).toContainEqual({
    name: 'closet_item_updated',
    properties: {
      schema_version: 3,
      fields_changed: ['state'],
      garment_type_id: firstDetailGarmentTypeId,
      entry_point: 'outfit_detail',
    },
    options: undefined,
  });
});

test('accepting the offer with the briefing already on records only the alert preference change', async () => {
  mockOffer = { kind: 'offer', ruleId: 'precipitation_onset' };
  const productAnalytics = createProductAnalytics();
  const screen = await render(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue({ morningBriefingOptIn: true })}
      recommendation={recommendationReady()}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  await act(async () => {
    fireEvent.press(screen.getByTestId('today-alert-offer-accept'));
  });
  // Taxonomy 5.9: `setting_changed` only for a preference that really changed.
  await waitFor(() => expect(productAnalytics.analytics.captures
    .filter(({ name }) => name === 'setting_changed')
    .map(({ properties }) => properties)).toEqual([
    { schema_version: 3, setting_name: 'notifications_enabled', new_value: true },
  ]));
  expect(mockPush).toHaveBeenCalledWith('/settings/notifications');
});
