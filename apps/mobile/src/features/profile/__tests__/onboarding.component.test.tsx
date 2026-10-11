import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions, Keyboard, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { styleAestheticsLimit, type PlaceSearchV1Data } from '@kuyara/contracts';

import { haptics } from '@/components/ui/haptics';
import { listGarmentTypesForPreference } from '@/features/catalog/domain/garment-catalog';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import { displayNameMinLength } from '@/features/profile/domain/profile';
import { garmentSilhouetteIds } from '@/garment-art/garment-silhouette-map';
import { silhouettes, type SilhouetteId } from '@/garment-art/silhouettes';
import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { onboardingStyledOutfit, onboardingUnisexOutfit } from '@/features/profile/application/onboarding-preview';
import { OnboardingScreen } from '@/features/profile/presentation/onboarding-screen';
import { LocationSelectionControls } from '@/features/weather/presentation/location-selection-controls';
import {
  PlaceSearchApplicationContext,
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import type { WeatherSnapshot } from '@/features/weather/domain/weather';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme, spacing } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';
import { mockFontScale } from '../../../../test/font-scale';

// The native identifiers of the one English convention (en-GB) and of Turkish; a bare `en` draws
// the US month-first, Sunday-first picker.
const nativeLocale = { en: 'en_GB', tr: 'tr_TR' } as const;

jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
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
const hidden = { includeHiddenElements: true };
const copy = messages.en.onboarding;
const consentCopy = messages.en.analytics;
const stepCount = 5;

// React Native provides the idle callback the weather previews wait for; Jest's environment does not.
beforeAll(() => {
  Object.assign(globalThis, {
    requestIdleCallback: (callback: () => void) => setTimeout(callback, 0),
    cancelIdleCallback: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
  });
});

afterEach(() => {
  Dimensions.set({ window: originalWindowDimensions });
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const place = {
  id: 'place.745044',
  displayName: 'İstanbul',
  region: 'Türkiye',
  latitudeE2: 4101,
  longitudeE2: 2898,
  timeZone: 'Europe/Istanbul',
} as const;
const secondPlace = {
  id: 'place.323786',
  displayName: 'Ankara',
  region: 'Türkiye',
  latitudeE2: 3992,
  longitudeE2: 3285,
  timeZone: 'Europe/Istanbul',
} as const;
const placeData: PlaceSearchV1Data = {
  places: [place],
  attribution: ['open-meteo', 'geonames'],
};

type ReadyState = Extract<WeatherApplicationValue['state'], { status: 'ready' }>;
const readyState: ReadyState = {
  status: 'ready',
  activeLocation: null,
  snapshot: null,
  freshness: null,
  permission: { kind: 'undetermined' },
  locationFlow: 'idle',
  isSelectingLocation: false,
  isRefreshing: false,
  refreshFailure: null,
};

type MutableWeather = { -readonly [Key in keyof WeatherApplicationValue]: WeatherApplicationValue[Key] };

function createWeatherApplication(state: Partial<ReadyState> = {}): MutableWeather {
  return {
    state: { ...readyState, ...state },
    retry: jest.fn(async () => undefined),
    dismissLocationFlow: jest.fn(),
    beginDeviceLocationSelection: jest.fn(async () => undefined),
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
    selectPlaceSearchResult: jest.fn(async (_place: PlaceSearchV1Data['places'][number]) => undefined),
  },
  language: 'en' | 'tr' = 'en',
  analytics = new RecordingProductAnalytics(),
  temperatureUnit: 'celsius' | 'fahrenheit' = 'celsius',
) {
  // A fresh tree each time, so a rerender reads the weather state as it is now.
  const tree = () => (
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
                    <LocationSelectionControls header={header} reportsSelection={false} testID={testID} testIDPrefix="onboarding" />
                  )}
                />
              </PlaceSearchApplicationContext>
            </WeatherApplicationContext>
          </ProductAnalyticsProvider>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>
  );
  const result = await render(tree());
  return {
    analytics,
    onComplete,
    result,
    rerender: () => result.rerender(tree()),
    weather,
    search,
  };
}

type Rendered = Awaited<ReturnType<typeof renderOnboarding>>['result'];

// Where (welcome and location on one screen), then how to dress, the optional styles, the
// optional name and birth date, and the analytics consent question, whose answer completes.
async function pressUntilStep(result: Rendered, step: number) {
  for (let current = 1; current < step; current += 1) {
    await fireEvent.press(result.getByTestId('onboarding-continue'));
  }
  expect(result.getByTestId(`onboarding-step-${step}`)).toBeOnTheScreen();
}

const layOutPreview = (result: Rendered) => fireEvent(result.getByTestId('onboarding-welcome-preview', hidden), 'layout',
  { nativeEvent: { layout: { x: 0, y: 0, width: 361, height: 300 } } });

// The garment drawings a board draws, by silhouette.
const outlineIds = new Map<string, SilhouetteId>(Object.entries(silhouettes)
  .map(([id, drawing]) => [drawing.groups[0].outline, id as SilhouetteId]));
const drawnIds = (result: Rendered, testID: string) => new Set(result.getByTestId(testID, hidden)
  .queryAll((node) => outlineIds.has(node.props.d))
  .map((node) => outlineIds.get(node.props.d)!));
const silhouetteOf = (garmentTypeId: GarmentTypeId, cut: 'mens' | 'womens') => garmentSilhouetteIds[cut][garmentTypeId];

