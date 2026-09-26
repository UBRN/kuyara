import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useSyncExternalStore, type PropsWithChildren } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { FirstUseTracker } from '@/features/analytics/application/first-use-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import { AnalyticsConsentTriggerContext } from '@/features/analytics/application/analytics-consent-trigger';
import { ProductAnalyticsContext } from '@/features/analytics/application/use-product-analytics';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { garmentCatalogVersion } from '@/features/catalog/domain/garment-catalog';
import {
  NotificationApplicationContext,
  type NotificationApplicationValue,
} from '@/features/notifications/application/notification-context';
import type { WeatherAlertOffer } from '@/features/notifications/domain/weather-alert-offer';
import { ProfileApplicationContext } from '@/features/profile/application/profile-context';
import type { LocalProfile } from '@/features/profile/domain/profile';
import {
  RecommendationApplicationContext,
  type RecommendationApplicationValue,
  useRecommendationApplication,
} from '@/features/recommendation/application/recommendation-application-context';
import type { RecommendationApplicationState } from '@/features/recommendation/application/recommendation-application-controller';
import {
  RecommendationRepositoryError,
  type RecommendationSnapshot,
} from '@/features/recommendation/data/recommendation-repository';
import { wornOutfitFrom, type WornOutfit } from '@/features/recommendation/domain/outfit-history';
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

// GlassButton draws the sheet close and the detail back as SwiftUI glass buttons.
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { BottomSheet: ({ children, index }: { children: React.ReactNode; index: number }) =>
    index >= 0 ? React.createElement(View, null, children) : null };
});
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

const mockStackScreen = jest.fn();
const mockDispatch = jest.fn();
let mockFocused = true;
jest.mock('expo-router', () => {
  const actualReact = jest.requireActual('react');
  return {
    Stack: { Screen: (props: unknown) => { mockStackScreen(props); return null; } },
    useFocusEffect: (callback: () => void | (() => void)) => actualReact.useEffect(callback, [callback]),
    useIsFocused: () => mockFocused,
    useNavigation: () => ({ dispatch: mockDispatch }),
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

const mockChoiceGet = jest.fn();
const mockChoiceUpsert = jest.fn();
let mockRecommendationSnapshot: RecommendationSnapshot | null = null;
let mockRecommendationReadError: Error | null = null;
jest.mock('@/infrastructure/sqlite/expo-sqlite-database', () => ({
  openKuyaraDatabase: async () => ({}),
}));
jest.mock('@/infrastructure/sqlite/migrations', () => ({ migrateDatabase: async () => undefined }));
jest.mock('@/features/recommendation/data/sqlite-dressing-day-choice-repository', () => ({
  SqliteDressingDayChoiceRepository: class {
    get(...args: unknown[]) { return mockChoiceGet(...args); }
    upsert(...args: unknown[]) { return mockChoiceUpsert(...args); }
  },
}));
const mockDepartureUpsert = jest.fn();
const mockDepartureClear = jest.fn();
const mockDepartureGet = jest.fn();
jest.mock('@/features/recommendation/data/sqlite-dressing-day-departure-repository', () => ({
  SqliteDressingDayDepartureRepository: class {
    get(...args: unknown[]) { return mockDepartureGet(...args); }
    upsert(...args: unknown[]) { return mockDepartureUpsert(...args); }
    clear(...args: unknown[]) { return mockDepartureClear(...args); }
  },
}));
// The re-ask sheet's native controls are tested in their own wrappers; here they are plain
// buttons, which also keeps the native dependency's name out of `features/`.
jest.mock('@/components/ui/segmented-control', () => {
  const { Pressable: MockPressable, Text: MockText, View: MockView } = jest.requireActual('react-native');
  return {
    SegmentedControl: ({ onChange, options, testID }: Readonly<{
      onChange: (value: string) => void;
      options: readonly Readonly<{ label: string; value: string }>[];
      testID?: string;
    }>) => (
      <MockView testID={testID}>
        {options.map((option) => (
          <MockPressable key={option.value} onPress={() => onChange(option.value)}
            testID={`${testID}-${option.value}`}>
            <MockText>{option.label}</MockText>
          </MockPressable>
        ))}
      </MockView>
    ),
  };
});
jest.mock('@/components/ui/native-wheel-picker', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { NativeWheelPicker: ({ testID }: Readonly<{ testID?: string }>) => <MockView testID={testID} /> };
});
jest.mock('@/features/recommendation/data/on-device-ai-module', () => ({ onDeviceAiModule: null }));
// Live provider tests choose whether the stub store has a saved recommendation.
jest.mock('@/features/recommendation/data/recommendation-repository', () => ({
  ...jest.requireActual('@/features/recommendation/data/recommendation-repository'),
  LocalRecommendationRepository: class {
    async getSnapshot() {
      if (mockRecommendationReadError) throw mockRecommendationReadError;
      return mockRecommendationSnapshot;
    }
  },
}));
jest.mock('@/features/recommendation/application/recommendation-application-controller', () => {
  const actual = jest.requireActual(
    '@/features/recommendation/application/recommendation-application-controller',
  );
  return {
    ...actual,
    localDayKey: () => '2026-09-24',
    localDayKind: () => 'weekday',
    localDayVariant: () => 0,
  };
});

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

function recommendationStateStore(initial: RecommendationApplicationState) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set: (next: RecommendationApplicationState) => {
      current = next;
      listeners.forEach((listener) => listener());
    },
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
    updateStyleAesthetics: jest.fn(async () => undefined),
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
  recommendationGetSnapshot,
  recommendationRefresh = jest.fn(async () => null),
  recommendationEvaluateApprovedTriggers = jest.fn(async () => undefined),
  recommendationRegenerate = jest.fn(async () => null),
  resolvedDressStyle,
  resolvedStyleAesthetics,
  outfitHistory,
  dressingDayChoiceReady,
  dressingDayChoiceFailed,
  dressingDayKey,
  morningChoicePending,
  eveningChoicePending,
  chooseFormality,
  reask,
  activeDeparture = null,
  reevaluateLocalDay = jest.fn(),
  wardrobe,
  profile,
  productAnalytics,
  markRecommendationShown = jest.fn(),
  liveRecommendationProvider = false,
}: PropsWithChildren<{
  weather: WeatherApplicationValue;
  recommendation: RecommendationApplicationState;
  recommendationGetSnapshot?: () => RecommendationApplicationState;
  recommendationRefresh?: () => Promise<null>;
  recommendationEvaluateApprovedTriggers?: (foreground?: boolean) => Promise<void>;
  recommendationRegenerate?: () => Promise<null>;
  resolvedDressStyle?: 'casual' | 'smart' | 'formal';
  resolvedStyleAesthetics?: RecommendationApplicationValue['resolvedStyleAesthetics'];
  outfitHistory?: RecommendationApplicationValue['outfitHistory'];
  dressingDayChoiceReady?: boolean;
  dressingDayChoiceFailed?: boolean;
  dressingDayKey?: string;
  morningChoicePending?: boolean;
  eveningChoicePending?: boolean;
  chooseFormality?: RecommendationApplicationValue['chooseFormality'];
  reask?: RecommendationApplicationValue['reask'];
  activeDeparture?: RecommendationApplicationValue['activeDeparture'];
  reevaluateLocalDay?: () => void;
  wardrobe: ReturnType<typeof wardrobeValue>;
  profile: ReturnType<typeof profileValue>;
  productAnalytics: ReturnType<typeof createProductAnalytics>;
  markRecommendationShown?: () => void;
  liveRecommendationProvider?: boolean;
}>) {
  const screenContent = (
    <WardrobeApplicationContext value={wardrobe as never}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }}>
        {children}
      </SafeAreaProvider>
    </WardrobeApplicationContext>
  );
  const recommendationContent = liveRecommendationProvider ? (
    <RecommendationApplicationProvider localProfileId={profile.state.profile.id}>
      {screenContent}
    </RecommendationApplicationProvider>
  ) : (
    <RecommendationApplicationContext value={{
      state: recommendation,
      getSnapshot: recommendationGetSnapshot ?? (() => recommendation),
      onDeviceAvailability: null,
      refresh: recommendationRefresh,
      evaluateApprovedTriggers: recommendationEvaluateApprovedTriggers,
      skipWait: jest.fn(async () => null),
      regenerate: recommendationRegenerate,
      resolvedDressStyle,
      resolvedStyleAesthetics,
      outfitHistory,
      dressingDayChoiceReady,
      dressingDayChoiceFailed,
      dressingDayKey,
      morningChoicePending,
      eveningChoicePending,
      chooseFormality,
      reask,
      activeDeparture,
      reevaluateLocalDay,
    }}>
      {screenContent}
    </RecommendationApplicationContext>
  );
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
              {recommendationContent}
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
import { RecommendationApplicationProvider } from '@/features/recommendation/application/recommendation-application-provider';
// eslint-disable-next-line import/first
import { RecommendationApplicationController } from '@/features/recommendation/application/recommendation-application-controller';
// eslint-disable-next-line import/first
import TodayRoute from '@/app/(tabs)/(today)/index';
// eslint-disable-next-line import/first
import OutfitDetailRoute from '@/app/(tabs)/(today)/[id]';

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  mockDispatch.mockClear();
  mockMarkInteractive.mockClear();
  mockAcceptOffer.mockClear();
  mockDismissOffer.mockClear();
  mockOffer = { kind: 'none' };
  mockParams = {};
  mockChoiceGet.mockReset().mockResolvedValue(null);
  mockChoiceUpsert.mockReset().mockResolvedValue(undefined);
  mockDepartureUpsert.mockReset().mockImplementation(async (localProfileId: string, dayKey: string,
    departureAt: string, timeZone: string) => ({ id: 'departure-one', localProfileId, dayKey, departureAt,
    timeZone, createdAt: departureAt, updatedAt: departureAt, deletedAt: null }));
  mockDepartureClear.mockReset().mockResolvedValue(false);
  mockDepartureGet.mockReset().mockResolvedValue(null);
  mockRecommendationSnapshot = null;
  mockRecommendationReadError = null;
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
      resolvedDressStyle="formal"
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
    dress_style: 'formal',
    age_bucket: 'unknown',
  });
});

