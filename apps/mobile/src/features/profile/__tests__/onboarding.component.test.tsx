import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { PlaceSearchV1Data } from '@kuyara/contracts';

import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { OnboardingScreen } from '@/features/profile/presentation/onboarding-screen';
import { LocationSelectionControls } from '@/features/weather/presentation/location-selection-controls';
import {
  PlaceSearchApplicationContext,
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme, spacing } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

// `useScreenViewed` (via `ProductAnalyticsProvider`) needs `expo-router`'s focus effect;
// this suite exercises step and completion analytics, not focus-driven screen views.
// The native identifiers of the one English convention (en-GB) and of Turkish; a bare `en` draws
// the US month-first, Sunday-first picker.
const nativeLocale = { en: 'en_GB', tr: 'tr_TR' } as const;

jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
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
    revalidateFreshness: jest.fn(async () => undefined),
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
  analytics = new RecordingProductAnalytics(),
  temperatureUnit: 'celsius' | 'fahrenheit' = 'celsius',
) {
  return {
    analytics,
    onComplete,
    result: await render(
      <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false, temperatureUnit }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <ProductAnalyticsProvider
              analytics={analytics}
              firstUseStore={new InMemoryFirstUseStore()}>
              <WeatherApplicationContext value={weather}>
                <PlaceSearchApplicationContext value={search}>
                  <OnboardingScreen
                    initialBirthDate={initialBirthDate}
                    initialDressStyle={initialDressStyle}
                    initialGender={initialGender}
                    onComplete={onComplete}
                    locationStep={({ header, testID }) => (
                      <LocationSelectionControls header={header} testID={testID} testIDPrefix="onboarding" />
                    )}
                  />
                </PlaceSearchApplicationContext>
              </WeatherApplicationContext>
            </ProductAnalyticsProvider>
          </SafeAreaProvider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>,
    ),
    weather,
    search,
  };
}

// Welcome, then location, then the optional name and age on one step, then gender, dress
// style and styles, which completes.
async function pressUntilStep(result: Awaited<ReturnType<typeof renderOnboarding>>['result'], step: number) {
  for (let current = 1; current < step; current += 1) {
    await fireEvent.press(result.getByTestId(current === 3 ? 'onboarding-name-skip' : 'onboarding-continue'));
  }
  expect(result.getByTestId(`onboarding-step-${step}`)).toBeOnTheScreen();
}

test('gender and dress style are required and a null birth date completes honestly', async () => {
  const { analytics, onComplete, result } = await renderOnboarding(null, null);
  expect(analytics.captures).toEqual([
    { name: 'onboarding_started', properties: { schema_version: 3 }, options: undefined },
  ]);

  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-2')).toBeOnTheScreen();
  expect(result.getByText(messages.en.onboarding.locationTitle)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-location-device')).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-place-search')).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-location-skip'))
    .toHaveTextContent(messages.en.onboarding.locationSkipAction);
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-3')).toBeOnTheScreen();
  expect(result.getByText(messages.en.onboarding.ageTitle)).toBeOnTheScreen();
  expect(result.getByText(messages.en.onboarding.birthDateNotSet)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-birth-date').props.accessibilityLabel).toBe(
    messages.en.onboarding.birthDateTitle,
  );
  await fireEvent.press(result.getByTestId('onboarding-name-skip'));
  expect(result.getByTestId('onboarding-step-4')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-gender-error')).toHaveTextContent(
    messages.en.onboarding.genderRequiredError,
  );
  // A blocked "continue" (no gender chosen yet) reports nothing.
  expect(analytics.captures).toHaveLength(4);
  await fireEvent.press(result.getByTestId('onboarding-gender-woman'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-5')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-dress-style-error')).toHaveTextContent(
    messages.en.onboarding.dressStyleRequiredError,
  );
  await fireEvent.press(result.getByTestId('onboarding-dress-style-formal'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-6')).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-style-option')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-complete'));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith({
    displayName: null,
    gender: 'woman',
    dressStyle: 'formal',
    styleAesthetics: [],
    birthDate: null,
  }));

  // Each taxonomy step keeps its own number, whatever its place on screen.
  expect(analytics.captures.map((capture) => capture.properties)).toEqual([
    { schema_version: 3 },
    { schema_version: 3, step_name: 'welcome', step_index: 1, skipped: false },
    { schema_version: 3, step_name: 'location', step_index: 5, skipped: true },
    { schema_version: 3, step_name: 'birth_date', step_index: 4, skipped: true },
    { schema_version: 3, step_name: 'gender', step_index: 2, skipped: false },
    {
      schema_version: 3,
      step_name: 'dress_style',
      step_index: 3,
      skipped: false,
      dress_style: 'formal',
    },
    {
      schema_version: 3,
      dress_style: 'formal',
      age_bucket: 'unknown',
      location_method: 'skipped',
    },
  ]);
  expect(analytics.names()).toEqual([
    'onboarding_started',
    'onboarding_step_completed',
    'onboarding_step_completed',
    'onboarding_step_completed',
    'onboarding_step_completed',
    'onboarding_step_completed',
    'onboarding_completed',
  ]);
});

