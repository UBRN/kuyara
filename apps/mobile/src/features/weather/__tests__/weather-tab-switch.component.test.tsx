import { act, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Profiler, useMemo, useSyncExternalStore } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { FirstUseTracker } from '@/features/analytics/application/first-use-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import { ProductAnalyticsContext } from '@/features/analytics/application/use-product-analytics';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { InMemoryWithdrawnIdentifierStore } from '@/features/analytics/data/in-memory-withdrawn-identifier-store';
import {
  WeatherApplicationController,
  type WeatherReadyState,
} from '@/features/weather/application/weather-application-controller';
import {
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import { getManualLocation } from '@/features/weather/domain/manual-location-catalog';
import { WeatherScreen } from '@/features/weather/presentation/weather-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

// A tab switch is a blur followed by a focus, and the router tells the screen about both
// without re-rendering it. This mock delivers exactly those two events, so a re-render that
// follows is one the screen caused itself.
const mockFocusSubscribers = new Set<(focused: boolean) => void>();
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    router: { push: jest.fn() },
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        let cleanup = callback();
        const subscriber = (focused: boolean) => {
          if (focused) cleanup = callback();
          else cleanup?.();
        };
        mockFocusSubscribers.add(subscriber);
        return () => {
          mockFocusSubscribers.delete(subscriber);
          cleanup?.();
        };
      }, [callback]);
    },
  };
});

// The rail is the screen's heaviest child and takes fresh props whenever the screen renders,
// so its render count is the screen's render count as far as a tab switch is concerned.
const mockRailColumnCounts: number[] = [];
jest.mock('@/features/weather/presentation/hourly-rail', () => {
  const actual = jest.requireActual('@/features/weather/presentation/hourly-rail') as
    typeof import('@/features/weather/presentation/hourly-rail');
  return {
    ...actual,
    HourlyRail: (props: Parameters<typeof actual.HourlyRail>[0]) => {
      mockRailColumnCounts.push(props.columns.length);
      return actual.HourlyRail(props);
    },
  };
});

async function switchTab(focused: boolean) {
  await act(async () => { mockFocusSubscribers.forEach((subscriber) => subscriber(focused)); });
}

let clock: jest.SpyInstance<number, []>;
let now = Date.parse('2026-07-30T09:30:00.000Z');
beforeEach(() => {
  now = Date.parse('2026-07-30T09:30:00.000Z');
  clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  mockRailColumnCounts.length = 0;
});
afterEach(() => clock.mockRestore());

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function sampleSnapshot() {
  const location = getManualLocation('sample.istanbul')!;
  const hour = (forecastAt: string) => ({
    forecastAt, temperatureCelsius: 16, apparentTemperatureCelsius: 15, condition: 'rain' as const,
    precipitationProbability: 0.5, windSpeedMetersPerSecond: 4, humidity: 0.7, uvIndex: 2,
  });
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4', localProfileId: 'profile-id',
    locationKey: location.locationKey, timeZone: location.timeZone,
    fetchedAt: '2026-07-30T09:00:00.000Z',
    origin: { kind: 'sample' as const, sourceId: 'test' },
    current: {
      observedAt: '2026-07-30T09:00:00.000Z', temperatureCelsius: 16,
      apparentTemperatureCelsius: 15, condition: 'rain' as const,
      precipitationProbability: 0.5, windSpeedMetersPerSecond: 4, humidity: 0.7, uvIndex: 2,
    },
    minimumTemperatureCelsius: 12, maximumTemperatureCelsius: 19,
    hourly: [hour('2026-07-30T09:00:00.000Z'), hour('2026-07-30T10:00:00.000Z')],
  };
}

function ready(): WeatherApplicationValue {
  const state: WeatherReadyState = {
    status: 'ready', activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(), freshness: 'fresh', permission: { kind: 'undetermined' },
    locationFlow: 'idle', isSelectingLocation: false, isRefreshing: false, refreshFailure: null,
  };
  return {
    state,
    retry: jest.fn(async () => undefined),
    dismissLocationFlow: jest.fn(),
    beginDeviceLocationSelection: jest.fn(async () => undefined),
    openApplicationSettings: jest.fn(async () => undefined),
    selectManualLocation: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    revalidateFreshness: jest.fn(async () => undefined),
  };
}

function productAnalytics() {
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
    withdrawnIdentifiers: new InMemoryWithdrawnIdentifierStore(),
  };
}