test('Today waits for the day choice before reporting resolved formality', async () => {
  const productAnalytics = createProductAnalytics();
  const profile = profileValue();
  const recommendation = recommendationReady();
  const wardrobe = wardrobeValue();
  const weather = weatherValue();
  const reevaluateLocalDay = jest.fn();
  const view = await render(
    <Providers productAnalytics={productAnalytics} profile={profile}
      recommendation={recommendation} resolvedDressStyle="smart"
      dressingDayChoiceReady={false} reevaluateLocalDay={reevaluateLocalDay}
      wardrobe={wardrobe} weather={weather}>
      <TodayRoute />
    </Providers>,
  );
  expect(productAnalytics.analytics.captures.filter((event) =>
    event.name === 'recommendation_viewed')).toHaveLength(0);

  view.rerender(
    <Providers productAnalytics={productAnalytics} profile={profile}
      recommendation={recommendation} resolvedDressStyle="formal"
      dressingDayChoiceReady reevaluateLocalDay={reevaluateLocalDay}
      wardrobe={wardrobe} weather={weather}>
      <TodayRoute />
    </Providers>,
  );
  await waitFor(() => expect(productAnalytics.analytics.captures.filter((event) =>
    event.name === 'recommendation_viewed')).toHaveLength(1));
  expect(productAnalytics.analytics.captures.find((event) =>
    event.name === 'recommendation_viewed')?.properties).toMatchObject({ dress_style: 'formal' });
});

