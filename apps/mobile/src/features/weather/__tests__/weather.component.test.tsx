import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WeatherApplicationContext, type WeatherApplicationValue } from '@/features/weather/application/weather-application-context';
import { getManualLocation } from '@/features/weather/data/manual-location-catalog';
import type { WeatherReadyState } from '@/features/weather/application/weather-application-controller';
import { WeatherScreen } from '@/features/weather/presentation/weather-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

const baseState: WeatherReadyState = {
  status: 'ready', activeLocation: null, snapshot: null, freshness: null,
  permission: { kind: 'undetermined' }, locationFlow: 'idle',
  isSelectingLocation: false, isRefreshing: false, hasRefreshError: false,
};

function sampleSnapshot() {
  const location = getManualLocation('sample.istanbul')!;
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4', localProfileId: 'profile-id',
    locationKey: location.locationKey, timeZone: location.timeZone,
    fetchedAt: '2026-07-30T09:00:00.000Z',
    origin: { kind: 'sample' as const, sourceId: 'test' },
    current: {
      observedAt: '2026-07-30T09:00:00.000Z', temperatureCelsius: 16,
      apparentTemperatureCelsius: 15, condition: 'rain' as const,
      precipitationProbability: 0.5, windSpeedMetersPerSecond: 4,
      humidity: 0.7, uvIndex: 2,
    },
    minimumTemperatureCelsius: 12, maximumTemperatureCelsius: 19,
    hourly: [{
      forecastAt: '2026-07-30T09:00:00.000Z', temperatureCelsius: 16,
      apparentTemperatureCelsius: 15, condition: 'rain' as const,
      precipitationProbability: 0.5, windSpeedMetersPerSecond: 4,
      humidity: 0.7, uvIndex: 2,
    }],
  };
}

function Providers({
  children,
  language,
  value,
}: PropsWithChildren<{ language: SupportedLanguage; value: WeatherApplicationValue }>) {
  return (
    <LocalizationContext.Provider value={{ language, messages: messages[language] }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <WeatherApplicationContext.Provider value={value}>
          <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
        </WeatherApplicationContext.Provider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>
  );
}

function createValue(state: WeatherReadyState = baseState) {
  return {
    state,
    retry: jest.fn(async () => undefined),
    dismissLocationFlow: jest.fn(),
    beginDeviceLocationSelection: jest.fn(async () => undefined),
    confirmDeviceLocationRequest: jest.fn(async () => undefined),
    openApplicationSettings: jest.fn(async () => undefined),
    selectManualLocation: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
  } satisfies WeatherApplicationValue;
}

describe.each(['en', 'tr'] as const)('%s Weather screen', (language) => {
  test('shows localized device and manual paths with sample disclosure', async () => {
    const value = createValue();
    const result = await render(
      <Providers language={language} value={value}><WeatherScreen /></Providers>,
    );
    const copy = messages[language].weather;
    expect(result.getByRole('button', { name: copy.useCurrentLocation })).toBeOnTheScreen();
    expect(result.getByText(copy.sampleDisclosure)).toBeOnTheScreen();
    for (const location of Object.values(copy.locations)) {
      expect(result.getByRole('radio', { name: location })).toBeOnTheScreen();
    }
    await fireEvent.press(result.getByRole('button', { name: copy.useCurrentLocation }));
    expect(value.beginDeviceLocationSelection).toHaveBeenCalledTimes(1);
  });
});

test('rationale is shown before confirmation and permanent denial opens Settings', async () => {
  const rationale = createValue({ ...baseState, locationFlow: 'rationale' });
  const result = await render(
    <Providers language="en" value={rationale}><WeatherScreen /></Providers>,
  );
  await fireEvent.press(result.getByRole('button', { name: messages.en.weather.continuePermission }));
  expect(rationale.confirmDeviceLocationRequest).toHaveBeenCalledTimes(1);
  await result.unmount();

  const permanent = createValue({
    ...baseState,
    permission: { kind: 'denied', canRequestAgain: false },
    locationFlow: 'denied-permanent',
  });
  const denied = await render(
    <Providers language="en" value={permanent}><WeatherScreen /></Providers>,
  );
  expect(denied.getByText(messages.en.weather.permanentDeniedBody)).toBeOnTheScreen();
  await fireEvent.press(denied.getByRole('button', { name: messages.en.weather.openSettings }));
  expect(permanent.openApplicationSettings).toHaveBeenCalledTimes(1);
});

test('selected location, stale snapshot, refreshing, failure, and hourly content remain visible', async () => {
  const active = getManualLocation('sample.istanbul')!;
  const value = createValue({
    ...baseState,
    activeLocation: active,
    snapshot: sampleSnapshot(),
    freshness: 'stale',
    isRefreshing: true,
    hasRefreshError: true,
  });
  const result = await render(
    <Providers language="en" value={value}><WeatherScreen /></Providers>,
  );
  expect(result.getByRole('radio', { name: messages.en.weather.locations[active.catalogId] }).props.accessibilityState.selected).toBe(true);
  expect(result.getByText(messages.en.weather.stale)).toBeOnTheScreen();
  expect(result.getByText(messages.en.weather.refreshFailed)).toBeOnTheScreen();
  expect(result.getAllByText(messages.en.weather.conditions.rain).length).toBeGreaterThan(0);
  expect(result.getByLabelText(messages.en.weather.refreshing).props.accessibilityState.busy).toBe(true);
});

test('manual selection emits stable catalog ID', async () => {
  const value = createValue();
  const result = await render(
    <Providers language="tr" value={value}><WeatherScreen /></Providers>,
  );
  await fireEvent.press(result.getByRole('radio', { name: messages.tr.weather.locations['sample.ankara'] }));
  expect(value.selectManualLocation).toHaveBeenCalledWith('sample.ankara');
});
