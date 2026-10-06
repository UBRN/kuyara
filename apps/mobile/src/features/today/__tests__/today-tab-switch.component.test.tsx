import { act, render } from '@testing-library/react-native';
import { Profiler } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { todayScreenState } from '@/features/today/__tests__/fixtures';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import {
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
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

// The board is the loaded screen's heaviest child and takes fresh props whenever the screen
// renders, so its render count is the screen's render count as far as a tab switch goes.
let mockBoardRenders = 0;
jest.mock('@/garment-art/garment-board', () => {
  const actual = jest.requireActual('@/garment-art/garment-board') as
    typeof import('@/garment-art/garment-board');
  return {
    ...actual,
    GarmentBoard: (props: Parameters<typeof actual.GarmentBoard>[0]) => {
      mockBoardRenders += 1;
      return actual.GarmentBoard(props);
    },
  };
});

async function switchTab(focused: boolean) {
  await act(async () => { mockFocusSubscribers.forEach((subscriber) => subscriber(focused)); });
}

const fixtureNow = Date.parse('2026-08-13T06:30:00.000Z');
let now = fixtureNow;
let clock: jest.SpiedFunction<typeof Date.now>;
beforeEach(() => {
  now = fixtureNow;
  mockBoardRenders = 0;
  clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => clock.mockRestore());

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

const weather: WeatherApplicationValue = {
  state: {
    status: 'ready',
    activeLocation: todayScreenState.snapshot.activeLocation,
    snapshot: todayScreenState.snapshot.weather,
    freshness: 'fresh',
    permission: { kind: 'undetermined' },
    locationFlow: 'idle',
    isSelectingLocation: false,
    isRefreshing: false,
    refreshFailure: null,
  },
  retry: jest.fn(async () => undefined),
  dismissLocationFlow: jest.fn(),
  beginDeviceLocationSelection: jest.fn(async () => undefined),
  confirmDeviceLocationRequest: jest.fn(async () => undefined),
  openApplicationSettings: jest.fn(async () => undefined),
  selectManualLocation: jest.fn(async () => undefined),
  refresh: jest.fn(async () => undefined),
  revalidateFreshness: jest.fn(async () => undefined),
};

// Every tab switch passes through Today. A blur and a focus that change nothing it shows must
// not draw it again (measured 2026-09-29: TodayScreenContent and the sheets behind it rendered
// on every navigation commit).
test('a tab switch that changes nothing on screen does not render Today again', async () => {
  let commits = 0;
  const handlers = { onOpenOutfitDetail: jest.fn(), onRefresh: jest.fn(), onAskAgain: jest.fn() };
  await render(
    <LocalizationContext value={{
      language: 'en', messages: messages.en, hour12: false, temperatureUnit: 'celsius',
    }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <WeatherApplicationContext value={weather}>
            <Profiler id="today" onRender={() => { commits += 1; }}>
              <TodayScreen language="en" state={todayScreenState} {...handlers} />
            </Profiler>
          </WeatherApplicationContext>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>,
  );
  await act(async () => undefined);
  const boardRenders = mockBoardRenders;
  const mountCommits = commits;
  expect(boardRenders).toBeGreaterThan(0);

  for (let visit = 0; visit < 3; visit += 1) {
    await switchTab(false);
    // Seconds pass between visits, not a minute: the clock moves with the minute, never sooner.
    now += 10_000;
    await switchTab(true);
  }

  expect(mockBoardRenders).toBe(boardRenders);
  expect(commits).toBe(mountCommits);
});
