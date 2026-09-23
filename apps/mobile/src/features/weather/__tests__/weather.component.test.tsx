import { router } from 'expo-router';
import { act, fireEvent, isHiddenFromAccessibility, render, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AppState, Dimensions, processColor, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { FirstUseTracker } from '@/features/analytics/application/first-use-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import { ProductAnalyticsContext } from '@/features/analytics/application/use-product-analytics';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { WeatherApplicationContext, type WeatherApplicationValue } from '@/features/weather/application/weather-application-context';
import { getManualLocation } from '@/features/weather/data/manual-location-catalog';
import type { WeatherReadyState } from '@/features/weather/application/weather-application-controller';
import { WeatherScreen } from '@/features/weather/presentation/weather-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { layout, lightTheme, spacing, typography } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-router', () => {
  const actualReact = jest.requireActual('react');
  return {
    router: { push: jest.fn() },
    Stack: { Screen: () => null },
    useFocusEffect: (callback: () => void | (() => void)) => actualReact.useEffect(callback, [callback]),
    useIsFocused: () => true,
  };
});

// eslint-disable-next-line import/first
import WeatherRoute from '@/app/(tabs)/weather';

// "Last updated" is read in the device time zone while the rail stays in the location's.
// `test:components` pins the device zone to UTC; the sample location is Europe/Istanbul.
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

const originalWindowDimensions = Dimensions.get('window');

function mockFontScale(fontScale: number) {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale } });
}

// The sample snapshot's hours are 09:00 and 10:00 UTC on 2026-07-30; the rail keeps only
// the hours that have not ended, so the clock sits inside the first of them by default.
let clock: jest.SpyInstance<number, []>;

beforeEach(() => {
  clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-30T09:30:00.000Z'));
});

afterEach(() => {
  clock.mockRestore();
  Dimensions.set({ window: originalWindowDimensions });
});

const baseState: WeatherReadyState = {
  status: 'ready', activeLocation: null, snapshot: null, freshness: null,
  permission: { kind: 'undetermined' }, locationFlow: 'idle',
  isSelectingLocation: false, isRefreshing: false, refreshFailure: null,
};

function sampleSnapshot(sourceId = 'test') {
  const location = getManualLocation('sample.istanbul')!;
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4', localProfileId: 'profile-id',
    locationKey: location.locationKey, timeZone: location.timeZone,
    fetchedAt: '2026-07-30T09:00:00.000Z',
    origin: { kind: 'sample' as const, sourceId },
    current: {
      observedAt: '2026-07-30T09:00:00.000Z', temperatureCelsius: 16,
      apparentTemperatureCelsius: 15, condition: 'rain' as const,
      precipitationProbability: 0.5, windSpeedMetersPerSecond: 4,
      humidity: 0.7, uvIndex: 2,
    },
    minimumTemperatureCelsius: 12, maximumTemperatureCelsius: 19,
    hourly: [
      {
        forecastAt: '2026-07-30T09:00:00.000Z', temperatureCelsius: 16,
        apparentTemperatureCelsius: 15, condition: 'rain' as const,
        precipitationProbability: 0.5, windSpeedMetersPerSecond: 4,
        humidity: 0.7, uvIndex: 2,
      },
      {
        forecastAt: '2026-07-30T10:00:00.000Z', temperatureCelsius: 17,
        apparentTemperatureCelsius: 16, condition: 'cloudy' as const,
        precipitationProbability: 0.2, windSpeedMetersPerSecond: 3,
        humidity: 0.65, uvIndex: 3,
      },
    ],
  };
}

