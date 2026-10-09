import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  RecommendationApplicationContext,
  type RecommendationApplicationValue,
} from '@/features/recommendation/application/recommendation-application-context';
import type { RecommendationSnapshot } from '@/features/recommendation/application/recommendation-repository';
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
  onOpenTomorrowDetail: (id: string) => void = jest.fn(),
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
                onOpenTomorrowDetail={onOpenTomorrowDetail} onRefresh={jest.fn()} state={todayScreenState} />
            </RecommendationApplicationContext>
          </WeatherApplicationContext>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>
  );
}

test.each([
  ['en', 'Tomorrow', 'Rain, 15.0°\u00a0to\u00a023.0°'],
  ['tr', 'Yarın', 'Yağmurlu, 15,0°\u00a0ile\u00a023,0°\u00a0arası'],
] as const)('%s: the evening shows tomorrow as one strip under the alternatives that opens its detail', async (
  language, heading, weatherLine,
) => {
  const open = jest.fn();
  const result = await render(screen(language, preview, [tomorrowRow], open));
  const strip = result.getByTestId('today-tomorrow');
  expect(strip).toHaveProp('accessibilityRole', 'button');
  expect(strip.props.accessibilityLabel).toContain(heading);
  expect(result.getByTestId('today-tomorrow-heading', { includeHiddenElements: true }))
    .toHaveTextContent(heading);
  // The range's spaces are non-breaking, so it never wraps away from itself.
  expect(result.getByTestId('today-tomorrow-weather', { includeHiddenElements: true }).props.children)
    .toBe(weatherLine);
  expect(result.getByTestId('today-tomorrow-board', { includeHiddenElements: true })).toBeTruthy();
  // The strip sits under the alternatives, after today's last update and before the re-ask.
  expect(result.getAllByTestId(/^today-(tomorrow|provenance|alternates-heading|outfit-list|ask-again)$/)
    .map(({ props }) => props.testID))
    .toEqual(['today-provenance', 'today-alternates-heading', 'today-outfit-list', 'today-tomorrow',
      'today-ask-again']);
  fireEvent.press(strip);
  expect(open).toHaveBeenCalledWith(recommendation.outfits[0].optionId);
});

test('no preview, or no forecast row for its day, leaves the section out without a message', async () => {
  const none = await render(screen('en', null));
  expect(none.queryByTestId('today-tomorrow')).toBeNull();
  const noRow = await render(screen('en', preview, []));
  expect(noRow.queryByTestId('today-tomorrow')).toBeNull();
});
