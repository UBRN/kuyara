import { act, fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { PlaceSearchV1Data } from '@kuyara/contracts';

import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { FirstUseTracker } from '@/features/analytics/application/first-use-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import { ProductAnalyticsContext } from '@/features/analytics/application/use-product-analytics';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { PlaceSearchApplicationContext, WeatherApplicationContext, type WeatherApplicationValue } from '@/features/weather/application/weather-application-context';
import { PlaceSearchError } from '@/features/weather/data/worker-place-search-data-source';
import type { ManualLocationId } from '@/features/weather/domain/weather';
import { WeatherLocationScreen } from '@/features/weather/presentation/weather-location-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 100 }));
// Test the feature's native-wrapper contracts; native layout and spoken grouping need the Simulator.
jest.mock('@/components/ui/native-list', () => {
  const { View, Text, Pressable } = jest.requireActual('react-native');
  return {
    NativeList: View,
    NativeListSection: ({ children, footer }: { children: React.ReactNode; footer?: string }) => <View>{children}<Text>{footer}</Text></View>,
    NativeListRow: ({ label, value, onPress, testID }: { label: string; value?: string; onPress?: () => void; testID?: string }) => (
      <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} testID={testID}><Text>{label}</Text><Text>{value}</Text></Pressable>
    ),
  };
});
jest.mock('@/components/ui/native-text-field', () => {
  const { TextInput } = jest.requireActual('react-native');
  return { NativeTextField: ({ label, ...props }: { label: string }) => <TextInput accessibilityLabel={label} {...props} /> };
});

const place = { id: 'place.745044', displayName: 'İstanbul', region: 'Türkiye', latitudeE2: 4101, longitudeE2: 2898, timeZone: 'Europe/Istanbul' };
const data: PlaceSearchV1Data = { places: [place], attribution: ['open-meteo', 'geonames'] };

function harness(language: SupportedLanguage = 'en') {
  const weather = {
    state: { status: 'ready', activeLocation: null, snapshot: null, freshness: null, permission: { kind: 'undetermined' }, locationFlow: 'idle', isSelectingLocation: false, isRefreshing: false, refreshFailure: null } as WeatherApplicationValue['state'],
    retry: jest.fn(async () => undefined), dismissLocationFlow: jest.fn(),
    beginDeviceLocationSelection: jest.fn(async () => undefined),
    confirmDeviceLocationRequest: jest.fn(async () => undefined),
    openApplicationSettings: jest.fn(async () => undefined),
    selectManualLocation: jest.fn(async () => undefined), refresh: jest.fn(async () => undefined),
  } satisfies WeatherApplicationValue;
  const search = { searchPlaces: jest.fn(async (): Promise<PlaceSearchV1Data> => data), selectPlaceSearchResult: jest.fn(async () => undefined) };
  const analytics = new RecordingProductAnalytics();
  const productAnalytics = {
    analytics,
    errorEpisodes: new ErrorEpisodeTracker(
      (name, properties, options) => analytics.capture(name, properties, options),
      () => new Date().toISOString(),
    ),
    firstUses: new FirstUseTracker(new InMemoryFirstUseStore()),
    retries: new RetryCounter(),
  };
  function Providers({ children }: PropsWithChildren) {
    return (
      <LocalizationContext value={{ language, messages: messages[language] }}>
        <KuyaraThemeContext value={lightTheme}>
          <ProductAnalyticsContext value={productAnalytics}>
            <WeatherApplicationContext value={weather}><PlaceSearchApplicationContext value={search}>{children}</PlaceSearchApplicationContext></WeatherApplicationContext>
          </ProductAnalyticsContext>
        </KuyaraThemeContext>
      </LocalizationContext>
    );
  }
  return { weather, search, analytics, Providers };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
const debounce = () => act(async () => { jest.advanceTimersByTime(300); });

test.each(['tr', 'en'] as const)('%s picker searches, attributes results and selects a place', async (language) => {
  const { weather, search, Providers } = harness(language);
  const copy = messages[language].weather;
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  expect(result.getByTestId('weather-location-controls')).toBeOnTheScreen();
  const field = result.getByLabelText(copy.placeSearchLabel);
  expect(field.props.placeholder).toBe(copy.placeSearchPlaceholder);
  await fireEvent.changeText(field, 'I'); await debounce();
  expect(search.searchPlaces).not.toHaveBeenCalled();
  await fireEvent.changeText(field, ' Ista ');
  expect(result.getByLabelText(copy.placeSearchLoading).props.accessibilityLiveRegion).toBe('polite');
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(copy.placeSearchLoading);
  await debounce();
  expect(search.searchPlaces).toHaveBeenCalledWith({ query: 'Ista', language, limit: 5 });
  expect(result.getByText(copy.placeSearchAttribution)).toBeOnTheScreen();
  await fireEvent.press(result.getByRole('button', { name: copy.placeSearchResultLabel(place.displayName, place.region) }));
  expect(search.selectPlaceSearchResult).toHaveBeenCalledWith(place);
  await fireEvent.press(result.getByRole('button', { name: copy.useCurrentLocation }));
  expect(weather.beginDeviceLocationSelection).toHaveBeenCalledTimes(1);
});

test('the selected place is marked and duplicate presses are disabled during persistence', async () => {
  const { weather, search, Providers } = harness();
  weather.state = { ...weather.state as Extract<WeatherApplicationValue['state'], { status: 'ready' }>, isSelectingLocation: true,
    activeLocation: { source: 'manual', catalogId: 'place.745044', displayName: place.displayName, locationKey: 'manual:place.745044', coordinates: { latitudeE2: 4101, longitudeE2: 2898 }, timeZone: 'Europe/Istanbul' } };
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.changeText(result.getByTestId('weather-place-search'), 'Ista'); await debounce();
  expect(result.getByText(messages.en.weather.placeSearchSelected)).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('weather-place-place.745044'));
  expect(search.selectPlaceSearchResult).not.toHaveBeenCalled();
});