function createProductAnalyticsValue() {
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
  language,
  value,
  productAnalytics,
  hour12 = false,
}: PropsWithChildren<{
  language: SupportedLanguage;
  value: WeatherApplicationValue;
  productAnalytics?: ReturnType<typeof createProductAnalyticsValue>;
  hour12?: boolean;
}>) {
  return (
    <LocalizationContext.Provider value={{ language, messages: messages[language], hour12 }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <ProductAnalyticsContext value={productAnalytics ?? createProductAnalyticsValue()}>
          <WeatherApplicationContext.Provider value={value}>
            <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
          </WeatherApplicationContext.Provider>
        </ProductAnalyticsContext>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>
  );
}

function createValue(state: WeatherApplicationValue['state'] = baseState) {
  return {
    state,
    retry: jest.fn(async () => undefined),
    dismissLocationFlow: jest.fn(),
    beginDeviceLocationSelection: jest.fn(async () => undefined),
    confirmDeviceLocationRequest: jest.fn(async () => undefined),
    openApplicationSettings: jest.fn(async () => undefined),
    selectManualLocation: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    revalidateFreshness: jest.fn(async () => undefined),
    getSnapshot: undefined as (() => WeatherApplicationValue['state']) | undefined,
  } satisfies WeatherApplicationValue;
}

describe.each(['en', 'tr'] as const)('%s Weather screen', (language) => {
  test('opens the dedicated location route without a sample picker on Weather', async () => {
    const value = createValue();
    const result = await render(
      <Providers language={language} value={value}><WeatherScreen /></Providers>,
    );
    const copy = messages[language].weather;
    expect(result.queryByText(copy.sampleDisclosure)).toBeNull();
    const locationButton = result.getByRole('button', {
      name: `${copy.noLocation} ${copy.changeLocationAction}`,
    });
    // ADR 0028's row anatomy carries the 44 target itself, the way Profile's does.
    expect(StyleSheet.flatten(locationButton.props.style))
      .toMatchObject({ minHeight: layout.minimumTouchTarget, paddingVertical: spacing.md });
    await fireEvent.press(locationButton);
    expect(router.push).toHaveBeenCalledWith('/weather/location');
    expect(result.queryByRole('radiogroup')).toBeNull();
    expect(result.getByTestId('weather-change-location-button')).toBeOnTheScreen();
  });

  test.each([
    ['offline', 'offlineTitle', 'offlineBody'],
    ['unavailable', 'unavailableTitle', 'unavailableBody'],
    ['rate-limited', 'rateLimitedTitle', 'rateLimitedBody'],
  ] as const)('shows a localized cacheless %s state with an accessible retry', async (
    refreshFailure,
    titleKey,
    bodyKey,
  ) => {
    const active = getManualLocation('sample.istanbul')!;
    const value = createValue({ ...baseState, activeLocation: active, refreshFailure });
    const result = await render(
      <Providers language={language} value={value}><WeatherScreen /></Providers>,
    );
    const copy = messages[language].weather;
    expect(result.getByRole('header', { name: copy[titleKey] })).toBeOnTheScreen();
    expect(result.getByText(copy[bodyKey]).props.accessibilityLiveRegion).toBe('polite');
    expect(result.queryByText(copy.sampleDisclosure)).toBeNull();
    await fireEvent.press(result.getByRole('button', { name: copy.refreshAccessibilityLabel }));
    expect(value.refresh).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['offline', 'offlineNotice'],
    ['unavailable', 'unavailableNotice'],
    ['rate-limited', 'rateLimitedNotice'],
  ] as const)('keeps cached stale weather visible with a localized %s notice', async (
    refreshFailure,
    noticeKey,
  ) => {
    const active = getManualLocation('sample.istanbul')!;
    const value = createValue({
      ...baseState,
      activeLocation: active,
      snapshot: sampleSnapshot(),
      freshness: 'stale',
      refreshFailure,
    });
    const result = await render(
      <Providers language={language} value={value}><WeatherScreen /></Providers>,
    );
    const copy = messages[language].weather;
    expect(result.getByTestId('weather-freshness')).toHaveTextContent(copy.refreshFailed);
    expect(result.getByText(copy.sampleDisclosure)).toBeOnTheScreen();
    expect(result.getAllByText(copy.conditions.rain).length).toBeGreaterThan(0);
    expect(result.getByLabelText(copy[noticeKey]).props.accessibilityLiveRegion).toBe('polite');
  });

  test('groups localized current metrics and hides the decorative glyph', async () => {
    const value = createValue({
      ...baseState,
      activeLocation: getManualLocation('sample.istanbul')!,
      snapshot: sampleSnapshot(),
      freshness: 'fresh',
    });
    const result = await render(
      <Providers language={language} value={value}><WeatherScreen /></Providers>,
    );
    expect(result.getByLabelText(language === 'en'
      ? 'Rain. 16.0°. Feels like 15.0°. Low 12.0° · High 19.0°. 50% precipitation'
      : 'Yağmurlu. Sıcaklık 16,0°. Hissedilen sıcaklık 15,0°. En düşük 12,0°, en yüksek 19,0°. Yağış olasılığı yüzde 50.')).toBeOnTheScreen();
    expect(result.getByLabelText(language === 'en'
      ? 'Wind 4 m/s'
      : 'Rüzgâr 4 m/sn')).toBeOnTheScreen();
    expect(result.getByLabelText(language === 'en'
      ? '70% humidity'
      : '%70 nem')).toBeOnTheScreen();
    expect(result.getByLabelText(language === 'en'
      ? 'UV index 2'
      : 'UV endeksi 2')).toBeOnTheScreen();
    expect(result.getByLabelText(language === 'en'
      ? '12:00. 16.0°. Rain. 50% precipitation'
      : 'Saat 12:00. Sıcaklık 16,0°. Yağmurlu. Yağış olasılığı yüzde 50.')).toBeOnTheScreen();
    expect(result.getByText(language === 'en' ? '4 m/s' : '4 m/sn')).toBeOnTheScreen();
    expect(result.getByText(language === 'en' ? '70%' : '%70')).toBeOnTheScreen();
    const currentCard = result.getByTestId('weather-current-card');
    expect(within(currentCard).getByText(language === 'en'
      ? 'Feels like 15.0° · Low 12.0° · High 19.0°'
      : 'Hissedilen 15,0° · En düşük 12,0° · En yüksek 19,0°')).toBeOnTheScreen();
    expect(within(currentCard).queryByText(
      messages[language].weather.precipitation(0.5),
    )).toBeNull();
    expect(StyleSheet.flatten(currentCard.props.style)).toMatchObject(lightTheme.elevation.raised);
    expect(StyleSheet.flatten(within(currentCard).getByText(language === 'en' ? '16.0°' : '16,0°').props.style).fontSize)
      .toBe(typography.display.fontSize);
    expect(StyleSheet.flatten(result.getByTestId('weather-hourly-card').props.style))
      .toMatchObject(lightTheme.elevation.raised);
    expect(result.getByRole('header', {
      name: messages[language].weather.hourlyHeading,
    })).toBeOnTheScreen();
    expect(result.getAllByTestId('weather-hourly-band', { includeHiddenElements: true }))
      .toHaveLength(2);
    expect(result.queryByTestId('weather-hour-divider', { includeHiddenElements: true }))
      .toBeNull();
    expect(result.queryByTestId('weather-hour-precipitation-bar', {
      includeHiddenElements: true,
    })).toBeNull();
    expect(isHiddenFromAccessibility(
      result.getByTestId('weather-glyph', { includeHiddenElements: true }),
    )).toBe(true);
  });

  test.each(['open-meteo', 'openweather', 'weatherkit'] as const)(
    'omits %s attribution from Weather', async (sourceId) => {
    const value = createValue({
      ...baseState,
      activeLocation: getManualLocation('sample.istanbul')!,
      snapshot: sampleSnapshot(sourceId),
      freshness: 'fresh',
    });
    const result = await render(
      <Providers language={language} value={value}><WeatherScreen /></Providers>,
    );
    expect(result.queryByText(messages[language].weather.attributionOpenMeteo)).toBeNull();
    expect(result.queryByText(messages[language].weather.attributionOpenWeather)).toBeNull();
    expect(result.queryByText(messages[language].weather.attributionAppleWeather)).toBeNull();
  });

  test.each(['sample', 'kuyara-worker-weather-v1', 'unknown-source'])(
    'renders no attribution link for the %s source',
    async (sourceId) => {
      const value = createValue({
        ...baseState,
        activeLocation: getManualLocation('sample.istanbul')!,
        snapshot: sampleSnapshot(sourceId),
        freshness: 'fresh',
      });
      const result = await render(
        <Providers language={language} value={value}><WeatherScreen /></Providers>,
      );
      expect(result.queryByRole('link')).toBeNull();
    },
  );
});

test('selected location, stale snapshot, refreshing, failure, and hourly content remain visible', async () => {
  const active = getManualLocation('sample.istanbul')!;
  const value = createValue({
    ...baseState,
    activeLocation: active,
    snapshot: sampleSnapshot(),
    freshness: 'stale',
    isRefreshing: true,
    refreshFailure: 'unavailable',
  });
  const result = await render(
    <Providers language="en" value={value}><WeatherScreen /></Providers>,
  );
  await fireEvent.press(result.getByRole('button', {
    name: `${active.displayName}. ${messages.en.weather.changeLocationAction}`,
  }));
  expect(result.getByText(active.displayName)).toBeOnTheScreen();
  // Refreshing outranks the failure, which outranks staleness, as on Today.
  expect(result.getByTestId('weather-freshness')).toHaveTextContent(messages.en.weather.refreshing);
  expect(result.getByLabelText(messages.en.weather.unavailableNotice).props.accessibilityLiveRegion).toBe('polite');
  expect(result.getAllByText(messages.en.weather.conditions.rain).length).toBeGreaterThan(0);
  expect(
    result.getByLabelText(messages.en.weather.refreshAccessibilityLabel).props.accessibilityState
      .busy,
  ).toBe(true);
});

test('the intro line gives way to the location, and the refresh control sits under it', async () => {
  const empty = createValue();
  const emptyResult = await render(
    <Providers language="en" value={empty}><WeatherScreen /></Providers>,
  );
  expect(emptyResult.getByText(messages.en.weather.introduction)).toBeOnTheScreen();
  expect(emptyResult.queryByTestId('weather-refresh-button')).toBeNull();

  const selected = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(),
    freshness: 'fresh',
  });
  const result = await render(
    <Providers language="en" value={selected}><WeatherScreen /></Providers>,
  );

  expect(result.queryByText(messages.en.weather.introduction)).toBeNull();
  expect(result.getByTestId('weather-refresh-button')).toBeOnTheScreen();
});

