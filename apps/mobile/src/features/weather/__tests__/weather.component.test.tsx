import { router } from 'expo-router';
import { act, fireEvent, isHiddenFromAccessibility, render, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, Linking, processColor, StyleSheet } from 'react-native';
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
import { lightTheme, typography } from '@/theme/theme';
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
}: PropsWithChildren<{
  language: SupportedLanguage;
  value: WeatherApplicationValue;
  productAnalytics?: ReturnType<typeof createProductAnalyticsValue>;
}>) {
  return (
    <LocalizationContext.Provider value={{ language, messages: messages[language] }}>
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
    expect(locationButton.props.hitSlop).toBe(10);
    expect(24 + locationButton.props.hitSlop * 2).toBeGreaterThanOrEqual(44);
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
    expect(result.getByText(copy.stale)).toBeOnTheScreen();
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
      ? 'Rain. 16°. Feels like 15°. Low 12° · High 19°. 50% precipitation'
      : 'Yağmurlu. Sıcaklık 16°. Hissedilen sıcaklık 15°. En düşük 12°, en yüksek 19°. Yağış olasılığı yüzde 50.')).toBeOnTheScreen();
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
      ? '12:00 PM. 16°. Rain. 50% precipitation'
      : 'Saat 12:00. Sıcaklık 16°. Yağmurlu. Yağış olasılığı yüzde 50.')).toBeOnTheScreen();
    expect(result.getByText(language === 'en' ? '4 m/s' : '4 m/sn')).toBeOnTheScreen();
    expect(result.getByText(language === 'en' ? '70%' : '%70')).toBeOnTheScreen();
    const currentCard = result.getByTestId('weather-current-card');
    expect(StyleSheet.flatten(currentCard.props.style)).toMatchObject(lightTheme.elevation.raised);
    expect(StyleSheet.flatten(within(currentCard).getByText('16°').props.style).fontSize)
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

  test.each([
    ['open-meteo', 'attributionOpenMeteo', 'https://open-meteo.com/'],
    ['openweather', 'attributionOpenWeather', 'https://openweathermap.org/'],
    [
      'weatherkit',
      'attributionAppleWeather',
      'https://developer.apple.com/weatherkit/data-source-attribution/',
    ],
  ] as const)('shows an accessible %s attribution link that opens its licence URL', async (
    sourceId,
    copyKey,
    url,
  ) => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const value = createValue({
      ...baseState,
      activeLocation: getManualLocation('sample.istanbul')!,
      snapshot: sampleSnapshot(sourceId),
      freshness: 'fresh',
    });
    const result = await render(
      <Providers language={language} value={value}><WeatherScreen /></Providers>,
    );
    const copy = messages[language].weather;
    const link = result.getByRole('link', { name: copy[copyKey] });
    expect(link).toBeOnTheScreen();
    await fireEvent.press(link);
    expect(openUrl).toHaveBeenCalledWith(url);
    openUrl.mockRestore();
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
  expect(result.getByText(messages.en.weather.stale)).toBeOnTheScreen();
  expect(result.getByLabelText(messages.en.weather.unavailableNotice).props.accessibilityLiveRegion).toBe('polite');
  expect(result.getAllByText(messages.en.weather.conditions.rain).length).toBeGreaterThan(0);
  expect(
    result.getByLabelText(messages.en.weather.refreshAccessibilityLabel).props.accessibilityState
      .busy,
  ).toBe(true);
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

test.each([
  [1, 'row', false],
  [3.12, 'column', true],
] as const)(
  'Weather at fontScale %s uses a %s location-card layout that remains word-wrappable',
  async (fontScale, flexDirection, stacked) => {
    mockFontScale(fontScale);
    const active = getManualLocation('sample.istanbul')!;
    const result = await render(
      <Providers language="en" value={createValue({ ...baseState, activeLocation: active })}>
        <WeatherScreen />
      </Providers>,
    );

    expect(StyleSheet.flatten(result.getByTestId('weather-location-card').props.style))
      .toMatchObject({ flexDirection });
    expect(StyleSheet.flatten(result.getByTestId('weather-location-name-group').props.style))
      .toMatchObject({ flex: 1, flexShrink: 1 });
    expect(StyleSheet.flatten(result.getByTestId('weather-location-affordance').props.style))
      .toMatchObject(stacked ? { alignSelf: 'stretch' } : { flexShrink: 0 });
    expect(Boolean(result.queryByTestId('weather-location-identity-row'))).toBe(stacked);
  },
);

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
  expect(button.props.hitSlop).toBe(10);
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
    properties: { schema_version: 1, surface: 'weather', result: 'success' },
    options: undefined,
  }, {
    name: 'feature_used_first_time',
    properties: { schema_version: 1, feature_name: 'manual_refresh' },
    options: undefined,
  }]);

  productAnalytics.analytics.captures.length = 0;
  await fireEvent.press(result.getByTestId('weather-refresh-button'));
  expect(productAnalytics.analytics.captures).toEqual([{
    name: 'manual_refresh_triggered',
    properties: { schema_version: 1, surface: 'weather', result: 'success' },
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
    properties: { schema_version: 1, surface: 'weather', attempt_number: 1, result: 'failure' },
    options: undefined,
  }]);

  productAnalytics.analytics.captures.length = 0;
  await fireEvent.press(result.getByRole('button', { name: messages.en.weather.refreshAccessibilityLabel }));
  expect(productAnalytics.analytics.captures).toEqual([{
    name: 'retry_after_failure_triggered',
    properties: { schema_version: 1, surface: 'weather', attempt_number: 2, result: 'failure' },
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
    { schema_version: 1, surface: 'weather', failure_category: 'offline', occurrence_count: 1 },
    { schema_version: 1, surface: 'weather', failure_category: 'offline' },
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
  expect(result.getByLabelText('01:00 PM. 17°. Cloudy. 20% precipitation')).toBeOnTheScreen();
  expect(result.queryByLabelText('12:00 PM. 16°. Rain. 50% precipitation')).toBeNull();

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
  ['en', 'Fri', 'Friday, 12:00 AM. 18°. Cloudy. 20% precipitation'],
  ['tr', 'Cum', 'Cuma, saat 00:00. Sıcaklık 18°. Bulutlu. Yağış olasılığı yüzde 20.'],
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
  // The rail's series is Weather's single accent instance (Law 1).
  const line = result.getByTestId('weather-hourly-series-line', { includeHiddenElements: true });
  // react-native-svg normalizes the stroke into a processed colour before it reaches the
  // host element, so the accent is compared in that form.
  expect(line.props.stroke.payload).toBe(processColor(lightTheme.colors.brandAccent));
});

test('device location card has one composed accessible name', async () => {
  const location = getManualLocation('sample.istanbul')!;
  const value = createValue({
    ...baseState,
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
