import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { PlaceSearchV1Data } from '@kuyara/contracts';

import { OnboardingScreen } from '@/features/profile/presentation/onboarding-screen';
import {
  PlaceSearchApplicationContext,
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@/components/ui/native-text-field', () => {
  const { TextInput } = jest.requireActual('react-native');
  return {
    NativeTextField: ({ label, ...props }: { label: string }) => (
      <TextInput accessibilityLabel={label} {...props} />
    ),
  };
});
jest.mock('@/components/ui/native-list', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    NativeList: View,
    NativeListSection: ({ children, footer }: {
      children: React.ReactNode;
      footer?: string;
    }) => <View>{children}<Text>{footer}</Text></View>,
    NativeListRow: ({ label, onPress, testID, value }: {
      label: string;
      onPress?: () => void;
      testID?: string;
      value?: string;
    }) => (
      <Pressable accessibilityLabel={label} onPress={onPress} testID={testID}>
        <Text>{label}</Text>
        <Text>{value}</Text>
      </Pressable>
    ),
  };
});

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

const originalWindowDimensions = Dimensions.get('window');

function mockFontScale(fontScale: number) {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale } });
}

afterEach(() => {
  Dimensions.set({ window: originalWindowDimensions });
});

const place = {
  id: 'place.745044',
  displayName: 'İstanbul',
  region: 'Türkiye',
  latitudeE2: 4101,
  longitudeE2: 2898,
  timeZone: 'Europe/Istanbul',
} as const;
const placeData: PlaceSearchV1Data = {
  places: [place],
  attribution: ['open-meteo', 'geonames'],
};

function createWeatherApplication(
  state: WeatherApplicationValue['state'] = {
    status: 'ready',
    activeLocation: null,
    snapshot: null,
    freshness: null,
    permission: { kind: 'undetermined' },
    locationFlow: 'idle',
    isSelectingLocation: false,
    isRefreshing: false,
    refreshFailure: null,
  },
): WeatherApplicationValue {
  return {
    state,
    retry: jest.fn(async () => undefined),
    dismissLocationFlow: jest.fn(),
    beginDeviceLocationSelection: jest.fn(async () => undefined),
    confirmDeviceLocationRequest: jest.fn(async () => undefined),
    openApplicationSettings: jest.fn(async () => undefined),
    selectManualLocation: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
  };
}

async function renderOnboarding(
  initialGender: 'woman' | 'man' | null,
  initialBirthDate: string | null,
  initialDressStyle: 'casual' | 'smart' | 'formal' | null = null,
  onComplete = jest.fn(async () => undefined),
  weather = createWeatherApplication(),
  search = {
    searchPlaces: jest.fn(async (): Promise<PlaceSearchV1Data> => placeData),
    selectPlaceSearchResult: jest.fn(async () => undefined),
  },
  language: 'en' | 'tr' = 'en',
) {
  return {
    onComplete,
    result: await render(
      <LocalizationContext.Provider value={{ language, messages: messages[language] }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <WeatherApplicationContext value={weather}>
              <PlaceSearchApplicationContext value={search}>
                <OnboardingScreen
                  initialBirthDate={initialBirthDate}
                  initialDressStyle={initialDressStyle}
                  initialGender={initialGender}
                  onComplete={onComplete}
                />
              </PlaceSearchApplicationContext>
            </WeatherApplicationContext>
          </SafeAreaProvider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>,
    ),
    weather,
    search,
  };
}

test('gender and dress style are required and a null birth date completes honestly', async () => {
  const { onComplete, result } = await renderOnboarding(null, null);

  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-2')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-gender-error')).toHaveTextContent(
    messages.en.onboarding.genderRequiredError,
  );
  await fireEvent.press(result.getByTestId('onboarding-gender-woman'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-3')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-dress-style-error')).toHaveTextContent(
    messages.en.onboarding.dressStyleRequiredError,
  );
  await fireEvent.press(result.getByTestId('onboarding-dress-style-formal'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-4')).toBeOnTheScreen();
  expect(result.getByText(messages.en.onboarding.birthDateNotSet)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-birth-date').props.accessibilityLabel).toBe(
    messages.en.onboarding.birthDateTitle,
  );

  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-5')).toBeOnTheScreen();
  expect(result.getByText(messages.en.onboarding.locationTitle)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-location-device')).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-place-search')).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-location-skip')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-complete'));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith({
    gender: 'woman',
    dressStyle: 'formal',
    birthDate: null,
  }));
});

test('existing profile values prefill the reopened onboarding steps', async () => {
  const { result } = await renderOnboarding('man', '1994-03-14', 'smart');

  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-gender-man').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-dress-style-smart').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.queryByText(messages.en.onboarding.birthDateNotSet)).toBeNull();
  expect(result.getByTestId('onboarding-birth-date').props.accessibilityValue.text).toContain(
    '1994-03-14',
  );
});

test('selecting a searched place uses the weather application without completing onboarding', async () => {
  jest.useFakeTimers();
  const onComplete = jest.fn(async () => undefined);
  const { result, search } = await renderOnboarding(
    'woman',
    null,
    'smart',
    onComplete,
  );

  for (let step = 0; step < 4; step += 1) {
    await fireEvent.press(result.getByTestId('onboarding-continue'));
  }
  await fireEvent.changeText(result.getByTestId('onboarding-place-search'), 'Ista');
  await act(async () => {
    jest.advanceTimersByTime(300);
    await Promise.resolve();
  });
  await fireEvent.press(result.getByTestId('onboarding-place-place.745044'));

  expect(search.selectPlaceSearchResult).toHaveBeenCalledWith(place);
  expect(onComplete).not.toHaveBeenCalled();
  expect(result.getByTestId('onboarding-step-5')).toBeOnTheScreen();
  jest.useRealTimers();
});

