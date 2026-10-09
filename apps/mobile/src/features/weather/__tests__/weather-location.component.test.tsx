import { act, fireEvent, isHiddenFromAccessibility, render, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AccessibilityInfo, Keyboard, StyleSheet, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { placeSearchQueryMaxLength, type PlaceSearchV1Data } from '@kuyara/contracts';

import { haptics } from '@/components/ui/haptics';
import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { FirstUseTracker } from '@/features/analytics/application/first-use-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import { ProductAnalyticsContext } from '@/features/analytics/application/use-product-analytics';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { InMemoryWithdrawnIdentifierStore } from '@/features/analytics/data/in-memory-withdrawn-identifier-store';
import { PlaceSearchApplicationContext, WeatherApplicationContext, type WeatherApplicationValue } from '@/features/weather/application/weather-application-context';
import { PlaceSearchError } from '@/features/weather/domain/place-search-error';
import type { ManualLocationId } from '@/features/weather/domain/weather';
import { LocationSelectionControls } from '@/features/weather/presentation/location-selection-controls';
import { WeatherLocationScreen } from '@/features/weather/presentation/weather-location-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 100 }));
const mockRouter = { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
// Test the feature's native-wrapper contracts; native layout and spoken grouping need the Simulator.
jest.mock('@/components/ui/native-list', () => {
  const { View, Text, Pressable } = jest.requireActual('react-native');
  return {
    NativeList: View,
    NativeListSection: ({ children, footer }: { children: React.ReactNode; footer?: string }) => <View>{children}<Text>{footer}</Text></View>,
    NativeListRow: ({ label, selected, onPress, testID, trailingSymbol }: { label: string; selected?: boolean; onPress?: () => void; testID?: string; trailingSymbol?: { name: string } }) => (
      <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} testID={testID}>
        <Text>{label}</Text>
        {trailingSymbol ? <Text testID={`${testID}-status-symbol`}>{trailingSymbol.name}</Text> : null}
      </Pressable>
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
    openApplicationSettings: jest.fn(async () => undefined),
    selectManualLocation: jest.fn(async () => undefined), refresh: jest.fn(async () => undefined),
    revalidateFreshness: jest.fn(async () => undefined),
  } satisfies WeatherApplicationValue;
  const search = { searchPlaces: jest.fn(async (): Promise<PlaceSearchV1Data> => data), selectPlaceSearchResult: jest.fn(async () => undefined) };
  const analytics = new RecordingProductAnalytics();
  const productAnalytics = {
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
  function Providers({ children }: PropsWithChildren) {
    return (
      <LocalizationContext value={{ language, messages: messages[language], hour12: false }}>
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
  mockRouter.back.mockClear(); mockRouter.replace.mockClear(); mockRouter.canGoBack.mockReturnValue(true);
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
  expect(field.props.maxLength).toBe(placeSearchQueryMaxLength);
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

test('a failed load of the location state is spoken on iOS', async () => {
  const { weather, Providers } = harness('en');
  weather.state = { status: 'error' } as WeatherApplicationValue['state'];
  await render(<Providers><WeatherLocationScreen /></Providers>);
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(messages.en.weather.loadErrorBody);
});

test('the selected place is marked and duplicate presses are disabled during persistence', async () => {
  const { weather, search, Providers } = harness();
  weather.state = { ...weather.state as Extract<WeatherApplicationValue['state'], { status: 'ready' }>, isSelectingLocation: true,
    activeLocation: { source: 'manual', catalogId: 'place.745044', displayName: place.displayName, locationKey: 'manual:place.745044', coordinates: { latitudeE2: 4101, longitudeE2: 2898 }, timeZone: 'Europe/Istanbul' } };
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.changeText(result.getByTestId('weather-place-search'), 'Ista'); await debounce();
  expect(result.getByTestId('weather-place-place.745044').props.accessibilityState.selected).toBe(true);
  // The chosen place carries a visible check, not only the selected trait.
  expect(result.getByTestId('weather-place-place.745044-status-symbol')).toHaveTextContent('check');
  await fireEvent.press(result.getByTestId('weather-place-place.745044'));
  expect(search.selectPlaceSearchResult).not.toHaveBeenCalled();
});

test('a place that is not the chosen one carries no check', async () => {
  const { Providers } = harness();
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.changeText(result.getByTestId('weather-place-search'), 'Ista'); await debounce();
  expect(result.getByTestId('weather-place-place.745044').props.accessibilityState.selected).toBe(false);
  expect(result.queryByTestId('weather-place-place.745044-status-symbol')).toBeNull();
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
    properties: { schema_version: 4, method: 'manual_selection', change_context: 'weather_tab' },
    options: undefined,
  }]);
  expect(analytics.captures.filter((c) => c.name === 'feature_used_first_time')).toEqual([{
    name: 'feature_used_first_time',
    properties: { schema_version: 4, feature_name: 'location_override' },
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
    properties: { schema_version: 4, method: 'device', change_context: 'weather_tab' },
    options: undefined,
  }]);
  expect(analytics.captures.some((c) => c.name === 'feature_used_first_time')).toBe(false);
});

test('selecting the same place again does not report a location change', async () => {
  const { weather, search, analytics, Providers } = harness();
  weather.state = {
    ...(weather.state as Extract<WeatherApplicationValue['state'], { status: 'ready' }>),
    activeLocation: {
      source: 'manual', catalogId: place.id as ManualLocationId,
      displayName: place.displayName, locationKey: 'manual:place.745044',
      coordinates: { latitudeE2: 4101, longitudeE2: 2898 }, timeZone: 'Europe/Istanbul',
    },
  };
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.changeText(result.getByTestId('weather-place-search'), 'Ista');
  await debounce();
  await fireEvent.press(result.getByTestId('weather-place-place.745044'));

  expect(search.selectPlaceSearchResult).toHaveBeenCalledTimes(1);
  expect(analytics.captures.filter((capture) => capture.name === 'location_changed')).toHaveLength(0);
  expect(analytics.captures.filter((capture) => capture.name === 'feature_used_first_time')).toHaveLength(1);
});

test('permanent denial keeps its Settings action on the new screen', async () => {
  const { weather, Providers } = harness();
  weather.state = { ...weather.state as Extract<WeatherApplicationValue['state'], { status: 'ready' }>, locationFlow: 'denied-permanent', permission: { kind: 'denied', canRequestAgain: false } };
  const denied = await render(<Providers><WeatherLocationScreen /></Providers>);
  expect(denied.getByText(messages.en.weather.placePermanentDeniedBody)).toBeOnTheScreen();
  await fireEvent.press(denied.getByRole('button', { name: messages.en.weather.openSettings }));
  expect(weather.openApplicationSettings).toHaveBeenCalledTimes(1);
});

// VoiceOver ignores live regions, so the card the main button leaves behind is spoken.
test.each([
  ['denied-requestable', (copy: typeof messages.en.weather) => copy.placeDeniedBody],
  ['denied-permanent', (copy: typeof messages.en.weather) => copy.placePermanentDeniedBody],
  ['services-unavailable', (copy: typeof messages.en.weather) => copy.placeServicesUnavailableBody],
  ['lookup-failed', (copy: typeof messages.en.weather) => copy.lookupFailedNoLocationBody],
  ['selection-failed', (copy: typeof messages.en.weather) => copy.selectionFailedNoLocationBody],
] as const)('the %s location message is announced on iOS', async (locationFlow, expected) => {
  const { weather, Providers } = harness();
  jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear();
  weather.state = { ...weather.state as Extract<WeatherApplicationValue['state'], { status: 'ready' }>, locationFlow };
  await render(<Providers><WeatherLocationScreen /></Providers>);
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(expected(messages.en.weather));
});

// Before any location exists there is no previous one to promise; once one is active the card says so.
test.each([
  ['lookup-failed', 'lookupFailedBody', 'lookupFailedNoLocationBody'],
  ['selection-failed', 'selectionFailedBody', 'selectionFailedNoLocationBody'],
] as const)('the %s card mentions a previous location only when one is active', async (locationFlow, withLocation, withoutLocation) => {
  for (const language of ['en', 'tr'] as const) {
    const copy = messages[language].weather;
    expect(copy[withoutLocation]).not.toMatch(/previous|önceki/i);

    const bare = harness(language);
    bare.weather.state = { ...readyState(bare.weather.state), activeLocation: null, locationFlow };
    const fresh = await render(<bare.Providers><WeatherLocationScreen /></bare.Providers>);
    expect(fresh.queryByText(copy[withLocation])).toBeNull();
    await fresh.unmount();

    const active = harness(language);
    const selected = readyState(active.weather.state);
    active.weather.state = {
      ...selected,
      activeLocation: { source: 'manual', catalogId: 'place.745044', displayName: 'Istanbul', locationKey: 'manual:place.745044', coordinates: { latitudeE2: 4101, longitudeE2: 2898 }, timeZone: 'Europe/Istanbul' },
      locationFlow,
    } as WeatherApplicationValue['state'];
    const shown = await render(<active.Providers><WeatherLocationScreen /></active.Providers>);
    expect(shown.getByText(copy[withLocation])).toBeOnTheScreen();
    await shown.unmount();
  }
});

test('an idle location flow announces nothing', async () => {
  const { Providers } = harness();
  jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear();
  await render(<Providers><WeatherLocationScreen /></Providers>);
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
});

// The onboarding heading, progress bar and body take most of a phone's height, so while the
// keyboard is up they step aside and the result list keeps room above it.
test('the header steps aside while the keyboard is up and returns when it goes', async () => {
  const handlers = new Map<string, () => void>();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
    handlers.set(event, handler);
    return { remove: jest.fn() };
  }) as unknown as typeof Keyboard.addListener);
  const { Providers } = harness();
  const result = await render(
    <Providers>
      <LocationSelectionControls header={<Text testID="test-header">Heading</Text>} testID="controls"
        testIDPrefix="onboarding" />
    </Providers>,
  );
  expect(result.getByTestId('test-header')).toBeOnTheScreen();
  await act(async () => { handlers.get('keyboardWillShow')?.(); });
  expect(result.queryByTestId('test-header')).toBeNull();
  expect(result.getByTestId('onboarding-place-search')).toBeOnTheScreen();
  await act(async () => { handlers.get('keyboardWillHide')?.(); });
  expect(result.getByTestId('test-header')).toBeOnTheScreen();
});

const readyState = (state: WeatherApplicationValue['state']) =>
  state as Extract<WeatherApplicationValue['state'], { status: 'ready' }>;
const istanbul = {
  source: 'manual' as const, catalogId: place.id as ManualLocationId, displayName: place.displayName,
  locationKey: 'manual:place.745044', coordinates: { latitudeE2: 4101, longitudeE2: 2898 }, timeZone: 'Europe/Istanbul',
};
const deviceLocation = {
  source: 'device' as const, accuracy: 'approximate' as const, locationKey: 'device:4101:2898',
  coordinates: { latitudeE2: 4101, longitudeE2: 2898 }, timeZone: 'Europe/Istanbul',
};

test('a chosen place closes the picker once, even after a quick double tap', async () => {
  const { weather, search, Providers } = harness();
  search.selectPlaceSearchResult.mockImplementation(async () => {
    weather.state = { ...readyState(weather.state), activeLocation: istanbul };
  });
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.changeText(result.getByTestId('weather-place-search'), 'Ista'); await debounce();
  const row = result.getByTestId('weather-place-place.745044');
  await act(async () => { fireEvent.press(row); fireEvent.press(row); });
  expect(search.selectPlaceSearchResult).toHaveBeenCalledTimes(2);
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});

test('a picker opened without history returns to Weather instead of popping', async () => {
  const { weather, search, Providers } = harness();
  mockRouter.canGoBack.mockReturnValue(false);
  search.selectPlaceSearchResult.mockImplementation(async () => {
    weather.state = { ...readyState(weather.state), activeLocation: istanbul };
  });
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.changeText(result.getByTestId('weather-place-search'), 'Ista'); await debounce();
  await fireEvent.press(result.getByTestId('weather-place-place.745044'));
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockRouter.replace).toHaveBeenCalledWith('/weather');
});