test('a rejected day-choice read leaves the morning sheet closed and writes no choice', async () => {
  function ChoiceReadStatus() {
    const { dressingDayChoiceFailed } = useRecommendationApplication();
    return <Text testID="day-choice-read-status">{String(dressingDayChoiceFailed)}</Text>;
  }
  let rejectChoiceRead: ((reason: Error) => void) | undefined;
  mockChoiceGet.mockImplementation(() => new Promise((_resolve, reject) => {
    rejectChoiceRead = reject;
  }));
  const props = {
    productAnalytics: createProductAnalytics(),
    profile: profileValue({ morningSheetEnabled: true }),
    recommendation: recommendationReady(),
    liveRecommendationProvider: true,
    wardrobe: wardrobeValue(),
    weather: weatherValue(),
  };
  const view = await render(
    <Providers {...props}>
      <TodayRoute />
      <ChoiceReadStatus />
    </Providers>,
  );

  await waitFor(() => expect(rejectChoiceRead).toBeDefined());
  expect(view.getByTestId('day-choice-read-status')).toHaveTextContent('false');
  await act(async () => {
    rejectChoiceRead?.(new Error('choice read failed'));
    await Promise.resolve();
  });

  expect(view.queryByTestId('daily-formality-sheet')).toBeNull();
  expect(view.getByTestId('day-choice-read-status')).toHaveTextContent('true');
  expect(mockChoiceUpsert).not.toHaveBeenCalled();

  mockChoiceGet.mockResolvedValueOnce(null);
  await act(async () => {
    view.rerender(
      <Providers {...props} weather={weatherValue()}>
        <TodayRoute />
        <ChoiceReadStatus />
      </Providers>,
    );
  });
  await waitFor(() => expect(mockChoiceGet).toHaveBeenCalledTimes(2));
  expect(await view.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
  expect(view.getByTestId('day-choice-read-status')).toHaveTextContent('false');
  expect(mockChoiceUpsert).not.toHaveBeenCalled();
});

test('an automatic trigger and pull across a forecast hour share one controller refresh', async () => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  mockRecommendationSnapshot = {
    ...saved.snapshot,
    catalogVersion: garmentCatalogVersion,
    localDayKey: '2026-09-24',
    dressStyle: 'casual',
  };
  jest.useFakeTimers({
    now: new Date('2026-09-24T06:59:59.000Z'),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
  let finishRefresh!: (value: RecommendationSnapshot | null) => void;
  const pendingRefresh = new Promise<RecommendationSnapshot | null>((resolve) => {
    finishRefresh = resolve;
  });
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(() => pendingRefresh);
  let pull: Promise<void> | null = null;
  try {
    const weather = weatherValue();
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
        recommendation={saved} liveRecommendationProvider
        wardrobe={wardrobeValue()} weather={weather}>
        <TodayRoute />
      </Providers>,
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(refresh.mock.calls[0][0]).toBe('dress-style-changed');
    expect(refresh.mock.calls[0][1].now).toBe('2026-09-24T06:59:59.000Z');

    jest.setSystemTime(new Date('2026-09-24T07:00:00.000Z'));
    expect(new Date().toISOString()).toBe('2026-09-24T07:00:00.000Z');
    await act(async () => {
      pull = view.getByTestId('today-screen').props.refreshControl.props.onRefresh();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(weather.refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  } finally {
    finishRefresh(mockRecommendationSnapshot);
    if (pull) await act(async () => { await pull; });
    refresh.mockRestore();
    jest.useRealTimers();
  }
});

test('a changed preference during regeneration runs once more with the latest input', async () => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  mockRecommendationSnapshot = {
    ...saved.snapshot,
    catalogVersion: garmentCatalogVersion,
    localDayKey: '2026-09-24',
    locationKey: 'manual:other',
  };
  let finishRefresh!: (value: RecommendationSnapshot | null) => void;
  const pendingRefresh = new Promise<RecommendationSnapshot | null>((resolve) => {
    finishRefresh = resolve;
  });
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementationOnce(() => pendingRefresh)
    .mockImplementation(async () => mockRecommendationSnapshot);
  try {
    const props = {
      productAnalytics: createProductAnalytics(),
      recommendation: saved,
      liveRecommendationProvider: true,
      wardrobe: wardrobeValue(),
      weather: weatherValue(),
    };
    const view = await render(
      <Providers {...props} profile={profileValue()}><TodayRoute /></Providers>,
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(refresh.mock.calls[0][0]).toBe('active-location-changed');
    expect(refresh.mock.calls[0][1].dressStyle).toBe('smart');
    const originalPull = view.getByTestId('today-screen').props.refreshControl.props.onRefresh;

    await act(async () => {
      view.rerender(<Providers {...props} profile={profileValue({ dressStyle: 'formal' })}>
        <TodayRoute />
      </Providers>);
    });
    await act(async () => {
      view.rerender(<Providers {...props} profile={profileValue({ dressStyle: 'casual' })}>
        <TodayRoute />
      </Providers>);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    let pendingPull!: Promise<void>;
    await act(async () => {
      pendingPull = originalPull();
      await Promise.resolve();
    });

    await act(async () => {
      finishRefresh(mockRecommendationSnapshot);
      await pendingPull;
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(refresh.mock.calls[1][1].dressStyle).toBe('casual');
    await act(async () => { await Promise.resolve(); });
    expect(refresh).toHaveBeenCalledTimes(2);
  } finally {
    finishRefresh(mockRecommendationSnapshot);
    refresh.mockRestore();
  }
});

// M6 step 1: the day-type tiles are one radio group, the current answer checked by three
// cues together, and one tap chooses. M18 step 2 then offers the day's styles; an untouched
// step writes the day type alone, so the Settings styles keep applying (N4).
test('the morning sheet is a radio group with the day answer preselected, and one tap chooses', async () => {
  const chooseFormality = jest.fn(async () => undefined);
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ morningSheetEnabled: true, dressStyle: 'smart' })}
      recommendation={recommendationReady()} resolvedDressStyle="smart"
      dressingDayKey="2026-08-13" dressingDayChoiceReady morningChoicePending
      chooseFormality={chooseFormality} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  expect(await view.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
  expect(view.getByText(messages.en.today.dailyStyle.question)).toBeOnTheScreen();
  expect(view.getByTestId('daily-formality-choices').props.accessibilityRole).toBe('radiogroup');
  const tiles = view.getAllByRole('radio');
  expect(tiles.map((tile) => tile.props.accessibilityLabel)).toEqual(['Casual', 'Smart', 'Formal']);
  expect(tiles.map((tile) => tile.props.accessibilityState.selected)).toEqual([false, true, false]);
  expect(view.getByTestId('daily-formality-smart-check')).toBeOnTheScreen();
  expect(view.queryByTestId('daily-formality-casual-check')).toBeNull();
  expect(StyleSheet.flatten(view.getByTestId('daily-formality-smart').props.style)).toMatchObject({
    backgroundColor: lightTheme.colors.surfaceInteractive,
    borderColor: lightTheme.colors.brandAccent,
    borderWidth: 2,
  });
  expect(view.queryByTestId('daily-formality-more')).toBeNull();
  expect(view.queryByTestId('daily-formality-first-day')).toBeNull();
  expect(view.getByTestId('daily-formality-close').props.accessibilityLabel)
    .toBe(messages.en.today.dailyStyle.close);

  await fireEvent.press(view.getByTestId('daily-formality-formal'));
  expect(chooseFormality).not.toHaveBeenCalled();
  expect(view.getByText(messages.en.today.dailyStyle.stylesQuestion)).toBeOnTheScreen();
  await fireEvent.press(view.getByTestId('daily-formality-styles-done'));
  expect(chooseFormality).toHaveBeenCalledTimes(1);
  expect(chooseFormality).toHaveBeenCalledWith('2026-08-13', 'formal', 'morning', undefined);
  await waitFor(() => expect(view.queryByTestId('daily-formality-sheet')).toBeNull());
});

// M18 step 2 at the large detent (N7): the day's styles start on what the day resolves to,
// and the changed answer rides the same single write as the day type.
test('the morning sheet step 2 writes the day type and the changed styles once', async () => {
  const chooseFormality = jest.fn(async () => undefined);
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ morningSheetEnabled: true, dressStyle: 'smart' })}
      recommendation={recommendationReady()} resolvedDressStyle="smart"
      resolvedStyleAesthetics={['classic']}
      dressingDayKey="2026-08-13" dressingDayChoiceReady morningChoicePending
      chooseFormality={chooseFormality} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  await fireEvent.press(await view.findByTestId('daily-formality-casual'));
  expect(view.getByTestId('daily-formality-styles-classic').props.accessibilityState.checked).toBe(true);
  expect(view.getByTestId('daily-formality-styles-note'))
    .toHaveTextContent(messages.en.today.dailyStyle.stylesNote);
  await fireEvent.press(view.getByTestId('daily-formality-styles-sporty'));
  await fireEvent.press(view.getByTestId('daily-formality-styles-done'));
  expect(chooseFormality).toHaveBeenCalledTimes(1);
  expect(chooseFormality).toHaveBeenCalledWith('2026-08-13', 'casual', 'morning', ['classic', 'sporty']);
  await waitFor(() => expect(view.queryByTestId('daily-formality-sheet')).toBeNull());
});

test('closing the sheet on step 2 keeps the chosen day type and leaves the styles alone', async () => {
  const chooseFormality = jest.fn(async () => undefined);
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ morningSheetEnabled: true, dressStyle: 'smart' })}
      recommendation={recommendationReady()} resolvedDressStyle="smart"
      dressingDayKey="2026-08-13" dressingDayChoiceReady morningChoicePending
      chooseFormality={chooseFormality} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  await fireEvent.press(await view.findByTestId('daily-formality-formal'));
  await fireEvent.press(view.getByTestId('daily-formality-styles-minimal'));
  await fireEvent.press(view.getByTestId('daily-formality-close'));
  expect(chooseFormality).toHaveBeenCalledTimes(1);
  expect(chooseFormality).toHaveBeenCalledWith('2026-08-13', 'formal', 'morning');
});

// M16: on the day onboarding finishes the sheet still asks, with the setup answer checked
// and one caption saying so.
test('the first dressing day preselects the setup answer and says so', async () => {
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ morningSheetEnabled: true, dressStyle: 'formal', displayName: 'Utku' })}
      recommendation={recommendationReady()} resolvedDressStyle="formal"
      dressingDayKey="2026-09-24" dressingDayChoiceReady morningChoicePending
      chooseFormality={jest.fn(async () => undefined)} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  expect(await view.findByTestId('daily-formality-first-day'))
    .toHaveTextContent(messages.en.today.dailyStyle.firstDayNote);
  expect(view.getByTestId('daily-formality-formal').props.accessibilityState.selected).toBe(true);
  // f25: the first day's greeting is a welcome, not a welcome back.
  expect(view.getByTestId('today-greeting')).toHaveTextContent('Welcome, Utku');
});