function Providers({ children, value }: PropsWithChildren<{ value: WeatherApplicationValue }>) {
  return (
    <LocalizationContext.Provider
      value={{ language: 'en', messages: messages.en, hour12: false, temperatureUnit: 'celsius' }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <ProductAnalyticsContext value={productAnalytics()}>
          <WeatherApplicationContext.Provider value={value}>
            <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
          </WeatherApplicationContext.Provider>
        </ProductAnalyticsContext>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>
  );
}

// Tab switches are the app's commonest navigation, and Weather sits behind every one of them.
// A blur and a focus that change nothing the screen shows must not draw it again (measured
// 2026-09-29: 110 to 133 ms per switch in a development build).
test('a tab switch that changes nothing on screen does not render Weather again', async () => {
  const value = ready();
  let commits = 0;
  await render(
    <Providers value={value}>
      <Profiler id="weather" onRender={() => { commits += 1; }}><WeatherScreen /></Profiler>
    </Providers>,
  );
  await act(async () => undefined);
  const railRenders = mockRailColumnCounts.length;
  const mountCommits = commits;
  expect(railRenders).toBeGreaterThan(0);
  expect(value.revalidateFreshness).toHaveBeenCalledTimes(1);

  for (let visit = 0; visit < 3; visit += 1) {
    await switchTab(false);
    // Seconds pass between visits, not a minute: the clock moves with the minute, never sooner.
    now += 10_000;
    await switchTab(true);
  }

  // Focus still re-evaluates freshness; only the drawing is spared.
  expect(value.revalidateFreshness).toHaveBeenCalledTimes(4);
  expect(mockRailColumnCounts.length).toBe(railRenders);
  expect(commits).toBe(mountCommits);
});

test('returning after an hour has ended still drops it from the rail', async () => {
  const value = ready();
  await render(<Providers value={value}><WeatherScreen /></Providers>);
  expect(mockRailColumnCounts.at(-1)).toBe(2);
  const railRenders = mockRailColumnCounts.length;

  await switchTab(false);
  now = Date.parse('2026-07-30T10:05:00.000Z');
  await switchTab(true);

  expect(mockRailColumnCounts.length).toBeGreaterThan(railRenders);
  expect(mockRailColumnCounts.at(-1)).toBe(1);
});

// A rail left scrolled must not open on later hours than the current one: coming back to
// Weather, or the hours themselves changing, brings the rail back to "Now". A refresh that
// keeps the same hours leaves a reader who is scrolling where they are.
test('the hourly rail opens on the current hour after a tab switch or a change of hours', async () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
  const value = ready();
  const result = await render(<Providers value={value}><WeatherScreen /></Providers>);
  await act(async () => undefined);
  const backToNow = () => scrollTo.mock.calls.filter(([to]) => (
    JSON.stringify(to) === JSON.stringify({ x: 0, animated: false })
  )).length;

  scrollTo.mockClear();
  await switchTab(false);
  now += 10_000;
  await switchTab(true);
  expect(backToNow()).toBe(1);

  // The same hours, refreshed: the reader keeps their place.
  scrollTo.mockClear();
  const refreshed = { ...sampleSnapshot(), fetchedAt: '2026-07-30T09:20:00.000Z' };
  await result.rerender(
    <Providers value={{ ...value, state: { ...value.state as WeatherReadyState, snapshot: refreshed } }}>
      <WeatherScreen />
    </Providers>,
  );
  expect(backToNow()).toBe(0);

  // The first hour has ended and a new snapshot starts an hour later: back to "Now".
  const later = sampleSnapshot();
  later.hourly = [{ ...later.hourly[1] }, { ...later.hourly[1], forecastAt: '2026-07-30T11:00:00.000Z' }];
  await result.rerender(
    <Providers value={{ ...value, state: { ...value.state as WeatherReadyState, snapshot: later } }}>
      <WeatherScreen />
    </Providers>,
  );
  expect(backToNow()).toBe(1);
  scrollTo.mockRestore();
});

// The provider hands every consumer a new context value whenever the controller publishes a
// state, so a focus that republished an identical state drew every screen reading the context
// (measured 2026-09-29: revalidating freshness on focus did exactly that, on both tabs). This
// test runs the real controller behind the same subscription the provider uses.
function ControllerProviders({
  children,
  controller,
}: PropsWithChildren<{ controller: WeatherApplicationController }>) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const value = useMemo<WeatherApplicationValue>(() => ({
    ...ready(),
    state,
    refresh: () => controller.refresh(),
    revalidateFreshness: controller.revalidateFreshness,
    getSnapshot: controller.getSnapshot,
  }), [controller, state]);
  return <Providers value={value}>{children}</Providers>;
}

test('a focus that leaves freshness as it was does not draw Weather again', async () => {
  const location = getManualLocation('sample.istanbul')!;
  const snapshot = { ...sampleSnapshot(), fetchedAt: '2026-07-30T09:20:00.000Z' };
  const controller = new WeatherApplicationController('profile-id', {
    loadRepository: async () => ({
      getActiveLocation: async () => location,
      getSnapshot: async () => snapshot,
    }) as never,
    provider: { fetchSnapshot: async () => { throw new Error('no fetch expected'); } },
    deviceLocation: {
      getPermissionState: async () => ({ kind: 'undetermined' }),
    } as never,
    now: () => new Date(now).toISOString(),
  });
  await controller.initialize();
  expect(controller.getSnapshot()).toMatchObject({ status: 'ready', freshness: 'fresh' });

  let commits = 0;
  await render(
    <ControllerProviders controller={controller}>
      <Profiler id="weather" onRender={() => { commits += 1; }}><WeatherScreen /></Profiler>
    </ControllerProviders>,
  );
  await act(async () => undefined);
  const railRenders = mockRailColumnCounts.length;
  const mountCommits = commits;
  const publishedState = controller.getSnapshot();

  for (let visit = 0; visit < 3; visit += 1) {
    await switchTab(false);
    now += 10_000;
    await switchTab(true);
  }

  expect(controller.getSnapshot()).toBe(publishedState);
  expect(mockRailColumnCounts.length).toBe(railRenders);
  expect(commits).toBe(mountCommits);
});