const istanbul = {
  source: 'manual',
  catalogId: place.id,
  displayName: place.displayName,
  locationKey: `manual:${place.id}`,
  coordinates: { latitudeE2: place.latitudeE2, longitudeE2: place.longitudeE2 },
  timeZone: place.timeZone,
} as const;
const ankara = {
  ...istanbul,
  catalogId: secondPlace.id,
  displayName: secondPlace.displayName,
  locationKey: `manual:${secondPlace.id}`,
  coordinates: { latitudeE2: secondPlace.latitudeE2, longitudeE2: secondPlace.longitudeE2 },
} as const;
const rainyIstanbul: WeatherSnapshot = {
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
};
const sampleTitle = copy.previewSampleTitle;
const istanbulTitle = copy.previewPlaceTitle('İstanbul', '23°', messages.en.weather.conditions.rain);

test('five steps: where, how to dress, styles, the last optional step and consent, with nothing optional given', async () => {
  const { analytics, onComplete, result } = await renderOnboarding(null, null);
  // Onboarding runs before the consent question, so it reports nothing.
  expect(analytics.captures).toEqual([]);

  // Where: the welcome and the location question on one screen, with no Back.
  expect(result.getByTestId('onboarding-step-1')).toBeOnTheScreen();
  expect(result.getByText(copy.welcomeTitle)).toBeOnTheScreen();
  expect(result.getByText(copy.welcomeBody)).toBeOnTheScreen();
  expect(result.getByText(copy.locationQuestion)).toHaveProp('accessibilityRole', 'header');
  expect(result.getByText(messages.en.weather.locationRationaleBody)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-location-device')).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-place-search')).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-location-skip')).toHaveTextContent(copy.locationSkipAction);
  expect(result.getByRole('progressbar').props.accessibilityValue).toMatchObject({ max: stepCount, now: 1 });
  expect(result.queryByTestId('onboarding-back')).toBeNull();
  await fireEvent.press(result.getByTestId('onboarding-continue'));

  // How to dress: both answers are asked, and each missing one says so beside its tiles.
  expect(result.getByTestId('onboarding-step-2')).toBeOnTheScreen();
  expect(result.getByText(copy.dressTitle)).toBeOnTheScreen();
  expect(result.getByText(messages.en.preferences.genderTitle)).toBeOnTheScreen();
  expect(result.getByText(copy.dressStyleGroup)).toBeOnTheScreen();
  // One error line under both groups names what is still missing, so it fits above the footer.
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-dress-style-error')).toHaveTextContent(copy.dressRequiredError);
  expect(result.queryByTestId('onboarding-gender-error')).toBeNull();
  await fireEvent.press(result.getByTestId('onboarding-gender-woman'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-2')).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-dress-style-error')).toHaveTextContent(copy.dressRequiredError);
  await fireEvent.press(result.getByTestId('onboarding-dress-style-formal'));
  expect(result.queryByTestId('onboarding-dress-style-error')).toBeNull();
  await fireEvent.press(result.getByTestId('onboarding-continue'));

  // Styles, optional.
  expect(result.getByTestId('onboarding-step-3')).toBeOnTheScreen();
  expect(result.getByText(copy.stylePreferencesBody(styleAestheticsLimit))).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-style-option')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-continue'));

  // The last optional step: a labelled name, an unset birth date that draws no date, one Closet
  // line, and a Continue that no optional field can disable.
  expect(result.getByTestId('onboarding-step-4')).toBeOnTheScreen();
  expect(result.getByText(copy.nameTitle)).toBeOnTheScreen();
  expect(result.getByText(copy.aboutBody)).toBeOnTheScreen();
  // The greeting is the name's own preview, in words on the ground, not a second plate.
  expect(within(result.getByTestId('onboarding-name-preview')).getByText(copy.nameGreetingCaption)).toBeOnTheScreen();
  expect(StyleSheet.flatten(result.getByTestId('onboarding-name-preview').props.style)?.backgroundColor).toBeUndefined();
  expect(result.getByText(copy.nameLabel, hidden)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-name')).toHaveAccessibleName(copy.nameLabel);
  expect(result.getByText(messages.en.preferences.birthDateTitle)).toBeOnTheScreen();
  expect(result.getByText(copy.birthDateBody)).toBeOnTheScreen();
  expect(result.queryByTestId('onboarding-birth-date')).toBeNull();
  expect(result.queryByText(copy.birthDateNotSet)).toBeNull();
  expect(result.getByTestId('onboarding-birth-date-add')).toHaveAccessibleName(copy.birthDateAddLabel);
  // The Closet is named with a small rack drawn beside it; the words carry the meaning.
  expect(result.getByText(copy.closetTitle)).toBeOnTheScreen();
  expect(result.getByText(copy.closetPromise)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-closet-rack', hidden)).toHaveProp('accessibilityElementsHidden', true);
  expect(result.queryByTestId('onboarding-name-skip')).toBeNull();
  expect(result.getByTestId('onboarding-continue')).toBeEnabled();
  await fireEvent.press(result.getByTestId('onboarding-continue'));

  expect(result.getByTestId('onboarding-step-5')).toBeOnTheScreen();
  expect(onComplete).not.toHaveBeenCalled();
  await fireEvent.press(result.getByTestId('onboarding-consent-decline'));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith({
    displayName: null,
    gender: 'woman',
    dressStyle: 'formal',
    styleAesthetics: [],
    birthDate: null,
  }, 'withdrawn'));

  expect(analytics.captures).toEqual([]);
});