// M16: a first recommendation held for the morning answer is a wait, and the sheet opens over
// it; a real failure keeps the sheet closed.
function morningPendingProps() {
  return {
    productAnalytics: createProductAnalytics(),
    profile: profileValue({ morningSheetEnabled: true }),
    resolvedDressStyle: 'smart' as const,
    dressingDayKey: '2026-08-13',
    dressingDayChoiceReady: true,
    morningChoicePending: true,
    chooseFormality: jest.fn(async () => undefined),
    wardrobe: wardrobeValue(),
  };
}

test('the morning sheet opens over the first wait', async () => {
  const view = await render(
    <Providers {...morningPendingProps()} recommendation={recommendationReady({ snapshot: null })}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );
  expect(await view.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
  expect(view.getByTestId('today-loading-screen')).toBeOnTheScreen();
  expect(view.queryByTestId('today-unavailable-screen')).toBeNull();
});

test('an offline catalog-bump cache stays hidden while the morning answer is pending', async () => {
  const stale = recommendationReady();
  if (stale.status !== 'ready' || !stale.snapshot) throw new Error('Expected saved fixture');
  mockRecommendationSnapshot = { ...stale.snapshot, catalogVersion: garmentCatalogVersion - 1 };
  mockRecommendationReadError = new RecommendationRepositoryError('invalid-data');
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(async () => null);
  try {
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()}
        profile={profileValue({ morningSheetEnabled: true })}
        recommendation={stale} liveRecommendationProvider
        wardrobe={wardrobeValue()} weather={weatherValue()}>
        <TodayRoute />
      </Providers>,
    );
    expect(await view.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
    expect(view.getByTestId('today-loading-screen')).toBeOnTheScreen();
    expect(view.queryByTestId('today-outfit-list')).toBeNull();
    expect(view.queryByTestId('today-unavailable-screen')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  } finally {
    refresh.mockRestore();
  }
});

test('the morning sheet never opens over an error card', async () => {
  const view = await render(
    <Providers {...morningPendingProps()} recommendation={recommendationReady()}
      weather={weatherValue({ snapshot: null, refreshFailure: 'offline' })}>
      <TodayRoute />
    </Providers>,
  );
  expect(view.getByTestId('today-unavailable-screen')).toBeOnTheScreen();
  expect(view.queryByTestId('daily-formality-sheet')).toBeNull();
});

// A pending morning answer is a wait only while nothing has failed. A recommendation that
// failed to load still renders the unavailable card and is reported on the recommendation
// surface, exactly as without a pending answer, and the sheet stays closed over it.
test('a pending morning answer with a recommendation failure stays unavailable and reported', async () => {
  const productAnalytics = createProductAnalytics();
  const props = { ...morningPendingProps(), productAnalytics };
  const failed = {
    status: 'ready' as const, snapshot: null, isRefreshing: false, lastFailure: 'unavailable' as const,
    phase: null, exhausted: false, showFirstGenerationOverlay: false,
  };
  const view = await render(
    <Providers {...props} recommendation={failed} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  expect(view.getByTestId('today-unavailable-screen')).toBeOnTheScreen();
  expect(view.queryByTestId('today-loading-screen')).toBeNull();
  expect(view.queryByTestId('daily-formality-sheet')).toBeNull();

  await view.rerender(
    <Providers {...props} recommendation={recommendationReady()} weather={weatherValue()}>
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

// P6: closing the morning question answers it with the profile's dress style, through the
// one write an answer makes. No alert, no random style, and no second write.
test('dismissing the morning sheet answers with the profile dress style and asks nothing', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const chooseFormality = jest.fn(async () => undefined);
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ morningSheetEnabled: true, dressStyle: 'casual' })}
      recommendation={recommendationReady()} resolvedDressStyle="casual"
      dressingDayKey="2026-08-13" dressingDayChoiceReady morningChoicePending
      chooseFormality={chooseFormality} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  await fireEvent.press(await view.findByTestId('daily-formality-close'));
  expect(alert).not.toHaveBeenCalled();
  expect(chooseFormality).toHaveBeenCalledTimes(1);
  expect(chooseFormality).toHaveBeenCalledWith('2026-08-13', 'casual', 'morning');
  await waitFor(() => expect(view.queryByTestId('daily-formality-sheet')).toBeNull());
  // P6: Today has no Plan tomorrow row.
  expect(view.queryByTestId('today-plan-tomorrow')).toBeNull();
  alert.mockRestore();
});

test('a dismissal whose save fails reopens the question with the save error', async () => {
  const chooseFormality = jest.fn(async () => { throw new Error('write failed'); });
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ morningSheetEnabled: true })}
      recommendation={recommendationReady()} resolvedDressStyle="smart"
      dressingDayKey="2026-08-13" dressingDayChoiceReady morningChoicePending
      chooseFormality={chooseFormality} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  await fireEvent.press(await view.findByTestId('daily-formality-close'));
  expect(await view.findByText(messages.en.today.dailyStyle.saveError)).toBeOnTheScreen();
  expect(view.getByTestId('daily-formality-sheet')).toBeOnTheScreen();
});

// O3: one sheet, no system alert. The current day type is checked, Now is the default, and
// the confirmation hands the day type and the departure to the application in one call.
test('Ask the stylist again opens one sheet and confirms through the application', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  let finish!: () => void;
  const settled = new Promise<void>((resolve) => { finish = resolve; });
  const reask = jest.fn(async () => ({ settled }));
  const regenerate = jest.fn(async () => null);
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
      recommendation={recommendationReady()} resolvedDressStyle="smart"
      dressingDayKey="2026-08-13" dressingDayChoiceReady recommendationRegenerate={regenerate}
      reask={reask} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  expect(view.queryByTestId('today-day-type-pill')).toBeNull();
  expect(view.queryByTestId('ask-again-sheet')).toBeNull();
  await fireEvent.press(view.getByTestId('today-ask-again'));
  expect(view.getByTestId('ask-again-sheet')).toBeOnTheScreen();
  expect(alert).not.toHaveBeenCalled();
  expect(view.getByTestId('ask-again-day-type-smart').props.accessibilityState.selected).toBe(true);
  expect(view.getByTestId('ask-again-confirm')).toHaveTextContent(messages.en.today.askAgain.chooseNow);

  // Closing keeps the outfit and asks nothing.
  await fireEvent.press(view.getByTestId('ask-again-close'));
  expect(view.queryByTestId('ask-again-sheet')).toBeNull();
  expect(reask).not.toHaveBeenCalled();

  await fireEvent.press(view.getByTestId('today-ask-again'));
  await fireEvent.press(view.getByTestId('ask-again-day-type-formal'));
  await fireEvent.press(view.getByTestId('ask-again-confirm'));
  expect(reask).toHaveBeenCalledWith({ formality: 'formal', departureAt: null, timeZone: 'Europe/Istanbul' });
  expect(regenerate).not.toHaveBeenCalled();
  await waitFor(() => expect(view.queryByTestId('ask-again-sheet')).toBeNull());
  await act(async () => { finish(); await settled; });
  alert.mockRestore();
});