test('the current conditions lead and the location control follows once a snapshot exists', async () => {
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(),
    freshness: 'fresh',
  });
  const result = await render(
    <Providers language="en" value={value}><WeatherScreen /></Providers>,
  );

  // Queries return elements in tree order, so the block order is the array order.
  const blocks = result
    .getAllByTestId(/^weather-(current-card|location-section|hourly-card)$/)
    .map((element) => element.props.testID);
  expect(blocks).toEqual(['weather-current-card', 'weather-location-section', 'weather-hourly-card']);
  expect(result.getByText(/^Last updated at /)).toBeOnTheScreen();
});

test('the meaning of the day leads the measurements inside the current card', async () => {
  for (const language of ['en', 'tr'] as const) {
    const value = createValue({
      ...baseState,
      activeLocation: getManualLocation('sample.istanbul')!,
      snapshot: sampleSnapshot(),
      freshness: 'fresh',
    });
    const result = await render(
      <Providers language={language} value={value}><WeatherScreen /></Providers>,
    );

    // It is raining at 09:30Z and the 10:00Z hour is cloudy, so the rain eases at 13:00
    // Istanbul time. The hero, then the meaning, then the measurements after the divider.
    const currentCard = result.getByTestId('weather-current-card');
    expect(within(currentCard).getByTestId('weather-outlook')).toHaveTextContent(
      language === 'en' ? 'Rain eases around 13:00' : 'Yağmur 13:00 civarında hafifliyor',
    );
    expect(within(currentCard)
      .getAllByTestId(/^weather-(outlook|current-divider)$/, { includeHiddenElements: true })
      .map((element) => element.props.testID))
      .toEqual(['weather-outlook', 'weather-current-divider']);
    await result.unmount();
  }
});

test('a rest of day that changes nothing says so, and a day almost over says nothing', async () => {
  const steady = sampleSnapshot();
  const clear = {
    temperatureCelsius: 16, apparentTemperatureCelsius: 15, condition: 'clear' as const,
    precipitationProbability: 0, windSpeedMetersPerSecond: 4, humidity: 0.7, uvIndex: 2,
  };
  const withHours = (hours: readonly string[]) => ({
    ...steady,
    current: { observedAt: steady.current.observedAt, ...clear },
    hourly: hours.map((forecastAt) => ({ forecastAt, ...clear })),
  });

  const result = await render(
    <Providers
      language="en"
      value={createValue({
        ...baseState,
        activeLocation: getManualLocation('sample.istanbul')!,
        snapshot: withHours(['2026-07-30T10:00:00.000Z', '2026-07-30T11:00:00.000Z']),
        freshness: 'fresh',
      })}>
      <WeatherScreen />
    </Providers>,
  );
  expect(result.getByTestId('weather-outlook'))
    .toHaveTextContent(messages.en.weather.outlook.steady);
  await result.unmount();

  // One hour left is too little of a day for "no notable change" to be worth a line.
  const lateEvening = await render(
    <Providers
      language="en"
      value={createValue({
        ...baseState,
        activeLocation: getManualLocation('sample.istanbul')!,
        snapshot: withHours(['2026-07-30T10:00:00.000Z']),
        freshness: 'fresh',
      })}>
      <WeatherScreen />
    </Providers>,
  );
  expect(lateEvening.queryByTestId('weather-outlook')).toBeNull();
});

// Owner decision of 18 September 2026: every temperature the app prints carries one decimal
// in the reader's own separator, and a swing is printed by the same formatter. This pins the
// sentence so the difference is never quietly rounded back to a whole degree.
test('a temperature swing is spelled with the one decimal every temperature carries', async () => {
  const base = sampleSnapshot();
  const clear = {
    condition: 'clear' as const, precipitationProbability: 0,
    windSpeedMetersPerSecond: 4, humidity: 0.7, uvIndex: 2,
  };
  const snapshot = {
    ...base,
    current: {
      observedAt: base.current.observedAt,
      temperatureCelsius: 16, apparentTemperatureCelsius: 15, ...clear,
    },
    hourly: [
      {
        forecastAt: '2026-07-30T10:00:00.000Z',
        temperatureCelsius: 7, apparentTemperatureCelsius: 6.6, ...clear,
      },
      {
        forecastAt: '2026-07-30T11:00:00.000Z',
        temperatureCelsius: 7, apparentTemperatureCelsius: 6.6, ...clear,
      },
    ],
  };

  for (const [language, sentence] of [
    ['en', 'Down 8.4\u00b0 by 13:00'],
    ['tr', 'Saat 13:00 civar\u0131nda 8,4\u00b0 d\u00fc\u015f\u00fcyor'],
  ] as const) {
    const result = await render(
      <Providers
        language={language}
        value={createValue({
          ...baseState,
          activeLocation: getManualLocation('sample.istanbul')!,
          snapshot,
          freshness: 'fresh',
        })}>
        <WeatherScreen />
      </Providers>,
    );
    expect(result.getByTestId('weather-outlook')).toHaveTextContent(sentence);
    await result.unmount();
  }
});