// ADR 0033 section 6: the last step is the one consent question. Accept is the primary action;
// decline is the same-size action directly beneath it, one tap, never faded. Both answers
// finish setup, and there is no way past the question that leaves it unanswered.
test.each([
  ['onboarding-consent-accept', 'granted'],
  ['onboarding-consent-decline', 'withdrawn'],
] as const)('the last step asks the consent question and %s finishes with %s', async (testID, answer) => {
  const { analytics, onComplete, result } = await renderOnboarding('woman', null, 'smart');
  await pressUntilStep(result, stepCount);

  expect(result.getByRole('header', { name: consentCopy.consentTitle })).toBeOnTheScreen();
  expect(result.getByText(consentCopy.consentBody)).toBeOnTheScreen();
  expect(result.getByText(consentCopy.consentSettingsBody)).toBeOnTheScreen();
  expect(result.getByRole('progressbar').props.accessibilityValue).toMatchObject({ max: stepCount, now: stepCount });
  const actions = within(result.getByTestId('onboarding-actions'));
  expect(actions.getAllByRole('button').map((button) => button.props.accessibilityLabel))
    .toEqual([consentCopy.acceptAction, consentCopy.declineAction]);
  expect(result.queryByTestId('onboarding-back')).toBeNull();
  // The stacked pair stretches both to the full width.
  expect(StyleSheet.flatten(result.getByTestId('onboarding-actions-row').props.style))
    .toMatchObject({ alignItems: 'stretch', flexDirection: 'column' });
  const accept = StyleSheet.flatten(result.getByTestId('onboarding-consent-accept').props.style);
  const decline = StyleSheet.flatten(result.getByTestId('onboarding-consent-decline').props.style);
  expect(accept).toMatchObject({ backgroundColor: lightTheme.colors.primaryFill });
  expect(decline).toMatchObject({ backgroundColor: lightTheme.colors.surfaceInteractive });
  expect(accept.width).toBeUndefined();
  expect(decline.width).toBeUndefined();
  expect(decline.minHeight).toBe(accept.minHeight);
  expect(decline.opacity).toBe(accept.opacity);
  // The settings sentence belongs to the body's group, `sm` from it, as on the Today sheet.
  let group = result.getByText(consentCopy.consentSettingsBody).parent;
  while (group && within(group).queryByText(consentCopy.consentBody) === null) group = group.parent;
  expect(StyleSheet.flatten(group?.props.style)).toMatchObject({ gap: spacing.sm });

  await fireEvent.press(result.getByTestId(testID));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
    gender: 'woman',
    dressStyle: 'smart',
  }), answer));
  // The screen only passes the answer on; nothing is captured here.
  expect(analytics.captures).toEqual([]);
});

test.each([
  ['onboarding-consent-accept', 'onboarding-consent-decline'],
  ['onboarding-consent-decline', 'onboarding-consent-accept'],
] as const)('while %s saves, it alone shows progress and the other keeps its look', async (pressed, other) => {
  const onComplete = jest.fn(() => new Promise<undefined>(() => undefined));
  const { result } = await renderOnboarding('woman', null, 'smart', onComplete);
  await pressUntilStep(result, stepCount);
  const otherStyle = StyleSheet.flatten(result.getByTestId(other).props.style);

  await fireEvent.press(result.getByTestId(pressed));
  expect(result.getByTestId(pressed).props.accessibilityState).toMatchObject({ busy: true });
  expect(result.getByTestId(other).props.accessibilityState).toMatchObject({ busy: false, disabled: false });
  expect(StyleSheet.flatten(result.getByTestId(other).props.style)).toEqual(otherStyle);
  await fireEvent.press(result.getByTestId(other));
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('a double tap on Continue or Back moves one step, so the location offer is never skipped', async () => {
  const { result } = await renderOnboarding('woman', null, 'smart');
  const twice = async (testID: string) => {
    await act(async () => {
      fireEvent.press(result.getByTestId(testID));
      fireEvent.press(result.getByTestId(testID));
    });
  };

  await twice('onboarding-continue');
  expect(result.getByTestId('onboarding-step-2')).toBeOnTheScreen();
  await twice('onboarding-back');
  expect(result.getByTestId('onboarding-step-1')).toBeOnTheScreen();
  await pressUntilStep(result, 3);
  await twice('onboarding-continue');
  expect(result.getByTestId('onboarding-step-4')).toBeOnTheScreen();
});

// The name is optional, so Continue is never disabled by it; a typed name that cannot be saved
// does not vanish silently either: the press stops there and says why.
test('an invalid typed name keeps Continue enabled, stops the press and says why', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const { onComplete, result } = await renderOnboarding('woman', null, 'smart');
  await pressUntilStep(result, 4);

  await fireEvent.changeText(result.getByTestId('onboarding-name'), '27');
  expect(result.getByTestId('onboarding-name-error')).toHaveTextContent(copy.nameLetterError);
  expect(within(result.getByTestId('onboarding-name-preview')).getByText(copy.nameGreetingEmpty)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-continue')).toBeEnabled();
  announce.mockClear();
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-step-4')).toBeOnTheScreen();
  expect(announce).toHaveBeenCalledWith(copy.nameLetterError);

  // The short-name error no longer points to a "Not now" that is gone.
  await fireEvent.changeText(result.getByTestId('onboarding-name'), 'A');
  expect(result.getByTestId('onboarding-name-error')).toHaveTextContent(copy.nameShortError(displayNameMinLength));
  expect(result.getByTestId('onboarding-name-error')).not.toHaveTextContent(/Not now/);

  await fireEvent.changeText(result.getByTestId('onboarding-name'), '  Deniz  ');
  expect(within(result.getByTestId('onboarding-name-preview'))
    .getByText(messages.en.today.greetingFirstNamed('Deniz'))).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  await fireEvent.press(result.getByTestId('onboarding-consent-accept'));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
    expect.objectContaining({ displayName: 'Deniz' }), 'granted'));
});