// Tour finding: a confirmed Later departure that is still ahead reopens the sheet on Later
// at that time, not on Now.
test('Ask the stylist again reopens on the persisted Later departure', async () => {
  const reask = jest.fn(async () => ({ settled: Promise.resolve() }));
  const departureAt = new Date(Math.floor(Date.now() / 900000) * 900000 + 2 * 3600000).toISOString();
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
      recommendation={recommendationReady()} resolvedDressStyle="smart"
      dressingDayKey="2026-08-13" dressingDayChoiceReady reask={reask}
      activeDeparture={{ id: 'departure-1', localProfileId: 'profile-1', dayKey: '2026-08-13', departureAt,
        timeZone: 'Europe/Istanbul', createdAt: departureAt, updatedAt: departureAt, deletedAt: null }}
      wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );
  await fireEvent.press(view.getByTestId('today-ask-again'));
  expect(view.getByTestId('ask-again-departure')).toBeOnTheScreen();
  expect(view.getByTestId('ask-again-confirm'))
    .not.toHaveTextContent(messages.en.today.askAgain.chooseNow);
  await fireEvent.press(view.getByTestId('ask-again-confirm'));
  expect(reask).toHaveBeenCalledWith({ formality: 'smart', departureAt, timeZone: 'Europe/Istanbul' });
});

// M18: the day type and the day's styles are one write, and the generation it starts
// already carries both, so the approved triggers find nothing left to answer.
test('the step 2 answer reaches the recommendation in the same write and generation', async () => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  mockRecommendationSnapshot = {
    ...saved.snapshot,
    catalogVersion: garmentCatalogVersion,
    localDayKey: '2026-09-24',
    dressStyle: 'smart',
    styleAesthetics: ['classic'],
  };
  mockChoiceGet.mockResolvedValue(null);
  mockChoiceUpsert.mockImplementation(async (_profile: string, dayKey: string, formality: string,
    source: string, styleAesthetics?: readonly string[]) => ({
    id: '0f0e2c1a-8b52-4c0e-9d57-1d3c9c1c2a10', localProfileId: 'profile-one', dayKey, formality,
    source, styleAesthetics: styleAesthetics ? [...styleAesthetics].sort() : null,
    createdAt: '2026-09-24T06:00:00.000Z', updatedAt: '2026-09-24T06:00:00.000Z', deletedAt: null,
  }));
  jest.useFakeTimers({
    now: new Date('2026-09-24T06:30:00.000Z'),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(() => new Promise(() => undefined));
  try {
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()}
        profile={profileValue({ morningSheetEnabled: true, styleAesthetics: ['classic'] })}
        recommendation={saved} liveRecommendationProvider
        wardrobe={wardrobeValue()} weather={weatherValue()}>
        <TodayRoute />
      </Providers>,
    );
    await fireEvent.press(await view.findByTestId('daily-formality-casual'));
    expect(view.getByTestId('daily-formality-styles-classic').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(view.getByTestId('daily-formality-styles-classic'));
    await fireEvent.press(view.getByTestId('daily-formality-styles-minimal'));
    expect(refresh).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId('daily-formality-styles-done'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(mockChoiceUpsert).toHaveBeenCalledTimes(1);
    expect(mockChoiceUpsert).toHaveBeenCalledWith(
      'profile-one', '2026-09-24', 'casual', 'morning', ['minimal']);
    await act(async () => { await Promise.resolve(); });
    // Every generation after the answer asks for both answers; none for the old day.
    for (const [, input] of refresh.mock.calls) {
      expect(input).toMatchObject({ dressStyle: 'casual', styleAesthetics: ['minimal'] });
    }
    expect(refresh.mock.calls[0][0]).toBe('dress-style-changed');
    // The approved triggers see the same answers, so any request they make is the identical
    // one, which the controller joins to the request in flight instead of starting another.
    for (const [trigger, input] of refresh.mock.calls.slice(1)) {
      expect(trigger).toBe('dress-style-changed');
      expect(input).toEqual(refresh.mock.calls[0][1]);
    }
  } finally {
    refresh.mockRestore();
    jest.useRealTimers();
  }
});

// A Later choice past the day boundary plans the next dressing day without changing Today.
test('a Later re-ask crossing 18:00 stores the future choice without replacing Today', async () => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  mockRecommendationSnapshot = {
    ...saved.snapshot,
    catalogVersion: garmentCatalogVersion,
    localDayKey: '2026-09-24',
    dressStyle: 'smart',
  };
  const current = mockRecommendationSnapshot;
  const row = (dayKey: string, formality: string, source: string) => ({
    id: '0f0e2c1a-8b52-4c0e-9d57-1d3c9c1c2a10',
    localProfileId: 'profile-one', dayKey, formality, source, styleAesthetics: null,
    createdAt: '2026-09-24T06:00:00.000Z', updatedAt: '2026-09-24T06:00:00.000Z', deletedAt: null });
  mockChoiceGet.mockResolvedValue(row('2026-09-24', 'smart', 'morning'));
  mockChoiceUpsert.mockImplementation(async (_profile: string, key: string, formality: string,
    source: string) => row(key, formality, source));
  jest.useFakeTimers({
    now: new Date('2026-09-24T14:30:00.000Z'),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(async () => null);
  try {
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
        recommendation={saved} liveRecommendationProvider
        wardrobe={wardrobeValue()} weather={weatherValue()}>
        <TodayRoute />
      </Providers>,
    );
    await waitFor(() => expect(view.getByTestId('today-ask-again')).toBeOnTheScreen());
    expect(refresh).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId('today-ask-again'));
    await fireEvent.press(view.getByTestId('ask-again-day-type-formal'));
    await fireEvent.press(view.getByTestId('ask-again-when-later'));
    await fireEvent.press(view.getByTestId('ask-again-confirm'));
    await waitFor(() => expect(mockChoiceUpsert).toHaveBeenCalledWith(
      'profile-one', '2026-09-24:evening', 'formal', 'chip'));
    expect(mockDepartureUpsert).toHaveBeenCalledTimes(1);
    expect(mockDepartureUpsert.mock.calls[0][1]).toBe('2026-09-24:evening');
    expect(refresh).not.toHaveBeenCalled();
    expect(mockRecommendationSnapshot).toBe(current);
  } finally {
    refresh.mockRestore();
    jest.useRealTimers();
  }
});

