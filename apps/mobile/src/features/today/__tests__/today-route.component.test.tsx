import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Alert, AppState, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LaunchRevealContext } from '@/components/ui/launch-curtain';
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
import { defaultDressStyle, type LocalProfile } from '@/features/profile/domain/profile';
import {
  RecommendationApplicationContext,
  type RecommendationApplicationValue,
  useRecommendationApplication,
} from '@/features/recommendation/application/recommendation-application-context';
import { refreshAfterPull } from '@/features/recommendation/application/pull-refresh';
import { composeOutfitPool, outfitOptionId } from '@/features/recommendation/application/recommend-outfits';
import type { RecommendationApplicationState } from '@/features/recommendation/application/recommendation-application-controller';
import {
  RecommendationRepositoryError,
  type RecommendationSnapshot,
} from '@/features/recommendation/data/recommendation-repository';
import { SqliteOutfitHistoryRepository } from '@/features/recommendation/data/sqlite-outfit-history-repository';
import { RoutedAiClient } from '@/features/recommendation/data/routed-ai-client';
import * as tomorrowPreview from '@/features/recommendation/application/tomorrow-preview';
import { slotCandidates } from '@/features/recommendation/domain/manual-mix';
import { wornOutfitFrom, wornPieceColorsFor, type WornOutfit } from '@/features/recommendation/domain/outfit-history';
import { todayActiveLocation, todayOutfitId, todayScreenState } from '@/features/today/__tests__/fixtures';
import { WalkthroughContext } from '@/features/walkthrough/application/walkthrough-context';
import { DailyFormalitySheet } from '@/features/today/presentation/daily-formality-sheet';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { garmentColorFamiliesBySlot } from '@/components/ui';
import { useClosetWearCounts } from '@/features/wardrobe/application/use-closet-wear-counts';
import { WardrobeApplicationContext } from '@/features/wardrobe/application/wardrobe-application-context';
import { closetColorOptions, closetSolidSwatches } from '@/features/wardrobe/domain/closet-color-options';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import {
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const mockOpenSheetClosers: (() => void)[] = [];

// GlassButton draws the sheet close and the detail back as SwiftUI glass buttons.
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  // A pan-down is the platform closing the sheet and calling `onClose`; the test reads the
  // handler of the sheet that is showing.
  return { BottomSheet: ({ children, index, onClose }: {
    children: React.ReactNode; index: number; onClose?: () => void;
  }) => {
    if (index >= 0 && onClose) mockOpenSheetClosers.push(onClose);
    return index >= 0 ? React.createElement(View, null, children) : null;
  } };
});
// Compose around chosen pieces sits behind the account screens switch: each test injects it.
let mockAccountsOpen = false;
jest.mock('@/features/account/application/account-screens-flag', () => ({
  get ACCOUNT_SCREENS_ENABLED() {
    return mockAccountsOpen;
  },
}));
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
let mockParams: { id?: string; day?: string } = {};