// The picker used to draw today beside "Not set", and a stray tap stored a real date. Add opens
// the wheel at 1 January, 25 years back; nothing is kept until the wheel is turned, and Remove
// appears only once a date exists.
test('Add opens the birth date wheel 25 years back and nothing is saved until it is turned', async () => {
  const { onComplete, result } = await renderOnboarding('woman', null, 'smart');
  await pressUntilStep(result, 4);
  await fireEvent.press(result.getByTestId('onboarding-birth-date-add'));
  const picker = result.getByTestId('onboarding-birth-date');
  expect(picker.props.accessibilityValue.text).toContain(`${new Date().getFullYear() - 25}-01-01`);
  expect(picker.props.range.start.getFullYear()).toBe(1900);
  expect(result.queryByTestId('onboarding-birth-date-add')).toBeNull();
  expect(result.queryByTestId('onboarding-birth-date-remove')).toBeNull();

  await fireEvent(picker, 'dateChange', new Date(1990, 5, 2, 12));
  // Remove takes Add's place in the row, and says what it removes.
  expect(result.getByTestId('onboarding-birth-date-remove')).toHaveAccessibleName(copy.birthDateClearAction);
  expect(within(result.getByTestId('onboarding-birth-date-remove')).getByText(copy.birthDateRemove, hidden)).toBeTruthy();
  await fireEvent.press(result.getByTestId('onboarding-birth-date-remove'));
  expect(result.queryByTestId('onboarding-birth-date')).toBeNull();
  expect(result.getByTestId('onboarding-birth-date-add')).toBeOnTheScreen();

  await fireEvent.press(result.getByTestId('onboarding-birth-date-add'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  await fireEvent.press(result.getByTestId('onboarding-consent-decline'));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
    expect.objectContaining({ birthDate: null }), 'withdrawn'));
});

test('a turned birth date is saved with an empty name', async () => {
  const { onComplete, result } = await renderOnboarding('woman', null, 'smart');
  await pressUntilStep(result, 4);
  await fireEvent.press(result.getByTestId('onboarding-birth-date-add'));
  await fireEvent(result.getByTestId('onboarding-birth-date'), 'dateChange', new Date(1994, 2, 14, 12));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  await fireEvent.press(result.getByTestId('onboarding-consent-accept'));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
    displayName: null,
    birthDate: '1994-03-14',
  }), 'granted'));
});

test('a new step\'s body and panel arrive while the title and progress stay still', async () => {
  const { result } = await renderOnboarding('woman', null, 'smart');
  await pressUntilStep(result, 3);
  // The test mock lands every spring at once; hold the landing to read the first frame.
  const withSpring = jest.spyOn(Reanimated, 'withSpring').mockImplementation((toValue) => toValue);
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  const entering = { opacity: 0, transform: [{ translateY: spacing.md }] };

  // Law 7: keyed on the step, the body and then the panel enter in reading order.
  expect(StyleSheet.flatten(result.getByText(copy.aboutBody).parent!.props.style))
    .toMatchObject(entering);
  expect(StyleSheet.flatten(result.getByTestId('onboarding-name-preview').parent!.parent!.props.style))
    .toMatchObject(entering);
  const heading = StyleSheet.flatten(result.getByText(copy.nameTitle).parent!.props.style);
  expect(heading.opacity).toBeUndefined();
  expect(heading.transform).toBeUndefined();
  withSpring.mockRestore();
});

// Styles reorder outfits and never remove one, so the styles step shows it: the plate stays and
// puts first the outfit the rules rank first in the chosen styles for the place's weather.
test('on the styles step the plate shows the outfit the chosen styles put first', async () => {
  jest.useFakeTimers();
  mockFontScale(1);
  const weather = createWeatherApplication({ activeLocation: istanbul, snapshot: rainyIstanbul, freshness: 'fresh' });
  const { result } = await renderOnboarding('man', null, 'smart', undefined, weather);
  await act(async () => { jest.advanceTimersByTime(1); });
  await pressUntilStep(result, 3);
  await layOutPreview(result);
  expect(result.getByText(istanbulTitle, hidden)).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-style-option-sporty'));
  // The pieces the new first outfit replaces slide away.
  await act(async () => { jest.advanceTimersByTime(1000); });
  const styled = onboardingStyledOutfit(rainyIstanbul, 'man', 'smart', ['sporty'])!;
  expect(drawnIds(result, 'onboarding-welcome-board'))
    .toEqual(new Set(styled.map(({ garmentTypeId }) => silhouetteOf(garmentTypeId, 'mens'))));
});