test('optional name step validates 2 to 30 characters and offers Not now', async () => {
  const { result } = await renderOnboarding(null, null);
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-3')).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-continue').props.accessibilityState.disabled).toBe(true);

  await fireEvent.changeText(result.getByTestId('onboarding-name'), '   ');
  expect(result.getByTestId('onboarding-continue').props.accessibilityState.disabled).toBe(true);

  await fireEvent.changeText(result.getByTestId('onboarding-name'), 'A');
  expect(result.getByTestId('onboarding-name-error')).toHaveTextContent(messages.en.onboarding.nameShortError);
  expect(result.getByTestId('onboarding-continue').props.accessibilityState.disabled).toBe(true);
  await fireEvent.changeText(result.getByTestId('onboarding-name'), 'a'.repeat(31));
  expect(result.getByTestId('onboarding-name-error')).toHaveTextContent(messages.en.onboarding.nameLongError);
  await fireEvent.changeText(result.getByTestId('onboarding-name'), '  Utku  ');
  expect(result.queryByTestId('onboarding-name-error')).toBeNull();
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-4')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-back'));
  await fireEvent.press(result.getByTestId('onboarding-name-skip'));
  expect(result.getByTestId('onboarding-step-4')).toBeOnTheScreen();
});

test('Not now skips only the name and keeps the birth date chosen on the same step', async () => {
  const { analytics, onComplete, result } = await renderOnboarding('woman', null, 'smart');
  await pressUntilStep(result, 3);
  await fireEvent(result.getByTestId('onboarding-birth-date'), 'dateChange', new Date(1994, 2, 14, 12));
  await fireEvent.changeText(result.getByTestId('onboarding-name'), 'A');
  await fireEvent.press(result.getByTestId('onboarding-name-skip'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  await fireEvent.press(result.getByTestId('onboarding-complete'));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
    displayName: null,
    birthDate: '1994-03-14',
  })));
  expect(analytics.captures.find((capture) => 'step_name' in capture.properties && capture.properties.step_name === 'birth_date')?.properties)
    .toMatchObject({ step_index: 4, skipped: false });
});

test('a new step\'s body and panel arrive while the title and progress stay still', async () => {
  const { result } = await renderOnboarding(null, null);
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  // The test mock lands every spring at once; hold the landing to read the first frame.
  const withSpring = jest.spyOn(Reanimated, 'withSpring').mockImplementation((toValue) => toValue);
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  const copy = messages.en.onboarding;
  const entering = { opacity: 0, transform: [{ translateY: spacing.md }] };

  // Law 7: keyed on the step, the body and then the panel enter in reading order.
  expect(StyleSheet.flatten(result.getByText(copy.nameBody).parent!.props.style))
    .toMatchObject(entering);
  expect(StyleSheet.flatten(result.getByTestId('onboarding-name-preview').parent!.parent!.props.style))
    .toMatchObject(entering);
  const heading = StyleSheet.flatten(result.getByText(copy.nameTitle).parent!.props.style);
  expect(heading.opacity).toBeUndefined();
  expect(heading.transform).toBeUndefined();
  withSpring.mockRestore();
});

