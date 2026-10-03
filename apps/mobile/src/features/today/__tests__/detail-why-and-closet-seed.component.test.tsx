import { fireEvent, render } from '@testing-library/react-native';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { recommendOutfits } from '@/features/recommendation/application/recommend-outfits';
import {
  firstOutfitId,
  todayScreenState,
  todayWeatherSnapshot,
} from '@/features/today/__tests__/fixtures';
import type { TodayScreenState } from '@/features/today/model';
import type { ClosetSeedOffer } from '@/features/today/application/outfit-detail-state';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { darkTheme, lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui/community/bottom-sheet', () => ({ BottomSheet: () => null }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(() => callback(), [callback]),
    Stack: { Toolbar: Object.assign(() => null, { Button: () => null }) },
  };
});

const fixtureNow = Date.parse('2026-08-13T06:30:00.000Z');
const originalDimensions = Dimensions.get('window');
let dateNowSpy: jest.SpiedFunction<typeof Date.now>;
beforeEach(() => {
  dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixtureNow);
  Dimensions.set({ window: { ...originalDimensions, width: 390, fontScale: 1 } });
});
afterEach(() => {
  dateNowSpy.mockRestore();
  Dimensions.set({ window: originalDimensions });
});

// 22 degrees, clear and calm: no weather requirement puts a piece in the outfit.
const mildMeasurements = {
  temperatureCelsius: 22, apparentTemperatureCelsius: 22, condition: 'clear' as const,
  precipitationProbability: 0, windSpeedMetersPerSecond: 2, humidity: 0.5, uvIndex: 1,
};
const mildWeather = {
  ...todayWeatherSnapshot,
  current: { observedAt: '2026-08-13T06:00:00.000Z', ...mildMeasurements },
  minimumTemperatureCelsius: 21,
  maximumTemperatureCelsius: 23,
  hourly: [{ forecastAt: '2026-08-13T07:00:00.000Z', ...mildMeasurements }],
};
const mildState = {
  ...todayScreenState,
  snapshot: {
    ...todayScreenState.snapshot,
    weather: mildWeather,
    recommendation: recommendOutfits({
      snapshot: mildWeather, now: mildWeather.current.observedAt, clothingPreference: 'womens', dayVariant: 0,
    }),
  },
} as TodayScreenState;

// 31 degrees in heavy rain: the outfit needs a waterproof shell and high breathability at once,
// so it trades some breathability for the protection.
const hotRainMeasurements = {
  temperatureCelsius: 31, apparentTemperatureCelsius: 33, condition: 'rain' as const,
  precipitationProbability: 0.9, windSpeedMetersPerSecond: 3, humidity: 0.8, uvIndex: 4,
};
const hotRainWeather = {
  ...todayWeatherSnapshot,
  current: { observedAt: '2026-08-13T06:00:00.000Z', ...hotRainMeasurements },
  minimumTemperatureCelsius: 29,
  maximumTemperatureCelsius: 32,
  hourly: [{ forecastAt: '2026-08-13T07:00:00.000Z', ...hotRainMeasurements }],
};
const hotRainState = {
  ...todayScreenState,
  snapshot: {
    ...todayScreenState.snapshot,
    weather: hotRainWeather,
    recommendation: recommendOutfits({
      snapshot: hotRainWeather, now: hotRainWeather.current.observedAt, clothingPreference: 'womens', dayVariant: 0,
    }),
  },
} as TodayScreenState;

const catalogName = (language: SupportedLanguage, id: string) =>
  messages[language].catalog[`catalog.garment_type.${id}.name` as keyof (typeof messages)['en']['catalog']];

function tree(
  language: SupportedLanguage,
  state: TodayScreenState,
  closetSeed: ClosetSeedOffer | null = null,
  dark = false,
) {
  return (
    <LocalizationContext value={{ language, messages: messages[language], hour12: false, temperatureUnit: 'celsius' }}>
      <KuyaraThemeContext.Provider value={dark ? darkTheme : lightTheme}>
        <SafeAreaProvider initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}>
          <HeaderHeightContext value={undefined}>
            <OutfitDetailScreen
              closetSeed={closetSeed}
              language={language}
              onEditPiece={jest.fn()}
              state={state}
              suggestionId={firstOutfitId(state)}
              wardrobeItems={[]}
            />
          </HeaderHeightContext>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>
  );
}

async function renderDetail(...args: Parameters<typeof tree>) {
  const result = await render(tree(...args));
  await fireEvent(result.getByTestId('outfit-detail-content'),
    'layout', { nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } } });
  return result;
}