test('existing profile values prefill the reopened onboarding steps', async () => {
  const { result } = await renderOnboarding('man', '1994-03-14', 'smart');

  await pressUntilStep(result, 2);
  expect(result.getByTestId('onboarding-gender-man').props.accessibilityState.selected).toBe(true);
  expect(result.getByTestId('onboarding-dress-style-smart').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  await fireEvent.press(result.getByTestId('onboarding-continue'));
  expect(result.getByTestId('onboarding-birth-date').props.accessibilityValue.text).toContain('1994-03-14');
  expect(result.getByTestId('onboarding-birth-date-remove')).toBeOnTheScreen();
});

test('selecting a searched place uses the weather application without completing onboarding', async () => {
  jest.useFakeTimers();
  const { onComplete, result, search } = await renderOnboarding('woman', null, 'smart');

  await fireEvent.changeText(result.getByTestId('onboarding-place-search'), 'Ista');
  await act(async () => {
    jest.advanceTimersByTime(300);
    await Promise.resolve();
  });
  await fireEvent.press(result.getByTestId('onboarding-place-place.745044'));

  expect(search.selectPlaceSearchResult).toHaveBeenCalledWith(place);
  expect(onComplete).not.toHaveBeenCalled();
  expect(result.getByTestId('onboarding-step-1')).toBeOnTheScreen();
});

// The signature moment, on one plate that stays: after a pick the keyboard and the results go,
// the title becomes the place, the sample outfit leaves and the stage waits empty while the row
// says the weather is on its way; then the sky, the glyph and the numbers arrive and the outfit
// the rules choose rises, once, with no other outfit drawn in between.
test('a picked city brings its own sky and outfit to the plate that stays', async () => {
  jest.useFakeTimers();
  mockFontScale(1);
  jest.spyOn(Reanimated, 'interpolateColor').mockImplementation(
    ((value: number, _input: readonly number[], output: readonly string[]) =>
      output[value >= 1 ? 1 : 0]) as typeof Reanimated.interpolateColor,
  );
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  const weather = createWeatherApplication();
  const { result, rerender, search } = await renderOnboarding(null, null, null, undefined, weather);
  search.selectPlaceSearchResult.mockImplementation(async () => {
    weather.state = { ...readyState, activeLocation: istanbul, isRefreshing: true };
  });
  await layOutPreview(result);
  const plate = result.getByTestId('onboarding-welcome-preview', hidden);
  // The example stands on the neutral stage, with no glyph and no numbers.
  expect(plate).toHaveStyle({ backgroundColor: lightTheme.atmosphere.neutral });
  expect(result.getByText(sampleTitle, hidden)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-welcome-board', hidden)).toBeTruthy();

  await fireEvent.changeText(result.getByTestId('onboarding-place-search'), 'Ista');
  await act(async () => {
    jest.advanceTimersByTime(300);
    await Promise.resolve();
  });
  await fireEvent.press(result.getByTestId('onboarding-place-place.745044'));
  expect(dismiss).toHaveBeenCalledTimes(1);
  await rerender();
  // The example title and outfit leave on `fast`.
  await act(async () => { jest.advanceTimersByTime(1000); });
  const row = result.getByTestId('onboarding-location-manual-current');
  expect(within(row).getByText('İstanbul')).toBeOnTheScreen();
  expect(within(row).getByText(messages.en.weather.placeWeatherLoading)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-location-skip')).toHaveTextContent(messages.en.common.continue);
  // The plate stays, titled with the place; its stage waits empty.
  expect(result.getByTestId('onboarding-welcome-preview', hidden)).toBe(plate);
  expect(within(plate).getByText('İstanbul', hidden)).toBeTruthy();
  expect(result.queryByText(sampleTitle, hidden)).toBeNull();
  expect(result.queryByTestId('onboarding-welcome-board', hidden)).toBeNull();

  weather.state = { ...weather.state as ReadyState, snapshot: rainyIstanbul, freshness: 'fresh', isRefreshing: false };
  await rerender();
  expect(result.queryByText(messages.en.weather.placeWeatherLoading)).toBeNull();
  expect(result.getByText(istanbulTitle, hidden)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-welcome-preview', hidden)).toHaveStyle({
    backgroundColor: lightTheme.atmosphere.fallingDay,
  });
  // Until the rules have chosen, no outfit stands in for theirs.
  expect(result.queryByTestId('onboarding-welcome-board', hidden)).toBeNull();
  await act(async () => { jest.advanceTimersByTime(1); });
  const ruled = onboardingUnisexOutfit(rainyIstanbul)!;
  expect(drawnIds(result, 'onboarding-welcome-board'))
    .toEqual(new Set(ruled.map(({ garmentTypeId }) => silhouetteOf(garmentTypeId, 'mens'))));
});

// A weather fetch that fails, a lookup that fails or a refusal never leaves a status waiting on
// screen: the example outfit stands, under the example title, with the flow's own card where it
// has one.
test.each([
  ['an offline weather fetch', { activeLocation: istanbul, refreshFailure: 'offline' as const }, null],
  ['a failed device lookup', { locationFlow: 'lookup-failed' as const, permission: { kind: 'granted', accuracy: 'full' } as const },
    messages.en.weather.lookupFailedNoLocationBody],
  ['a refused permission', { locationFlow: 'denied-requestable' as const, permission: { kind: 'denied', canRequestAgain: true } as const },
    messages.en.weather.placeDeniedBody],
])('%s keeps the example outfit and no weather status', async (_name, state, card) => {
  const { result } = await renderOnboarding(null, null, null, undefined, createWeatherApplication(state));
  await layOutPreview(result);
  expect(result.queryByText(/Getting the weather/)).toBeNull();
  expect(result.getByText(sampleTitle, hidden)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-welcome-board', hidden)).toBeTruthy();
  if (card) expect(result.getByText(card)).toBeOnTheScreen();
});

// Two picks in a row: the one that lands last is the place in use, so only it is spoken and
// only its weather is awaited; the first pick, once it resolves, says nothing.
test('a second pick racing the first names, speaks and awaits only the place in use', async () => {
  jest.useFakeTimers();
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const weather = createWeatherApplication();
  let finishFirst: () => void = () => undefined;
  const search = {
    searchPlaces: jest.fn(async (): Promise<PlaceSearchV1Data> => ({ ...placeData, places: [place, secondPlace] })),
    selectPlaceSearchResult: jest.fn(async (picked: PlaceSearchV1Data['places'][number]) => {
      if (picked.id === place.id) {
        await new Promise<void>((resolve) => { finishFirst = resolve; });
        return undefined;
      }
      weather.state = { ...readyState, activeLocation: ankara, isRefreshing: true };
      return undefined;
    }),
  };
  const { result, rerender } = await renderOnboarding(null, null, null, undefined, weather, search);
  await fireEvent.changeText(result.getByTestId('onboarding-place-search'), 'An');
  await act(async () => {
    jest.advanceTimersByTime(300);
    await Promise.resolve();
  });
  announce.mockClear();
  await fireEvent.press(result.getByTestId('onboarding-place-place.745044'));
  // The picked results step aside; a new search brings them back for the second pick.
  await fireEvent.changeText(result.getByTestId('onboarding-place-search'), 'Ank');
  await act(async () => {
    jest.advanceTimersByTime(300);
    await Promise.resolve();
  });
  await fireEvent.press(result.getByTestId('onboarding-place-place.323786'));
  await act(async () => { finishFirst(); });
  await rerender();

  expect(announce).toHaveBeenCalledWith(messages.en.weather.placeSelectedFetching('Ankara'));
  expect(announce.mock.calls.flat().filter((line) => String(line).includes('İstanbul'))).toEqual([]);
  expect(within(result.getByTestId('onboarding-location-manual-current')).getByText('Ankara')).toBeOnTheScreen();
});

test('device selection starts the shared flow and permanent denial keeps Settings available', async () => {
  const active = await renderOnboarding('woman', null, 'smart');
  await fireEvent.press(active.result.getByTestId('onboarding-location-device'));
  expect(active.weather.beginDeviceLocationSelection).toHaveBeenCalledTimes(1);
  await active.result.unmount();

  const deniedWeather = createWeatherApplication({
    permission: { kind: 'denied', canRequestAgain: false },
    locationFlow: 'denied-permanent',
  });
  const denied = await renderOnboarding('woman', null, 'smart', undefined, deniedWeather);
  expect(denied.result.getByText(messages.en.weather.placePermanentDeniedBody)).toBeOnTheScreen();
  await fireEvent.press(denied.result.getByRole('button', { name: messages.en.weather.openSettings }));
  expect(deniedWeather.openApplicationSettings).toHaveBeenCalledTimes(1);
  expect(denied.result.getByTestId('onboarding-location-skip')).toBeOnTheScreen();
});

// Back from the Settings trip the denial card opened, with access granted there, the step names
// the place the app found and confirms it once, as a tap on the device button would.
test('access granted in Settings names the found place on the step and confirms it once', async () => {
  const success = jest.spyOn(haptics, 'success').mockImplementation(() => undefined);
  const weather = createWeatherApplication({
    permission: { kind: 'denied', canRequestAgain: false },
    locationFlow: 'denied-permanent',
  });
  let finish: () => void = () => undefined;
  jest.mocked(weather.openApplicationSettings).mockImplementation(() => new Promise<void>((resolve) => {
    finish = () => {
      weather.state = {
        ...readyState,
        activeLocation: {
          source: 'device', accuracy: 'full', displayName: 'Kadıköy', locationKey: 'device:4099:2903',
          coordinates: { latitudeE2: 4099, longitudeE2: 2903 }, timeZone: 'Europe/Istanbul',
        },
        permission: { kind: 'granted', accuracy: 'full' },
      };
      resolve();
    };
  }));
  const { result } = await renderOnboarding('woman', null, 'smart', undefined, weather);
  await fireEvent.press(result.getByRole('button', { name: messages.en.weather.openSettings }));
  expect(success).not.toHaveBeenCalled();
  await act(async () => { finish(); });
  expect(within(result.getByTestId('onboarding-location-device-current')).getByText('Kadıköy')).toBeOnTheScreen();
  expect(result.queryByText(messages.en.weather.placePermanentDeniedBody)).toBeNull();
  expect(success).toHaveBeenCalledTimes(1);
});

// While a city is typed the results need the room above the keyboard: the heading, the plate,
// the denial card and the footer step aside, so the list lands below the field instead of on
// it, and all return with the keyboard's dismissal.
test('the heading, plate, denial card and footer step aside while a city is typed', async () => {
  const handlers = new Map<string, (() => void)[]>();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    return { remove: jest.fn() };
  }) as unknown as typeof Keyboard.addListener);
  const emit = (event: string) => act(async () => { handlers.get(event)?.forEach((handler) => handler()); });
  const deniedWeather = createWeatherApplication({
    permission: { kind: 'denied', canRequestAgain: false },
    locationFlow: 'denied-permanent',
  });
  const { result } = await renderOnboarding('woman', null, 'smart', undefined, deniedWeather);
  const deniedBody = messages.en.weather.placePermanentDeniedBody;
  expect(result.getByText(deniedBody)).toBeOnTheScreen();

  const plate = result.getByTestId('onboarding-welcome-preview', hidden);
  await emit('keyboardWillShow');
  expect(result.queryByText(deniedBody)).toBeNull();
  expect(result.queryByText(copy.welcomeTitle)).toBeNull();
  // Hidden, not unmounted: it does not arrive again when the keyboard goes.
  expect(plate).not.toBeVisible();
  expect(result.queryByTestId('onboarding-actions')).toBeNull();
  expect(result.getByTestId('onboarding-place-search')).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-place-results', hidden)).toBeOnTheScreen();

  await emit('keyboardWillHide');
  expect(result.getByText(deniedBody)).toBeOnTheScreen();
  expect(result.getByText(copy.welcomeTitle)).toBeOnTheScreen();
  expect(result.getByTestId('onboarding-welcome-preview', hidden)).toBe(plate);
  expect(result.getByTestId('onboarding-actions')).toBeOnTheScreen();
});