test('without a snapshot the location control stays the first block after the title', async () => {
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: null,
    freshness: null,
    refreshFailure: 'offline',
  });
  const result = await render(
    <Providers language="en" value={value}><WeatherScreen /></Providers>,
  );
  const placeName = getManualLocation('sample.istanbul')!.displayName;

  expect(result.queryByTestId('weather-current-card')).toBeNull();
  expect(result.queryByText(messages.en.weather.introduction)).toBeNull();
  // Text queries return nodes in tree order: the location row's own label comes first.
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const texts = result
    .getAllByText(new RegExp(`^(${escape(placeName)}|${escape(messages.en.weather.offlineBody)})$`))
    .map((element) => element.props.children);
  expect(texts).toEqual([placeName, messages.en.weather.offlineBody]);
});

test('the freshness line announces only while it is not fresh', async () => {
  const fresh = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(),
    freshness: 'fresh',
  });
  const freshResult = await render(
    <Providers language="en" value={fresh}><WeatherScreen /></Providers>,
  );
  const freshLine = freshResult.getByTestId('weather-freshness');
  expect(freshLine).toHaveTextContent(messages.en.weather.fresh);
  expect(freshLine.props.accessibilityLiveRegion).toBe('none');

  const stale = createValue({ ...fresh.state, freshness: 'stale' } as WeatherReadyState);
  const staleResult = await render(
    <Providers language="en" value={stale}><WeatherScreen /></Providers>,
  );
  const staleLine = staleResult.getByTestId('weather-freshness');
  expect(staleLine).toHaveTextContent(messages.en.weather.stale);
  expect(staleLine.props.accessibilityLiveRegion).toBe('polite');
});

test('the cold load says it is loading rather than refreshing', async () => {
  const result = await render(
    <Providers language="en" value={createValue({ status: 'loading' })}><WeatherScreen /></Providers>,
  );

  expect(result.getByText(messages.en.weather.loading)).toBeOnTheScreen();
  expect(result.queryByText(messages.en.weather.refreshing)).toBeNull();
});

test('returning to Weather re-evaluates freshness', async () => {
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(),
    freshness: 'fresh',
  });

  await render(<Providers language="en" value={value}><WeatherScreen /></Providers>);

  expect(value.revalidateFreshness).toHaveBeenCalledTimes(1);
});

test.each([
  [false, '12:00', 'Last updated at 09:00'],
  [true, '12:00 pm', 'Last updated at 9:00 am'],
] as const)('hour labels follow the device clock setting (hour12: %s)', async (
  hour12,
  railLabel,
  updatedLabel,
) => {
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(),
    freshness: 'fresh',
  });

  const result = await render(
    <Providers hour12={hour12} language="en" value={value}><WeatherScreen /></Providers>,
  );

  // The rail stays in the location's zone (09:00 UTC is 12:00 in Istanbul); the label does not.
  expect(result.getByText(railLabel)).toBeOnTheScreen();
  expect(result.getByText(updatedLabel.replace(/\u00a0|\u202f/gu, ' '))).toBeOnTheScreen();
});

test('an older English snapshot uses the same day-first date order as Today', async () => {
  const snapshot = { ...sampleSnapshot(), fetchedAt: '2026-07-28T21:30:00.000Z' };
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot,
    freshness: 'stale',
  });

  const result = await render(
    <Providers language="en" value={value}><WeatherScreen /></Providers>,
  );

  expect(result.getByText(/28\/07\/2026/)).toBeOnTheScreen();
});

test('foregrounding Weather advances its screen clock without a navigation refocus', async () => {
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(),
    freshness: 'stale',
  });
  const changeHandlers: ((state: 'active') => void)[] = [];
  const removeListener = jest.fn();
  const originalAddEventListener = AppState.addEventListener;
  AppState.addEventListener = jest.fn(
    (_event, handler) => {
      changeHandlers.push(handler as (state: 'active') => void);
      return { remove: removeListener };
    },
  ) as typeof AppState.addEventListener;
  const result = await render(
    <Providers language="en" value={value}><WeatherScreen /></Providers>,
  );
  expect(result.getByTestId('weather-hourly-card')).toBeOnTheScreen();
  expect(changeHandlers.length).toBeGreaterThan(0);

  clock.mockReturnValue(Date.parse('2026-07-31T09:30:00.000Z'));
  await act(async () => {
    for (const changeHandler of changeHandlers) changeHandler('active');
  });

  expect(result.queryByTestId('weather-hourly-card', { includeHiddenElements: true })).toBeNull();
  expect(result.getByText(/30\/07\/2026/)).toBeOnTheScreen();
  await result.unmount();
  expect(removeListener).toHaveBeenCalled();
  AppState.addEventListener = originalAddEventListener;
});

test('Weather renders a searched place from its persisted display name', async () => {
  const value = createValue({ ...baseState, activeLocation: {
    source: 'manual', catalogId: 'place.745044', displayName: 'İstanbul',
    locationKey: 'manual:place.745044', coordinates: { latitudeE2: 4101, longitudeE2: 2898 },
    timeZone: 'Europe/Istanbul',
  } });
  const result = await render(<Providers language="tr" value={value}><WeatherScreen /></Providers>);
  expect(result.getByText('İstanbul')).toBeOnTheScreen();
});

// ADR 0028: Weather's location control is the shared list row Profile draws, so the row's
// own primitive owns the text scaling and this screen only has to hand it the place.
test.each([[1], [3.12]] as const)(
  'Weather at fontScale %s draws the location as the shared list row',
  async (fontScale) => {
    mockFontScale(fontScale);
    const active = getManualLocation('sample.istanbul')!;
    const result = await render(
      <Providers language="en" value={createValue({ ...baseState, activeLocation: active })}>
        <WeatherScreen />
      </Providers>,
    );

    const row = result.getByTestId('weather-change-location-button');
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({
      flexDirection: 'row',
      minHeight: layout.minimumTouchTarget,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    });
    expect(result.getByTestId('weather-change-location-button-tile')).toBeOnTheScreen();
    expect(within(row).getByText(active.displayName)).toBeOnTheScreen();
  },
);