test.each(['tr', 'en'] as const)('%s picker announces empty and error states without raw messages', async (language) => {
  const { search, Providers } = harness(language);
  search.searchPlaces.mockResolvedValueOnce({ ...data, places: [{ ...place, timeZone: null }] });
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  const field = result.getByTestId('weather-place-search');
  const copy = messages[language].weather;
  await fireEvent.changeText(field, 'Ista'); await debounce();
  expect(result.getByLabelText(copy.placeSearchEmpty).props.accessibilityLiveRegion).toBe('polite');
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(copy.placeSearchEmpty);
  expect(result.queryByText(copy.placeSearchAttribution)).toBeNull();
  for (const code of ['unavailable', 'rate-limited', 'invalid-input', 'invalid-response'] as const) {
    const error = new PlaceSearchError(code); error.message = 'secret provider URL';
    search.searchPlaces.mockRejectedValueOnce(error);
    await fireEvent.changeText(field, code); await debounce();
    expect(result.getByLabelText(copy.placeSearchErrors[code]).props.accessibilityLiveRegion).toBe('polite');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(copy.placeSearchErrors[code]);
    expect(result.queryByText(error.message)).toBeNull();
  }
});

test('selecting a searched place that changes the location captures location_changed and feature_used_first_time once', async () => {
  const { weather, search, analytics, Providers } = harness();
  const selected = {
    source: 'manual' as const, catalogId: place.id as ManualLocationId, displayName: place.displayName,
    locationKey: 'manual:place.745044',
    coordinates: { latitudeE2: 4101, longitudeE2: 2898 }, timeZone: 'Europe/Istanbul',
  };
  search.selectPlaceSearchResult.mockImplementation(async () => {
    weather.state = { ...(weather.state as Extract<WeatherApplicationValue['state'], { status: 'ready' }>), activeLocation: selected };
  });
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.changeText(result.getByTestId('weather-place-search'), 'Ista'); await debounce();
  await fireEvent.press(result.getByRole('button', { name: messages.en.weather.placeSearchResultLabel(place.displayName, place.region) }));

  expect(analytics.captures.filter((c) => c.name === 'location_changed')).toEqual([{
    name: 'location_changed',
    properties: { schema_version: 1, method: 'manual_selection', change_context: 'weather_tab' },
    options: undefined,
  }]);
  expect(analytics.captures.filter((c) => c.name === 'feature_used_first_time')).toEqual([{
    name: 'feature_used_first_time',
    properties: { schema_version: 1, feature_name: 'location_override' },
    options: undefined,
  }]);

  // A second manual pick to a different place reports the change again, but the feature
  // is already marked used and does not fire a second `feature_used_first_time`.
  analytics.captures.length = 0;
  search.selectPlaceSearchResult.mockImplementation(async () => {
    weather.state = {
      ...(weather.state as Extract<WeatherApplicationValue['state'], { status: 'ready' }>),
      activeLocation: { ...selected, catalogId: 'place.999' as ManualLocationId, locationKey: 'manual:place.999' },
    };
  });
  await fireEvent.press(result.getByRole('button', { name: messages.en.weather.placeSearchResultLabel(place.displayName, place.region) }));
  expect(analytics.captures.some((c) => c.name === 'location_changed')).toBe(true);
  expect(analytics.captures.some((c) => c.name === 'feature_used_first_time')).toBe(false);
});

test('selecting the device location does not report feature_used_first_time for location_override', async () => {
  const { weather, analytics, Providers } = harness();
  weather.beginDeviceLocationSelection.mockImplementation(async () => {
    weather.state = {
      ...(weather.state as Extract<WeatherApplicationValue['state'], { status: 'ready' }>),
      activeLocation: {
        source: 'device', accuracy: 'approximate', locationKey: 'device:4101:2898',
        coordinates: { latitudeE2: 4101, longitudeE2: 2898 }, timeZone: 'Europe/Istanbul',
      },
    };
  });
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.press(result.getByRole('button', { name: messages.en.weather.useCurrentLocation }));

  expect(analytics.captures.filter((c) => c.name === 'location_changed')).toEqual([{
    name: 'location_changed',
    properties: { schema_version: 1, method: 'device', change_context: 'weather_tab' },
    options: undefined,
  }]);
  expect(analytics.captures.some((c) => c.name === 'feature_used_first_time')).toBe(false);
});

test('permission rationale and permanent denial retain their existing actions on the new screen', async () => {
  const { weather, Providers } = harness();
  weather.state = { ...weather.state as Extract<WeatherApplicationValue['state'], { status: 'ready' }>, locationFlow: 'rationale' };
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.press(result.getByRole('button', { name: messages.en.weather.continuePermission }));
  expect(weather.confirmDeviceLocationRequest).toHaveBeenCalledTimes(1);
  await result.unmount();
  weather.state = { ...weather.state as Extract<WeatherApplicationValue['state'], { status: 'ready' }>, locationFlow: 'denied-permanent', permission: { kind: 'denied', canRequestAgain: false } };
  const denied = await render(<Providers><WeatherLocationScreen /></Providers>);
  expect(denied.getByText(messages.en.weather.placePermanentDeniedBody)).toBeOnTheScreen();
  await fireEvent.press(denied.getByRole('button', { name: messages.en.weather.openSettings }));
  expect(weather.openApplicationSettings).toHaveBeenCalledTimes(1);
});