test('a failed place save keeps the picker open with its message', async () => {
  const { weather, search, Providers } = harness();
  search.selectPlaceSearchResult.mockImplementation(async () => {
    weather.state = { ...readyState(weather.state), locationFlow: 'selection-failed' };
  });
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.changeText(result.getByTestId('weather-place-search'), 'Ista'); await debounce();
  await fireEvent.press(result.getByTestId('weather-place-place.745044'));
  expect(mockRouter.back).not.toHaveBeenCalled();
});

test('the device location closes the picker once found, and stays for a denial or a failed lookup', async () => {
  const { weather, Providers } = harness();
  weather.beginDeviceLocationSelection.mockImplementationOnce(async () => {
    weather.state = { ...readyState(weather.state), locationFlow: 'denied-requestable' };
  });
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.press(result.getByRole('button', { name: messages.en.weather.useCurrentLocation }));
  expect(mockRouter.back).not.toHaveBeenCalled();
  await result.unmount();

  weather.state = { ...readyState(weather.state), locationFlow: 'idle' };
  weather.beginDeviceLocationSelection.mockImplementationOnce(async () => {
    weather.state = { ...readyState(weather.state), locationFlow: 'lookup-failed' };
  });
  const failed = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.press(failed.getByRole('button', { name: messages.en.weather.useCurrentLocation }));
  expect(mockRouter.back).not.toHaveBeenCalled();
  await failed.unmount();

  weather.state = { ...readyState(weather.state), locationFlow: 'idle' };
  weather.beginDeviceLocationSelection.mockImplementationOnce(async () => {
    weather.state = { ...readyState(weather.state), locationFlow: 'idle', activeLocation: deviceLocation };
  });
  const granted = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.press(granted.getByRole('button', { name: messages.en.weather.useCurrentLocation }));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});