test('device selection starts the shared flow and permanent denial keeps Settings available', async () => {
  const active = await renderOnboarding('woman', null, 'smart');
  for (let step = 0; step < 4; step += 1) {
    await fireEvent.press(active.result.getByTestId('onboarding-continue'));
  }
  await fireEvent.press(active.result.getByTestId('onboarding-location-device'));
  expect(active.weather.beginDeviceLocationSelection).toHaveBeenCalledTimes(1);
  await active.result.unmount();

  const deniedWeather = createWeatherApplication({
    status: 'ready',
    activeLocation: null,
    snapshot: null,
    freshness: null,
    permission: { kind: 'denied', canRequestAgain: false },
    locationFlow: 'denied-permanent',
    isSelectingLocation: false,
    isRefreshing: false,
    refreshFailure: null,
  });
  const denied = await renderOnboarding('woman', null, 'smart', undefined, deniedWeather);
  for (let step = 0; step < 4; step += 1) {
    await fireEvent.press(denied.result.getByTestId('onboarding-continue'));
  }
  expect(denied.result.getByText(messages.en.weather.placePermanentDeniedBody))
    .toBeOnTheScreen();
  await fireEvent.press(denied.result.getByRole('button', {
    name: messages.en.weather.openSettings,
  }));
  expect(deniedWeather.openApplicationSettings).toHaveBeenCalledTimes(1);
  expect(denied.result.getByTestId('onboarding-complete')).toBeOnTheScreen();
});

test('a chosen location turns the final quiet action into the start action', async () => {
  const weather = createWeatherApplication({
    status: 'ready',
    activeLocation: {
      source: 'manual',
      catalogId: place.id,
      displayName: place.displayName,
      locationKey: `manual:${place.id}`,
      coordinates: { latitudeE2: place.latitudeE2, longitudeE2: place.longitudeE2 },
      timeZone: place.timeZone,
    },
    snapshot: null,
    freshness: null,
    permission: { kind: 'undetermined' },
    locationFlow: 'idle',
    isSelectingLocation: false,
    isRefreshing: false,
    refreshFailure: null,
  });
  const { result, onComplete } = await renderOnboarding('woman', null, 'smart', undefined, weather);
  for (let step = 0; step < 4; step += 1) {
    await fireEvent.press(result.getByTestId('onboarding-continue'));
  }
  expect(result.queryByText(messages.en.weather.cancel)).not.toBeOnTheScreen();
  await fireEvent.press(result.getByRole('button', {
    name: messages.en.onboarding.completeAction,
  }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
});

test.each(['tr', 'en'] as const)(
  'the step 4 picker takes the app language %s and stacks its title above the control at accessibility sizes',
  async (language) => {
    mockFontScale(3);
    const { result } = await renderOnboarding(
      'woman',
      null,
      'smart',
      undefined,
      undefined,
      undefined,
      language,
    );

    for (let step = 0; step < 3; step += 1) {
      await fireEvent.press(result.getByTestId('onboarding-continue'));
    }
    expect(result.getByTestId('onboarding-step-4')).toBeOnTheScreen();

    const picker = result.getByTestId('onboarding-birth-date');
    expect(picker.props.modifiers).toEqual([
      { $type: 'environment', key: 'locale', value: language },
      { $type: 'labelsHidden' },
      { $type: 'tint', color: lightTheme.colors.brandPrimary },
    ]);
    expect(picker.props.accessibilityLabel).toBe(messages[language].onboarding.birthDateTitle);
    // The title is kuyara's own text above a one-row host, hidden from assistive tech so
    // the picker's name is spoken once.
    expect(StyleSheet.flatten(result.getByTestId('expo-ui-host').props.style))
      .toMatchObject({ height: 96 });
    // The step heading carries the same words, so look for the copy the picker draws.
    const visualTitles = result.getAllByText(messages[language].onboarding.birthDateTitle, {
      includeHiddenElements: true,
    });
    expect(visualTitles.some((title) => title.props.accessibilityElementsHidden === true)).toBe(true);
  },
);

test.each([
  [1, 'row', false],
  [3, 'column-reverse', true],
] as const)(
  'at fontScale %s the pinned bar lays its actions out in a %s and keeps the step scrollable',
  async (fontScale, flexDirection, stacked) => {
    mockFontScale(fontScale);
    const { result } = await renderOnboarding(null, null);

    const actions = within(result.getByTestId('onboarding-actions'));
    expect(StyleSheet.flatten(result.getByTestId('onboarding-actions-row').props.style))
      .toMatchObject({ flexDirection });

    // Above the threshold the bar holds nothing but its stacked buttons; the rationale
    // moves into the scrollable step, where it can still be read to its end.
    const rationale = messages.en.weather.locationRationaleBody;
    const step = within(result.getByTestId('onboarding-step-1'));
    expect(actions.queryByText(rationale) !== null).toBe(!stacked);
    expect(step.queryByText(rationale) !== null).toBe(stacked);
  },
);