test('a new dressing day waits for its Later row before choosing outfits', async () => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  mockRecommendationSnapshot = { ...saved.snapshot,
    catalogVersion: garmentCatalogVersion, localDayKey: '2026-09-23' };
  mockChoiceGet.mockResolvedValue({
    id: '0f0e2c1a-8b52-4c0e-9d57-1d3c9c1c2a10', localProfileId: 'profile-one',
    dayKey: '2026-09-24', formality: 'formal', source: 'chip', styleAesthetics: null,
    createdAt: '2026-09-24T13:00:00.000Z', updatedAt: '2026-09-24T13:00:00.000Z',
    deletedAt: null,
  });
  let finishDeparture!: (value: unknown) => void;
  mockDepartureGet.mockImplementation(() => new Promise((resolve) => {
    finishDeparture = resolve;
  }));
  jest.useFakeTimers({ now: new Date('2026-09-24T13:00:00.000Z'),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(async () => null);
  const departureAt = '2026-09-24T14:00:00.000Z';
  try {
    await render(
      <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
        recommendation={saved} liveRecommendationProvider
        wardrobe={wardrobeValue()} weather={weatherValue()}>
        <TodayRoute />
      </Providers>,
    );
    await waitFor(() => expect(mockChoiceGet).toHaveBeenCalledWith('profile-one', '2026-09-24'));
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      finishDeparture({ id: 'departure-one', localProfileId: 'profile-one',
        dayKey: '2026-09-24', departureAt, timeZone: 'Europe/Istanbul',
        createdAt: departureAt, updatedAt: departureAt, deletedAt: null });
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(refresh.mock.calls[0][1].departureAt).toBe(departureAt);
    expect(refresh.mock.calls[0][1].dressStyle).toBe('formal');
  } finally {
    refresh.mockRestore();
    jest.useRealTimers();
  }
});

// N20: the first foreground open after 18:00 asks the evening question with nothing checked,
// and closing it answers the evening with the profile's dress style (P6).
test('the evening sheet arrives empty and its dismissal uses the profile dress style', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const chooseFormality = jest.fn(async () => undefined);
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ morningSheetEnabled: true, dressStyle: 'formal' })}
      recommendation={recommendationReady()} resolvedDressStyle="formal"
      dressingDayKey="2026-08-13:evening" dressingDayChoiceReady eveningChoicePending
      chooseFormality={chooseFormality} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  const copy = messages.en.today.dailyStyle;
  expect(await view.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
  expect(view.getByText(copy.questionEvening)).toBeOnTheScreen();
  expect(view.getAllByRole('radio').map((tile) => tile.props.accessibilityState.selected))
    .toEqual([false, false, false]);
  expect(view.queryByTestId('daily-formality-smart-check')).toBeNull();

  await fireEvent.press(view.getByTestId('daily-formality-close'));
  expect(alert).not.toHaveBeenCalled();
  expect(chooseFormality).toHaveBeenCalledTimes(1);
  expect(chooseFormality).toHaveBeenCalledWith('2026-08-13:evening', 'formal', 'morning');
  alert.mockRestore();
});

// S3: after a place switch the previous place's snapshot is the last valid result, but it is
// never shown under the new place's name. Today waits, or states the failure.
test('a retained previous-place snapshot never renders under the new place', async () => {
  const newPlace = { ...todayActiveLocation, locationKey: 'manual:sample.ankara', displayName: 'Ankara' };
  const props = { productAnalytics: createProductAnalytics(), profile: profileValue(),
    recommendation: recommendationReady(), wardrobe: wardrobeValue() };
  const view = await render(
    <Providers {...props} weather={weatherValue({ activeLocation: newPlace, freshness: 'stale',
      isRefreshing: true })}>
      <TodayRoute />
    </Providers>,
  );
  expect(view.getByTestId('today-loading-screen')).toBeOnTheScreen();
  expect(view.queryByText('Ankara')).toBeNull();
  expect(view.queryByTestId('today-title')).toBeNull();

  await view.rerender(
    <Providers {...props} weather={weatherValue({ activeLocation: newPlace, freshness: 'stale',
      refreshFailure: 'offline' })}>
      <TodayRoute />
    </Providers>,
  );
  expect(view.getByTestId('today-unavailable-screen')).toBeOnTheScreen();
  expect(view.queryByTestId('today-title')).toBeNull();
});

test.each([
  ['Today', TodayRoute],
  ['outfit detail', OutfitDetailRoute],
])('%s only presents the active place\'s saved outfit', async (_screen, Route) => {
  mockParams = { id: todayOutfitId(1) };
  const newPlace = { ...todayActiveLocation, locationKey: 'manual:sample.ankara', displayName: 'Ankara' };
  const newWeather = { ...todayScreenState.snapshot.weather, id: 'ankara-weather',
    locationKey: newPlace.locationKey };
  const saved = recommendationReady();
  const props = { productAnalytics: createProductAnalytics(), profile: profileValue(),
    wardrobe: wardrobeValue() };
  const renderPlace = (weather: WeatherApplicationValue, recommendation: RecommendationApplicationState,
    dressingDayChoiceFailed = false) => (
    <Providers {...props} weather={weather} recommendation={recommendation}
      dressingDayChoiceFailed={dressingDayChoiceFailed}
      dressingDayChoiceReady={dressingDayChoiceFailed ? false : undefined}>
      <Route />
    </Providers>
  );
  const view = await render(renderPlace(weatherValue(), saved));
  expect(view.getByText(messages.en.recommendation.archetypes.rain_ready)).toBeOnTheScreen();

  // B's weather has arrived, but its selection still has A's saved row as last known good.
  const atNewPlace = weatherValue({ activeLocation: newPlace, snapshot: newWeather });
  await view.rerender(renderPlace(atNewPlace, saved));
  expect(view.queryByText(messages.en.recommendation.archetypes.rain_ready)).toBeNull();
  expect(view.getByRole('header', { name: messages.en.today.loadingTitle })).toBeOnTheScreen();

  await view.rerender(renderPlace(atNewPlace, saved, true));
  expect(view.queryByText(messages.en.recommendation.archetypes.rain_ready)).toBeNull();
  expect(view.getByRole('header', { name: messages.en.today.unavailableTitle })).toBeOnTheScreen();

  await view.rerender(renderPlace(atNewPlace, recommendationReady({ isRefreshing: true })));
  expect(view.queryByText(messages.en.recommendation.archetypes.rain_ready)).toBeNull();
  expect(view.getByRole('header', { name: messages.en.today.loadingTitle })).toBeOnTheScreen();

  // A failed selection leaves A's saved row available when returning, never on B's screen.
  await view.rerender(renderPlace(atNewPlace, recommendationReady({ lastFailure: 'offline' })));
  expect(view.queryByText(messages.en.recommendation.archetypes.rain_ready)).toBeNull();
  expect(view.getByRole('header', { name: messages.en.weather.offlineTitle })).toBeOnTheScreen();

  await view.rerender(renderPlace(weatherValue(), saved));
  expect(view.getByText(messages.en.recommendation.archetypes.rain_ready)).toBeOnTheScreen();
});

// f7: a morning or evening answer dims the outfit under a line that says what is
// happening, and the badge waits for the new outfit's own source.
test('a day-type change dims the outfit and says it is updating until the new one lands', async () => {
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
      recommendation={recommendationReady({ isRefreshing: true })} resolvedDressStyle="formal"
      dressingDayKey="2026-08-13" dressingDayChoiceReady
      wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  expect(view.queryByTestId('today-day-type-pill')).toBeNull();
  expect(view.getByTestId('today-updating-status'))
    .toHaveTextContent(messages.en.today.dailyStyle.updating.formal);
  expect(view.queryByTestId('today-provenance-badge')).toBeNull();

  await view.rerender(
    <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
      recommendation={recommendationReady({ snapshot: {
        ...(recommendationReady() as Extract<RecommendationApplicationState, { status: 'ready' }>).snapshot!,
        dressStyle: 'formal',
      } })} resolvedDressStyle="formal"
      dressingDayKey="2026-08-13" dressingDayChoiceReady
      wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );
  expect(view.queryByTestId('today-updating-status')).toBeNull();
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
  expect(result.getByTestId('first-generation-runway')).toBeOnTheScreen();
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
  expect(result.queryByTestId('first-generation-runway')).toBeNull();
  expect(result.getByTestId('today-freshness')).toHaveTextContent(messages.en.today.phase['asking-stylist']);
});

