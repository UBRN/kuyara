import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  RecommendationApplicationContext,
  type RecommendationApplicationValue,
} from '@/features/recommendation/application/recommendation-application-context';
import type { RecommendationSnapshot } from '@/features/recommendation/data/recommendation-repository';
import { todayScreenState, todayWeatherSnapshot } from '@/features/today/__tests__/fixtures';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import {
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import type { WeatherSnapshot } from '@/features/weather/domain/weather';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn() }),
}));

const recommendation = todayScreenState.snapshot.recommendation;
if (recommendation.status !== 'recommended') throw new Error('Expected a recommendation fixture.');

const preview = {
  id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b5',
  localProfileId: 'profile-one',
  weatherSnapshotId: todayWeatherSnapshot.id,
  locationKey: todayWeatherSnapshot.locationKey,
  clothingPreference: 'womens',
  dressStyle: 'smart',
  styleAesthetics: [],
  catalogVersion: 1,
  dayVariant: 5,
  localDayKey: '2026-08-14',
  generationMode: 'ai-assisted',
  recommendation: { ...recommendation, generationMode: 'ai-assisted' },
  createdAt: '2026-08-13T16:00:00.000Z',
  updatedAt: '2026-08-13T16:00:00.000Z',
} as const satisfies RecommendationSnapshot;

const tomorrowRow = {
  dateKey: '2026-08-14', condition: 'rain', minimumTemperatureCelsius: 15,
  maximumTemperatureCelsius: 23, precipitationProbability: 0.6, precipitationMillimetres: 4,
} as const;

function screen(
  language: SupportedLanguage,
  tomorrowPreview: RecommendationSnapshot | null,
  daily: WeatherSnapshot['daily'] = [tomorrowRow],
) {
  const weather = {
    state: {
      status: 'ready',
      activeLocation: todayScreenState.snapshot.activeLocation,
      snapshot: { ...todayWeatherSnapshot, daily },
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
  } satisfies WeatherApplicationValue;
  const recommendationApplication = {
    state: { status: 'ready', snapshot: null, isRefreshing: false, lastFailure: null, phase: null,
      exhausted: false, showFirstGenerationOverlay: false },
    tomorrowPreview,
  } as unknown as RecommendationApplicationValue;
  return (
    <LocalizationContext value={{ language, messages: messages[language], hour12: false, temperatureUnit: 'celsius' }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}>
          <WeatherApplicationContext value={weather}>
            <RecommendationApplicationContext value={recommendationApplication}>
              <TodayScreen language={language} onAskAgain={jest.fn()} onOpenOutfitDetail={jest.fn()}
                onRefresh={jest.fn()} state={todayScreenState} />
            </RecommendationApplicationContext>
          </WeatherApplicationContext>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>
  );
}

test.each([
  ['en', 'Tomorrow', 'Rain · Low 15.0° · High 23.0°'],
  ['tr', 'Yarın', 'Yağmurlu · En düşük 15,0° · En yüksek 23,0°'],
] as const)('%s: the evening shows tomorrow under its own heading with its weather', async (
  language, heading, weatherLine,
) => {
  const result = await render(screen(language, preview));
  expect(result.getByRole('header', { name: heading })).toBeOnTheScreen();
  expect(result.getByTestId('today-tomorrow-weather')).toHaveTextContent(weatherLine);
  expect(result.getByTestId('today-tomorrow-title')).toBeOnTheScreen();
  expect(result.getByTestId('today-tomorrow-board', { includeHiddenElements: true })).toBeTruthy();
});

test('no preview, or no forecast row for its day, leaves the section out without a message', async () => {
  const none = await render(screen('en', null));
  expect(none.queryByTestId('today-tomorrow')).toBeNull();
  const noRow = await render(screen('en', preview, []));
  expect(noRow.queryByTestId('today-tomorrow')).toBeNull();
});