test('a chosen location turns the quiet location action into Continue and is not reported', async () => {
  const weather = createWeatherApplication({ activeLocation: istanbul });
  const { analytics, result, onComplete } = await renderOnboarding('woman', null, 'smart', undefined, weather);
  expect(result.queryByText(copy.locationSkipAction)).not.toBeOnTheScreen();
  expect(result.getByTestId('onboarding-location-skip')).toHaveTextContent(messages.en.common.continue);
  await pressUntilStep(result, stepCount);
  await fireEvent.press(result.getByRole('button', { name: consentCopy.acceptAction }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  // The place chosen in onboarding is not reported either: `location_changed` starts at Weather.
  expect(analytics.captures).toEqual([]);
});

// The step can be skipped, so its action starts quiet; once the device has found a place it is
// named on the step and Continue becomes the step's main action, drawn like every other step's.
// Nothing moves on by itself.
test('a found device location is named on the step and turns Continue into the main action', async () => {
  const skippable = await renderOnboarding('woman', null, 'smart');
  const continueStyle = (result: Rendered) =>
    StyleSheet.flatten(result.getByTestId('onboarding-continue').props.style);
  expect(continueStyle(skippable.result).backgroundColor).toBe(lightTheme.colors.surfaceInteractive);
  expect(skippable.result.queryByTestId('onboarding-location-device-current')).toBeNull();
  await pressUntilStep(skippable.result, 2);
  const stepContinue = continueStyle(skippable.result);
  await skippable.result.unmount();

  const weather = createWeatherApplication({
    activeLocation: {
      source: 'device', accuracy: 'full', displayName: 'Kadıköy', locationKey: 'device:4099:2903',
      coordinates: { latitudeE2: 4099, longitudeE2: 2903 }, timeZone: 'Europe/Istanbul',
    },
    permission: { kind: 'granted', accuracy: 'full' },
  });
  const { result } = await renderOnboarding('woman', null, 'smart', undefined, weather);
  const row = result.getByTestId('onboarding-location-device-current');
  expect(within(row).getByText('Kadıköy')).toBeOnTheScreen();
  expect(within(row).getByText(messages.en.weather.fullLocation)).toBeOnTheScreen();
  const located = continueStyle(result);
  expect(located.backgroundColor).toBe(lightTheme.colors.primaryFill);
  expect(located.height ?? located.minHeight).toBe(stepContinue.height ?? stepContinue.minHeight);
  expect(StyleSheet.flatten(result.getByTestId('onboarding-location-device').props.style).backgroundColor)
    .toBe(lightTheme.colors.surfaceInteractive);
  expect(result.getByTestId('onboarding-step-1')).toBeOnTheScreen();
});

test('once the place is known, both plates draw its weather and name instead of the sample', async () => {
  mockFontScale(1);
  const weather = createWeatherApplication({ activeLocation: istanbul, snapshot: rainyIstanbul, freshness: 'fresh' });
  const { result } = await renderOnboarding('woman', null, 'smart', undefined, weather);
  expect(result.getByText(istanbulTitle, hidden)).toBeOnTheScreen();
  await pressUntilStep(result, 2);
  expect(result.getByText(istanbulTitle, hidden)).toBeOnTheScreen();
  // The sky glyph sits with the first line of a wrapped preview title.
  let previewRow = result.getByText(istanbulTitle, hidden).parent;
  while (previewRow && StyleSheet.flatten(previewRow.props.style)?.flexDirection !== 'row') previewRow = previewRow.parent;
  expect(StyleSheet.flatten(previewRow!.props.style).alignItems).toBe('flex-start');
});

test.each(['tr', 'en'] as const)(
  'the birth date wheel takes the app language %s and keeps its label hidden at accessibility sizes',
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

    await pressUntilStep(result, 4);
    await fireEvent.press(result.getByTestId('onboarding-birth-date-add'));

    const picker = result.getByTestId('onboarding-birth-date');
    expect(picker.props.modifiers).toEqual([
      { $type: 'environment', key: 'locale', value: nativeLocale[language] },
      { $type: 'datePickerStyle', style: 'wheel' },
      { $type: 'labelsHidden' },
      { $type: 'tint', color: lightTheme.colors.brandPrimary },
    ]);
    expect(picker.props.accessibilityLabel).toBe(messages[language].preferences.birthDateTitle);
    expect(StyleSheet.flatten(result.getByTestId('expo-ui-host').props.style))
      .toMatchObject({ height: 216 });
  },
);

// O5: the button pair stacks, stronger action first, above text factor 1.2. O14: what location
// is used for is always part of the step, never the pinned bar.
test.each([
  [1, 'row'],
  [1.3, 'column'],
  [3, 'column'],
] as const)(
  'at fontScale %s the pinned bar lays its actions out in a %s and the rationale stays in the step',
  async (fontScale, flexDirection) => {
    mockFontScale(fontScale);
    const { result } = await renderOnboarding('woman', null, 'smart');
    await pressUntilStep(result, 2);
    expect(StyleSheet.flatten(result.getByTestId('onboarding-actions-row').props.style))
      .toMatchObject({ flexDirection });
    await fireEvent.press(result.getByTestId('onboarding-back'));

    const rationale = messages.en.weather.locationRationaleBody;
    expect(within(result.getByTestId('onboarding-actions')).queryByText(rationale)).toBeNull();
    expect(within(result.getByTestId('onboarding-step-1')).getByText(rationale)).toBeOnTheScreen();
  },
);

test('the place\'s plate title follows Fahrenheit', async () => {
  const weather = createWeatherApplication({ activeLocation: istanbul, snapshot: rainyIstanbul, freshness: 'fresh' });
  const { result } = await renderOnboarding(
    null, null, undefined, undefined, weather, undefined, undefined, undefined, 'fahrenheit',
  );
  expect(result.getByText(copy.previewPlaceTitle('İstanbul', '73°', messages.en.weather.conditions.rain), hidden))
    .toBeOnTheScreen();
});

// At the largest standard text size a long condition wraps the preview title; beside its glyph
// it shrinks to the plate's width instead of being cut at the clipped edge.
test('the preview title wraps beside its glyph inside the plate', async () => {
  const { result } = await renderOnboarding(null, null);
  const title = result.getByText(sampleTitle, hidden);
  expect(StyleSheet.flatten(title.props.style)).toMatchObject({ flexShrink: 1, minWidth: 0 });
});

// The handler a press reaches, read from the rendered tree, so two presses can land in one
// frame, before the spinner the first one starts has been drawn.
function pressHandlerOf(element: { unstable_fiber?: unknown }) {
  type Fiber = { memoizedProps?: { onPress?: unknown }; return: Fiber | null } | null;
  let fiber = element.unstable_fiber as Fiber;
  while (fiber && typeof fiber.memoizedProps?.onPress !== 'function') fiber = fiber.return;
  return fiber!.memoizedProps!.onPress as () => void;
}

test('an answer pressed twice in one frame, or both answers, saves once and announces no missing answer', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const onComplete = jest.fn(() => new Promise<undefined>(() => undefined));
  const { result } = await renderOnboarding('woman', null, 'casual', onComplete);
  await pressUntilStep(result, stepCount);
  announce.mockClear();

  const decline = pressHandlerOf(result.getByTestId('onboarding-consent-decline'));
  const accept = pressHandlerOf(result.getByTestId('onboarding-consent-accept'));
  await act(async () => {
    decline();
    decline();
    accept();
  });
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(expect.anything(), 'withdrawn');
  expect(announce).not.toHaveBeenCalledWith(copy.dressRequiredError);
});