// Onboarding hosts the same controls in its own flow, which moves on by its own buttons.
test('the onboarding place step never navigates when a place is chosen, and reports nothing', async () => {
  const { weather, search, analytics, Providers } = harness();
  search.selectPlaceSearchResult.mockImplementation(async () => {
    weather.state = { ...readyState(weather.state), activeLocation: istanbul };
  });
  const result = await render(
    <Providers><LocationSelectionControls reportsSelection={false} testID="controls" testIDPrefix="onboarding" /></Providers>,
  );
  await fireEvent.changeText(result.getByTestId('onboarding-place-search'), 'Ista'); await debounce();
  await fireEvent.press(result.getByTestId('onboarding-place-place.745044'));
  expect(search.selectPlaceSearchResult).toHaveBeenCalledTimes(1);
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  // Onboarding runs before the consent question: `location_changed` starts at Weather.
  expect(analytics.captures).toEqual([]);
});

// Law 7: a new search status crossfades in over the old rather than snapping, and the results
// fade in on `motion.fast` when they appear rather than popping in. Only the new status is
// spoken, with its live region.
test('the search status crossfades and the results fade in when they appear', async () => {
  const { search, Providers } = harness();
  const copy = messages.en.weather;
  const withTiming = jest.spyOn(Reanimated, 'withTiming');
  const withDelay = jest.spyOn(Reanimated, 'withDelay');
  search.searchPlaces.mockResolvedValueOnce({ ...data, places: [] });
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  const resultsOpacity = () =>
    StyleSheet.flatten(result.getByTestId('weather-place-results').parent!.props.style).opacity;
  expect(resultsOpacity()).toBe(0);
  const field = result.getByTestId('weather-place-search');
  await fireEvent.changeText(field, 'Zzz'); await debounce();
  expect(result.getByLabelText(copy.placeSearchEmpty)).toBeOnTheScreen();

  withDelay.mockClear();
  await fireEvent.changeText(field, 'Ista');
  expect(withDelay).toHaveBeenCalledWith(lightTheme.motion.fast, expect.anything());
  const spoken = result.getAllByLabelText(/./).filter((node) => node.props.accessibilityLiveRegion === 'polite'
    && !isHiddenFromAccessibility(node));
  expect(spoken.map((node) => node.props.accessibilityLabel)).toEqual([copy.placeSearchLoading]);

  withTiming.mockClear();
  await debounce();
  expect(result.getByText(copy.placeSearchAttribution)).toBeOnTheScreen();
  expect(withTiming).toHaveBeenCalledWith(1, { duration: lightTheme.motion.fast, easing: expect.anything() });
});