test('pull-to-refresh with a valid recommendation refreshes weather without regenerating', async () => {
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

  await waitFor(() => expect(weather.refresh).toHaveBeenCalledTimes(1));
  expect(recommendationRefresh).not.toHaveBeenCalled();
  expect(order).toEqual(['weather']);
  expect(productAnalytics.analytics.captures.map((c) => c.name)).toContain('manual_refresh_triggered');
  expect(productAnalytics.analytics.captures.map((c) => c.name)).not.toContain('retry_after_failure_triggered');
});

test('pull-to-refresh retries an unavailable recommendation after weather settles', async () => {
  const productAnalytics = createProductAnalytics();
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
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={recommendationReady({ snapshot: null, lastFailure: 'unavailable' })}
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
  expect(productAnalytics.analytics.captures.find(({ name }) =>
    name === 'retry_after_failure_triggered')?.properties).toEqual({
    schema_version: 3, surface: 'today', attempt_number: 1, result: 'failure',
  });
});

test('pull-to-refresh skips retry when an outfit arrives during weather refresh', async () => {
  let resolveWeather!: () => void;
  const productAnalytics = createProductAnalytics();
  let currentRecommendation = recommendationReady({ snapshot: null, lastFailure: 'unavailable' });
  const weather = {
    ...weatherValue(),
    refresh: jest.fn(() => new Promise<void>((resolve) => { resolveWeather = resolve; })),
  };
  const recommendationRefresh = jest.fn(async () => null);
  const result = await render(
    <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={currentRecommendation}
      recommendationGetSnapshot={() => currentRecommendation}
      recommendationRefresh={recommendationRefresh}
      wardrobe={wardrobeValue()}
      weather={weather}>
      <TodayRoute />
    </Providers>,
  );

  await act(async () => result.getByTestId('today-screen').props.refreshControl.props.onRefresh());
  currentRecommendation = recommendationReady();
  await act(async () => resolveWeather());

  expect(weather.refresh).toHaveBeenCalledTimes(1);
  expect(recommendationRefresh).not.toHaveBeenCalled();
  expect(productAnalytics.analytics.captures.find(({ name }) =>
    name === 'retry_after_failure_triggered')?.properties).toEqual({
    schema_version: 3, surface: 'today', attempt_number: 1, result: 'success',
  });
});