const mockStackScreen = jest.fn();
const mockDispatch = jest.fn();
const mockNavigationListeners = new Map<string, (event: { data: { closing: boolean } }) => void>();
let mockFocused = true;
jest.mock('expo-router', () => {
  const actualReact = jest.requireActual('react');
  return {
    // Today's alternatives are the library's own links.
    Link: jest.requireActual('expo-router').Link,
    usePreventZoomTransitionDismissal: jest.fn(),
    Stack: {
      Screen: (props: unknown) => { mockStackScreen(props); return null; },
      // The detail's share button sits in the native toolbar, which draws nothing here.
      Toolbar: Object.assign(() => null, { Button: () => null }),
    },
    useFocusEffect: (callback: () => void | (() => void)) => actualReact.useEffect(callback, [callback]),
    useIsFocused: () => mockFocused,
    useNavigation: () => ({
      dispatch: mockDispatch,
      addListener: (name: string, listener: (event: { data: { closing: boolean } }) => void) => {
        mockNavigationListeners.set(name, listener);
        return () => mockNavigationListeners.delete(name);
      },
    }),
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
const mockRecommendationSave = jest.fn();
let mockLocalDayKey: string | null = '2026-09-24';
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
// The real sheet, recorded: the test sheet unmounts its content once closed, so what a native
// sheet draws while it animates out is read from the props it received.
jest.mock('@/features/today/presentation/daily-formality-sheet', () => {
  const actual = jest.requireActual('@/features/today/presentation/daily-formality-sheet');
  return { ...actual, DailyFormalitySheet: jest.fn(actual.DailyFormalitySheet) };
});
// Live provider tests choose whether the stub store has a saved recommendation.
jest.mock('@/features/recommendation/data/recommendation-repository', () => ({
  ...jest.requireActual('@/features/recommendation/data/recommendation-repository'),
  LocalRecommendationRepository: class {
    async getSnapshot() {
      if (mockRecommendationReadError) throw mockRecommendationReadError;
      return mockRecommendationSnapshot;
    }
    saveSnapshot(...args: unknown[]) { return mockRecommendationSave(...args); }
  },
}));
jest.mock('@/features/recommendation/application/recommendation-application-controller', () => {
  const actual = jest.requireActual(
    '@/features/recommendation/application/recommendation-application-controller',
  );
  return {
    ...actual,
    localDayKey: (date: Date) => mockLocalDayKey ?? actual.localDayKey(date),
    localDayKind: () => 'weekday',
    localDayVariant: () => 0,
  };
});

const todayRecommendation = todayScreenState.snapshot.recommendation;

// The garment the first offered outfit leads with, read from the presentation the detail
// screen renders rather than written down, so a change in the engine's offer order moves the
// caption lookups and the Closet entry they create with it.
const firstDetailGarmentTypeId = (() => {
  const presentation = createTodayPresentation(todayScreenState, 'en', false, 'celsius', Date.now());
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
      catalogVersion: garmentCatalogVersion,
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
    seedEmptyCloset: jest.fn(async () => [] as readonly WardrobeItem[]),
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
      // These tests exercise generation without the day question; the ones about it pass true.
      morningSheetEnabled: false,
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
      () => true,
    ),
    firstUses: new FirstUseTracker(new InMemoryFirstUseStore(), () => true),
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
  resolvedDressStyle = 'smart',
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
  tomorrowPreview = null,
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
  tomorrowPreview?: RecommendationApplicationValue['tomorrowPreview'];
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
      refreshAfterPull: () => refreshAfterPull({
        getSnapshot: recommendationGetSnapshot ?? (() => recommendation),
        refresh: recommendationRefresh,
        evaluateApprovedTriggers: () => recommendationEvaluateApprovedTriggers(),
      }),
      skipWait: jest.fn(async () => null),
      regenerate: recommendationRegenerate,
      resolvedDressStyle,
      profileDressStyle: profile.state.profile.dressStyle ?? defaultDressStyle,
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
      tomorrowPreview,
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
            beginConsentPresentation: () => 'gate-nonce',
            matchesConsentPresentation: () => false,
            clearConsentPresentation: () => undefined,
            answeringPresentation: null,
            answerConsentPresentation: (_nonce, answer) => answer(),
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
  mockAccountsOpen = false;
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
  mockRecommendationSave.mockReset();
  mockLocalDayKey = '2026-09-24';
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

test('the name sheet waits for the launch curtain to go', async () => {
  const profile = profileValue({ namePromptVersion: 0 });
  const route = (done: boolean) => (
    <Providers productAnalytics={createProductAnalytics()} profile={profile}
      recommendation={recommendationReady()} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <LaunchRevealContext value={{ revealing: true, done }}>
        <TodayRoute />
      </LaunchRevealContext>
    </Providers>
  );
  const view = await render(route(false));
  expect(view.queryByText(messages.en.onboarding.nameTitle)).toBeNull();

  await view.rerender(route(true));
  expect(await view.findByText(messages.en.onboarding.nameTitle)).toBeOnTheScreen();
});

test('the morning question waits for the launch curtain to go', async () => {
  const route = (done: boolean) => (
    <Providers {...morningPendingProps()} recommendation={recommendationReady({ snapshot: null })}
      weather={weatherValue()}>
      <LaunchRevealContext value={{ revealing: true, done }}>
        <TodayRoute />
      </LaunchRevealContext>
    </Providers>
  );
  const view = await render(route(false));
  expect(view.queryByTestId('daily-formality-sheet')).toBeNull();

  await view.rerender(route(true));
  expect(await view.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
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

test('the provider keeps the profile dress style apart from the day answer', async () => {
  function DressStyles() {
    const { resolvedDressStyle, profileDressStyle } = useRecommendationApplication();
    return <Text testID="dress-styles">{`${resolvedDressStyle}/${profileDressStyle}`}</Text>;
  }
  mockChoiceGet.mockImplementation(async (_profile: string, key: string) => ({
    id: '0f0e2c1a-8b52-4c0e-9d57-1d3c9c1c2a10', localProfileId: 'profile-one',
    dayKey: key, formality: 'formal', source: 'morning', styleAesthetics: null,
    createdAt: '2026-09-24T06:00:00.000Z', updatedAt: '2026-09-24T06:00:00.000Z',
    deletedAt: null,
  }));
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ dressStyle: 'casual' })} recommendation={recommendationReady()}
      liveRecommendationProvider wardrobe={wardrobeValue()} weather={weatherValue()}>
      <DressStyles />
    </Providers>,
  );

  await waitFor(() => expect(view.getByTestId('dress-styles')).toHaveTextContent('formal/casual'));
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
  expect(view.getByTestId('today-unavailable-screen')).toBeOnTheScreen();
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

test('a pull re-reads a failed day-choice read instead of leaving Today unavailable', async () => {
  mockChoiceGet.mockRejectedValueOnce(new Error('choice read failed'));
  const view = await render(
    <Providers
      productAnalytics={createProductAnalytics()}
      profile={profileValue({ morningSheetEnabled: true })}
      recommendation={recommendationReady()}
      liveRecommendationProvider
      wardrobe={wardrobeValue()}
      weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );
  expect(await view.findByTestId('today-unavailable-screen')).toBeOnTheScreen();
  expect(mockChoiceGet).toHaveBeenCalledTimes(1);

  mockChoiceGet.mockResolvedValueOnce(null);
  await act(async () => view.getByTestId('today-screen').props.refreshControl.props.onRefresh());

  await waitFor(() => expect(mockChoiceGet).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(view.queryByTestId('today-unavailable-screen')).toBeNull());
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

// The one-tap question: it names the profile's usual day type, one large
// button answers it, the other two day types sit below with nothing checked and answer in one
// tap too. Either answer writes the day type alone, so the Settings styles keep applying (N4).
test('the morning sheet answers the usual day type in one tap and closes', async () => {
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

  const copy = messages.en.today.dailyStyle;
  expect(await view.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
  expect(view.getByText(copy.usualQuestion.smart)).toBeOnTheScreen();
  expect(view.getByTestId('daily-formality-choices').props.accessibilityRole).toBe('radiogroup');
  const tiles = view.getAllByRole('radio');
  expect(tiles.map((tile) => tile.props.accessibilityLabel)).toEqual(['Casual', 'Formal']);
  expect(tiles.map((tile) => tile.props.accessibilityState.selected)).toEqual([false, false]);
  expect(view.queryByTestId('daily-formality-smart')).toBeNull();
  expect(view.getByTestId('daily-formality-close').props.accessibilityLabel).toBe(copy.close);

  await fireEvent.press(view.getByTestId('daily-formality-usual'));
  expect(chooseFormality).toHaveBeenCalledTimes(1);
  expect(chooseFormality).toHaveBeenCalledWith('2026-08-13', 'smart', 'morning', undefined);
  await waitFor(() => expect(view.queryByTestId('daily-formality-sheet')).toBeNull());
  expect(view.queryByText(copy.stylesQuestion)).toBeNull();
});

test('a day-type tile answers the morning question in one tap and closes', async () => {
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
  expect(chooseFormality).toHaveBeenCalledTimes(1);
  expect(chooseFormality).toHaveBeenCalledWith('2026-08-13', 'formal', 'morning', undefined);
  await waitFor(() => expect(view.queryByTestId('daily-formality-sheet')).toBeNull());
});

// M18 step 2 at the large detent (N7), opened only by "Pick styles for today": the day's styles
// start on what the day resolves to, and the changed answer rides one write with the usual day type.
test('the morning sheet step 2 writes the usual day type and the changed styles once', async () => {
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

  await fireEvent.press(await view.findByTestId('daily-formality-pick-styles'));
  expect(chooseFormality).not.toHaveBeenCalled();
  expect(view.getByTestId('daily-formality-styles-classic').props.accessibilityState.checked).toBe(true);
  expect(view.getByTestId('daily-formality-styles-note'))
    .toHaveTextContent(messages.en.today.dailyStyle.stylesNote);
  await fireEvent.press(view.getByTestId('daily-formality-styles-sporty'));
  await fireEvent.press(view.getByTestId('daily-formality-styles-done'));
  expect(chooseFormality).toHaveBeenCalledTimes(1);
  expect(chooseFormality).toHaveBeenCalledWith('2026-08-13', 'smart', 'morning', ['classic', 'sporty']);
  await waitFor(() => expect(view.queryByTestId('daily-formality-sheet')).toBeNull());
});

test('closing the sheet on step 2 answers the usual day type and leaves the styles alone', async () => {
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

  await fireEvent.press(await view.findByTestId('daily-formality-pick-styles'));
  await fireEvent.press(view.getByTestId('daily-formality-styles-minimal'));
  await fireEvent.press(view.getByTestId('daily-formality-close'));
  expect(chooseFormality).toHaveBeenCalledTimes(1);
  expect(chooseFormality).toHaveBeenCalledWith('2026-08-13', 'smart', 'morning');
});

// f25: the first dressing day greets with a welcome; its question, when asked, offers the setup
// answer as the usual one and checks nothing.
test('the first dressing day offers the setup answer as the usual one', async () => {
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ morningSheetEnabled: true, dressStyle: 'formal', displayName: 'Utku' })}
      recommendation={recommendationReady()} resolvedDressStyle="formal"
      dressingDayKey="2026-09-24" dressingDayChoiceReady morningChoicePending
      chooseFormality={jest.fn(async () => undefined)} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );

  expect(await view.findByText(messages.en.today.dailyStyle.usualQuestion.formal)).toBeOnTheScreen();
  expect(view.getAllByRole('radio').map((tile) => tile.props.accessibilityState.selected))
    .toEqual([false, false]);
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

test('the day question stays closed through loading when no active location follows', async () => {
  const props = morningPendingProps();
  const view = await render(
    <Providers {...props} recommendation={recommendationReady({ snapshot: null })}
      weather={{ ...weatherValue(), state: { status: 'loading' } }}>
      <TodayRoute />
    </Providers>,
  );
  expect(view.getByTestId('today-loading-screen')).toBeOnTheScreen();
  expect(view.queryByTestId('daily-formality-sheet')).toBeNull();

  await view.rerender(
    <Providers {...props} recommendation={recommendationReady({ snapshot: null })}
      weather={weatherValue({ activeLocation: null, snapshot: null, freshness: null })}>
      <TodayRoute />
    </Providers>,
  );
  expect(view.getByTestId('today-no-location')).toBeOnTheScreen();
  expect(view.queryByTestId('daily-formality-sheet')).toBeNull();
});

test('the day question stays closed when weather already failed during recommendation loading', async () => {
  const view = await render(
    <Providers {...morningPendingProps()} recommendation={{ status: 'loading' }}
      weather={weatherValue({ snapshot: null, freshness: null, refreshFailure: 'offline' })}>
      <TodayRoute />
    </Providers>,
  );
  expect(view.getByTestId('today-loading-screen')).toBeOnTheScreen();
  expect(view.queryByTestId('daily-formality-sheet')).toBeNull();
});

test('a missing recommendation without a failure waits without day-choice fixture fields', async () => {
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
      recommendation={recommendationReady({ snapshot: null })}
      wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );
  expect(view.getByTestId('today-loading-screen')).toBeOnTheScreen();
  expect(view.queryByTestId('today-unavailable-screen')).toBeNull();
});

test('a completed profile without a clothing preference cannot wait for generation', async () => {
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ gender: null, clothingPreference: null })}
      recommendation={recommendationReady({ snapshot: null })} liveRecommendationProvider
      wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );
  expect(await view.findByTestId('today-unavailable-screen')).toBeOnTheScreen();
  expect(view.queryByTestId('today-loading-screen')).toBeNull();
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

test('offline start after a catalog bump renders current fallback outfits and cached weather', async () => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  mockRecommendationSnapshot = { ...saved.snapshot, catalogVersion: garmentCatalogVersion - 1,
    localDayKey: '2026-09-24' };
  mockRecommendationSave.mockImplementation(async (_profileId, entry) => ({
    ...mockRecommendationSnapshot,
    id: 'current-catalog-recommendation',
    catalogVersion: entry.context.catalogVersion,
    localDayKey: entry.context.localDayKey,
    weatherSnapshotId: entry.weatherSnapshotId,
    locationKey: entry.locationKey,
    generationMode: entry.recommendation.generationMode,
    recommendation: entry.recommendation,
  }));
  const ai = jest.spyOn(RoutedAiClient.prototype, 'recommendRouted')
    .mockRejectedValue(new Error('offline'));
  const history = jest.spyOn(SqliteOutfitHistoryRepository.prototype, 'lastSeven')
    .mockResolvedValue([]);
  try {
    const cachedWeather = weatherValue({ freshness: 'stale', refreshFailure: 'offline' });
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
        recommendation={saved} liveRecommendationProvider wardrobe={wardrobeValue()}
        weather={cachedWeather}>
        <TodayRoute />
      </Providers>,
    );
    await waitFor(() => expect(mockRecommendationSave).toHaveBeenCalledTimes(1),
      { timeout: 5000 });
    await waitFor(() => expect(view.getByTestId('today-outfit-list')).toBeOnTheScreen());
    expect(ai).toHaveBeenCalledTimes(1);
    expect(mockRecommendationSave).toHaveBeenCalledTimes(1);
    const generated = mockRecommendationSave.mock.results[0].value as Promise<RecommendationSnapshot>;
    const current = await generated;
    expect(current.catalogVersion).toBe(garmentCatalogVersion);
    expect(current.recommendation.status).toBe('recommended');
    if (current.recommendation.status !== 'recommended') throw new Error('Expected fallback');
    expect(current.recommendation.outfits).toHaveLength(3);
    expect(current.generationMode).toBe('deterministic-fallback');
    expect(view.getByTestId('today-top-row')).toHaveTextContent(/Istanbul/);
    expect(view.getByTestId('today-title')).toHaveTextContent(/20/);
    expect(view.getByTestId('today-freshness')).toHaveTextContent(/06:05/);
    expect(view.queryByTestId('today-provenance-badge')).toBeNull();
    expect(view.queryByTestId('today-unavailable-screen')).toBeNull();
  } finally {
    ai.mockRestore();
    history.mockRestore();
  }
}, 10000);

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

// The save error belongs to the opening it happened in: a failed confirm followed by a
// successful pan-down leaves the next opening (here the evening question) clean and silent.
test('a save error from a failed confirm does not follow a successful dismissal into the next opening', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  const chooseFormality = jest.fn<Promise<void>, unknown[]>()
    .mockRejectedValueOnce(new Error('write failed'))
    .mockResolvedValue(undefined);
  const props = {
    productAnalytics: createProductAnalytics(),
    profile: profileValue({ morningSheetEnabled: true }),
    recommendation: recommendationReady(),
    resolvedDressStyle: 'smart' as const,
    dressingDayChoiceReady: true,
    chooseFormality,
    wardrobe: wardrobeValue(),
    weather: weatherValue(),
  };
  const view = await render(
    <Providers {...props} dressingDayKey="2026-08-13" morningChoicePending>
      <TodayRoute />
    </Providers>,
  );

  await fireEvent.press(await view.findByTestId('daily-formality-formal'));
  expect(await view.findByText(messages.en.today.dailyStyle.saveError)).toBeOnTheScreen();

  await fireEvent.press(view.getByTestId('daily-formality-close'));
  await waitFor(() => expect(view.queryByTestId('daily-formality-sheet')).toBeNull());
  expect(chooseFormality).toHaveBeenCalledTimes(2);
  announce.mockClear();

  await view.rerender(
    <Providers {...props} dressingDayKey="2026-08-13:evening" eveningChoicePending>
      <TodayRoute />
    </Providers>,
  );
  expect(await view.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
  expect(view.queryByText(messages.en.today.dailyStyle.saveError)).toBeNull();
  expect(announce).not.toHaveBeenCalled();
  announce.mockRestore();
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

// A pan-down during the write closes the sheet, so a failed write presents it again on its
// error line: the failure is never left on a sheet nobody can see.
test('Ask the stylist again closed by a pan-down while busy reopens on the error when the write fails', async () => {
  let fail!: () => void;
  const reask = jest.fn(() => new Promise<{ settled: Promise<void> }>((_, reject) => {
    fail = () => reject(new Error('write failed'));
  }));
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
      recommendation={recommendationReady()} resolvedDressStyle="smart"
      dressingDayKey="2026-08-13" dressingDayChoiceReady reask={reask}
      wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );
  await fireEvent.press(view.getByTestId('today-ask-again'));
  await fireEvent.press(view.getByTestId('ask-again-confirm'));
  expect(reask).toHaveBeenCalledTimes(1);
  const close = mockOpenSheetClosers.at(-1);
  expect(close).toBeDefined();
  await act(async () => { close!(); });
  expect(view.queryByTestId('ask-again-sheet')).toBeNull();
  await act(async () => { fail(); });
  await waitFor(() => expect(view.getByTestId('ask-again-sheet')).toBeOnTheScreen());
  expect(view.getByTestId('ask-again-error')).toBeOnTheScreen();
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
    await fireEvent.press(await view.findByTestId('daily-formality-pick-styles'));
    expect(view.getByTestId('daily-formality-styles-classic').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(view.getByTestId('daily-formality-styles-classic'));
    await fireEvent.press(view.getByTestId('daily-formality-styles-minimal'));
    expect(refresh).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId('daily-formality-styles-done'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(mockChoiceUpsert).toHaveBeenCalledTimes(1);
    expect(mockChoiceUpsert).toHaveBeenCalledWith(
      'profile-one', '2026-09-24', 'smart', 'morning', ['minimal']);
    await act(async () => { await Promise.resolve(); });
    // Every generation after the answer asks for both answers; none for the old day.
    for (const [, input] of refresh.mock.calls) {
      expect(input).toMatchObject({ dressStyle: 'smart', styleAesthetics: ['minimal'] });
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
// The boundary is the device clock's (the suite runs in UTC), whatever zone the place is in.
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
    now: new Date('2026-09-24T17:30:00.000Z'),
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

test('a rejected departure read still starts the first recommendation', async () => {
  mockRecommendationReadError = new RecommendationRepositoryError('invalid-data');
  mockDepartureGet.mockRejectedValueOnce(new Error('departure read failed'));
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(() => new Promise(() => undefined));
  try {
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
        recommendation={recommendationReady({ snapshot: null })} liveRecommendationProvider
        wardrobe={wardrobeValue()} weather={weatherValue()}>
        <TodayRoute />
      </Providers>,
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(view.getByTestId('today-loading-screen')).toBeOnTheScreen();
  } finally {
    refresh.mockRestore();
  }
});

test('cold evening open waits for its unanswered choice and generates once after dismissal', async () => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  mockLocalDayKey = null;
  jest.useFakeTimers({ now: new Date('2026-09-24T18:30:00.000Z'),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  mockRecommendationSnapshot = { ...saved.snapshot, localDayKey: '2026-09-24' };
  mockRecommendationReadError = new RecommendationRepositoryError('invalid-data');
  const analytics = createProductAnalytics();
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(() => new Promise(() => undefined));
  mockChoiceUpsert.mockImplementation(async (_profile: string, key: string, formality: string,
    source: string) => ({
    id: '0f0e2c1a-8b52-4c0e-9d57-1d3c9c1c2a10', localProfileId: 'profile-one',
    dayKey: key, formality, source, styleAesthetics: null,
    createdAt: '2026-09-24T18:00:00.000Z', updatedAt: '2026-09-24T18:00:00.000Z',
    deletedAt: null,
  }));
  try {
    const view = await render(
      <Providers productAnalytics={analytics}
        profile={profileValue({ morningSheetEnabled: true, dressStyle: 'formal' })}
        recommendation={saved} liveRecommendationProvider
        wardrobe={wardrobeValue()} weather={weatherValue()}>
        <TodayRoute />
      </Providers>,
    );
    expect(await view.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
    expect(view.getByTestId('today-loading-screen')).toBeOnTheScreen();
    expect(view.queryByTestId('today-unavailable-screen')).toBeNull();
    analytics.errorEpisodes.flushAll('session_end');
    expect(analytics.analytics.names()).not.toContain('error_shown');
    expect(refresh).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId('daily-formality-close'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(new Set(refresh.mock.calls.map(([, input]) => JSON.stringify(input))).size).toBe(1);
    expect(mockChoiceUpsert).toHaveBeenCalledWith(
      'profile-one', '2026-09-24:evening', 'formal', 'morning', undefined);
    expect(refresh.mock.calls[0][1].localDayKey).toBe('2026-09-24:evening');
  } finally {
    refresh.mockRestore();
    jest.useRealTimers();
  }
});

test.each([
  ['morning', '2026-09-24T08:30:00.000Z', '2026-09-24'],
  ['evening', '2026-09-24T18:30:00.000Z', '2026-09-24:evening'],
])('an answered %s question stays in the wait until generation begins', async (
  _question, at, key,
) => {
  mockLocalDayKey = null;
  jest.useFakeTimers({ now: new Date(at),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  mockRecommendationReadError = new RecommendationRepositoryError('invalid-data');
  let finishDeparture!: (value: null) => void;
  mockDepartureGet.mockImplementation(() => new Promise((resolve) => {
    finishDeparture = resolve;
  }));
  mockChoiceUpsert.mockImplementation(async (_profile: string, dayKey: string,
    formality: string, source: string) => ({
    id: '0f0e2c1a-8b52-4c0e-9d57-1d3c9c1c2a10', localProfileId: 'profile-one',
    dayKey, formality, source, styleAesthetics: null,
    createdAt: at, updatedAt: at, deletedAt: null,
  }));
  const analytics = createProductAnalytics();
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(() => new Promise(() => undefined));
  try {
    const view = await render(
      <Providers productAnalytics={analytics}
        profile={profileValue({ morningSheetEnabled: true })}
        recommendation={recommendationReady()} liveRecommendationProvider
        wardrobe={wardrobeValue()} weather={weatherValue()}>
        <TodayRoute />
      </Providers>,
    );
    expect(await view.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
    await fireEvent.press(view.getByTestId('daily-formality-close'));
    await waitFor(() => expect(view.queryByTestId('daily-formality-sheet')).toBeNull());
    expect(mockChoiceUpsert).toHaveBeenCalledWith(
      'profile-one', key, 'smart', 'morning', undefined);
    expect(refresh).not.toHaveBeenCalled();
    expect(view.getByTestId('today-loading-screen')).toBeOnTheScreen();
    expect(view.queryByTestId('today-unavailable-screen')).toBeNull();
    analytics.errorEpisodes.flushAll('session_end');
    expect(analytics.analytics.names()).not.toContain('error_shown');

    await act(async () => { finishDeparture(null); });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(refresh.mock.calls[0][1].localDayKey).toBe(key);
    expect(view.queryByTestId('today-unavailable-screen')).toBeNull();
  } finally {
    refresh.mockRestore();
    jest.useRealTimers();
  }
});

test('a warm process crossing 18:00 opens the evening question over a wait', async () => {
  mockLocalDayKey = null;
  jest.useFakeTimers({ now: new Date('2026-09-24T17:59:00.000Z'),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  mockRecommendationSnapshot = { ...saved.snapshot, catalogVersion: garmentCatalogVersion,
    localDayKey: '2026-09-24' };
  mockChoiceGet.mockImplementation(async (_profile: string, key: string) =>
    key === '2026-09-24' ? {
      id: '0f0e2c1a-8b52-4c0e-9d57-1d3c9c1c2a10', localProfileId: 'profile-one',
      dayKey: key, formality: 'smart', source: 'morning', styleAesthetics: null,
      createdAt: '2026-09-24T06:00:00.000Z', updatedAt: '2026-09-24T06:00:00.000Z',
      deletedAt: null,
    } : null);
  mockChoiceUpsert.mockImplementation(async (_profile: string, key: string, formality: string,
    source: string) => ({
    id: '0f0e2c1a-8b52-4c0e-9d57-1d3c9c1c2a10', localProfileId: 'profile-one',
    dayKey: key, formality, source, styleAesthetics: null,
    createdAt: '2026-09-24T18:00:00.000Z', updatedAt: '2026-09-24T18:00:00.000Z',
    deletedAt: null,
  }));
  const analytics = createProductAnalytics();
  let focusToday!: () => void;
  function ForegroundProbe() {
    const { reevaluateLocalDay } = useRecommendationApplication();
    useEffect(() => { focusToday = reevaluateLocalDay; }, [reevaluateLocalDay]);
    return null;
  }
  const history = jest.spyOn(SqliteOutfitHistoryRepository.prototype, 'lastSeven')
    .mockResolvedValue([]);
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(() => new Promise(() => undefined));
  try {
    const view = await render(
      <Providers productAnalytics={analytics} profile={profileValue({ morningSheetEnabled: true })}
        recommendation={saved} liveRecommendationProvider
        wardrobe={wardrobeValue()} weather={weatherValue()}>
        <ForegroundProbe />
        <TodayRoute />
      </Providers>,
    );
    await waitFor(() => expect(view.getByTestId('today-outfit-list')).toBeOnTheScreen());
    jest.setSystemTime(new Date('2026-09-24T18:00:00.000Z'));
    await act(async () => { focusToday(); });
    expect(await view.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
    expect(view.getByTestId('today-loading-screen')).toBeOnTheScreen();
    expect(view.queryByTestId('today-unavailable-screen')).toBeNull();
    analytics.errorEpisodes.flushAll('session_end');
    expect(analytics.analytics.names()).not.toContain('error_shown');
    expect(refresh).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId('daily-formality-close'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(mockChoiceUpsert).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls.every(([, input]) => input.localDayKey === '2026-09-24:evening'))
      .toBe(true);
    expect(new Set(refresh.mock.calls.map(([, input]) => JSON.stringify(input))).size).toBe(1);
  } finally {
    history.mockRestore();
    refresh.mockRestore();
    jest.useRealTimers();
  }
});

// A return from the background across a key flip asks the new key's question before anything
// is chosen, and its answer starts the one generation, with the new key's own Later departure
// rather than the previous key's answer.
test.each([
  ['evening', '2026-09-24T17:59:00.000Z', '2026-09-24T18:00:00.000Z', '2026-09-24',
    '2026-09-24:evening', '2026-09-24T19:30:00.000Z'],
  ['morning', '2026-09-24T03:59:00.000Z', '2026-09-24T04:00:00.000Z', '2026-09-23:evening',
    '2026-09-24', '2026-09-24T08:30:00.000Z'],
])('a warm return across the %s flip asks first and generates once with the new key', async (
  _question, before, after, previousKey, nextKey, departureAt,
) => {
  mockLocalDayKey = null;
  jest.useFakeTimers({ now: new Date(before),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  mockRecommendationSnapshot = { ...saved.snapshot, catalogVersion: garmentCatalogVersion,
    dressStyle: 'formal', localDayKey: previousKey };
  mockChoiceGet.mockImplementation(async (_profile: string, key: string) =>
    key === previousKey ? {
      id: '0f0e2c1a-8b52-4c0e-9d57-1d3c9c1c2a10', localProfileId: 'profile-one',
      dayKey: key, formality: 'formal', source: 'morning', styleAesthetics: null,
      createdAt: before, updatedAt: before, deletedAt: null,
    } : null);
  mockChoiceUpsert.mockImplementation(async (_profile: string, key: string, formality: string,
    source: string) => ({
    id: '1f0e2c1a-8b52-4c0e-9d57-1d3c9c1c2a10', localProfileId: 'profile-one',
    dayKey: key, formality, source, styleAesthetics: null,
    createdAt: after, updatedAt: after, deletedAt: null,
  }));
  mockDepartureGet.mockImplementation(async (_profile: string, key: string) =>
    key === nextKey ? { id: 'departure-one', localProfileId: 'profile-one', dayKey: key,
      departureAt, timeZone: 'Europe/Istanbul', createdAt: before, updatedAt: before,
      deletedAt: null } : null);
  const onChange: ((state: string) => void)[] = [];
  const appState = jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'change') onChange.push(listener as (state: string) => void);
    return { remove: jest.fn() };
  });
  const history = jest.spyOn(SqliteOutfitHistoryRepository.prototype, 'lastSeven')
    .mockResolvedValue([]);
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(() => new Promise(() => undefined));
  try {
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()}
        profile={profileValue({ morningSheetEnabled: true, dressStyle: 'smart' })}
        recommendation={saved} liveRecommendationProvider
        wardrobe={wardrobeValue()} weather={weatherValue()}>
        <TodayRoute />
      </Providers>,
    );
    await waitFor(() => expect(view.getByTestId('today-outfit-list')).toBeOnTheScreen());
    expect(refresh).not.toHaveBeenCalled();

    jest.setSystemTime(new Date(after));
    await act(async () => {
      onChange.forEach((listener) => listener('background'));
      onChange.forEach((listener) => listener('active'));
    });
    expect(await view.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
    expect(refresh).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId('daily-formality-close'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(mockChoiceUpsert).toHaveBeenCalledTimes(1);
    expect(mockChoiceUpsert).toHaveBeenCalledWith('profile-one', nextKey, 'smart', 'morning', undefined);
    expect(new Set(refresh.mock.calls.map(([, input]) => JSON.stringify(input))).size).toBe(1);
    expect(refresh.mock.calls[0][1]).toMatchObject({ localDayKey: nextKey, dressStyle: 'smart', departureAt });
  } finally {
    appState.mockRestore();
    history.mockRestore();
    refresh.mockRestore();
    jest.useRealTimers();
  }
});

// The day's first outfit is chosen from the weather a refresh already in flight brings, and from
// the weather it has when that refresh fails.
test.each([
  ['succeeds', true],
  ['fails', false],
])('the day\'s first generation waits for a weather refresh in flight and runs once it %s', async (
  _outcome, succeeds,
) => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  mockRecommendationSnapshot = { ...saved.snapshot, catalogVersion: garmentCatalogVersion,
    localDayKey: '2026-09-23' };
  const history = jest.spyOn(SqliteOutfitHistoryRepository.prototype, 'lastSeven')
    .mockResolvedValue([]);
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(() => new Promise(() => undefined));
  const stale = todayScreenState.snapshot.weather;
  const fresh = { ...stale, id: '118f0f4d-1d45-4ae7-a8f1-796e8297d3b4' };
  const tree = (weather: WeatherApplicationValue) => (
    <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
      recommendation={saved} liveRecommendationProvider
      wardrobe={wardrobeValue()} weather={weather}>
      <TodayRoute />
    </Providers>
  );
  try {
    const view = await render(tree(weatherValue({ freshness: 'stale', isRefreshing: true })));
    await waitFor(() => expect(mockChoiceGet).toHaveBeenCalledWith('profile-one', '2026-09-24'));
    await waitFor(() => expect(mockDepartureGet).toHaveBeenCalledWith('profile-one', '2026-09-24'));
    await act(async () => { await Promise.resolve(); });
    expect(refresh).not.toHaveBeenCalled();

    await view.rerender(tree(succeeds
      ? weatherValue({ snapshot: fresh })
      : weatherValue({ freshness: 'stale', refreshFailure: 'unavailable' })));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(new Set(refresh.mock.calls.map(([, input]) => JSON.stringify(input))).size).toBe(1);
    expect(refresh.mock.calls[0][1].snapshot.id).toBe(succeeds ? fresh.id : stale.id);
    expect(refresh.mock.calls[0][1].localDayKey).toBe('2026-09-24');
  } finally {
    history.mockRestore();
    refresh.mockRestore();
  }
});

test('a morning answer given while the weather refreshes waits for that weather', async () => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  mockRecommendationSnapshot = { ...saved.snapshot, catalogVersion: garmentCatalogVersion,
    localDayKey: '2026-09-23' };
  mockChoiceUpsert.mockImplementation(async (_profile: string, key: string, formality: string,
    source: string) => ({
    id: '0f0e2c1a-8b52-4c0e-9d57-1d3c9c1c2a10', localProfileId: 'profile-one',
    dayKey: key, formality, source, styleAesthetics: null,
    createdAt: '2026-09-24T06:00:00.000Z', updatedAt: '2026-09-24T06:00:00.000Z', deletedAt: null,
  }));
  const history = jest.spyOn(SqliteOutfitHistoryRepository.prototype, 'lastSeven')
    .mockResolvedValue([]);
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(() => new Promise(() => undefined));
  const fresh = { ...todayScreenState.snapshot.weather, id: '118f0f4d-1d45-4ae7-a8f1-796e8297d3b4' };
  const tree = (weather: WeatherApplicationValue) => (
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ morningSheetEnabled: true, dressStyle: 'formal' })}
      recommendation={saved} liveRecommendationProvider
      wardrobe={wardrobeValue()} weather={weather}>
      <TodayRoute />
    </Providers>
  );
  try {
    const view = await render(tree(weatherValue({ freshness: 'stale', isRefreshing: true })));
    expect(await view.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
    await fireEvent.press(view.getByTestId('daily-formality-close'));
    await waitFor(() => expect(view.queryByTestId('daily-formality-sheet')).toBeNull());
    expect(mockChoiceUpsert).toHaveBeenCalledWith('profile-one', '2026-09-24', 'formal', 'morning', undefined);
    await act(async () => { await Promise.resolve(); });
    expect(refresh).not.toHaveBeenCalled();

    await view.rerender(tree(weatherValue({ snapshot: fresh })));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(new Set(refresh.mock.calls.map(([, input]) => JSON.stringify(input))).size).toBe(1);
    expect(refresh.mock.calls[0][1]).toMatchObject({ dressStyle: 'formal', localDayKey: '2026-09-24' });
    expect(refresh.mock.calls[0][1].snapshot.id).toBe(fresh.id);
  } finally {
    history.mockRestore();
    refresh.mockRestore();
  }
});

// The Settings switch turns off both questions: with it off, the evening is dressed for the
// profile dress style without a sheet, and the morning answer does not carry over.
test('with the day questions off, 18:00 opens no sheet and dresses the evening for the profile style', async () => {
  mockLocalDayKey = null;
  jest.useFakeTimers({ now: new Date('2026-09-24T17:59:00.000Z'),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  mockRecommendationSnapshot = { ...saved.snapshot, catalogVersion: garmentCatalogVersion,
    dressStyle: 'formal', localDayKey: '2026-09-24' };
  mockChoiceGet.mockImplementation(async (_profile: string, key: string) =>
    key === '2026-09-24' ? {
      id: '0f0e2c1a-8b52-4c0e-9d57-1d3c9c1c2a10', localProfileId: 'profile-one',
      dayKey: key, formality: 'formal', source: 'chip', styleAesthetics: null,
      createdAt: '2026-09-24T09:00:00.000Z', updatedAt: '2026-09-24T09:00:00.000Z', deletedAt: null,
    } : null);
  const onChange: ((state: string) => void)[] = [];
  const appState = jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'change') onChange.push(listener as (state: string) => void);
    return { remove: jest.fn() };
  });
  const history = jest.spyOn(SqliteOutfitHistoryRepository.prototype, 'lastSeven')
    .mockResolvedValue([]);
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(() => new Promise(() => undefined));
  try {
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()}
        profile={profileValue({ morningSheetEnabled: false, dressStyle: 'smart' })}
        recommendation={saved} liveRecommendationProvider
        wardrobe={wardrobeValue()} weather={weatherValue()}>
        <TodayRoute />
      </Providers>,
    );
    await waitFor(() => expect(view.getByTestId('today-outfit-list')).toBeOnTheScreen());
    expect(refresh).not.toHaveBeenCalled();

    jest.setSystemTime(new Date('2026-09-24T18:00:00.000Z'));
    await act(async () => {
      onChange.forEach((listener) => listener('background'));
      onChange.forEach((listener) => listener('active'));
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(view.queryByTestId('daily-formality-sheet')).toBeNull();
    expect(mockChoiceUpsert).not.toHaveBeenCalled();
    expect(new Set(refresh.mock.calls.map(([, input]) => JSON.stringify(input))).size).toBe(1);
    expect(refresh.mock.calls[0][1]).toMatchObject({ localDayKey: '2026-09-24:evening', dressStyle: 'smart' });
  } finally {
    appState.mockRestore();
    history.mockRestore();
    refresh.mockRestore();
    jest.useRealTimers();
  }
});

// N20: the first foreground open after 18:00 asks whether the evening is the profile's usual
// day type, with no tile checked and nothing carried from the morning; closing it answers the
// evening with the profile's dress style (P6).
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
  expect(view.getByText(copy.usualQuestionEvening.formal)).toBeOnTheScreen();
  expect(view.getByText(copy.differentQuestionEvening)).toBeOnTheScreen();
  expect(view.getAllByRole('radio').map((tile) => tile.props.accessibilityState.selected))
    .toEqual([false, false]);
  expect(view.queryByTestId('daily-formality-casual-check')).toBeNull();

  await fireEvent.press(view.getByTestId('daily-formality-close'));
  expect(alert).not.toHaveBeenCalled();
  expect(chooseFormality).toHaveBeenCalledTimes(1);
  expect(chooseFormality).toHaveBeenCalledWith('2026-08-13:evening', 'formal', 'morning');
  alert.mockRestore();
});

// The native sheet animates out after it is closed: while it does, it still draws the question
// it was showing, never the morning question.
test('a closing evening sheet keeps its question and its empty choice while it animates out', async () => {
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ morningSheetEnabled: true, dressStyle: 'smart' })}
      recommendation={recommendationReady()} resolvedDressStyle="smart"
      dressingDayKey="2026-08-13:evening" dressingDayChoiceReady eveningChoicePending
      chooseFormality={jest.fn(async () => undefined)} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );
  expect(await view.findByText(messages.en.today.dailyStyle.usualQuestionEvening.smart)).toBeOnTheScreen();
  const sheet = jest.mocked(DailyFormalitySheet);
  sheet.mockClear();

  await fireEvent.press(view.getByTestId('daily-formality-close'));
  await waitFor(() => expect(view.queryByTestId('daily-formality-sheet')).toBeNull());
  const closing = sheet.mock.calls.map(([props]) => props).filter((props) => !props.visible);
  expect(closing).not.toHaveLength(0);
  expect(closing.map(({ period, usual, step }) => ({ period, usual, step })))
    .toEqual(closing.map(() => ({ period: 'evening', usual: 'smart', step: 'dayType' })));
});

test('a sheet answered on step 2 keeps the styles step while it animates out', async () => {
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()}
      profile={profileValue({ morningSheetEnabled: true, dressStyle: 'smart' })}
      recommendation={recommendationReady()} resolvedDressStyle="smart"
      resolvedStyleAesthetics={['classic']}
      dressingDayKey="2026-08-13" dressingDayChoiceReady morningChoicePending
      chooseFormality={jest.fn(async () => undefined)} wardrobe={wardrobeValue()} weather={weatherValue()}>
      <TodayRoute />
    </Providers>,
  );
  await fireEvent.press(await view.findByTestId('daily-formality-pick-styles'));
  const sheet = jest.mocked(DailyFormalitySheet);
  sheet.mockClear();

  await fireEvent.press(view.getByTestId('daily-formality-styles-done'));
  await waitFor(() => expect(view.queryByTestId('daily-formality-sheet')).toBeNull());
  const closing = sheet.mock.calls.map(([props]) => props).filter((props) => !props.visible);
  expect(closing).not.toHaveLength(0);
  expect(closing.map(({ step, styles }) => ({ step, hasStyles: styles != null })))
    .toEqual(closing.map(() => ({ step: 'styles', hasStyles: true })));
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

test('a place change keeps the old weather and outfit hidden until the new request resolves', async () => {
  const newPlace = { ...todayActiveLocation, locationKey: 'manual:sample.ankara', displayName: 'Ankara' };
  const newWeather = { ...todayScreenState.snapshot.weather, id: 'ankara-weather',
    locationKey: newPlace.locationKey,
    current: { ...todayScreenState.snapshot.weather.current, temperatureCelsius: 31,
      condition: 'clear' as const } };
  const oldRecommendation = recommendationReady();
  if (oldRecommendation.status !== 'ready' || !oldRecommendation.snapshot) {
    throw new Error('Expected saved fixture');
  }
  const oldSnapshot = oldRecommendation.snapshot;
  let selectPlace!: () => Promise<void>;
  let resolveWeather!: () => void;
  function Transition() {
    const [weather, setWeather] = useState(() => weatherValue());
    const [recommendation, setRecommendation] = useState(oldRecommendation);
    useEffect(() => {
      selectPlace = async () => {
        setWeather(weatherValue({ activeLocation: newPlace, isRefreshing: true }));
        await new Promise<void>((resolve) => { resolveWeather = resolve; });
        setWeather(weatherValue({ activeLocation: newPlace, snapshot: newWeather }));
        setRecommendation(recommendationReady({ snapshot: {
          ...oldSnapshot, id: 'ankara-recommendation',
          weatherSnapshotId: newWeather.id, locationKey: newPlace.locationKey,
        } }));
      };
    }, []);
    return <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
      recommendation={recommendation} wardrobe={wardrobeValue()} weather={weather}>
      <TodayRoute />
    </Providers>;
  }
  const view = await render(<Transition />);
  expect(view.getByTestId('today-top-row')).toHaveTextContent(/Istanbul/);
  expect(view.getByTestId('today-title')).toHaveTextContent(/20/);
  expect(view.getByTestId('today-title')).toHaveTextContent(/Rain/);
  expect(view.getByTestId('today-outfit-list')).toBeOnTheScreen();

  await act(async () => { void selectPlace(); });
  expect(view.getByTestId('today-loading-screen')).toBeOnTheScreen();
  expect(view.queryByText('Ankara')).toBeNull();
  expect(view.queryByTestId('today-title')).toBeNull();
  expect(view.queryByTestId('today-outfit-list')).toBeNull();

  await act(async () => { resolveWeather(); });
  expect(view.getByTestId('today-top-row')).toHaveTextContent(/Ankara/);
  expect(view.getByTestId('today-title')).toHaveTextContent(/31/);
  expect(view.getByTestId('today-title')).toHaveTextContent(/Clear/);
  expect(view.getByTestId('today-outfit-list')).toBeOnTheScreen();
  expect(view.queryByText('Istanbul')).toBeNull();
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
      dressingDayChoiceFailed={dressingDayChoiceFailed}>
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
  expect(result.getByTestId('today-freshness')).toHaveTextContent(/Couldn’t refresh/);

  await act(async () => result.getByTestId('today-screen').props.refreshControl.props.onRefresh());

  expect(recommendationRefresh).not.toHaveBeenCalled();
  expect(recommendationEvaluateApprovedTriggers).toHaveBeenCalledWith();
  expect(result.getByTestId('today-archetype')).toBeOnTheScreen();
  expect(result.getByTestId('today-freshness')).not.toHaveTextContent(/Couldn’t refresh/);
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
  expect(result.getByTestId('today-freshness')).toHaveTextContent(/Couldn’t refresh/);
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

test('returning to a focused Today re-evaluates the day, triggers and weather freshness', async () => {
  const reevaluateLocalDay = jest.fn();
  const recommendationEvaluateApprovedTriggers = jest.fn(async () => undefined);
  const weather = weatherValue();
  const onChange: ((state: string) => void)[] = [];
  const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'change') onChange.push(listener as (state: string) => void);
    return { remove: jest.fn() };
  });
  try {
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
        recommendation={recommendationReady()}
        recommendationEvaluateApprovedTriggers={recommendationEvaluateApprovedTriggers}
        reevaluateLocalDay={reevaluateLocalDay} wardrobe={wardrobeValue()} weather={weather}>
        <TodayRoute />
      </Providers>,
    );
    expect(onChange.length).toBeGreaterThan(0);
    const before = [reevaluateLocalDay.mock.calls.length,
      recommendationEvaluateApprovedTriggers.mock.calls.length,
      (weather.revalidateFreshness as jest.Mock).mock.calls.length];
    await act(async () => {
      onChange.forEach((listener) => listener('background'));
      onChange.forEach((listener) => listener('active'));
    });
    expect(reevaluateLocalDay).toHaveBeenCalledTimes(before[0] + 1);
    expect(recommendationEvaluateApprovedTriggers).toHaveBeenCalledTimes(before[1] + 1);
    expect(weather.revalidateFreshness).toHaveBeenCalledTimes(before[2] + 1);
    view.unmount();
  } finally {
    subscription.mockRestore();
  }
});

test('an evening Later choice explains its departure and ready times on Today', async () => {
  const ready = recommendationReady();
  if (ready.status !== 'ready' || !ready.snapshot) throw new Error('fixture');
  jest.useFakeTimers({
    now: new Date('2026-08-13T18:30:00.000Z'),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
  try {
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
        recommendation={{ ...ready, snapshot: { ...ready.snapshot,
          coverageStart: '2026-08-13T19:00:00.000Z' } }}
        wardrobe={wardrobeValue()} weather={weatherValue()}
        activeDeparture={{
          id: 'departure-one', localProfileId: 'profile-one', dayKey: '2026-08-13:evening',
          departureAt: '2026-08-13T19:00:00.000Z', timeZone: 'Europe/Istanbul',
          createdAt: '2026-08-13T18:00:00.000Z', updatedAt: '2026-08-13T18:00:00.000Z',
          deletedAt: null,
        }}>
        <TodayRoute />
      </Providers>,
    );
    expect(view.getByTestId('today-later-ready')).toHaveTextContent(
      'Your 22:00 outfit is ready at 21:00');
  } finally {
    jest.useRealTimers();
  }
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
  // A background refresh keeps its line and leaves the pull control still.
  expect(result.getByTestId('today-screen').props.refreshControl.props.refreshing).toBe(false);
  expect(result.getByTestId('today-archetype')).toBeOnTheScreen();

  await result.rerender(
    <Providers {...props} recommendation={recommendationReady({ lastFailure: 'unavailable' })}>
      <TodayRoute />
    </Providers>,
  );
  expect(result.getByTestId('today-freshness')).toHaveTextContent(/Couldn’t refresh/);
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
      recommendation={recommendationReady()} resolvedDressStyle="formal"
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

  // S21: the outfit is the stack's own link to its detail, as each alternative is.
  let link = result.getByTestId('today-archetype').parent;
  while (link && link.props.href === undefined) link = link.parent;
  expect(link?.props.href).toMatch(new RegExp(`^/${encodeURIComponent(todayOutfitId(1))}(\\?|$)`));
});

// The link navigates by itself behind the route's single-tap guard (the component suite checks
// the outfit's link carries it), so a double tap never reaches the imperative push.
test('a quick double tap on an outfit opens one detail, not two stacked on each other', async () => {
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
  await fireEvent.press(result.getByTestId('today-archetype'));

  expect(mockPush.mock.calls.filter(([href]) => typeof href === 'object' && href.pathname === '/[id]'))
    .toHaveLength(0);
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

// The native back control pops first and moves the route only once the pop has landed, so
// detail tells the tour when its pop back to Today starts; an arriving push says nothing, and a
// cancelled swipe tells it the pop is off.
test('outfit detail tells the tour when its pop back to Today starts and when a swipe is cancelled', async () => {
  mockParams = { id: todayOutfitId(1) };
  const reportReturningToday = jest.fn();
  const reportPopCancelled = jest.fn();
  await render(
    <WalkthroughContext value={{
      active: true, restart: () => undefined, reportToday: () => undefined, reportReturningToday,
      reportPopCancelled,
    }}>
      <Providers
        productAnalytics={createProductAnalytics()}
        profile={profileValue()}
        recommendation={recommendationReady()}
        wardrobe={wardrobeValue()}
        weather={weatherValue()}>
        <OutfitDetailRoute />
      </Providers>
    </WalkthroughContext>,
  );
  const transitionStart = mockNavigationListeners.get('transitionStart');
  await act(async () => transitionStart?.({ data: { closing: false } }));
  expect(reportReturningToday).not.toHaveBeenCalled();
  await act(async () => transitionStart?.({ data: { closing: true } }));
  expect(reportReturningToday).toHaveBeenCalledTimes(1);
  // A swipe back let go before it completes (iOS) leaves detail where it is.
  expect(reportPopCancelled).not.toHaveBeenCalled();
  await act(async () => mockNavigationListeners.get('gestureCancel')?.({ data: { closing: false } }));
  expect(reportPopCancelled).toHaveBeenCalledTimes(1);
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
  // Done waits for the ownership answer; the colour starts on the outfit's own family, which
  // names no palette shade (O8), so the sheet names the family and no swatch is selected.
  expect(result.getByTestId('piece-edit-done').props.accessibilityState.disabled).toBe(true);
  expect(result.getAllByRole('radio').filter((radio) =>
    radio.props.testID?.startsWith('wardrobe-color-') && radio.props.accessibilityState.selected)).toEqual([]);
  const nameLine = result.getByTestId('piece-edit-color-name');
  const suggestedName = (nameLine.children as readonly unknown[]).filter((child) => typeof child === 'string').join('');
  await fireEvent.press(result.getByTestId('piece-edit-owned'));
  await fireEvent.press(result.getByTestId('piece-edit-done'));

  const [input] = (wardrobe.createItem as jest.Mock).mock.calls[0] as [{ colorFamily: 'black' }];
  expect(input).toEqual({
    garmentTypeId: firstDetailGarmentTypeId, entryState: 'owned', colorFamily: input.colorFamily,
  });
  expect(messages.en.catalog[`catalog.color_family.${input.colorFamily}`]).toBe(suggestedName);
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
  await fireEvent.press(result.getByTestId('wardrobe-color-sage'));
  await fireEvent.press(result.getByTestId('piece-edit-photo-select'));
  await waitFor(() => expect(result.getByTestId('piece-edit-photo-preview')).toBeOnTheScreen());
  await fireEvent.press(result.getByTestId('piece-edit-done'));

  // The palette choice is written with its family; analytics reports only the categories.
  expect(wardrobe.updateItem).toHaveBeenCalledWith(
    'item-one',
    { entryState: 'owned', colorFamily: 'green', colorChoice: { kind: 'option', id: 'sage' } },
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

// O8: another shade of the record's own family changes no analytics category, so the record
// is written with the new choice and no closet_item_updated event is sent.
test('the piece sheet writes a new shade of the same family without an analytics event', async () => {
  mockParams = { id: todayOutfitId(1) };
  const productAnalytics = createProductAnalytics();
  // A record in the family the outfit draws the piece in, so it opens as the owned record.
  const presentation = createTodayPresentation(todayScreenState, 'en', false, 'celsius', Date.now());
  if (presentation.kind !== 'loaded') throw new Error('Expected loaded Today presentation.');
  const [suggestion] = presentation.suggestions;
  const slot = suggestion.boardPieces.find(({ garmentTypeId }) => garmentTypeId === firstDetailGarmentTypeId)!.slot;
  const family = garmentColorFamiliesBySlot(suggestion.palette).get(slot)!;
  const [first, second] = [...closetSolidSwatches, ...closetColorOptions]
    .filter((option) => option.family === family).map(({ id }) => id);
  const existing = wardrobeItem({ colorFamily: family, colorChoice: { kind: 'option', id: first } });
  const wardrobe = wardrobeValue({
    state: {
      status: 'ready', items: [existing], isRefreshing: false, isMutating: false,
      refreshFailure: null,
    },
    updateItem: jest.fn(async () => ({ ...existing, colorChoice: { kind: 'option' as const, id: second } })),
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
  expect(result.getByTestId(`wardrobe-color-${first}`).props.accessibilityState.selected).toBe(true);
  await fireEvent.press(result.getByTestId(`wardrobe-color-${second}`));
  await fireEvent.press(result.getByTestId('piece-edit-done'));

  expect(wardrobe.updateItem).toHaveBeenCalledWith(
    'item-one', { entryState: 'owned', colorFamily: family, colorChoice: { kind: 'option', id: second } },
  );
  await waitFor(() => expect(result.queryByTestId('piece-edit-sheet')).toBeNull());
  expect(productAnalytics.analytics.captures.some((c) => c.name === 'closet_item_updated')).toBe(false);
});

// B: the evening strip opens tomorrow's preview in detail, with that day's forecast and
// without the day's worn action, and it records no analytics.
test('tomorrow\'s preview opens in detail read-only, with its own forecast', async () => {
  if (todayRecommendation.status !== 'recommended') throw new Error('fixture');
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('fixture');
  const preview = { ...saved.snapshot, id: 'preview-one', localDayKey: '2026-08-14' };
  const weather = weatherValue({ snapshot: { ...todayScreenState.snapshot.weather, daily: [{
    dateKey: '2026-08-14', condition: 'rain', minimumTemperatureCelsius: 7.2,
    maximumTemperatureCelsius: 9.6, precipitationProbability: 0.8, precipitationMillimetres: 4,
  }] } });
  const outfitHistory = {
    list: jest.fn(async () => []),
    day: jest.fn(async () => []),
    log: jest.fn(async () => { throw new Error('never'); }),
  };
  const productAnalytics = createProductAnalytics();
  const props = {
    productAnalytics, profile: profileValue(), recommendation: saved, wardrobe: wardrobeValue(), weather,
    dressingDayKey: '2026-08-13:evening', outfitHistory,
  };

  mockParams = { id: todayOutfitId(1), day: 'tomorrow' };
  const result = await render(
    <Providers {...props} tomorrowPreview={preview}><OutfitDetailRoute /></Providers>,
  );
  expect(await result.findByTestId('outfit-detail-weather-recap')).toHaveTextContent(/7\.2°\sto\s9\.6°/);
  expect(result.getByTestId('outfit-detail-weather-recap')).toHaveTextContent(/Rain/);
  await waitFor(() => expect(outfitHistory.day).toHaveBeenCalled());
  expect(result.queryByTestId('outfit-detail-wore-this')).toBeNull();
  expect(productAnalytics.analytics.names()).not.toContain('outfit_detail_opened');
  // Its screen view is not recorded either: tomorrow's preview records no analytics at all.
  expect(productAnalytics.analytics.names()).not.toContain('screen_viewed');

  // Without the preview there is nothing to show for tomorrow, even if today offers the id.
  await result.rerender(<Providers {...props} tomorrowPreview={null}><OutfitDetailRoute /></Providers>);
  expect(result.queryByTestId('outfit-detail-weather-recap')).toBeNull();
});

test('tomorrow detail opens from its preview when today has no recommendation', async () => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('fixture');
  const preview = { ...saved.snapshot, id: 'preview-one', localDayKey: '2026-08-14' };
  const weather = weatherValue({ snapshot: { ...todayScreenState.snapshot.weather, daily: [{
    dateKey: '2026-08-14', condition: 'rain', minimumTemperatureCelsius: 7.2,
    maximumTemperatureCelsius: 9.6, precipitationProbability: 0.8, precipitationMillimetres: 4,
  }] } });
  mockParams = { id: todayOutfitId(1), day: 'tomorrow' };
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
      recommendation={{ ...saved, snapshot: null }} tomorrowPreview={preview}
      wardrobe={wardrobeValue()} weather={weather}>
      <OutfitDetailRoute />
    </Providers>,
  );
  expect(await view.findByTestId('outfit-detail-weather-recap')).toHaveTextContent(/7\.2°\sto\s9\.6°/);
});

// Between 00:00 and 04:00 the strip says "This morning", and the detail's title follows it.
test.each([
  ['2026-08-13T22:30:00.000Z', messages.en.today.tomorrow.morningHeading],
  ['2026-08-13T17:30:00.000Z', messages.en.today.tomorrow.heading],
])('tomorrow detail at %s is titled %s', async (at, title) => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('fixture');
  const preview = { ...saved.snapshot, id: 'preview-one', localDayKey: '2026-08-14' };
  const weather = weatherValue({ snapshot: { ...todayScreenState.snapshot.weather, daily: [{
    dateKey: '2026-08-14', condition: 'rain', minimumTemperatureCelsius: 7.2,
    maximumTemperatureCelsius: 9.6, precipitationProbability: 0.8, precipitationMillimetres: 4,
  }] } });
  jest.useFakeTimers({ now: new Date(at),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  mockParams = { id: todayOutfitId(1), day: 'tomorrow' };
  try {
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
        recommendation={{ ...saved, snapshot: null }} tomorrowPreview={preview}
        wardrobe={wardrobeValue()} weather={weather}>
        <OutfitDetailRoute />
      </Providers>,
    );
    expect(await view.findByTestId('outfit-detail-weather-recap')).toBeOnTheScreen();
    expect(mockStackScreen).toHaveBeenLastCalledWith({
      options: expect.objectContaining({ headerTitle: title }),
    });
  } finally {
    jest.useRealTimers();
  }
});

// ADR 0038: "Wore this today" records each look of a dressing day under its bare date, beside
// the day's earlier looks, with no confirmation. The same look is never written twice.
test('wore this today records each look of the day beside the earlier ones', async () => {
  mockParams = { id: todayOutfitId(1) };
  if (todayRecommendation.status !== 'recommended') throw new Error('fixture');
  const stored: WornOutfit[] = [];
  const outfitHistory = {
    list: jest.fn(async () => []),
    day: jest.fn(async () => stored.map((outfit) => ({ outfit })) as never),
    log: jest.fn(async (_day: string, outfit: WornOutfit, _pieceColors: unknown) => {
      stored.push(outfit);
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

  await waitFor(() => expect(outfitHistory.day).toHaveBeenCalledWith('2026-08-13'));
  await fireEvent.press(await result.findByTestId('outfit-detail-wore-this'));
  expect(outfitHistory.log).toHaveBeenCalledTimes(1);
  expect(outfitHistory.log).toHaveBeenCalledWith('2026-08-13', wornOutfitFrom(todayRecommendation.outfits[0]),
    expect.any(Object));
  // Migration 24: the record carries the swatch each piece was drawn in, one per worn slot.
  const [, recorded, pieceColors] = outfitHistory.log.mock.calls[0];
  expect(wornPieceColorsFor(recorded, pieceColors)).toEqual(pieceColors);
  expect(Object.keys(pieceColors as object).sort()).toEqual(Object.keys(recorded.garments).sort());
  expect(await result.findByTestId('outfit-detail-worn')).toBeOnTheScreen();
  expect(result.queryByTestId('outfit-detail-wore-this')).toBeNull();
  expect(props.productAnalytics.analytics.names()).not.toContain('outfit_worn_logged');

  // Another outfit of the same day is recorded beside the first, without asking.
  mockParams = { id: todayOutfitId(2) };
  await result.rerender(<Providers {...props}><OutfitDetailRoute /></Providers>);
  await fireEvent.press(await result.findByTestId('outfit-detail-wore-this'));
  expect(outfitHistory.log).toHaveBeenCalledTimes(2);
  expect(outfitHistory.log).toHaveBeenLastCalledWith('2026-08-13', wornOutfitFrom(todayRecommendation.outfits[1]),
    expect.any(Object));
  expect(await result.findByTestId('outfit-detail-worn')).toBeOnTheScreen();
  expect(alert).not.toHaveBeenCalled();

  // Back on the first look, the day still shows it worn.
  mockParams = { id: todayOutfitId(1) };
  await result.rerender(<Providers {...props}><OutfitDetailRoute /></Providers>);
  expect(await result.findByTestId('outfit-detail-worn')).toBeOnTheScreen();
  expect(result.queryByTestId('outfit-detail-wore-this')).toBeNull();
  alert.mockRestore();
});

// An outfit from Today's "More ideas" opens on the ordinary detail as kuyara's on-device outfit:
// the pool the controller composed, never composed again, recorded as recommended, and with no
// detail-opened event, which names a place among the three.
test('an idea from the composed pool opens on detail as composed on the device and records as recommended', async () => {
  if (todayRecommendation.status !== 'recommended') throw new Error('fixture');
  const pool = composeOutfitPool(todayRecommendation.requirements, 'womens', 0);
  if (pool.status !== 'composed') throw new Error('fixture');
  const shown = new Set(todayRecommendation.outfits.map(({ optionId }) => optionId));
  const ideaId = outfitOptionId(pool.outfits.find((outfit) => !shown.has(outfitOptionId(outfit)))!);
  mockParams = { id: ideaId };
  const logged: WornOutfit[] = [];
  const outfitHistory = {
    list: jest.fn(async () => []),
    day: jest.fn(async () => []),
    log: jest.fn(async (_day: string, outfit: WornOutfit) => {
      logged.push(outfit);
      return { outfit } as never;
    }),
  };
  const props = {
    productAnalytics: createProductAnalytics(),
    profile: profileValue(),
    recommendation: recommendationReady({ pool: pool.outfits }),
    wardrobe: wardrobeValue(),
    weather: weatherValue(),
    dressingDayKey: '2026-08-13:evening',
    outfitHistory,
  };
  const result = await render(<Providers {...props}><OutfitDetailRoute /></Providers>);
  expect(await result.findByText(messages.en.today.generationSourceDeterministic)).toBeOnTheScreen();
  expect(result.queryByText(messages.en.today.unavailableTitle)).toBeNull();
  await waitFor(() => expect(outfitHistory.day).toHaveBeenCalled());
  await fireEvent.press(await result.findByTestId('outfit-detail-wore-this'));
  expect(logged).toHaveLength(1);
  expect(logged[0].source).toBe('recommended');
  expect(props.productAnalytics.analytics.names()).not.toContain('outfit_detail_opened');
});

// Phase 7: a changed outfit is recorded only by "Wore this today", as a
// manual worn outfit under the existing schema, and leaving detail forgets the change.
test('a changed outfit records as manual, turns the full-screen back swipe off while focused, and is forgotten on leaving', async () => {
  mockParams = { id: todayOutfitId(1) };
  if (todayRecommendation.status !== 'recommended') throw new Error('fixture');
  const [pick] = todayRecommendation.outfits;
  const footwear = slotCandidates(pick, 'footwear', todayRecommendation.requirements, 'womens')
    .map(({ garmentTypeId }) => garmentTypeId);
  const next = footwear[footwear.indexOf(pick.footwear.garment.garmentTypeId) + 1];
  const outfitHistory = {
    list: jest.fn(async () => []),
    day: jest.fn(async () => []),
    log: jest.fn(async (_day: string, outfit: WornOutfit) => ({ outfit }) as never),
  };
  const props = {
    productAnalytics: createProductAnalytics(),
    profile: profileValue(),
    recommendation: recommendationReady(),
    wardrobe: wardrobeValue(),
    weather: weatherValue(),
    dressingDayKey: '2026-08-13',
    outfitHistory,
  };
  const layout = { nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } } };
  const lastOptions = () => (mockStackScreen.mock.calls.at(-1)?.[0] as { options: Record<string, unknown> }).options;
  const result = await render(<Providers {...props}><OutfitDetailRoute /></Providers>);
  await fireEvent(result.getByTestId('outfit-detail-content'), 'layout', layout);
  const piece = () => result.getByTestId('outfit-detail-board-piece-footwear');
  expect(lastOptions().fullScreenGestureEnabled).toBeUndefined();
  await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(lastOptions().fullScreenGestureEnabled).toBe(false);
  await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(lastOptions().fullScreenGestureEnabled).toBeUndefined();
  expect(result.getByRole('header', { name: messages.en.today.manualMix.title })).toBeOnTheScreen();

  await fireEvent.press(await result.findByTestId('outfit-detail-wore-this'));
  await waitFor(() => expect(outfitHistory.log).toHaveBeenCalledTimes(1));
  const [, worn] = outfitHistory.log.mock.calls[0];
  expect(worn).toEqual({
    ...wornOutfitFrom(pick),
    garments: { ...wornOutfitFrom(pick).garments, footwear: next },
    formality: expect.any(String),
    source: 'manual',
  });
  expect(props.productAnalytics.analytics.names()).not.toContain('outfit_worn_logged');

  // Leaving detail drops the change: the outfit opens again as kuyara chose it.
  await result.rerender(<Providers {...props}><Text>Today</Text></Providers>);
  expect(result.queryByTestId('outfit-detail-content')).toBeNull();
  await result.rerender(<Providers {...props}><OutfitDetailRoute /></Providers>);
  await fireEvent(result.getByTestId('outfit-detail-content'), 'layout', layout);
  expect(result.queryByRole('header', { name: messages.en.today.manualMix.title })).toBeNull();
  expect(result.getByTestId(`outfit-detail-piece-${pick.footwear.garment.garmentTypeId}`)).toBeOnTheScreen();
  expect(result.queryByRole('button', { name: messages.en.today.manualMix.reset })).toBeNull();
});

// The board's swipe hint plays once for life: the first enlargement stores the profile flag as
// the hint starts, a second enlargement in the same visit stores nothing more, and a profile
// whose flag is stored never plays it.
test('the first enlargement on outfit detail stores the swipe hint flag once', async () => {
  mockParams = { id: todayOutfitId(1) };
  const layout = { nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } } };
  const open = async (swapHintShown: boolean) => {
    const profile = { ...profileValue({ swapHintShown }), markSwapHintShown: jest.fn(async () => undefined) };
    const props = {
      productAnalytics: createProductAnalytics(),
      profile,
      recommendation: recommendationReady(),
      wardrobe: wardrobeValue(),
      weather: weatherValue(),
    };
    const result = await render(<Providers {...props}><OutfitDetailRoute /></Providers>);
    await fireEvent(result.getByTestId('outfit-detail-content'), 'layout', layout);
    const activate = () => fireEvent(result.getByTestId('outfit-detail-board-piece-footwear'),
      'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    return { activate, profile, result };
  };

  // The hint plays, and is stored, once the enlargement's growth has landed.
  const growthLanded = () => act(async () => {
    await new Promise((resolve) => setTimeout(resolve, lightTheme.springs.spatial.duration + 50));
  });

  const due = await open(false);
  await due.activate();
  await growthLanded();
  expect(due.profile.markSwapHintShown).toHaveBeenCalledTimes(1);
  await due.activate();
  await due.activate();
  await growthLanded();
  expect(due.profile.markSwapHintShown).toHaveBeenCalledTimes(1);
  await due.result.unmount();

  const stored = await open(true);
  await stored.activate();
  await growthLanded();
  expect(stored.profile.markSwapHintShown).not.toHaveBeenCalled();
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

// The Closet's worn counts follow History: a worn day recorded elsewhere reaches a Closet that
// stayed mounted, without waiting for its items to be read again.
test('a worn day recorded through the provider reaches the Closet counts already mounted', async () => {
  if (todayRecommendation.status !== 'recommended') throw new Error('fixture');
  const worn = wornOutfitFrom(todayRecommendation.outfits[0]);
  const records: { outfit: WornOutfit }[] = [];
  const list = jest.spyOn(SqliteOutfitHistoryRepository.prototype, 'list')
    .mockImplementation(async () => [...records] as never);
  const log = jest.spyOn(SqliteOutfitHistoryRepository.prototype, 'log')
    .mockImplementation(async (_profile, _day, outfit) => {
      records.push({ outfit });
      return { outfit } as never;
    });
  const items = [wardrobeItem()];
  function Probe() {
    const { outfitHistory } = useRecommendationApplication();
    const counts = useClosetWearCounts();
    return (
      <>
        <Text testID="wear-count">{String(counts.get('item-one') ?? 0)}</Text>
        <Pressable testID="wear-log" onPress={() => { void outfitHistory?.log('2026-08-13', worn, null); }} />
      </>
    );
  }
  try {
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
        recommendation={recommendationReady()} liveRecommendationProvider
        wardrobe={wardrobeValue({ state: { status: 'ready', items, isRefreshing: false, isMutating: false,
          refreshFailure: null } })} weather={weatherValue()}>
        <Probe />
      </Providers>,
    );
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(view.getByTestId('wear-count')).toHaveTextContent('0');
    await fireEvent.press(view.getByTestId('wear-log'));
    await waitFor(() => expect(view.getByTestId('wear-count')).toHaveTextContent('1'));
    expect(log).toHaveBeenCalledTimes(1);
  } finally {
    list.mockRestore();
    log.mockRestore();
  }
});

// Tomorrow's preview is chosen on a foreground open of Today after 18:00. An open of Today in
// the afternoon asks for nothing in the evening: the ask belongs to the dressing day it was made in.
test("an afternoon open of Today does not choose tomorrow's preview when the evening starts elsewhere", async () => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  const eveningKey = '2026-09-24:evening';
  mockLocalDayKey = '2026-09-24';
  mockRecommendationSnapshot = { ...saved.snapshot, localDayKey: '2026-09-24' };
  mockRecommendationSave.mockImplementation(async (_profileId, entry) => ({
    ...mockRecommendationSnapshot,
    id: `recommendation-${entry.context.localDayKey}`,
    localDayKey: entry.context.localDayKey,
    weatherSnapshotId: entry.weatherSnapshotId,
    locationKey: entry.locationKey,
    generationMode: entry.recommendation.generationMode,
    recommendation: entry.recommendation,
  }));
  mockChoiceGet.mockImplementation(async (profileId: string, dayKey: string) => ({
    id: `choice-${dayKey}`, localProfileId: profileId, dayKey, formality: 'smart', source: 'chip',
    styleAesthetics: null, createdAt: '2026-09-24T06:00:00.000Z', updatedAt: '2026-09-24T06:00:00.000Z',
    deletedAt: null,
  }));
  const ai = jest.spyOn(RoutedAiClient.prototype, 'recommendRouted').mockRejectedValue(new Error('offline'));
  const history = jest.spyOn(SqliteOutfitHistoryRepository.prototype, 'lastSeven').mockResolvedValue([]);
  const covers = jest.spyOn(tomorrowPreview, 'forecastCoversWindow').mockReturnValue(true);
  const ensure = jest.spyOn(tomorrowPreview.TomorrowPreviewController.prototype, 'ensure')
    .mockResolvedValue(undefined);
  function Probe() {
    const application = useRecommendationApplication();
    return (
      <>
        <Text testID="probe-day">{application.dressingDayKey}</Text>
        <Text testID="probe-settled">{String(application.state.status === 'ready' && !application.state.isRefreshing
          && application.state.snapshot?.localDayKey === application.dressingDayKey)}</Text>
        <Pressable testID="probe-foreground" onPress={() => { void application.evaluateApprovedTriggers(true); }} />
        <Pressable testID="probe-clock" onPress={() => application.reevaluateLocalDay()} />
      </>
    );
  }
  try {
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
        recommendation={saved} liveRecommendationProvider wardrobe={wardrobeValue()} weather={weatherValue()}>
        <Probe />
      </Providers>,
    );
    await waitFor(() => expect(view.getByTestId('probe-settled')).toHaveTextContent('true'));
    // An open of Today in the afternoon.
    await fireEvent.press(view.getByTestId('probe-foreground'));
    expect(ensure).not.toHaveBeenCalled();

    // The clock passes 18:00 while the app is elsewhere: no open of Today has asked yet.
    mockLocalDayKey = eveningKey;
    await fireEvent.press(view.getByTestId('probe-clock'));
    await waitFor(() => expect(view.getByTestId('probe-day')).toHaveTextContent(eveningKey));
    await waitFor(() => expect(view.getByTestId('probe-settled')).toHaveTextContent('true'));
    expect(ensure).not.toHaveBeenCalled();

    // The evening's own foreground open of Today asks, and the preview is chosen.
    await fireEvent.press(view.getByTestId('probe-foreground'));
    await waitFor(() => expect(ensure).toHaveBeenCalledTimes(1));
  } finally {
    ai.mockRestore();
    history.mockRestore();
    covers.mockRestore();
    ensure.mockRestore();
  }
}, 15000);

// The device in New York and the place in Istanbul: 19:00 on the device is 02:00 at the place and
// 21:00 is 04:00, so a coming morning read from the place's clock moved to the next date in the
// middle of the evening and claimed a second preview. The key stays the evening's own.
test("tomorrow's preview keeps one key through an evening when the place keeps another time", async () => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  const previousZone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  mockLocalDayKey = null;
  jest.useFakeTimers({ now: new Date('2026-09-24T23:00:00.000Z'),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  mockRecommendationSnapshot = { ...saved.snapshot, localDayKey: '2026-09-24:evening' };
  mockRecommendationSave.mockImplementation(async (_profileId, entry) => ({
    ...mockRecommendationSnapshot,
    id: `recommendation-${entry.context.localDayKey}`,
    localDayKey: entry.context.localDayKey,
    weatherSnapshotId: entry.weatherSnapshotId,
    locationKey: entry.locationKey,
    generationMode: entry.recommendation.generationMode,
    recommendation: entry.recommendation,
  }));
  mockChoiceGet.mockImplementation(async (profileId: string, dayKey: string) => ({
    id: `choice-${dayKey}`, localProfileId: profileId, dayKey, formality: 'smart', source: 'chip',
    styleAesthetics: null, createdAt: '2026-09-24T06:00:00.000Z', updatedAt: '2026-09-24T06:00:00.000Z',
    deletedAt: null,
  }));
  const ai = jest.spyOn(RoutedAiClient.prototype, 'recommendRouted').mockRejectedValue(new Error('offline'));
  const history = jest.spyOn(SqliteOutfitHistoryRepository.prototype, 'lastSeven').mockResolvedValue([]);
  const covers = jest.spyOn(tomorrowPreview, 'forecastCoversWindow').mockReturnValue(true);
  const ensure = jest.spyOn(tomorrowPreview.TomorrowPreviewController.prototype, 'ensure')
    .mockResolvedValue(undefined);
  function Probe() {
    const application = useRecommendationApplication();
    return (
      <>
        <Text testID="probe-settled">{String(application.state.status === 'ready' && !application.state.isRefreshing
          && application.state.snapshot?.localDayKey === application.dressingDayKey)}</Text>
        <Pressable testID="probe-foreground" onPress={() => { void application.evaluateApprovedTriggers(true); }} />
      </>
    );
  }
  try {
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()} profile={profileValue()}
        recommendation={saved} liveRecommendationProvider wardrobe={wardrobeValue()} weather={weatherValue()}>
        <Probe />
      </Providers>,
    );
    await waitFor(() => expect(view.getByTestId('probe-settled')).toHaveTextContent('true'));
    await fireEvent.press(view.getByTestId('probe-foreground'));
    await waitFor(() => expect(ensure).toHaveBeenCalled());

    // Two hours later the device still sits in the same evening, and the place has crossed 04:00.
    jest.setSystemTime(new Date('2026-09-25T01:00:00.000Z'));
    await fireEvent.press(view.getByTestId('probe-foreground'));
    await act(async () => undefined);
    const keys = new Set(ensure.mock.calls.map(([input]) => input.localDayKey));
    expect([...keys]).toEqual(['2026-09-25']);
  } finally {
    process.env.TZ = previousZone;
    jest.useRealTimers();
    ai.mockRestore();
    history.mockRestore();
    covers.mockRestore();
    ensure.mockRestore();
  }
}, 15000);

test('an empty Closet takes the outfit\'s pieces with the one ownership asked, once, and the offer then goes', async () => {
  mockParams = { id: todayOutfitId(1) };
  const seedEmptyCloset = jest.fn(async (inputs: readonly { garmentTypeId: string }[]) =>
    inputs.map(({ garmentTypeId }, index) => wardrobeItem({ id: `seeded-${index}`, garmentTypeId } as Partial<WardrobeItem>)));
  const props = { productAnalytics: createProductAnalytics(), profile: profileValue(), recommendation: recommendationReady(),
    weather: weatherValue() };
  const copy = messages.en.today.closetSeed;
  const view = await render(
    <Providers {...props} wardrobe={wardrobeValue({ seedEmptyCloset })}>
      <OutfitDetailRoute />
    </Providers>,
  );

  await fireEvent.press(view.getByTestId('outfit-detail-closet-seed-button'));
  const owned = view.getByTestId('outfit-detail-closet-seed-owned');
  await fireEvent.press(owned);
  await fireEvent.press(owned);
  expect(seedEmptyCloset).toHaveBeenCalledTimes(1);
  const inputs = seedEmptyCloset.mock.calls[0][0] as readonly Record<string, unknown>[];
  expect(inputs.length).toBeGreaterThan(0);
  expect(inputs.every((input) => input.entryState === 'owned' && typeof input.garmentTypeId === 'string')).toBe(true);
  expect(new Set(inputs.map(({ garmentTypeId }) => garmentTypeId)).size).toBe(inputs.length);

  // The Closet now holds the pieces: the offer is gone and the confirmation names the count.
  const seeded = await seedEmptyCloset.mock.results[0].value;
  await view.rerender(
    <Providers {...props} wardrobe={wardrobeValue({ seedEmptyCloset, state: {
      status: 'ready', items: seeded, isRefreshing: false, isMutating: false, refreshFailure: null,
    } })}>
      <OutfitDetailRoute />
    </Providers>,
  );
  await waitFor(() => expect(view.queryByTestId('outfit-detail-closet-seed-button')).toBeNull());
  expect(view.getByText(copy.added(inputs.length))).toBeOnTheScreen();
});

test('a Closet that holds anything gets no offer to add the outfit', async () => {
  mockParams = { id: todayOutfitId(1) };
  const view = await render(
    <Providers productAnalytics={createProductAnalytics()} profile={profileValue()} recommendation={recommendationReady()}
      wardrobe={wardrobeValue({ state: {
        status: 'ready', items: [wardrobeItem()], isRefreshing: false, isMutating: false, refreshFailure: null,
      } })}
      weather={weatherValue()}>
      <OutfitDetailRoute />
    </Providers>,
  );
  expect(view.getByTestId('outfit-detail-pieces')).toBeOnTheScreen();
  expect(view.queryByTestId('outfit-detail-closet-seed-button')).toBeNull();
  expect(view.queryByText(messages.en.today.closetSeed.body)).toBeNull();
});

function setupRow(dayKey: string) {
  return {
    id: '0f0e2c1a-8b52-4c0e-9d57-1d3c9c1c2a10', localProfileId: 'profile-one', dayKey,
    formality: 'formal', source: 'morning', styleAesthetics: null,
    createdAt: '2026-09-24T06:00:00.000Z', updatedAt: '2026-09-24T06:00:00.000Z', deletedAt: null,
  };
}

test('the day setup finished on asks no day question and dresses for the setup answer', async () => {
  const saved = recommendationReady();
  if (saved.status !== 'ready' || !saved.snapshot) throw new Error('Expected saved fixture');
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(async () => null);
  try {
    const props = {
      productAnalytics: createProductAnalytics(),
      recommendation: saved,
      liveRecommendationProvider: true,
      wardrobe: wardrobeValue(),
      weather: weatherValue(),
    };
    // Setup recorded its answer under this dressing day, whenever the profile row was created.
    mockChoiceGet.mockResolvedValue(setupRow('2026-09-24'));
    const setUpToday = await render(
      <Providers {...props} profile={profileValue({
        morningSheetEnabled: true, dressStyle: 'formal', createdAt: '2026-09-23T06:00:00.000Z',
      })}><TodayRoute /></Providers>,
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(refresh.mock.calls[0][1].dressStyle).toBe('formal');
    expect(setUpToday.queryByTestId('daily-formality-sheet')).toBeNull();
    expect(mockChoiceUpsert).not.toHaveBeenCalled();
    await setUpToday.unmount();

    // A profile set up today by a build that wrote no choice row still counts as answered.
    refresh.mockClear();
    mockChoiceGet.mockResolvedValue(null);
    const withoutRow = await render(
      <Providers {...props} profile={profileValue({
        morningSheetEnabled: true, dressStyle: 'formal', createdAt: '2026-09-24T06:00:00.000Z',
      })}><TodayRoute /></Providers>,
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(withoutRow.queryByTestId('daily-formality-sheet')).toBeNull();
    await withoutRow.unmount();

    // A dressing day setup did not finish on asks.
    refresh.mockClear();
    const otherDay = await render(
      <Providers {...props} profile={profileValue({
        morningSheetEnabled: true, dressStyle: 'formal', createdAt: '2026-09-23T06:00:00.000Z',
      })}><TodayRoute /></Providers>,
    );
    expect(await otherDay.findByTestId('daily-formality-sheet')).toBeOnTheScreen();
    expect(refresh).not.toHaveBeenCalled();
  } finally {
    refresh.mockRestore();
  }
});

function SetupFinisher() {
  const { answerSetupDay } = useRecommendationApplication();
  return (
    <Pressable onPress={() => void answerSetupDay?.('formal')} testID="finish-setup">
      <Text>finish</Text>
    </Pressable>
  );
}

// The profile row is created at first launch; what counts is the clock when setup finishes.
// First launch at 17:55 and setup done at 18:03 is the evening, and 03:50 then 04:10 is the
// next morning: the answer is recorded under the dressing day the finishing moment is in.
test.each([
  ['2026-09-24T18:03:00.000Z', '2026-09-24:evening'],
  ['2026-09-25T04:10:00.000Z', '2026-09-25'],
])('finishing setup at %s answers the dressing day %s', async (at, key) => {
  mockLocalDayKey = null;
  jest.useFakeTimers({ now: new Date(at),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  mockChoiceUpsert.mockImplementation(async (_profile: string, dayKey: string) => setupRow(dayKey));
  const refresh = jest.spyOn(RecommendationApplicationController.prototype, 'refresh')
    .mockImplementation(async () => null);
  try {
    const view = await render(
      <Providers productAnalytics={createProductAnalytics()}
        profile={profileValue({ morningSheetEnabled: true, dressStyle: 'formal',
          onboardingCompleted: false, createdAt: new Date(Date.parse(at) - 8 * 60_000).toISOString() })}
        recommendation={recommendationReady()} liveRecommendationProvider
        wardrobe={wardrobeValue()} weather={weatherValue()}>
        <SetupFinisher />
      </Providers>,
    );
    await fireEvent.press(await view.findByTestId('finish-setup'));
    await waitFor(() => expect(mockChoiceUpsert).toHaveBeenCalledTimes(1));
    expect(mockChoiceUpsert).toHaveBeenCalledWith('profile-one', key, 'formal', 'morning');
    await view.unmount();

    // The next open of Today on that day reads the answer and asks nothing.
    mockChoiceGet.mockResolvedValue(setupRow(key));
    const today = await render(
      <Providers productAnalytics={createProductAnalytics()}
        profile={profileValue({ morningSheetEnabled: true, dressStyle: 'formal' })}
        recommendation={recommendationReady()} liveRecommendationProvider
        wardrobe={wardrobeValue()} weather={weatherValue()}>
        <TodayRoute />
      </Providers>,
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(today.queryByTestId('daily-formality-sheet')).toBeNull();
  } finally {
    refresh.mockRestore();
    jest.useRealTimers();
  }
});

describe('compose around chosen pieces on detail', () => {
  if (todayRecommendation.status !== 'recommended') throw new Error('fixture');
  const { AccountScreensContext } = jest.requireActual('@/features/account/application/account-screens-context');
  const { accountScenarios, createInMemoryAccountScreens } = jest.requireActual('@/features/account/application/account-screens');
  const composeModule = jest.requireActual('@/features/recommendation/application/compose-around-pieces');
  const copy = messages.en.today;
  const pins = [{ slot: 'bottom', garmentTypeId: 'skirt' }] as const;
  // An earlier test restores its AppState spy onto the preset's mock without its subscription;
  // the sign-in pager subscribes, so each test here gets a working one.
  let appState: jest.SpyInstance;
  beforeEach(() => {
    appState = jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }) as never);
  });
  afterEach(() => appState.mockRestore());
  const expected = () => composeModule.composeAroundPieces({
    requirements: todayRecommendation.requirements, clothingPreference: 'womens', dayVariant: 0, dressStyle: 'smart',
  }, pins);

  function renderDetail(scenario: 'upToDate' | 'signedOut', outfitHistory?: RecommendationApplicationValue['outfitHistory']) {
    mockParams = { id: todayOutfitId(1) };
    const port = createInMemoryAccountScreens(accountScenarios[scenario]);
    const props = {
      productAnalytics: createProductAnalytics(),
      profile: profileValue(),
      recommendation: recommendationReady(),
      wardrobe: wardrobeValue(),
      weather: weatherValue(),
      dressingDayKey: '2026-08-13',
      outfitHistory,
    };
    return {
      port,
      result: render(
        <Providers {...props}>
          <AccountScreensContext.Provider value={port}><OutfitDetailRoute /></AccountScreensContext.Provider>
        </Providers>,
      ),
    };
  }

  async function composeSkirt(result: Awaited<ReturnType<typeof render>>) {
    await fireEvent.press(result.getByTestId('compose-entry-row'));
    await fireEvent.press(result.getByTestId('compose-choose-another'));
    await fireEvent.press(result.getByTestId('compose-catalog-bottom-skirt'));
    await fireEvent.press(result.getByTestId('compose-build'));
  }

  test('while the account screens are closed there is no row, no sheet and no account sheet', async () => {
    const { port, result } = renderDetail('signedOut');
    const screen = await result;
    port.openSignIn('detail');
    expect(await screen.findByTestId('outfit-detail-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('compose-entry-row')).toBeNull();
    expect(screen.queryByTestId('compose-sheet')).toBeNull();
    expect(screen.queryByTestId('account-sheet-detail')).toBeNull();
  });

  test('a non-member\'s muted row opens Complete your profile on the compose benefit page', async () => {
    mockAccountsOpen = true;
    const { port, result } = renderDetail('signedOut');
    const screen = await result;
    const row = await screen.findByTestId('compose-entry-row');
    expect(row.props.accessibilityLabel).toBe(`${copy.compose.entry}, ${copy.compose.membersChip}`);
    await fireEvent.press(row);
    expect(port.getSnapshot().sheet).toBe('detail');
    expect(await screen.findByTestId('account-sheet-detail')).toBeOnTheScreen();
    expect(screen.getByTestId('account-intro-dot-compose').props.accessibilityState).toEqual({ selected: true });
    expect(screen.queryByTestId('compose-sheet')).toBeNull();
  });

  test('a member composes: the result steps through its outfits, the chosen piece reads Your choice, and Wore this today records it as manual', async () => {
    mockAccountsOpen = true;
    const want = expected();
    if (want.status !== 'composed') throw new Error('fixture');
    const outfitHistory = {
      list: jest.fn(async () => []),
      day: jest.fn(async () => []),
      log: jest.fn(async (_day: string, outfit: WornOutfit) => ({ outfit }) as never),
    };
    const { result } = renderDetail('upToDate', outfitHistory);
    const screen = await result;
    await composeSkirt(screen);
    const total = want.options.length;
    const position = await screen.findByTestId('compose-result-position');
    expect(position).toHaveTextContent(`1 / ${total}`);
    expect(screen.getByTestId('outfit-detail-changed-from')).toHaveTextContent(copy.compose.builtFrom);
    expect(screen.getByTestId('outfit-detail-generation-source')).toHaveTextContent(copy.compose.source);
    expect(within(screen.getByTestId('outfit-detail-row-bottom')).getByText(copy.manualMix.yourChoice, { includeHiddenElements: true }))
      .toBeOnTheScreen();
    // The rest is kuyara's answer around the skirt, not a change to kuyara's pick.
    expect(screen.queryAllByTestId(/^outfit-detail-piece-changed-/, { includeHiddenElements: true })).toEqual([]);
    let shown = 0;
    if (total > 1) {
      await fireEvent.press(screen.getByTestId('compose-show-another'));
      shown = 1;
      expect(screen.getByTestId('compose-result-position')).toHaveTextContent(`2 / ${total}`);
    } else {
      expect(screen.queryByTestId('compose-show-another')).toBeNull();
    }
    await waitFor(() => expect(outfitHistory.day).toHaveBeenCalled());
    await fireEvent.press(await screen.findByTestId('outfit-detail-wore-this'));
    expect(outfitHistory.log).toHaveBeenCalledWith('2026-08-13', wornOutfitFrom(want.options[shown].outfit, 'manual'),
      expect.any(Object));

    // Back to kuyara's pick forgets the composed result.
    await fireEvent.press(screen.getByTestId('outfit-detail-reset-button'));
    expect(screen.queryByTestId('compose-result-position')).toBeNull();
  });

  test('a day that composes nothing leaves the outfit as it was', async () => {
    mockAccountsOpen = true;
    const spy = jest.spyOn(composeModule, 'composeAroundPieces').mockReturnValue({ status: 'unavailable' });
    const { result } = renderDetail('upToDate');
    const screen = await result;
    await composeSkirt(screen);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.queryByTestId('compose-result-position')).toBeNull();
    expect(screen.getByTestId('outfit-detail-screen')).toBeOnTheScreen();
    expect(within(screen.getByTestId('outfit-detail-heading-group')).queryByText(copy.manualMix.title)).toBeNull();
    spy.mockRestore();
  });
});