test('existing profile values prefill the reopened onboarding steps', async () => {
  const { result } = await renderOnboarding('man', '1994-03-14', 'smart');

  await pressUntilStep(result, 3);
  expect(result.queryByText(messages.en.onboarding.birthDateNotSet)).toBeNull();
  expect(result.getByTestId('onboarding-birth-date').props.accessibilityValue.text).toContain(
    '1994-03-14',
  );
  await fireEvent.press(result.getByTestId('onboarding-name-skip'));
  expect(result.getByTestId('onboarding-gender-man').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-dress-style-smart').props.accessibilityState.selected).toBe(true);
});

test('the onboarding birth date picker cannot select a date the birth date rule refuses', async () => {
  const { result } = await renderOnboarding('man', null, 'smart');

  await pressUntilStep(result, 3);
  expect(result.getByTestId('onboarding-birth-date').props.range.start.getFullYear()).toBe(1900);
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

  await pressUntilStep(result, 2);
  await fireEvent.changeText(result.getByTestId('onboarding-place-search'), 'Ista');
  await act(async () => {
    jest.advanceTimersByTime(300);
    await Promise.resolve();
  });
  await fireEvent.press(result.getByTestId('onboarding-place-place.745044'));

  expect(search.selectPlaceSearchResult).toHaveBeenCalledWith(place);
  expect(onComplete).not.toHaveBeenCalled();
  expect(result.getByTestId('onboarding-step-2')).toBeOnTheScreen();
  jest.useRealTimers();
});

test('device selection starts the shared flow and permanent denial keeps Settings available', async () => {
  const active = await renderOnboarding('woman', null, 'smart');
  await pressUntilStep(active.result, 2);
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
  await pressUntilStep(denied.result, 2);
  expect(denied.result.getByText(messages.en.weather.placePermanentDeniedBody))
    .toBeOnTheScreen();
  await fireEvent.press(denied.result.getByRole('button', {
    name: messages.en.weather.openSettings,
  }));
  expect(deniedWeather.openApplicationSettings).toHaveBeenCalledTimes(1);
  expect(denied.result.getByTestId('onboarding-location-skip')).toBeOnTheScreen();
});

const istanbul = {
  source: 'manual',
  catalogId: place.id,
  displayName: place.displayName,
  locationKey: `manual:${place.id}`,
  coordinates: { latitudeE2: place.latitudeE2, longitudeE2: place.longitudeE2 },
  timeZone: place.timeZone,
} as const;

test('a chosen location turns the quiet location action into Continue and is reported', async () => {
  const weather = createWeatherApplication({
    status: 'ready',
    activeLocation: istanbul,
    snapshot: null,
    freshness: null,
    permission: { kind: 'undetermined' },
    locationFlow: 'idle',
    isSelectingLocation: false,
    isRefreshing: false,
    refreshFailure: null,
  });
  const { analytics, result, onComplete } = await renderOnboarding('woman', null, 'smart', undefined, weather);
  await pressUntilStep(result, 2);
  expect(result.queryByText(messages.en.onboarding.locationSkipAction)).not.toBeOnTheScreen();
  expect(result.getByTestId('onboarding-location-skip')).toHaveTextContent(messages.en.common.continue);
  await pressUntilStep(result, 6);
  await fireEvent.press(result.getByRole('button', {
    name: messages.en.onboarding.completeAction,
  }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  expect(analytics.captures.find((capture) => 'step_name' in capture.properties && capture.properties.step_name === 'location')?.properties)
    .toMatchObject({ step_index: 5, skipped: false });
  expect(analytics.captures.at(-1)?.properties).toMatchObject({ location_method: 'manual' });
});

test('once the place is known, the choice previews draw its weather instead of the sample', async () => {
  mockFontScale(1);
  const weather = createWeatherApplication({
    status: 'ready',
    activeLocation: istanbul,
    snapshot: {
      id: 'weather-one',
      localProfileId: 'profile-one',
      locationKey: istanbul.locationKey,
      timeZone: place.timeZone,
      fetchedAt: '2026-10-03T09:00:00.000Z',
      origin: { kind: 'live', sourceId: 'open-meteo' },
      current: {
        observedAt: '2026-10-03T09:00:00.000Z',
        temperatureCelsius: 23,
        apparentTemperatureCelsius: 23,
        condition: 'rain',
        precipitationProbability: 80,
        windSpeedMetersPerSecond: 3,
        humidity: 70,
        uvIndex: 2,
      },
      minimumTemperatureCelsius: 18,
      maximumTemperatureCelsius: 25,
      hourly: [],
    },
    freshness: 'fresh',
    permission: { kind: 'undetermined' },
    locationFlow: 'idle',
    isSelectingLocation: false,
    isRefreshing: false,
    refreshFailure: null,
  });
  const { result } = await renderOnboarding('woman', null, 'smart', undefined, weather);
  await pressUntilStep(result, 4);
  const hidden = { includeHiddenElements: true };
  expect(result.getByText(messages.en.onboarding.welcomePreviewTitle('23°', messages.en.weather.conditions.rain), hidden))
    .toBeOnTheScreen();
  expect(result.getByTestId('onboarding-welcome-preview', hidden)).toHaveStyle({
    backgroundColor: lightTheme.atmosphere.fallingDay,
  });
});

test.each(['tr', 'en'] as const)(
  'the name and age step\'s picker takes the app language %s and stacks its title above the control at accessibility sizes',
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

    await pressUntilStep(result, 3);

    const picker = result.getByTestId('onboarding-birth-date');
    expect(picker.props.modifiers).toEqual([
      { $type: 'environment', key: 'locale', value: nativeLocale[language] },
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

// O5: the button pair stacks, stronger action first, above text factor 1.2. O14: the
// location rationale is always part of the welcome step, never the pinned bar.
test.each([
  [1, 'row'],
  [1.3, 'column'],
  [3, 'column'],
] as const)(
  'at fontScale %s the pinned bar lays its actions out in a %s and keeps the step scrollable',
  async (fontScale, flexDirection) => {
    mockFontScale(fontScale);
    const { result } = await renderOnboarding(null, null);

    const actions = within(result.getByTestId('onboarding-actions'));
    expect(StyleSheet.flatten(result.getByTestId('onboarding-actions-row').props.style))
      .toMatchObject({ flexDirection });

    const rationale = messages.en.weather.locationRationaleBody;
    const step = within(result.getByTestId('onboarding-step-1'));
    expect(actions.queryByText(rationale)).toBeNull();
    expect(step.getByText(rationale)).toBeOnTheScreen();
  },
);

test('the onboarding weather sample follows Fahrenheit', async () => {
  const { result } = await renderOnboarding(
    null, null, undefined, undefined, undefined, undefined, undefined, undefined, 'fahrenheit',
  );
  expect(result.getByText(messages.en.onboarding.welcomePreviewTitle('57°', messages.en.weather.conditions.cloudy), {
    includeHiddenElements: true,
  })).toBeOnTheScreen();
});

// O14: every step shows what it changes, from shipped drawings only.
test('each step draws what it changes: a Today preview, a greeting and garment tiles', async () => {
  mockFontScale(1);
  const { result } = await renderOnboarding(null, null);
  const hidden = { includeHiddenElements: true };
  const copy = messages.en.onboarding;

  const preview = result.getByTestId('onboarding-welcome-preview', hidden);
  expect(preview.props.accessibilityElementsHidden).toBe(true);
  expect(result.getByText(copy.welcomePreviewCaption)).toBeOnTheScreen();
  await fireEvent(preview, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 361, height: 300 } } });
  expect(result.getByTestId('onboarding-welcome-board', hidden)).toBeTruthy();

  await fireEvent.press(result.getByTestId('onboarding-continue'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(within(result.getByTestId('onboarding-name-preview')).getByText(copy.nameGreetingEmpty))
    .toBeOnTheScreen();
  await fireEvent.changeText(result.getByTestId('onboarding-name'), 'Deniz');
  expect(within(result.getByTestId('onboarding-name-preview'))
    .getByText(messages.en.today.greetingFirstNamed('Deniz'))).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-continue'));

  // Gender: two radio tiles, each hinting at three pieces from its catalog.
  expect(result.getByTestId('onboarding-gender-woman')).toHaveAccessibleName(messages.en.preferences.genderWoman);
  expect(result.getByTestId('onboarding-gender-woman-drawing-2', hidden)).toBeTruthy();
  await fireEvent.press(result.getByTestId('onboarding-gender-man'));
  expect(result.getByTestId('onboarding-gender-man-check', hidden)).toBeTruthy();
  // The sample board answers the gender and dress style choices on one stage that stays.
  const choiceBoard = result.getByTestId('onboarding-welcome-board', hidden);
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-welcome-board', hidden)).toBe(choiceBoard);

  // Dress style: the morning sheet's day-type drawings.
  expect(result.getByTestId('onboarding-dress-style-casual-drawing', hidden)).toBeTruthy();
  await fireEvent.press(result.getByTestId('onboarding-dress-style-smart'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));

  // Styles: checkbox tiles; a fourth choice is disabled once three are taken.
  for (const style of ['classic', 'minimal', 'sporty'] as const) {
    await fireEvent.press(result.getByTestId(`onboarding-style-option-${style}`));
  }
  expect(result.getByTestId('onboarding-style-option-minimal').props.accessibilityState)
    .toMatchObject({ checked: true });
  expect(result.getByTestId('onboarding-style-option-relaxed').props.accessibilityState)
    .toMatchObject({ checked: false, disabled: true });
  expect(result.getByText(messages.en.preferences.stylePreferencesLimit)).toBeOnTheScreen();
});