// O14: every step shows what it changes, from shipped drawings only.
test('each step draws what it changes: the plate, the answer tiles and a greeting', async () => {
  mockFontScale(1);
  const { result } = await renderOnboarding(null, null);

  const preview = result.getByTestId('onboarding-welcome-preview', hidden);
  expect(preview.props.accessibilityElementsHidden).toBe(true);
  await layOutPreview(result);
  expect(result.getByTestId('onboarding-welcome-board', hidden)).toBeTruthy();
  await fireEvent.press(result.getByTestId('onboarding-continue'));

  // How to dress: the gender and dress style tiles answer on one board, under one plate.
  expect(result.getByTestId('onboarding-gender-woman')).toHaveAccessibleName(messages.en.preferences.genderWoman);
  expect(result.getByTestId('onboarding-gender-woman-drawing-2', hidden)).toBeTruthy();
  expect(result.getByTestId('onboarding-dress-style-casual-drawing', hidden)).toBeTruthy();
  await layOutPreview(result);
  const board = result.getByTestId('onboarding-welcome-board', hidden);
  await fireEvent.press(result.getByTestId('onboarding-gender-man'));
  expect(result.getByTestId('onboarding-gender-man-check', hidden)).toBeTruthy();
  await fireEvent.press(result.getByTestId('onboarding-dress-style-smart'));
  expect(result.getByTestId('onboarding-welcome-board', hidden)).toBe(board);
  await fireEvent.press(result.getByTestId('onboarding-continue'));

  // Styles: checkbox tiles; a fourth choice is disabled once three are taken.
  for (const style of ['classic', 'minimal', 'sporty'] as const) {
    await fireEvent.press(result.getByTestId(`onboarding-style-option-${style}`));
  }
  expect(result.getByTestId('onboarding-style-option-minimal').props.accessibilityState)
    .toMatchObject({ checked: true });
  expect(result.getByTestId('onboarding-style-option-relaxed').props.accessibilityState)
    .toMatchObject({ checked: false, disabled: true });
  expect(result.getByText(messages.en.preferences.stylePreferencesLimit(styleAestheticsLimit))).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('onboarding-continue'));

  expect(within(result.getByTestId('onboarding-name-preview')).getByText(copy.nameGreetingEmpty))
    .toBeOnTheScreen();
  await fireEvent.changeText(result.getByTestId('onboarding-name'), 'Deniz');
  expect(within(result.getByTestId('onboarding-name-preview'))
    .getByText(messages.en.today.greetingFirstNamed('Deniz'))).toBeOnTheScreen();
});