test('Weather at font scale 3.1 keeps its actions, hourly heading, and last column intact', async () => {
  mockFontScale(3.1);
  const active = getManualLocation('sample.istanbul')!;
  const result = await render(
    <Providers
      language="en"
      value={createValue({
        ...baseState,
        activeLocation: active,
        snapshot: sampleSnapshot(),
        freshness: 'fresh',
      })}>
      <WeatherScreen />
    </Providers>,
  );

  expect(result.getByText(messages.en.weather.refresh)).toHaveTextContent('Refresh');
  expect(result.getByText(messages.en.weather.refresh).props.numberOfLines).toBeUndefined();
  expect(result.getByTestId('weather-change-location-button')).toBeOnTheScreen();
  expect(StyleSheet.flatten(result.getByRole('header', {
    name: messages.en.weather.hourlyHeading,
  }).props.style)).toMatchObject({ lineHeight: typography.bodyStrong.lineHeight });
  expect(within(result.getByTestId('weather-hourly-rail'))
    .getByLabelText('13:00. 17.0°. Cloudy. 20% precipitation')).toBeOnTheScreen();
});

test('Weather offers a pull-to-refresh gesture alongside the visible refresh button', async () => {
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(),
    freshness: 'fresh',
  });
  const result = await render(
    <Providers language="en" value={value}>
      <WeatherScreen />
    </Providers>,
  );

  const button = result.getByTestId('weather-refresh-button');
  expect(button.props.accessibilityLabel).toBe(messages.en.weather.refreshAccessibilityLabel);
  expect(result.getByText(messages.en.weather.refresh)).toBeOnTheScreen();
  // The control carries the 44-point target in its own box rather than in a hitSlop the
  // layout cannot see; the Pill inside keeps its size and sits centred.
  expect(StyleSheet.flatten(button.props.style)).toMatchObject({
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
  });
  fireEvent.press(button);
  expect(value.refresh).toHaveBeenCalledTimes(1);

  const refreshControl = result.getByTestId('weather-screen').props.refreshControl;
  expect(refreshControl).toBeTruthy();
  expect(refreshControl.props.refreshing).toBe(false);

  refreshControl.props.onRefresh();
  expect(value.refresh).toHaveBeenCalledTimes(2);
});

test('the pull control spins only for a pulled refresh, not for one already in flight at mount', async () => {
  let finishRefresh!: (value: undefined) => void;
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(),
    freshness: 'stale',
    isRefreshing: true,
  });
  value.refresh.mockImplementation(() => new Promise<undefined>((resolve) => { finishRefresh = resolve; }));
  const result = await render(
    <Providers language="en" value={value}><WeatherScreen /></Providers>,
  );
  const control = () => result.getByTestId('weather-screen').props.refreshControl;
  // A location change starts a refresh before the screen shows; the control must not
  // adopt it, because iOS keeps a programmatically started inset until the next pull.
  expect(control().props.refreshing).toBe(false);

  await act(async () => { control().props.onRefresh(); });
  expect(control().props.refreshing).toBe(true);
  await act(async () => { finishRefresh(undefined); });
  expect(control().props.refreshing).toBe(false);
});

test('a successful manual refresh reports manual_refresh_triggered and feature_used_first_time once', async () => {
  const readyState: WeatherReadyState = {
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(),
    freshness: 'fresh',
  };
  const value = createValue(readyState);
  value.refresh.mockImplementation(async () => undefined);
  value.getSnapshot = () => value.state;
  const productAnalytics = createProductAnalyticsValue();
  const result = await render(
    <Providers language="en" productAnalytics={productAnalytics} value={value}>
      <WeatherScreen />
    </Providers>,
  );

  await fireEvent.press(result.getByTestId('weather-refresh-button'));

  expect(productAnalytics.analytics.captures).toEqual([{
    name: 'manual_refresh_triggered',
    properties: { schema_version: 3, surface: 'weather', result: 'success' },
    options: undefined,
  }, {
    name: 'feature_used_first_time',
    properties: { schema_version: 3, feature_name: 'manual_refresh' },
    options: undefined,
  }]);

  productAnalytics.analytics.captures.length = 0;
  await fireEvent.press(result.getByTestId('weather-refresh-button'));
  expect(productAnalytics.analytics.captures).toEqual([{
    name: 'manual_refresh_triggered',
    properties: { schema_version: 3, surface: 'weather', result: 'success' },
    options: undefined,
  }]);
});

test('refreshing while a failure is shown reports retry_after_failure_triggered with a growing attempt number', async () => {
  const readyState: WeatherReadyState = {
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: null,
    freshness: null,
    refreshFailure: 'offline',
  };
  const value = createValue(readyState);
  value.refresh.mockImplementation(async () => undefined);
  value.getSnapshot = () => value.state;
  const productAnalytics = createProductAnalyticsValue();
  const result = await render(
    <Providers language="en" productAnalytics={productAnalytics} value={value}>
      <WeatherScreen />
    </Providers>,
  );

  await fireEvent.press(result.getByRole('button', { name: messages.en.weather.refreshAccessibilityLabel }));
  expect(productAnalytics.analytics.captures).toEqual([{
    name: 'retry_after_failure_triggered',
    properties: { schema_version: 3, surface: 'weather', attempt_number: 1, result: 'failure' },
    options: undefined,
  }]);

  productAnalytics.analytics.captures.length = 0;
  await fireEvent.press(result.getByRole('button', { name: messages.en.weather.refreshAccessibilityLabel }));
  expect(productAnalytics.analytics.captures).toEqual([{
    name: 'retry_after_failure_triggered',
    properties: { schema_version: 3, surface: 'weather', attempt_number: 2, result: 'failure' },
    options: undefined,
  }]);
});

test('the focused Weather route reports a shown failure and its recovery', async () => {
  const productAnalytics = createProductAnalyticsValue();
  const result = await render(
    <Providers
      language="en"
      productAnalytics={productAnalytics}
      value={createValue({ ...baseState, refreshFailure: 'offline' })}>
      <WeatherRoute />
    </Providers>,
  );

  await result.rerender(
    <Providers
      language="en"
      productAnalytics={productAnalytics}
      value={createValue(baseState)}>
      <WeatherRoute />
    </Providers>,
  );

  const errors = productAnalytics.analytics.captures.filter(
    ({ name }) => name === 'error_shown' || name === 'error_recovered',
  );
  expect(errors.map(({ properties }) => properties)).toEqual([
    { schema_version: 3, surface: 'weather', failure_category: 'offline', occurrence_count: 1 },
    { schema_version: 3, surface: 'weather', failure_category: 'offline' },
  ]);
});

