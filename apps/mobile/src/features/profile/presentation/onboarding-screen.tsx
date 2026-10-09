import { dressStyles, styleAesthetics, styleAestheticsLimit } from '@kuyara/contracts';
import {
  AccessibilityInfo,
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import Animated, { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  ButtonPair,
  Entrance,
  Icon,
  NativeDatePicker,
  ProgressFill,
  Screen,
} from '@/components/ui';
import { useKeyboardVisible } from '@/components/ui/use-keyboard-visible';
import {
  ChoiceTile,
  type ChoiceTileDrawing,
  ChoiceTileGrid,
  type GarmentBoardPiece,
  GarmentCutProvider,
  GarmentPreviewBoard,
  type GarmentOutfitPalette,
  measureGarmentBoardHeight,
} from '@/garment-art';
import type { ClothingPreference } from '@/domain/preferences';
import type { GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';
import {
  createOnboardingDraft,
  onboardingPreferencesFromDraft,
  onboardingSteps,
  reduceOnboardingDraft,
} from '@/features/profile/application/onboarding-state';
import {
  onboardingPreviewOutfits,
  type OnboardingPreviewOutfits,
} from '@/features/profile/application/onboarding-preview';
import type {
  DressStyle,
  Gender,
  StyleAesthetic,
  OnboardingPreferences,
} from '@/features/profile/domain/profile';
import {
  catalogPreferenceByGender,
  displayNameIssue,
  genderSchema,
  minimumBirthDate,
  orderStyleAesthetics,
} from '@/features/profile/domain/profile';
import { NameInput } from '@/features/profile/presentation/name-input';
import { aestheticLabel } from '@/features/profile/presentation/style-aesthetics-options';
import { resolveAtmosphereState, resolveDaypart } from '@/features/weather/domain/atmosphere-state';
import { resolveConditionStyle } from '@/features/weather/domain/condition-style';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import {
  activeLocationSnapshot,
  type WeatherConditionCode,
  type WeatherSnapshot,
} from '@/features/weather/domain/weather';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { useLocalization } from '@/localization/use-messages';
import { useEasierToSee } from '@/theme/easier-to-see';
import { formatWholeTemperatureValue } from '@/presentation/format-temperature';
import { PlateView } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';
import { borderWidths, plateTheme, radii, spacing } from '@/theme/theme';

// O14 onboarding visuals: each step shows what it changes, drawn only from shipped
// silhouettes on the approved stages; no mascot, avatar or body, no new colour.
// The preview draws a fixed sample sky until the location step has found the place's weather.
// Until a gender is chosen the preview is one unisex outfit: types both catalogs carry, in
// fixed neutral colours, drawn in the men's straight cut, the block unisex clothing is cut on
// (the women's cut draws a fitted waist and a curved hip).
const unisexPreviewPieces = [
  { slot: 'outer_layer', garmentTypeId: 'light_jacket', category: 'outerwear' },
  { slot: 'primary_top', garmentTypeId: 't_shirt', category: 'top' },
  { slot: 'bottom', garmentTypeId: 'jeans', category: 'bottom' },
  { slot: 'footwear', garmentTypeId: 'sneakers', category: 'footwear' },
] as const;
const unisexPreviewSwatches: Readonly<Partial<Record<GarmentBoardPiece['slot'], GarmentSwatchId>>> = {
  outer_layer: 'navy', primary_top: 'white', bottom: 'midwash', footwear: 'white',
};
const unisexPreviewCut: ClothingPreference = 'mens';
// From the gender step on, the same board answers each choice: a gender and a dress style
// swap the pieces they change (Law 7), so the first minute already shows what a choice does.
// Once the place's weather is known, the outfits are the ones the device's rules choose for it;
// until then these sample outfits, which fill the same four slots, dress the sample sky.
const previewOutfit = (
  outer: GarmentBoardPiece['garmentTypeId'],
  top: GarmentBoardPiece['garmentTypeId'],
  bottom: GarmentBoardPiece['garmentTypeId'],
  footwear: GarmentBoardPiece['garmentTypeId'],
): readonly GarmentBoardPiece[] => [
  { slot: 'outer_layer', garmentTypeId: outer, category: 'outerwear' },
  { slot: 'primary_top', garmentTypeId: top, category: 'top' },
  { slot: 'bottom', garmentTypeId: bottom, category: 'bottom' },
  { slot: 'footwear', garmentTypeId: footwear, category: 'footwear' },
];
const choicePreviewPieces: Readonly<Record<Gender, Readonly<Record<DressStyle, readonly GarmentBoardPiece[]>>>> = {
  woman: {
    casual: previewOutfit('light_jacket', 't_shirt', 'skirt', 'ballet_flats'),
    smart: previewOutfit('trench_coat', 'blouse', 'skirt', 'loafers'),
    formal: previewOutfit('blazer', 'blouse', 'trousers', 'closed_shoes'),
  },
  man: {
    casual: previewOutfit('light_jacket', 't_shirt', 'jeans', 'sneakers'),
    smart: previewOutfit('trench_coat', 'shirt', 'trousers', 'loafers'),
    formal: previewOutfit('blazer', 'shirt', 'trousers', 'closed_shoes'),
  },
};
type PreviewSky = Readonly<{
  temperatureC: number;
  condition: WeatherConditionCode;
  daypart: 'day' | 'night' | null;
}>;
const sampleSky: PreviewSky = { temperatureC: 14, condition: 'cloudy', daypart: 'day' };
const previewPalette = (
  pieces: readonly GarmentBoardPiece[],
  formality: DressStyle,
  sky: PreviewSky,
  swatches: Readonly<Partial<Record<GarmentBoardPiece['slot'], GarmentSwatchId>>> = {},
): GarmentOutfitPalette => ({
  optionId: 'onboarding-welcome-preview',
  pieces: pieces.map(({ garmentTypeId, slot }) => ({ garmentTypeId, slot, recordedSwatchId: swatches[slot] })),
  temperatureC: sky.temperatureC,
  condition: sky.condition,
  isNight: sky.daypart === 'night',
  formality,
});
// Each outfit with the cut it is drawn in: a gender's outfits in that gender's catalog cut.
type CutOutfit = readonly [readonly GarmentBoardPiece[], ClothingPreference];
const stagePieces = (choices: typeof choicePreviewPieces): readonly CutOutfit[] => [
  [unisexPreviewPieces, unisexPreviewCut],
  ...genderSchema.options.flatMap((gender) => Object.values(choices[gender])
    .map((pieces): CutOutfit => [pieces, catalogPreferenceByGender[gender]])),
];
const stageHeight = (outfits: readonly CutOutfit[], width: number, large: boolean) => (
  Math.max(...outfits.map(([pieces, cut]) => measureGarmentBoardHeight(pieces, width, 'today', cut, false, large))));
// Each answer hints at the catalog it chooses, three pieces from it.
const genderHints: Readonly<Record<Gender, readonly ChoiceTileDrawing[]>> = {
  woman: [
    { garmentTypeId: 'cardigan', category: 'top' },
    { garmentTypeId: 'skirt', category: 'bottom' },
    { garmentTypeId: 'ballet_flats', category: 'footwear' },
  ],
  man: [
    { garmentTypeId: 'light_jacket', category: 'outerwear' },
    { garmentTypeId: 'trousers', category: 'bottom' },
    { garmentTypeId: 'closed_shoes', category: 'footwear' },
  ],
};
// The morning sheet's day-type drawings, so the answer is recognisable the next morning (M16).
const dressStyleDrawings: Readonly<Record<DressStyle, ChoiceTileDrawing>> = {
  casual: { garmentTypeId: 't_shirt', category: 'top' },
  smart: { garmentTypeId: 'shirt', category: 'top' },
  formal: { garmentTypeId: 'blazer', category: 'outerwear' },
};
const styleDrawings: Readonly<Record<StyleAesthetic, ChoiceTileDrawing>> = {
  minimal: { garmentTypeId: 'long_sleeve_t_shirt', category: 'top' },
  classic: { garmentTypeId: 'trench_coat', category: 'outerwear' },
  sporty: { garmentTypeId: 'sneakers', category: 'footwear' },
  streetwear: { garmentTypeId: 'hoodie', category: 'top' },
  relaxed: { garmentTypeId: 'sandals', category: 'footwear' },
};

type OnboardingScreenProps = Readonly<{
  initialGender: Gender | null;
  initialDressStyle: DressStyle | null;
  initialStyleAesthetics?: readonly StyleAesthetic[];
  initialBirthDate: string | null;
  initialDisplayName?: string | null;
  onComplete: (preferences: OnboardingPreferences) => Promise<void>;
  /**
   * The location step's picker, which the composition route supplies from the weather
   * feature. It is given the step's heading and the test ID the step carries.
   */
  locationStep: (step: Readonly<{ header: ReactNode; testID: string }>) => ReactNode;
}>;

const totalSteps = onboardingSteps.length;

export function OnboardingScreen({
  initialBirthDate,
  initialDisplayName = null,
  initialDressStyle,
  initialStyleAesthetics = [],
  initialGender,
  onComplete,
  locationStep,
}: OnboardingScreenProps) {
  const [draft, dispatch] = useReducer(
    reduceOnboardingDraft,
    createOnboardingDraft({
      displayName: initialDisplayName,
      gender: initialGender,
      dressStyle: initialDressStyle,
      styleAesthetics: initialStyleAesthetics,
      birthDate: initialBirthDate,
    }),
  );
  const [saveError, setSaveError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [previewWidth, setPreviewWidth] = useState(0);
  const announcedStep = useRef(false);
  const headingRef = useRef<Text>(null);
  const now = useForegroundClock();
  const maximumBirthDate = useMemo(() => new Date(now), [now]);
  const { language, messages, temperatureUnit } = useLocalization();
  const copy = messages.onboarding;
  const preferenceCopy = messages.preferences;
  const theme = useKuyaraTheme();
  const largeBoard = useEasierToSee();
  const weatherState = useWeatherApplication().state;
  const activeLocation = weatherState.status === 'ready' ? weatherState.activeLocation : null;
  const activeLocationSource = activeLocation?.source ?? null;
  const hasActiveLocation = activeLocationSource !== null;
  // Once the location step has found the place's weather, every preview draws its sky.
  const placeWeather = weatherState.status === 'ready'
    ? activeLocationSnapshot(weatherState.snapshot, activeLocation) : null;
  const sky: PreviewSky = placeWeather ? {
    temperatureC: placeWeather.current.temperatureCelsius,
    condition: placeWeather.current.condition,
    daypart: resolveDaypart(placeWeather.current.observedAt, placeWeather.timeZone, activeLocation?.coordinates),
  } : sampleSky;
  // The rules take a moment, so they run off the render once the place's weather has
  // settled, steps before the board shows them; until then the sample outfits stand.
  const [weatherOutfits, setWeatherOutfits] = useState<Readonly<{
    snapshot: WeatherSnapshot;
    outfits: OnboardingPreviewOutfits | null;
  }> | null>(null);
  useEffect(() => {
    if (!placeWeather) return undefined;
    const idle = requestIdleCallback(() => setWeatherOutfits({
      snapshot: placeWeather,
      outfits: onboardingPreviewOutfits(placeWeather),
    }));
    return () => cancelIdleCallback(idle);
  }, [placeWeather]);
  const ruledOutfits = weatherOutfits !== null && weatherOutfits.snapshot === placeWeather
    ? weatherOutfits.outfits : null;
  const choicePieces = ruledOutfits ?? choicePreviewPieces;
  const skyStage = theme.atmosphere[resolveAtmosphereState(sky.condition, sky.daypart)];
  const skyCondition = resolveConditionStyle(sky.condition, sky.daypart);
  const step = onboardingSteps[draft.step];
  const keyboardVisible = useKeyboardVisible();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const nameFieldRef = useRef<View>(null);
  const footerRef = useRef<View>(null);
  // The keyboard shortens the page from below, and at large text sizes that leaves the name
  // field under the pinned footer. Once the keyboard is up the page scrolls by the least that
  // shows the whole field above the footer.
  useEffect(() => {
    if (step !== 'about') return undefined;
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      nameFieldRef.current?.measureInWindow((_x, fieldTop, _width, fieldHeight) => {
        footerRef.current?.measureInWindow((_footerX, footerTop) => {
          const hidden = fieldTop + fieldHeight + spacing.md - footerTop;
          if (hidden > 0) scrollRef.current?.scrollTo({ animated: true, y: scrollOffset.get() + hidden });
        });
      });
    });
    return () => shown.remove();
  }, [scrollOffset, scrollRef, step]);
  const hasValidName = Boolean(draft.displayName?.trim())
    && !displayNameIssue(draft.displayName ?? '');

  const stepTitle = {
    welcome: copy.welcomeTitle,
    location: copy.locationTitle,
    about: copy.nameTitle,
    gender: copy.genderTitle,
    dress_style: copy.dressStyleTitle,
    styles: copy.stylePreferencesTitle,
  }[step];
  const stepBody = {
    welcome: copy.welcomeBody,
    location: copy.locationBody,
    about: copy.nameBody,
    gender: copy.genderBody,
    dress_style: copy.dressStyleBody,
    styles: copy.stylePreferencesBody(styleAestheticsLimit),
  }[step];

  useEffect(() => {
    if (announcedStep.current) {
      AccessibilityInfo.announceForAccessibility(stepTitle);
      const animationFrame = requestAnimationFrame(() => {
        const headingNode = findNodeHandle(headingRef.current);
        if (headingNode) {
          AccessibilityInfo.setAccessibilityFocus(headingNode);
        }
      });
      return () => cancelAnimationFrame(animationFrame);
    } else {
      announcedStep.current = true;
    }
  }, [stepTitle]);

  const goForward = () => {
    setSaveError(false);

    const nameInvalid = step === 'about' && !hasValidName;
    if (nameInvalid) return;
    const genderMissing = step === 'gender' && !draft.gender;
    const dressStyleMissing = step === 'dress_style' && !draft.dressStyle;
    if (genderMissing) {
      AccessibilityInfo.announceForAccessibility(copy.genderRequiredError);
    }
    if (dressStyleMissing) {
      AccessibilityInfo.announceForAccessibility(copy.dressStyleRequiredError);
    }
    dispatch({ type: 'continue', from: draft.step });
  };

  const complete = async () => {
    // A press while saving is not a missing answer; it is ignored. The ref also holds a second
    // press in the same frame, before the spinner it starts is drawn.
    if (savingRef.current) return;
    const preferences = onboardingPreferencesFromDraft(draft);
    if (!preferences) {
      AccessibilityInfo.announceForAccessibility(
        draft.gender ? copy.dressStyleRequiredError : copy.genderRequiredError,
      );
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setSaveError(false);
    // A promise chain, not try/finally: React Compiler does not compile a component holding a
    // `finally` clause, and the whole onboarding tree then re-rendered on every step.
    await onComplete(preferences)
      .catch(() => {
        setSaveError(true);
        AccessibilityInfo.announceForAccessibility(copy.saveError);
      })
      .finally(() => {
        savingRef.current = false;
        setIsSaving(false);
      });
  };

  // The rationale is part of the welcome step's content, not the pinned bar (O14), so the
  // bar holds only its buttons and the step can still be read to its end.
  const locationRationale = (
    <AppText colorRole="textSecondary" variant="caption">
      {messages.weather.locationRationaleBody}
    </AppText>
  );
  const typedName = draft.displayName?.trim() ?? '';

  // One stage from the welcome to the dress style step, as tall as its tallest outfit, so a
  // swap never moves what is under it.
  const previewHeight = stageHeight(
    step === 'welcome' ? [[unisexPreviewPieces, unisexPreviewCut]] : stagePieces(choicePieces), previewWidth, largeBoard);
  const previewGender = step !== 'welcome' ? draft.gender : null;
  const previewPieces = previewGender
    ? choicePieces[previewGender][draft.dressStyle ?? 'casual']
    : unisexPreviewPieces;
  // The preview is drawn in the cut of the gender being chosen; until one is, the unisex cut.
  const previewCut = previewGender ? catalogPreferenceByGender[previewGender] : unisexPreviewCut;
  // The later steps' tiles are drawn in the chosen gender's cut too.
  const answerCut = draft.gender ? catalogPreferenceByGender[draft.gender] : unisexPreviewCut;
  const choiceStep = step === 'gender' || step === 'dress_style';
  const previewStage = (
    <PlateView
      accessibilityElementsHidden
      color={skyStage}
      importantForAccessibility="no-hide-descendants"
      onLayout={({ nativeEvent }) => setPreviewWidth(nativeEvent.layout.width)}
      style={styles.stage}
      testID="onboarding-welcome-preview">
      <View style={styles.previewTitle}>
        <Icon
          color={plateTheme(theme, skyStage).condition[skyCondition.ink]}
          name={skyCondition.shape}
          size={20}
        />
        <AppText style={styles.previewTitleText} tabularNumbers variant="bodyStrong">{copy.welcomePreviewTitle(
          `${formatWholeTemperatureValue(sky.temperatureC, language, temperatureUnit)}°`,
          messages.weather.conditions[sky.condition],
        )}</AppText>
      </View>
      {previewWidth > 0 ? (
        <GarmentCutProvider cut={previewCut}>
          <GarmentPreviewBoard
            height={previewHeight}
            palette={previewPalette(previewPieces, draft.dressStyle ?? 'casual', sky,
              previewGender ? undefined : unisexPreviewSwatches)}
            pieces={previewPieces}
            stageColor={skyStage}
            testID="onboarding-welcome-board"
            width={previewWidth}
          />
        </GarmentCutProvider>
      ) : null}
    </PlateView>
  );

  const heading = (
    <View style={styles.heading}>
      <AppText accessibilityRole="header" ref={headingRef} variant="titleLarge">
        {stepTitle}
      </AppText>
      <View
        accessible
        accessibilityLabel={copy.stepPosition(draft.step + 1, totalSteps)}
        accessibilityRole="progressbar"
        accessibilityValue={{ max: totalSteps, min: 0, now: draft.step + 1 }}
        style={styles.progress}>
        {Array.from({ length: totalSteps }, (_, index) => (
          <ProgressFill
            key={index}
            progress={index <= draft.step ? 1 : 0}
            style={styles.progressSegment}
          />
        ))}
      </View>
      {/* The title and progress stay still while each step's own content arrives
          (Law 7): keyed on the step, the body and then the panel enter in reading order. */}
      <Entrance index={0} key={`body-${draft.step}`}>
      <AppText colorRole="textSecondary">{stepBody}</AppText>
      </Entrance>
    </View>
  );

  return (
    <GarmentCutProvider cut={answerCut}>
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {step === 'location' ? (
        <SafeAreaView edges={['top']} style={styles.screen}>
          {locationStep({ header: heading, testID: `onboarding-step-${draft.step + 1}` })}
        </SafeAreaView>
      ) : (
        <Screen
          contentContainerStyle={styles.content}
          ref={scrollRef}
          testID={`onboarding-step-${draft.step + 1}`}>
          {heading}

      {/* The gender and dress style steps share one stage: it arrives once and stays, and
          only the pieces a choice changes move. */}
      {choiceStep ? (
        <Entrance index={1} key="choice-stage">{previewStage}</Entrance>
      ) : null}

      <Entrance index={choiceStep ? 2 : 1} key={`panel-${draft.step}`}>
      {step === 'welcome' ? (
        <View style={styles.panel}>
          {previewStage}
          <AppText>{copy.welcomePreviewCaption}</AppText>
          {locationRationale}
        </View>
      ) : null}

      {step === 'about' ? (
        <View style={styles.panel}>
          <PlateView
            color={theme.atmosphere.veiledDay}
            style={[styles.stage, styles.greeting]}
            testID="onboarding-name-preview">
            <AppText variant="title">
              {typedName && !displayNameIssue(typedName)
                ? messages.today.greetingFirstNamed(typedName)
                : copy.nameGreetingEmpty}
            </AppText>
            <AppText colorRole="textSecondary" variant="caption">{copy.nameGreetingCaption}</AppText>
          </PlateView>
          <View ref={nameFieldRef}>
            <NameInput
              onChangeText={(value) => dispatch({ type: 'set-display-name', value })}
              testID="onboarding-name"
              value={draft.displayName ?? ''}
            />
          </View>
          <View style={styles.age}>
            <AppText accessibilityRole="header" variant="bodyStrong">{copy.ageTitle}</AppText>
            <AppText colorRole="textSecondary" variant="caption">{copy.birthDateBody}</AppText>
            {draft.birthDate === null ? (
              <AppText colorRole="textSecondary">{copy.birthDateNotSet}</AppText>
            ) : null}
            <NativeDatePicker
              accessibilityLabel={copy.birthDateTitle}
              language={language}
              maximumDate={maximumBirthDate}
              minimumDate={minimumBirthDate}
              onChange={(value) => dispatch({ type: 'select-birth-date', value })}
              standalone
              testID="onboarding-birth-date"
              value={draft.birthDate}
            />
            {draft.birthDate !== null ? (
              <Button
                label={copy.birthDateClearAction}
                onPress={() => dispatch({ type: 'select-birth-date', value: null })}
                variant="plain"
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {step === 'gender' ? (
        <View style={styles.section} accessibilityLabel={preferenceCopy.genderTitle}>
          <ChoiceTileGrid accessibilityRole="radiogroup" columns={2}>
            {genderSchema.options.map((gender) => (
              // Each answer draws its hints in the cut it chooses.
              <GarmentCutProvider cut={catalogPreferenceByGender[gender]} key={gender}>
                <ChoiceTile
                  drawings={genderHints[gender]}
                  label={gender === 'woman' ? preferenceCopy.genderWoman : preferenceCopy.genderMan}
                  onPress={() => dispatch({ type: 'select-gender', value: gender })}
                  role="radio"
                  selected={draft.gender === gender}
                  testID={`onboarding-gender-${gender}`}
                />
              </GarmentCutProvider>
            ))}
          </ChoiceTileGrid>
          {draft.hasValidationError ? (
            <AppText
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              colorRole="textSecondary"
              testID="onboarding-gender-error">
              {copy.genderRequiredError}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {step === 'dress_style' ? (
        <View style={styles.section} accessibilityLabel={preferenceCopy.dressStyleTitle}>
          <ChoiceTileGrid accessibilityRole="radiogroup" columns={3}>
            {dressStyles.map((style) => (
              <ChoiceTile
                drawings={[dressStyleDrawings[style]]}
                key={style}
                label={style === 'casual'
                  ? preferenceCopy.dressStyleCasual
                  : style === 'smart' ? preferenceCopy.dressStyleSmart : preferenceCopy.dressStyleFormal}
                onPress={() => dispatch({ type: 'select-dress-style', value: style })}
                role="radio"
                selected={draft.dressStyle === style}
                testID={`onboarding-dress-style-${style}`}
              />
            ))}
          </ChoiceTileGrid>
          {draft.hasValidationError ? (
            <AppText
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              colorRole="textSecondary"
              testID="onboarding-dress-style-error">
              {copy.dressStyleRequiredError}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {step === 'styles' ? (
        <View style={styles.section}>
          <ChoiceTileGrid columns={2} testID="onboarding-style-option">
            {styleAesthetics.map((style) => {
              const checked = draft.styleAesthetics.includes(style);
              return (
                <ChoiceTile
                  disabled={!checked && draft.styleAesthetics.length >= styleAestheticsLimit}
                  drawings={[styleDrawings[style]]}
                  key={style}
                  label={aestheticLabel(preferenceCopy, style)}
                  onPress={() => dispatch({
                    type: 'select-style-aesthetics',
                    value: checked
                      ? draft.styleAesthetics.filter((value) => value !== style)
                      : orderStyleAesthetics([...draft.styleAesthetics, style]),
                  })}
                  role="checkbox"
                  selected={checked}
                  testID={`onboarding-style-option-${style}`}
                />
              );
            })}
          </ChoiceTileGrid>
          {draft.styleAesthetics.length >= styleAestheticsLimit ? (
            <AppText variant="caption">{preferenceCopy.stylePreferencesLimit(styleAestheticsLimit)}</AppText>
          ) : null}
        </View>
      ) : null}

      </Entrance>

      {saveError ? (
        <AppText
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          colorRole="textSecondary"
          testID="onboarding-save-error">
          {copy.saveError}
        </AppText>
      ) : null}

        </Screen>
      )}

      {/* While a city is being typed the results need the room above the keyboard; the footer
          returns when the keyboard goes. */}
      {step === 'location' && keyboardVisible ? null : (
      <SafeAreaView
        edges={['bottom']}
        ref={footerRef}
        testID="onboarding-actions"
        style={[
          styles.pinnedAction,
          {
            backgroundColor: theme.colors.backgroundElevated,
            borderColor: theme.colors.borderSubtle,
          },
        ]}>
        <ButtonPair
          primary={step === 'location' ? (
            <View style={styles.primaryAction} testID="onboarding-location-skip">
              {/* Quiet while the step can be skipped; once a place is chosen it is the step's
                  main action, drawn like every other step's Continue. */}
              <Button
                label={hasActiveLocation ? messages.common.continue : copy.locationSkipAction}
                onPress={goForward}
                size={hasActiveLocation ? 'large' : undefined}
                style={styles.skipAction}
                testID="onboarding-continue"
                variant={hasActiveLocation ? 'prominent' : 'tonal'}
              />
            </View>
          ) : step === 'styles' ? (
            <Button
              label={copy.completeAction}
              loading={isSaving}
              onPress={complete}
              size="large"
              style={styles.primaryAction}
              testID="onboarding-complete"
            />
          ) : step === 'about' ? (
            <View style={styles.nameActions}>
              <Button
                label={copy.nameNotNow}
                onPress={() => {
                  dispatch({ type: 'set-display-name', value: null });
                  dispatch({ type: 'continue', from: draft.step });
                }}
                testID="onboarding-name-skip"
                variant="plain"
              />
              <Button
                disabled={!hasValidName}
                label={messages.common.continue}
                onPress={goForward}
                size="large"
                testID="onboarding-continue"
              />
            </View>
          ) : (
            <Button
              label={messages.common.continue}
              loading={isSaving}
              onPress={goForward}
              size="large"
              style={styles.primaryAction}
              testID="onboarding-continue"
            />
          )}
          secondary={draft.step > 0 ? (
            <Button
              disabled={isSaving}
              label={messages.common.back}
              onPress={() => {
                setSaveError(false);
                dispatch({ type: 'back', from: draft.step });
              }}
              size="large"
              testID="onboarding-back"
              variant="plain"
            />
          ) : null}
          testID="onboarding-actions-row"
        />
      </SafeAreaView>
      )}
    </KeyboardAvoidingView>
    </GarmentCutProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: spacing.md,
  },
  heading: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  panel: {
    gap: spacing.md,
  },
  stage: {
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  previewTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  // Beside the glyph a long condition wraps inside the plate, whose edge clips.
  previewTitleText: { flexShrink: 1, minWidth: 0 },
  greeting: {
    gap: spacing.xs,
    padding: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  age: {
    gap: spacing.sm,
  },
  primaryAction: {
    flexGrow: 1,
  },
  // O14: one footer row on every step; on the name step Not now and Continue share it.
  nameActions: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  skipAction: {
    width: '100%',
  },
  progress: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  progressSegment: {
    borderRadius: radii.pill,
    flex: 1,
    height: 6,
  },
  pinnedAction: {
    borderTopWidth: borderWidths.subtle,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