// Before a gender is chosen the preview is one unisex outfit: types both catalogs carry, in the
// men's straight cut; a chosen gender then draws its own cut, and so do the dress style tiles.
test('the preview draws a unisex outfit until a gender is chosen, then that gender\'s cut', async () => {
  mockFontScale(1);
  const { result } = await renderOnboarding(null, null);
  const outlineIds = new Map<string, SilhouetteId>(Object.entries(silhouettes)
    .map(([id, drawing]) => [drawing.groups[0].outline, id as SilhouetteId]));
  const drawnIds = (testID: string) => new Set(result.getByTestId(testID, hidden)
    .queryAll((node) => outlineIds.has(node.props.d))
    .map((node) => outlineIds.get(node.props.d)!));
  const typeOf = (id: SilhouetteId) => (Object.entries(garmentSilhouetteIds.mens) as [GarmentTypeId, SilhouetteId][])
    .find(([, drawing]) => drawing === id)?.[0];
  const mensTypes = new Set(listGarmentTypesForPreference('mens').map(({ typeId }) => typeId));
  const bothCatalogs = new Set(listGarmentTypesForPreference('womens').map(({ typeId }) => typeId)
    .filter((typeId) => mensTypes.has(typeId)));
  const expectUnisex = () => {
    const drawn = [...drawnIds('onboarding-welcome-board')];
    expect(drawn).toHaveLength(4);
    for (const id of drawn) {
      expect(id).toMatch(/-m$/);
      expect(bothCatalogs.has(typeOf(id)!)).toBe(true);
    }
  };

  await layOutPreview(result);
  expectUnisex();

  await fireEvent.press(result.getByTestId('onboarding-continue'));
  await layOutPreview(result);
  expectUnisex();

  await fireEvent.press(result.getByTestId('onboarding-gender-woman'));
  const women = [...drawnIds('onboarding-welcome-board')];
  expect(women.length).toBeGreaterThan(0);
  expect(women.every((id) => id.endsWith('-f'))).toBe(true);

  await fireEvent.press(result.getByTestId('onboarding-gender-man'));
  const men = [...drawnIds('onboarding-welcome-board')];
  expect(men.length).toBeGreaterThan(0);
  expect(men.every((id) => id.endsWith('-m'))).toBe(true);
  expect(drawnIds('onboarding-dress-style-smart')).toEqual(new Set(['g-shirt-m']));
});