test('leaving Weather resets its retry attempt counter', async () => {
  const productAnalytics = createProductAnalyticsValue();
  productAnalytics.retries.nextAttempt('weather');
  const result = await render(
    <Providers language="en" productAnalytics={productAnalytics} value={createValue()}>
      <WeatherRoute />
    </Providers>,
  );

  await result.unmount();
  expect(productAnalytics.retries.nextAttempt('weather')).toBe(1);
});

test('the hourly rail drops the hours that have ended', async () => {
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(),
    freshness: 'stale',
  });
  const hidden = { includeHiddenElements: true };
  clock.mockReturnValue(Date.parse('2026-07-30T10:30:00.000Z'));
  const result = await render(<Providers language="en" value={value}><WeatherScreen /></Providers>);
  const bands = result.getAllByTestId('weather-hourly-band', hidden);
  expect(bands).toHaveLength(1);
  expect(result.getByLabelText('13:00. 17.0°. Cloudy. 20% precipitation')).toBeOnTheScreen();
  expect(result.queryByLabelText('12:00. 16.0°. Rain. 50% precipitation')).toBeNull();

});

test('a dry hour drops the chance from the rail but never from its label', async () => {
  const snapshot = sampleSnapshot();
  snapshot.hourly[1] = { ...snapshot.hourly[1], precipitationProbability: 0 };
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot,
    freshness: 'fresh',
  });
  clock.mockReturnValue(Date.parse('2026-07-30T09:10:00.000Z'));
  const result = await render(<Providers language="en" value={value}><WeatherScreen /></Providers>);
  const rail = within(result.getByTestId('weather-hourly-rail'));

  expect(rail.getByText('50%')).toBeOnTheScreen();
  expect(rail.queryByText('0%')).toBeNull();
  expect(result.getByLabelText('13:00. 17.0°. Cloudy. 0% precipitation')).toBeOnTheScreen();
});

test('the hourly card is not rendered once every hour of the snapshot\'s day has ended', async () => {
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(),
    freshness: 'stale',
  });
  clock.mockReturnValue(Date.parse('2026-07-30T11:00:00.000Z'));
  const result = await render(<Providers language="en" value={value}><WeatherScreen /></Providers>);
  expect(result.queryByTestId('weather-hourly-card', { includeHiddenElements: true })).toBeNull();
  expect(result.getByTestId('weather-current-card')).toBeOnTheScreen();
});

test.each([
  ['en', 'Fri', 'Friday, 00:00. 18.0°. Cloudy. 20% precipitation'],
  ['tr', 'Cum', 'Cuma, saat 00:00. Sıcaklık 18,0°. Bulutlu. Yağış olasılığı yüzde 20.'],
] as const)('marks the first %s column of a new local day', async (
  language,
  shortWeekday,
  accessibilityLabel,
) => {
  const snapshot = sampleSnapshot();
  snapshot.hourly.push({
    ...snapshot.hourly[1],
    forecastAt: '2026-07-30T21:00:00.000Z',
    temperatureCelsius: 18,
  });
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot,
    freshness: 'fresh',
  });
  clock.mockReturnValue(Date.parse('2026-07-30T10:30:00.000Z'));

  const result = await render(
    <Providers language={language} value={value}><WeatherScreen /></Providers>,
  );

  expect(result.getByText(shortWeekday)).toBeOnTheScreen();
  expect(result.getByLabelText(accessibilityLabel)).toBeOnTheScreen();
});

test('the hourly rail scrolls horizontally and plots one accent temperature series', async () => {
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(),
    freshness: 'fresh',
  });
  const result = await render(
    <Providers language="en" value={value}><WeatherScreen /></Providers>,
  );

  const rail = result.getByTestId('weather-hourly-rail');
  expect(rail.props.horizontal).toBe(true);
  expect(within(rail).getAllByLabelText(/precipitation$/)).toHaveLength(2);
  expect(result.getAllByText('50%').length).toBeGreaterThan(0);

  // The series is placed once the first plot band has been laid out, because its offset
  // inside a column depends on the scaled line boxes above it.
  const bands = result.getAllByTestId('weather-hourly-band', { includeHiddenElements: true });
  expect(result.queryByTestId('weather-hourly-series', { includeHiddenElements: true }))
    .toBeNull();
  await fireEvent(bands[0], 'layout', {
    nativeEvent: { layout: { x: 0, y: 42, width: 64, height: 64 } },
  });

  const series = result.getByTestId('weather-hourly-series', { includeHiddenElements: true });
  expect(isHiddenFromAccessibility(series)).toBe(true);
  expect(StyleSheet.flatten(series.props.style)).toMatchObject({ position: 'absolute', top: 42 });
  // The series is Weather's accent-coloured temperature encoding; the daily rails below
  // draw the same quantity in the same hue and count with it, not against it (Law 1).
  const line = result.getByTestId('weather-hourly-series-line', { includeHiddenElements: true });
  // react-native-svg normalizes the stroke into a processed colour before it reaches the
  // host element, so the accent is compared in that form.
  expect(line.props.stroke.payload).toBe(processColor(lightTheme.colors.brandAccent));
  // The series runs behind the rail, so each number knocks the stroke out with the card's
  // own fill instead of letting it cross the digits.
  const label = result.getAllByTestId('weather-hourly-temperature', { includeHiddenElements: true })[0];
  expect(StyleSheet.flatten(label.props.style)).toMatchObject({
    backgroundColor: lightTheme.colors.surface,
    paddingHorizontal: spacing.xs,
    position: 'absolute',
  });
});