const granted = { kind: 'granted', accuracy: 'full' } as const;

// A found device location is named under the button with how it was resolved and a check, so
// the person can see the lookup worked; the button steps down to locate again.
test.each(['tr', 'en'] as const)('%s the device location in use is named under the button with its caption and a check', async (language) => {
  const { weather, Providers } = harness(language);
  const copy = messages[language].weather;
  weather.state = { ...readyState(weather.state), permission: granted, activeLocation: { ...deviceLocation, accuracy: 'full', displayName: 'Kadıköy' } };
  const result = await render(<Providers><LocationSelectionControls testID="controls" testIDPrefix="onboarding" /></Providers>);
  const row = result.getByTestId('onboarding-location-device-current');
  expect(within(row).getByText('Kadıköy')).toBeOnTheScreen();
  expect(within(row).getByText(copy.fullLocation)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-location-device-current-check')).toBeOnTheScreen();
  expect(row.props.accessibilityState).toEqual({ selected: true });
  expect(row.props.accessibilityLabel).toBe(`Kadıköy, ${copy.fullLocation}`);
  expect(StyleSheet.flatten(result.getByTestId('onboarding-location-device').props.style).backgroundColor)
    .toBe(lightTheme.colors.surfaceInteractive);
});

test('an unnamed approximate device fix falls back to the generic name and says it is approximate', async () => {
  const { weather, Providers } = harness();
  const copy = messages.en.weather;
  weather.state = { ...readyState(weather.state), permission: { kind: 'granted', accuracy: 'approximate' }, activeLocation: deviceLocation };
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  const row = result.getByTestId('weather-location-device-current');
  expect(within(row).getByText(copy.currentLocation)).toBeOnTheScreen();
  expect(within(row).getByText(copy.approximateLocation)).toBeOnTheScreen();
});

test('no current-location row stands for a manual place or a pending answer', async () => {
  const { weather, Providers } = harness();
  weather.state = { ...readyState(weather.state), activeLocation: istanbul };
  const manual = await render(<Providers><WeatherLocationScreen /></Providers>);
  expect(manual.queryByTestId('weather-location-device-current')).toBeNull();
  await manual.unmount();
  weather.state = { ...readyState(weather.state), permission: granted, activeLocation: deviceLocation, locationFlow: 'lookup-failed' };
  const failed = await render(<Providers><WeatherLocationScreen /></Providers>);
  expect(failed.queryByTestId('weather-location-device-current')).toBeNull();
});

// The tap asks the system directly: no card of kuyara's own comes first. The status line says
// the fix is being taken only once permission is granted: under the system prompt nothing is
// being found yet. Success is spoken once, with the place's name, and felt once.
test('the lookup status shows after permission is granted, never under the prompt, and success is spoken and felt once', async () => {
  const { weather, Providers } = harness();
  const copy = messages.en.weather;
  const success = jest.spyOn(haptics, 'success').mockImplementation(() => undefined);
  let finish: () => void = () => undefined;
  weather.beginDeviceLocationSelection.mockImplementation(() => new Promise<undefined>((resolve) => {
    weather.state = { ...readyState(weather.state), locationFlow: 'idle', isSelectingLocation: true };
    finish = () => {
      weather.state = { ...readyState(weather.state), isSelectingLocation: false, permission: granted,
        activeLocation: { ...deviceLocation, displayName: 'Kadıköy' } };
      resolve(undefined);
    };
  }));
  const controls = () => <Providers><LocationSelectionControls testID="controls" testIDPrefix="onboarding" /></Providers>;
  const result = await render(controls());
  await fireEvent.press(result.getByRole('button', { name: copy.useCurrentLocation }));
  await result.rerender(controls());
  expect(result.queryByLabelText(copy.locatingDevice)).toBeNull();
  expect(result.queryByText(copy.placeDeniedBody)).toBeNull();

  jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear();
  weather.state = { ...readyState(weather.state), permission: granted };
  await result.rerender(controls());
  expect(result.getByLabelText(copy.locatingDevice).props.accessibilityLiveRegion).toBe('polite');
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(copy.locatingDevice);

  jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear();
  await act(async () => { finish(); });
  await result.rerender(controls());
  expect(result.queryByLabelText(copy.locatingDevice)).toBeNull();
  expect(result.getByTestId('onboarding-location-device-current')).toBeOnTheScreen();
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(copy.locationFoundNamed('Kadıköy'));
  expect(success).toHaveBeenCalledTimes(1);
});

test('a failed lookup or a denial is not felt as success, nor is a device location the app moved by itself', async () => {
  const { weather, Providers } = harness();
  const success = jest.spyOn(haptics, 'success').mockImplementation(() => undefined);
  const controls = () => <Providers><LocationSelectionControls testID="controls" testIDPrefix="onboarding" /></Providers>;
  for (const locationFlow of ['lookup-failed', 'services-unavailable', 'denied-requestable', 'denied-permanent'] as const) {
    weather.beginDeviceLocationSelection.mockImplementationOnce(async () => {
      weather.state = { ...readyState(weather.state), locationFlow };
    });
    const result = await render(controls());
    await fireEvent.press(result.getByRole('button', { name: messages.en.weather.useCurrentLocation }));
    await result.unmount();
  }
  expect(success).not.toHaveBeenCalled();

  // The foreground re-acquisition replaces the device location without anyone asking.
  weather.state = { ...readyState(weather.state), locationFlow: 'idle', permission: granted, activeLocation: deviceLocation };
  const result = await render(controls());
  jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear();
  weather.state = { ...readyState(weather.state), activeLocation: { ...deviceLocation, locationKey: 'device:4099:2903', displayName: 'Kadıköy' } };
  await result.rerender(controls());
  expect(result.getByTestId('onboarding-location-device-current')).toBeOnTheScreen();
  expect(success).not.toHaveBeenCalled();
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
});

// Back from the Settings trip with access granted, the lookup that return starts confirms
// itself as a tap's would: the status line, the named row, one announcement and one haptic,
// and the picker closes. A return without access confirms nothing.
test('a return from Settings with access granted finds the location as a tap would', async () => {
  const { weather, analytics, Providers } = harness();
  const copy = messages.en.weather;
  const success = jest.spyOn(haptics, 'success').mockImplementation(() => undefined);
  const denied = { ...readyState(weather.state), locationFlow: 'denied-permanent', permission: { kind: 'denied', canRequestAgain: false } } as const;
  weather.state = denied;
  let finish: (found: boolean) => void = () => undefined;
  weather.openApplicationSettings.mockImplementation(() => new Promise<undefined>((resolve) => {
    finish = (found) => {
      weather.state = found
        ? { ...readyState(weather.state), locationFlow: 'idle', isSelectingLocation: false, permission: granted, activeLocation: { ...deviceLocation, displayName: 'Kadıköy' } }
        : denied;
      resolve(undefined);
    };
  }));
  const screen = () => <Providers><WeatherLocationScreen /></Providers>;

  const unchanged = await render(screen());
  await fireEvent.press(unchanged.getByRole('button', { name: copy.openSettings }));
  await act(async () => { finish(false); });
  expect(success).not.toHaveBeenCalled();
  expect(mockRouter.back).not.toHaveBeenCalled();
  await unchanged.unmount();

  const result = await render(screen());
  await fireEvent.press(result.getByRole('button', { name: copy.openSettings }));
  weather.state = { ...readyState(weather.state), locationFlow: 'idle', permission: granted, isSelectingLocation: true };
  await result.rerender(screen());
  expect(result.getByLabelText(copy.locatingDevice)).toBeOnTheScreen();
  jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear();
  await act(async () => { finish(true); });
  expect(success).toHaveBeenCalledTimes(1);
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(copy.locationFoundNamed('Kadıköy'));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(analytics.captures.filter((c) => c.name === 'location_changed')).toHaveLength(1);
});

// A Settings trip that ends without a lookup, by "Not now" before the return was read, leaves
// the device location already in use where it was: nothing was found, so nothing confirms.
test('a Settings trip that ends without a lookup confirms nothing', async () => {
  const { weather, Providers } = harness();
  const success = jest.spyOn(haptics, 'success').mockImplementation(() => undefined);
  weather.state = {
    ...readyState(weather.state), locationFlow: 'denied-permanent', activeLocation: deviceLocation,
    permission: { kind: 'denied', canRequestAgain: false },
  };
  let end: () => void = () => undefined;
  weather.openApplicationSettings.mockImplementation(() => new Promise<undefined>((resolve) => {
    end = () => {
      weather.state = { ...readyState(weather.state), locationFlow: 'idle' };
      resolve(undefined);
    };
  }));
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear();
  await fireEvent.press(result.getByRole('button', { name: messages.en.weather.openSettings }));
  await act(async () => { end(); });
  expect(success).not.toHaveBeenCalled();
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  expect(mockRouter.back).not.toHaveBeenCalled();
});

test('an unnamed fix is spoken as found without a name, and a manual pick shows no lookup status', async () => {
  const { weather, search, Providers } = harness();
  const copy = messages.en.weather;
  weather.state = { ...readyState(weather.state), permission: granted };
  weather.beginDeviceLocationSelection.mockImplementation(async () => {
    weather.state = { ...readyState(weather.state), activeLocation: deviceLocation };
  });
  const result = await render(<Providers><WeatherLocationScreen /></Providers>);
  jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear();
  await fireEvent.press(result.getByRole('button', { name: copy.useCurrentLocation }));
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(copy.locationFound);
  await result.unmount();

  weather.state = { ...readyState(weather.state), activeLocation: null };
  search.selectPlaceSearchResult.mockImplementation(() => new Promise<undefined>(() => {
    weather.state = { ...readyState(weather.state), isSelectingLocation: true };
  }));
  const manual = await render(<Providers><WeatherLocationScreen /></Providers>);
  await fireEvent.changeText(manual.getByTestId('weather-place-search'), 'Ista'); await debounce();
  await fireEvent.press(manual.getByTestId('weather-place-place.745044'));
  await manual.rerender(<Providers><WeatherLocationScreen /></Providers>);
  expect(manual.queryByLabelText(copy.locatingDevice)).toBeNull();
});