describe.each(['en', 'tr'] as const)('%s outfit detail', (language) => {
  const copy = messages[language].today;

  test('a trade-off reads under "Why this outfit", and no reasons list is drawn', async () => {
    const result = await renderDetail(language, hotRainState);
    const why = result.getByTestId('outfit-detail-why');
    const tradeoffs = result.queryAllByTestId(/^outfit-detail-tradeoff-/);
    expect(tradeoffs.length).toBeGreaterThan(0);
    for (const row of tradeoffs) expect(why).toContainElement(row);
    expect(tradeoffs[0]).toHaveTextContent(copy.requirementTradeoffRow({ requirement: '', garments: [] }).split('(')[0],
      { exact: false });
    expect(result.queryByTestId('outfit-detail-reasons')).toBeNull();
  });

  test('"Why this outfit" ties the rain to the pieces it put on, in a sentence and a drawn line', async () => {
    const result = await renderDetail(language, todayScreenState);
    expect(result.getByRole('header', { name: copy.whyOutfit.heading })).toBeOnTheScreen();
    const rain = result.getByTestId('outfit-detail-why-rain');
    expect(rain).toHaveProp('accessibilityLabel',
      copy.whyOutfit.link.rain([catalogName(language, 'rain_jacket'), catalogName(language, 'rain_boots')]));
    expect(rain).toHaveTextContent(copy.whyOutfit.causes.rain, { exact: false });
    expect(result.getByTestId('outfit-detail-why-line-rain')).toBeOnTheScreen();
    // The drawing is the sentence's picture, so assistive tech hears the row's label instead.
    expect(result.getByTestId('outfit-detail-why-rain-silhouette-rain_jacket', { includeHiddenElements: true }))
      .toBeOnTheScreen();
  });

  test('mild weather links no piece, so there is no "Why this outfit" at all', async () => {
    const result = await renderDetail(language, mildState, null, true);
    expect(result.queryByTestId('outfit-detail-why')).toBeNull();
    expect(result.queryByText(copy.whyOutfit.heading)).toBeNull();
  });

  test('an empty Closet asks once, owned or wanted, and hands over every piece in its drawn colour family', async () => {
    const onSeed = jest.fn();
    const result = await renderDetail(language, todayScreenState, { status: 'offer', addedCount: 0, onSeed });
    expect(result.getByText(copy.closetSeed.body)).toBeOnTheScreen();

    // The tap asks; Cancel goes back to the offer without adding anything.
    await fireEvent.press(result.getByTestId('outfit-detail-closet-seed-button'));
    expect(result.getByRole('header', { name: copy.closetSeed.question })).toBeOnTheScreen();
    await fireEvent.press(result.getByTestId('outfit-detail-closet-seed-cancel'));
    expect(result.queryByTestId('outfit-detail-closet-seed-choice')).toBeNull();
    expect(onSeed).not.toHaveBeenCalled();

    await fireEvent.press(result.getByTestId('outfit-detail-closet-seed-button'));
    expect(result.getByTestId('outfit-detail-closet-seed-wanted')).toHaveProp('accessibilityLabel', copy.closetSeed.choice.wanted);
    await fireEvent.press(result.getByTestId('outfit-detail-closet-seed-wanted'));
    expect(onSeed).toHaveBeenCalledTimes(1);
    const [pieces, entryState] = onSeed.mock.calls[0] as [readonly { garmentTypeId: string; colorFamily: string | null }[], string];
    expect(entryState).toBe('wanted');
    expect(pieces.map(({ garmentTypeId }) => garmentTypeId)).toEqual(
      expect.arrayContaining(['rain_jacket', 'rain_boots']));
    expect(pieces.every(({ colorFamily }) => typeof colorFamily === 'string')).toBe(true);

    // Busy: the choice stays and every press is ignored, so a double tap cannot seed twice.
    await result.rerender(tree(language, todayScreenState, { status: 'busy', addedCount: 0, onSeed }));
    await fireEvent.press(result.getByTestId('outfit-detail-closet-seed-owned'));
    await fireEvent.press(result.getByTestId('outfit-detail-closet-seed-wanted'));
    expect(onSeed).toHaveBeenCalledTimes(1);

    // Added: the offer is gone and the confirmation says how many pieces went in.
    await result.rerender(tree(language, todayScreenState, { status: 'added', addedCount: 4, onSeed }));
    expect(result.queryByTestId('outfit-detail-closet-seed-button')).toBeNull();
    expect(result.queryByTestId('outfit-detail-closet-seed-choice')).toBeNull();
    expect(result.getByText(copy.closetSeed.added(4))).toBeOnTheScreen();
  });

  test('a failed seed keeps the offer and says so; a Closet with pieces gets no offer', async () => {
    const onSeed = jest.fn();
    const result = await renderDetail(language, todayScreenState, { status: 'failed', addedCount: 0, onSeed });
    expect(result.getByTestId('outfit-detail-closet-seed-button')).toBeOnTheScreen();
    expect(result.getByText(copy.closetSeed.failed)).toBeOnTheScreen();

    await result.rerender(tree(language, todayScreenState, null));
    expect(result.queryByTestId('outfit-detail-closet-seed-button')).toBeNull();
    expect(result.queryByText(copy.closetSeed.body)).toBeNull();
  });
});