test('the UV stat is omitted at zero and wind and humidity keep their places', async () => {
  const copy = messages.en.weather;
  const night = sampleSnapshot();
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: { ...night, current: { ...night.current, uvIndex: 0 } },
    freshness: 'fresh',
  });
  const result = await render(
    <Providers language="en" value={value}><WeatherScreen /></Providers>,
  );

  // The stat captions are `eyebrow`, which renders uppercase, so the labels are matched
  // case-insensitively rather than against the localized casing.
  const label = (text: string) => new RegExp(`^${text}$`, 'i');
  expect(result.queryByText(label(copy.uvIndexLabel))).toBeNull();
  expect(result.getByText(label(copy.windLabel))).toBeOnTheScreen();
  expect(result.getByText(label(copy.humidityLabel))).toBeOnTheScreen();

  const day = await render(
    <Providers
      language="en"
      value={createValue({
        ...baseState,
        activeLocation: getManualLocation('sample.istanbul')!,
        snapshot: night,
        freshness: 'fresh',
      })}>
      <WeatherScreen />
    </Providers>,
  );
  expect(day.getByText(label(copy.uvIndexLabel))).toBeOnTheScreen();
});

test('device location card has one composed accessible name', async () => {
  const location = getManualLocation('sample.istanbul')!;
  const value = createValue({
    ...baseState,
    permission: { kind: 'granted', accuracy: 'approximate' },
    activeLocation: {
      source: 'device',
      accuracy: 'approximate',
      coordinates: location.coordinates,
      locationKey: 'device:4101:2898',
      timeZone: location.timeZone,
    },
  });
  const result = await render(
    <Providers language="en" value={value}><WeatherScreen /></Providers>,
  );

  expect(result.getByRole('button', {
    name: `${messages.en.weather.currentLocation}. ${messages.en.weather.approximateLocation}. ${messages.en.weather.changeLocationAction}`,
  })).toBeOnTheScreen();
  expect(result.queryByRole('button', { name: messages.en.weather.changeLocationAction })).toBeNull();
});

test('a named device location shows the locality and keeps its accuracy caption', async () => {
  const location = getManualLocation('sample.istanbul')!;
  const value = createValue({
    ...baseState,
    permission: { kind: 'granted', accuracy: 'approximate' },
    activeLocation: {
      source: 'device',
      accuracy: 'approximate',
      coordinates: location.coordinates,
      displayName: 'Kadıköy',
      locationKey: 'device:4101:2898',
      timeZone: location.timeZone,
    },
  });
  const result = await render(
    <Providers language="en" value={value}><WeatherScreen /></Providers>,
  );

  expect(result.getByRole('button', {
    name: `Kadıköy. ${messages.en.weather.approximateLocation}. ${messages.en.weather.changeLocationAction}`,
  })).toBeOnTheScreen();
  expect(result.queryByText(messages.en.weather.currentLocation)).toBeNull();
});

test.each(['en', 'tr'] as const)(
  '%s device location replaces accuracy with a last-known warning when access is off',
  async (language) => {
    const location = getManualLocation('sample.istanbul')!;
    const value = createValue({
      ...baseState,
      permission: { kind: 'denied', canRequestAgain: false },
      activeLocation: {
        source: 'device',
        accuracy: 'full',
        coordinates: location.coordinates,
        locationKey: 'device:4101:2898',
        timeZone: location.timeZone,
      },
    });
    const result = await render(
      <Providers language={language} value={value}><WeatherScreen /></Providers>,
    );

    const copy = messages[language].weather;
    expect(result.getByText(copy.locationAccessOff)).toBeOnTheScreen();
    expect(result.queryByText(copy.fullLocation)).toBeNull();
    expect(result.getByRole('button', {
      name: `${copy.currentLocation}. ${copy.locationAccessOff.replace(/[.!?…]+$/u, '')}. ${copy.changeLocationAction}`,
    })).toBeOnTheScreen();
  },
);

test('rounded weather measurements never render negative zero', async () => {
  const snapshot = sampleSnapshot();
  snapshot.current.temperatureCelsius = -0.4;
  snapshot.current.apparentTemperatureCelsius = -0.04;
  snapshot.current.windSpeedMetersPerSecond = -0.04;
  snapshot.minimumTemperatureCelsius = -0.04;
  snapshot.hourly[0].temperatureCelsius = -0.4;
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot,
    freshness: 'fresh',
  });
  const result = await render(
    <Providers language="en" value={value}><WeatherScreen /></Providers>,
  );

  // -0.4 is genuinely below zero and keeps its sign; -0.04 is not and must not borrow one.
  expect(result.queryAllByText('-0.0°')).toHaveLength(0);
  expect(result.getAllByText('-0.4°').length).toBeGreaterThan(0);
  expect(result.getByText('0 m/s')).toBeOnTheScreen();
});

// The outlook's own day is the local calendar day of the snapshot, 30 July in Istanbul, and
// the sixth entry proves the contract's extra room never reaches the screen.
const sampleDaily = [
  {
    dateKey: '2026-07-30', condition: 'rain' as const,
    minimumTemperatureCelsius: 12, maximumTemperatureCelsius: 19,
    precipitationProbability: 0.5, precipitationMillimetres: 1.4,
  },
  {
    dateKey: '2026-07-31', condition: 'cloudy' as const,
    minimumTemperatureCelsius: 14, maximumTemperatureCelsius: 22,
    precipitationProbability: 0.2, precipitationMillimetres: null,
  },
  {
    dateKey: '2026-08-01', condition: 'clear' as const,
    minimumTemperatureCelsius: 18, maximumTemperatureCelsius: 27,
    precipitationProbability: 0, precipitationMillimetres: null,
  },
  {
    dateKey: '2026-08-02', condition: 'partly_cloudy' as const,
    minimumTemperatureCelsius: 17, maximumTemperatureCelsius: 25,
    // Under half a millimetre: the amount is dropped rather than rounded to "0 mm".
    precipitationProbability: 0.1, precipitationMillimetres: 0.4,
  },
  {
    dateKey: '2026-08-03', condition: 'thunderstorm' as const,
    minimumTemperatureCelsius: 15, maximumTemperatureCelsius: 20,
    precipitationProbability: 0.8, precipitationMillimetres: 12,
  },
  {
    dateKey: '2026-08-04', condition: 'snow' as const,
    minimumTemperatureCelsius: -3, maximumTemperatureCelsius: 1,
    precipitationProbability: 0.9, precipitationMillimetres: 4,
  },
];

function dailyValue() {
  return createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: { ...sampleSnapshot(), daily: sampleDaily },
    freshness: 'fresh',
  });
}

