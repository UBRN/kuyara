import { act, fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { PlaceSearchV1Data } from '@kuyara/contracts';

import { PlaceSearchApplicationContext, WeatherApplicationContext, type WeatherApplicationValue } from '@/features/weather/application/weather-application-context';
import { PlaceSearchError } from '@/features/weather/data/worker-place-search-data-source';
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
  function Providers({ children }: PropsWithChildren) {
    return (
      <LocalizationContext value={{ language, messages: messages[language] }}>
        <KuyaraThemeContext value={lightTheme}>
          <WeatherApplicationContext value={weather}><PlaceSearchApplicationContext value={search}>{children}</PlaceSearchApplicationContext></WeatherApplicationContext>
        </KuyaraThemeContext>
      </LocalizationContext>
    );
  }
  return { weather, search, Providers };
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