test('pull-to-refresh clears a saved outfit failure when its approved inputs are current', async () => {
  const productAnalytics = createProductAnalytics();
  const recommendationRefresh = jest.fn(async () => null);
  const store = recommendationStateStore(recommendationReady({ lastFailure: 'unavailable' }));
  const recommendationEvaluateApprovedTriggers = jest.fn(async (foreground?: boolean) => {
    if (!foreground) store.set(recommendationReady());
  });
  function Scenario() {
    const recommendation = useSyncExternalStore(store.subscribe, store.getSnapshot);
    return <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={recommendation}
      recommendationGetSnapshot={store.getSnapshot}
      recommendationRefresh={recommendationRefresh}
      recommendationEvaluateApprovedTriggers={recommendationEvaluateApprovedTriggers}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>;
  }
  const result = await render(
    <Scenario />,
  );
  productAnalytics.analytics.captures.length = 0;
  recommendationEvaluateApprovedTriggers.mockClear();
  expect(result.getByTestId('today-freshness')).toHaveTextContent(/Couldn't refresh/);

  await act(async () => result.getByTestId('today-screen').props.refreshControl.props.onRefresh());

  expect(recommendationRefresh).not.toHaveBeenCalled();
  expect(recommendationEvaluateApprovedTriggers).toHaveBeenCalledWith();
  expect(result.getByTestId('today-archetype')).toBeOnTheScreen();
  expect(result.getByTestId('today-freshness')).not.toHaveTextContent(/Couldn't refresh/);
  expect(productAnalytics.analytics.captures.find(({ name }) =>
    name === 'retry_after_failure_triggered')?.properties).toEqual({
    schema_version: 3, surface: 'today', attempt_number: 1, result: 'success',
  });
});

test('a failed weather refresh with the same snapshot skips recommendation regeneration', async () => {
  const productAnalytics = createProductAnalytics();
  const weather = weatherValue({ refreshFailure: 'offline' });
  const recommendationRefresh = jest.fn(async () => null);
  const store = recommendationStateStore(recommendationReady({ lastFailure: 'unavailable' }));
  const recommendationEvaluateApprovedTriggers = jest.fn(async (foreground?: boolean) => {
    if (!foreground) store.set(recommendationReady());
  });
  function Scenario() {
    const recommendation = useSyncExternalStore(store.subscribe, store.getSnapshot);
    return <Providers
      productAnalytics={productAnalytics}
      profile={profileValue()}
      recommendation={recommendation}
      recommendationGetSnapshot={store.getSnapshot}
      recommendationRefresh={recommendationRefresh}
      recommendationEvaluateApprovedTriggers={recommendationEvaluateApprovedTriggers}
      wardrobe={wardrobeValue()}
      weather={weather}>
      <TodayRoute />
    </Providers>;
  }
  const result = await render(
    <Scenario />,
  );
  recommendationEvaluateApprovedTriggers.mockClear();

  await act(async () => result.getByTestId('today-screen').props.refreshControl.props.onRefresh());
  await waitFor(() => expect(
    productAnalytics.analytics.captures.some(({ name }) => name === 'retry_after_failure_triggered'),
  ).toBe(true));

  expect(weather.refresh).toHaveBeenCalledTimes(1);
  expect(recommendationRefresh).not.toHaveBeenCalled();
  expect(recommendationEvaluateApprovedTriggers).toHaveBeenCalledWith();
  expect(result.getByTestId('today-freshness')).toHaveTextContent(/Couldn't refresh/);
  expect(productAnalytics.analytics.captures.find(({ name }) =>
    name === 'retry_after_failure_triggered')?.properties).toEqual({
    schema_version: 3, surface: 'today', attempt_number: 1, result: 'failure',
  });
});

test('focusing Today asks the recommendation provider to re-evaluate the local day', async () => {
  const reevaluateLocalDay = jest.fn();
  const recommendationEvaluateApprovedTriggers = jest.fn(async () => undefined);
  await render(
    <Providers
      productAnalytics={createProductAnalytics()}
      profile={profileValue()}
      recommendation={recommendationReady()}
      recommendationEvaluateApprovedTriggers={recommendationEvaluateApprovedTriggers}
      reevaluateLocalDay={reevaluateLocalDay}
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  expect(reevaluateLocalDay).toHaveBeenCalledTimes(1);
  expect(recommendationEvaluateApprovedTriggers).toHaveBeenCalledWith(true);
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

test('an exhausted recommendation (A7) hides the ask-again control and puts nothing in its place', async () => {
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
  expect(result.queryByTestId('today-ask-again')).toBeNull();
  expect(result.queryByRole('button', { name: messages.en.today.askAgain.action })).toBeNull();
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
  // O14: the way back is the system's glass capsule in the native bar, named for Today; the
  // screen draws no back control of its own, not even in the unavailable state.
  expect(mockStackScreen).toHaveBeenLastCalledWith({
    options: { headerBackTitle: messages.en.navigation.today, headerShown: true, headerTitle: '' },
  });
  expect(result.queryByTestId('outfit-detail-back')).toBeNull();
  // In view, the page stays put rather than being popped under the reader.
  expect(mockDispatch).not.toHaveBeenCalled();
});

test('a regeneration that drops the outfit while detail is off screen returns Today to its root', async () => {
  mockParams = { id: todayOutfitId(1) };
  if (todayRecommendation.status !== 'recommended') throw new Error('fixture');
  const props = {
    productAnalytics: createProductAnalytics(),
    profile: profileValue(),
    wardrobe: wardrobeValue(),
    weather: weatherValue(),
  };
  const [first, second, third] = todayRecommendation.outfits;
  const ready = recommendationReady();
  if (ready.status !== 'ready' || !ready.snapshot) throw new Error('fixture');
  const withOutfits = (outfits: typeof todayRecommendation.outfits) => ({
    ...ready,
    snapshot: { ...ready.snapshot!, recommendation: { ...todayRecommendation, outfits } },
  });
  mockFocused = false;
  try {
    // Off screen with the outfit still offered, detail stays where it is.
    const result = await render(
      <Providers {...props} recommendation={withOutfits([second, first, third])}>
        <OutfitDetailRoute />
      </Providers>,
    );
    expect(mockDispatch).not.toHaveBeenCalled();

    await result.rerender(
      <Providers {...props} recommendation={withOutfits([second, third])}>
        <OutfitDetailRoute />
      </Providers>,
    );
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'POP_TO_TOP' });
  } finally {
    mockFocused = true;
  }
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

test('the piece sheet adds an untracked piece to the Closet with entry_point outfit_detail', async () => {
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

  await fireEvent.press(result.getByTestId(`outfit-detail-piece-${firstDetailGarmentTypeId}`));
  expect(result.getByText(messages.en.wardrobe.pieceSheetAddTitle)).toBeOnTheScreen();
  // Done waits for the ownership answer; the colour starts on the outfit's own family.
  expect(result.getByTestId('piece-edit-done').props.accessibilityState.disabled).toBe(true);
  const suggestedFamily = result.getAllByRole('radio').find((radio) =>
    radio.props.testID?.startsWith('wardrobe-color-') && radio.props.accessibilityState.selected);
  expect(suggestedFamily).toBeDefined();
  await fireEvent.press(result.getByTestId('piece-edit-owned'));
  await fireEvent.press(result.getByTestId('piece-edit-done'));

  const family = suggestedFamily!.props.testID.replace('wardrobe-color-', '');
  expect(wardrobe.createItem).toHaveBeenCalledWith({
    garmentTypeId: firstDetailGarmentTypeId, entryState: 'owned', colorFamily: family,
  });
  await waitFor(() => expect(result.queryByTestId('piece-edit-sheet')).toBeNull());
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

test('the piece sheet edits the matching record, with a photo from the library', async () => {
  mockParams = { id: todayOutfitId(1) };
  const productAnalytics = createProductAnalytics();
  const existing = wardrobeItem({ entryState: 'wanted' });
  const stagedPhoto = { previewUri: 'file:///cache/kuyara/wardrobe/staging/one.jpg' };
  const wardrobe = wardrobeValue({
    state: {
      status: 'ready', items: [existing], isRefreshing: false, isMutating: false,
      refreshFailure: null,
    },
    preparePhoto: jest.fn(async () => stagedPhoto),
    updateItem: jest.fn(async () => ({ ...existing, entryState: 'owned', colorFamily: 'green' })),
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

  await fireEvent.press(result.getByTestId(`outfit-detail-piece-${firstDetailGarmentTypeId}`));
  expect(result.getByText(messages.en.wardrobe.pieceSheetEditTitle)).toBeOnTheScreen();
  expect(result.getByTestId('piece-edit-wanted').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(result.getByTestId('piece-edit-owned'));
  await fireEvent.press(result.getByTestId('wardrobe-color-green'));
  await fireEvent.press(result.getByTestId('piece-edit-photo-select'));
  await waitFor(() => expect(result.getByTestId('piece-edit-photo-preview')).toBeOnTheScreen());
  await fireEvent.press(result.getByTestId('piece-edit-done'));

  expect(wardrobe.updateItem).toHaveBeenCalledWith(
    'item-one',
    { entryState: 'owned', colorFamily: 'green' },
    { kind: 'replace', stagedPhoto },
  );
  await waitFor(() => expect(productAnalytics.analytics.captures).toContainEqual({
    name: 'closet_item_updated',
    properties: {
      schema_version: 3,
      fields_changed: ['color_family', 'state', 'photo'],
      garment_type_id: firstDetailGarmentTypeId,
      entry_point: 'outfit_detail',
    },
    options: undefined,
  }));
  // A saved photo belongs to the record now; closing the sheet never discards it.
  expect(wardrobe.discardStagedPhoto).not.toHaveBeenCalled();
});

// ADR 0038: "Wore this today" writes one row per dressing day under its bare date. The same
// look is never written twice, and another look replaces the day only after a confirmation.
test('wore this today records the outfit once per dressing day', async () => {
  mockParams = { id: todayOutfitId(1) };
  if (todayRecommendation.status !== 'recommended') throw new Error('fixture');
  let stored: WornOutfit | null = null;
  const outfitHistory = {
    list: jest.fn(async () => []),
    get: jest.fn(async () => stored ? { outfit: stored } as never : null),
    log: jest.fn(async (_day: string, outfit: WornOutfit) => {
      stored = outfit;
      return { outfit } as never;
    }),
  };
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const props = {
    productAnalytics: createProductAnalytics(),
    profile: profileValue(),
    recommendation: recommendationReady(),
    wardrobe: wardrobeValue(),
    weather: weatherValue(),
    dressingDayKey: '2026-08-13:evening',
    outfitHistory,
  };
  const result = await render(<Providers {...props}><OutfitDetailRoute /></Providers>);

  await waitFor(() => expect(outfitHistory.get).toHaveBeenCalledWith('2026-08-13'));
  await fireEvent.press(await result.findByTestId('outfit-detail-wore-this'));
  expect(outfitHistory.log).toHaveBeenCalledTimes(1);
  expect(outfitHistory.log).toHaveBeenCalledWith('2026-08-13', wornOutfitFrom(todayRecommendation.outfits[0]));
  expect(await result.findByTestId('outfit-detail-worn')).toBeOnTheScreen();
  expect(result.queryByTestId('outfit-detail-wore-this')).toBeNull();
  expect(props.productAnalytics.analytics.names()).not.toContain('outfit_worn_logged');

  // Another outfit of the same day asks before it replaces the record.
  mockParams = { id: todayOutfitId(2) };
  await result.rerender(<Providers {...props}><OutfitDetailRoute /></Providers>);
  await fireEvent.press(await result.findByTestId('outfit-detail-wore-this'));
  expect(alert).toHaveBeenCalledTimes(1);
  expect(alert.mock.calls[0][0]).toBe(messages.en.today.wornReplaceTitle);
  expect(outfitHistory.log).toHaveBeenCalledTimes(1);
  const confirm = alert.mock.calls[0][2]?.find(({ style }) => style === 'destructive');
  await act(async () => { confirm?.onPress?.(); });
  expect(outfitHistory.log).toHaveBeenCalledTimes(2);
  expect(outfitHistory.log).toHaveBeenLastCalledWith('2026-08-13', wornOutfitFrom(todayRecommendation.outfits[1]));
  alert.mockRestore();
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