test.each([
  [
    'en',
    ['Thu', 'Fri', 'Sat', 'Sun', 'Mon'],
    '1 mm · 50%',
    '20%',
    '10%',
    'Today, Thursday. Rain. Low 12.0° · High 19.0°. Now 16.0°. 1 mm, 50% precipitation',
    'Saturday. Clear. Low 18.0° · High 27.0°. 0% precipitation',
  ],
  [
    'tr',
    ['Per', 'Cum', 'Cmt', 'Paz', 'Pzt'],
    '1 mm · %50',
    '%20',
    '%10',
    'Bugün, Perşembe. Yağmurlu. En düşük 12,0°, en yüksek 19,0°. Şu an 16,0°. 1 milimetre yağış. Yağış olasılığı yüzde 50.',
    'Cumartesi. Açık. En düşük 18,0°, en yüksek 27,0°. Yağış olasılığı yüzde 0.',
  ],
] as const)('draws five %s outlook days with a full label on every row', async (
  language,
  weekdays,
  amountAndChance,
  chanceAlone,
  subMillimetreChance,
  todayLabel,
  dryDayLabel,
) => {
  const result = await render(
    <Providers language={language} value={dailyValue()}><WeatherScreen /></Providers>,
  );
  const card = within(result.getByTestId('weather-daily-card'));

  expect(result.getByRole('header', { name: messages[language].weather.dailyHeading }))
    .toBeOnTheScreen();
  expect(card.getAllByTestId('weather-daily-row')).toHaveLength(5);
  for (const day of weekdays) expect(card.getByText(day)).toBeOnTheScreen();
  // The sixth day the contract allows is never drawn, and neither is its snow.
  expect(card.queryByText('Tue')).toBeNull();
  expect(card.queryByText('Sal')).toBeNull();

  expect(card.getByText(amountAndChance)).toBeOnTheScreen();
  expect(card.getByText(chanceAlone)).toBeOnTheScreen();
  // Monday measured 0.4 mm, which rounds to nothing: its chance is shown alone.
  expect(card.getByText(subMillimetreChance)).toBeOnTheScreen();
  // A day with neither an amount nor a chance shows nothing at all, and its label still
  // states the chance, so the empty cell costs a screen reader nothing.
  expect(within(card.getAllByTestId('weather-daily-row')[2]).queryByText(/%/)).toBeNull();
  // Today is named in words and the rail's mark is stated as a number, so neither the
  // 3 point dot nor the row's position is the only thing that says which day this is.
  expect(result.getByLabelText(todayLabel)).toBeOnTheScreen();
  expect(result.getByLabelText(dryDayLabel)).toBeOnTheScreen();
});

test('one rail carries the current temperature, and only on today\'s row', async () => {
  const result = await render(
    <Providers language="en" value={dailyValue()}><WeatherScreen /></Providers>,
  );
  const card = within(result.getByTestId('weather-daily-card'));

  expect(card.getAllByTestId('weather-daily-rail', { includeHiddenElements: true }))
    .toHaveLength(5);
  const fills = card.getAllByTestId('weather-daily-rail-fill', { includeHiddenElements: true });
  expect(fills).toHaveLength(5);
  // The week runs 12 to 27, so Thursday's 12 to 19 starts at the cold end and covers the
  // first 47 per cent of it; every rail is positioned against that same range.
  expect(StyleSheet.flatten(fills[0].props.style)).toMatchObject({
    backgroundColor: lightTheme.colors.brandAccent,
    left: '0%',
    width: `${(19 - 12) / (27 - 12) * 100}%`,
  });
  const markers = card.getAllByTestId('weather-daily-rail-marker', { includeHiddenElements: true });
  expect(markers).toHaveLength(1);
});

test('above fontScale 1.5 the outlook range stacks under its day', async () => {
  mockFontScale(1.6);
  const result = await render(
    <Providers language="en" value={dailyValue()}><WeatherScreen /></Providers>,
  );

  const row = result.getAllByTestId('weather-daily-row')[0];
  expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'column' });
  // The rail survives the stack rather than being squeezed out between two numbers.
  expect(result.getAllByTestId('weather-daily-rail', { includeHiddenElements: true }))
    .toHaveLength(5);
});

test('a snapshot held across midnight drops the day that has ended', async () => {
  // One local day past the first entry: an offline device opening after midnight still
  // holds Thursday's snapshot, and Thursday is over.
  mockFontScale(1);
  clock.mockReturnValue(Date.parse('2026-07-31T09:30:00.000Z'));
  const result = await render(
    <Providers language="en" value={dailyValue()}><WeatherScreen /></Providers>,
  );
  const card = within(result.getByTestId('weather-daily-card'));

  // Still five rows, and Thursday is not one of them: the sixth contract day takes the
  // freed place rather than the card going short.
  expect(card.getAllByTestId('weather-daily-row')).toHaveLength(5);
  expect(card.queryByText('Thu')).toBeNull();
  expect(card.getByText('Fri')).toBeOnTheScreen();
  expect(card.getByText('Tue')).toBeOnTheScreen();
  // The mark and the word move with the day instead of disappearing with Thursday.
  expect(card.getAllByTestId('weather-daily-rail-marker', { includeHiddenElements: true }))
    .toHaveLength(1);
  expect(result.getByLabelText(
    'Today, Friday. Cloudy. Low 14.0° · High 22.0°. Now 16.0°. 20% precipitation',
  )).toBeOnTheScreen();
});

test('an outlook whose every day has ended renders no section', async () => {
  mockFontScale(1);
  clock.mockReturnValue(Date.parse('2026-08-10T09:30:00.000Z'));
  const result = await render(
    <Providers language="en" value={dailyValue()}><WeatherScreen /></Providers>,
  );

  expect(result.queryByTestId('weather-daily-card', { includeHiddenElements: true })).toBeNull();
});

test('a snapshot that carries no outlook renders no daily section at all', async () => {
  const value = createValue({
    ...baseState,
    activeLocation: getManualLocation('sample.istanbul')!,
    snapshot: sampleSnapshot(),
    freshness: 'fresh',
  });
  const result = await render(
    <Providers language="en" value={value}><WeatherScreen /></Providers>,
  );

  expect(result.queryByTestId('weather-daily-card', { includeHiddenElements: true })).toBeNull();
  expect(result.queryByText(messages.en.weather.dailyHeading)).toBeNull();
  expect(result.getByTestId('weather-hourly-card')).toBeOnTheScreen();
});
