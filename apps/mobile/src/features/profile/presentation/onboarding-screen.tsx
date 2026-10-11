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
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import Animated, { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  ButtonPair,
  Crossfade,
  Entrance,
  FadeIn,
  Icon,
  NativeDatePicker,
  ProgressFill,
  Screen,
  TintingPlate,
} from '@/components/ui';
import { useKeyboardVisible } from '@/components/ui/use-keyboard-visible';
import {
  ChoiceTile,
  type ChoiceTileDrawing,
  ChoiceTileGrid,
  ClosetRack,
  GarmentBoard,
  type GarmentBoardPiece,
  GarmentCutProvider,
  GarmentPreviewBoard,
  type GarmentOutfitPalette,
  measureGarmentBoardHeight,
  type RackPiece,
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
  onboardingStyledOutfit,
  onboardingUnisexOutfit,
  type OnboardingPreviewOutfits,
} from '@/features/profile/application/onboarding-preview';
import type {
  AnalyticsConsent,
  DressStyle,
  Gender,
  StyleAesthetic,
  OnboardingPreferences,
} from '@/features/profile/domain/profile';
import {
  catalogPreferenceByGender,
  birthDatePickerStart,
  genderSchema,
  minimumBirthDate,
  orderStyleAesthetics,
} from '@/features/profile/domain/profile';
import { NameInput, nameInputError } from '@/features/profile/presentation/name-input';
import { aestheticLabel } from '@/features/profile/presentation/style-aesthetics-options';
import { resolveAtmosphereState, resolveDaypart } from '@/features/weather/domain/atmosphere-state';
import { resolveConditionStyle } from '@/features/weather/domain/condition-style';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { awaitsPlaceWeather } from '@/features/weather/application/weather-application-controller';
import {
  activeLocationSnapshot,
  type WeatherConditionCode,
  type WeatherSnapshot,
} from '@/features/weather/domain/weather';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { useLocalization } from '@/localization/use-messages';
import { useEasierToSee } from '@/theme/easier-to-see';
import { formatWholeTemperatureValue } from '@/presentation/format-temperature';
import { useKuyaraTheme } from '@/theme/theme-context';
import { borderWidths, plateTheme, radii, spacing } from '@/theme/theme';

// O14 onboarding visuals: each step shows what it changes, drawn only from shipped
// silhouettes on the approved stages; no mascot, avatar or body, no new colour.
// Until the first step has found a place's weather the preview is an example outfit on the
// neutral stage, with no sky of its own (ADR 0018's "no weather yet"); then it takes that
// place's sky, name, temperature and condition.
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
// On the step that asks them, the same board answers each choice: a gender and a dress style
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
// One board metric for every outfit the plate shows: the sample outfits, each in its cut, fill
// it, and a taller outfit (a long coat, a jumpsuit) is drawn smaller to fit it, so nothing under
// the plate moves when an answer or the weather changes the outfit.
const sampleOutfits: readonly (readonly [readonly GarmentBoardPiece[], ClothingPreference])[] = [
  [unisexPreviewPieces, unisexPreviewCut],
  ...genderSchema.options.flatMap((gender) => Object.values(choicePreviewPieces[gender])
    .map((pieces) => [pieces, catalogPreferenceByGender[gender]] as const)),
];
const boardHeightAt = (width: number, large: boolean) => Math.max(...sampleOutfits.map(([pieces, cut]) =>
  measureGarmentBoardHeight(pieces, width, 'today', cut, false, large)));
/** The width an outfit is drawn at so it fits the board's height: its full width, or less. */
const fittedWidth = (
  pieces: readonly GarmentBoardPiece[],
  cut: ClothingPreference,
  width: number,
  height: number,
  large: boolean,
) => Math.min(width, width * height / measureGarmentBoardHeight(pieces, width, 'today', cut, false, large));
// The board takes this share of the plate's width, so the plate leaves the answer tiles room
// on the step that asks them while the board stays the step's picture.
const PREVIEW_BOARD_SHARE = 0.66;
// The Closet line's rack: a few sample pieces in fixed colour families, one of them wanted
// (drawn dashed), as the account introduction's rack; a picture of the promise, not a record.
const closetSample: readonly RackPiece[] = ([
  ['light_jacket', 'outerwear', 'blue', false],
  ['sweater', 'top', 'green', false],
  ['t_shirt', 'top', 'white', false],
  ['jeans', 'bottom', 'blue', false],
  ['sneakers', 'footwear', 'white', false],
  ['trench_coat', 'outerwear', 'beige', true],
] as const).map(([garmentTypeId, category, colorFamily, wanted], index) => ({
  id: `onboarding-closet-${index}`,
  garmentTypeId,
  category,
  colorFamily,
  wanted,
  addedAt: index,
}));
const CLOSET_RACK_WIDTH = 160;
// What the first step's stage holds: an outfit with the palette it is drawn in, keyed by what
// it shows, so a new outfit takes the stage once and the same one never re-dresses it.
type StageOutfit = Readonly<{ key: string; pieces: readonly GarmentBoardPiece[]; palette: GarmentOutfitPalette }>;
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
  /** Called with the consent question's answer, which the last step requires. */
  onComplete: (
    preferences: OnboardingPreferences,
    analyticsConsent: Exclude<AnalyticsConsent, 'undecided'>,
  ) => Promise<void>;
  /**
   * The first step's picker, which the composition route supplies from the weather feature.
   * It is given the step's heading, plate and question, and the test ID the step carries.
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
  const [addingBirthDate, setAddingBirthDate] = useState(false);
  // The answer being saved, so only its button shows progress.
  const [savingAnswer, setSavingAnswer] = useState<Exclude<AnalyticsConsent, 'undecided'> | null>(null);
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
  const insets = useSafeAreaInsets();
  const largeBoard = useEasierToSee();
  const weatherState = useWeatherApplication().state;
  const activeLocation = weatherState.status === 'ready' ? weatherState.activeLocation : null;
  const hasActiveLocation = activeLocation !== null;
  // Once the first step has found the place's weather, every preview draws its sky.
  const placeWeather = weatherState.status === 'ready'
    ? activeLocationSnapshot(weatherState.snapshot, activeLocation) : null;
  const sky: PreviewSky = placeWeather ? {
    temperatureC: placeWeather.current.temperatureCelsius,
    condition: placeWeather.current.condition,
    daypart: resolveDaypart(placeWeather.current.observedAt, placeWeather.timeZone, activeLocation?.coordinates),
  } : sampleSky;
  // The rules take a moment, so they run off the render once the place's weather has
  // settled; until then the sample outfits stand.
  const [weatherOutfits, setWeatherOutfits] = useState<Readonly<{
    snapshot: WeatherSnapshot;
    outfits: OnboardingPreviewOutfits | null;
    unisex: readonly GarmentBoardPiece[] | null;
  }> | null>(null);
  useEffect(() => {
    if (!placeWeather) return undefined;
    const idle = requestIdleCallback(() => setWeatherOutfits({
      snapshot: placeWeather,
      outfits: onboardingPreviewOutfits(placeWeather),
      unisex: onboardingUnisexOutfit(placeWeather),
    }));
    return () => cancelIdleCallback(idle);
  }, [placeWeather]);
  const ruled = weatherOutfits !== null && weatherOutfits.snapshot === placeWeather ? weatherOutfits : null;
  const choicePieces = ruled?.outfits ?? choicePreviewPieces;
  // Without a place's weather the plate is the neutral stage: no sky is claimed for the example.
  const skyCondition = placeWeather ? resolveConditionStyle(sky.condition, sky.daypart) : null;
  const plateColor = placeWeather
    ? theme.atmosphere[resolveAtmosphereState(sky.condition, sky.daypart)]
    : theme.atmosphere.neutral;
  const step = onboardingSteps[draft.step];
  // A chosen place's weather is on its way: the first step titles the plate with the place and
  // leaves its stage empty until the weather and the outfit chosen for it arrive.
  const waitingForPlaceWeather = step === 'location' && awaitsPlaceWeather(weatherState);
  const keyboardVisible = useKeyboardVisible();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const aboutFieldsRef = useRef<View>(null);
  const footerRef = useRef<View>(null);
  // The keyboard shortens the page from below and the pinned footer rises with it, over the
  // name field and the birth date row under it. Once the keyboard is up the page scrolls by the
  // least that shows both above the footer, never so far that the field leaves the top.
  useEffect(() => {
    if (step !== 'about') return undefined;
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      aboutFieldsRef.current?.measureInWindow((_x, fieldsTop, _width, fieldsHeight) => {
        footerRef.current?.measureInWindow((_footerX, footerTop) => {
          const hidden = Math.min(fieldsTop + fieldsHeight + spacing.md - footerTop, fieldsTop - insets.top - spacing.md);
          if (hidden > 0) scrollRef.current?.scrollTo({ animated: true, y: scrollOffset.get() + hidden });
        });
      });
    });
    return () => shown.remove();
  }, [insets.top, scrollOffset, scrollRef, step]);
  const typedName = draft.displayName ?? '';
  const nameError = nameInputError(typedName, messages, true);

  const stepTitle = {
    location: copy.welcomeTitle,
    dress: copy.dressTitle,
    styles: copy.stylePreferencesTitle,
    about: copy.nameTitle,
    consent: messages.analytics.consentTitle,
  }[step];
  const stepBody = {
    location: copy.welcomeBody,
    dress: copy.dressBody,
    styles: copy.stylePreferencesBody(styleAestheticsLimit),
    about: copy.aboutBody,
    consent: messages.analytics.consentBody,
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
    // The name is optional, but a typed one that cannot be saved stops here and says why
    // rather than being dropped.
    if (step === 'about' && nameError) {
      AccessibilityInfo.announceForAccessibility(nameError);
      return;
    }
    if (step === 'dress' && (!draft.gender || !draft.dressStyle)) {
      AccessibilityInfo.announceForAccessibility(copy.dressRequiredError);
    }
    dispatch({ type: 'continue', from: draft.step });
  };

  const complete = async (analyticsConsent: Exclude<AnalyticsConsent, 'undecided'>) => {
    // A press while saving, of either answer, is ignored rather than read as a missing answer.
    // The ref also holds a second press in the same frame, before the pressed answer's spinner
    // is drawn.
    if (savingRef.current) return;
    const preferences = onboardingPreferencesFromDraft(draft);
    if (!preferences) {
      AccessibilityInfo.announceForAccessibility(copy.dressRequiredError);
      return;
    }

    savingRef.current = true;
    setSavingAnswer(analyticsConsent);
    setSaveError(false);
    // A promise chain, not try/finally: React Compiler does not compile a component holding a
    // `finally` clause, and the whole onboarding tree then re-rendered on every step.
    await onComplete(preferences, analyticsConsent)
      .catch(() => {
        setSaveError(true);
        AccessibilityInfo.announceForAccessibility(copy.saveError);
      })
      .finally(() => {
        savingRef.current = false;
        setSavingAnswer(null);
      });
  };

  // What location is used for is part of the first step's content, not the pinned bar (O14),
  // so the bar holds only its buttons and the step can still be read to its end.
  const locationRationale = (
    <AppText colorRole="textSecondary" variant="caption">
      {messages.weather.locationRationaleBody}
    </AppText>
  );

  // One board metric on every step: the board area is as tall as the sample outfits drawn at
  // the board's width, and every outfit is drawn to fit it.
  const boardWidth = previewWidth * PREVIEW_BOARD_SHARE;
  const boardHeight = boardHeightAt(boardWidth, largeBoard);
  const fitted = (pieces: readonly GarmentBoardPiece[], cut: ClothingPreference) =>
    fittedWidth(pieces, cut, boardWidth, boardHeight, largeBoard);
  const palette = (pieces: readonly GarmentBoardPiece[], sample: boolean) =>
    previewPalette(pieces, draft.dressStyle ?? 'casual', sky, sample ? unisexPreviewSwatches : undefined);

  // The first step's stage: the example outfit until a place is chosen; nothing while the
  // place's weather and the outfit the rules choose for it are on their way; then that outfit.
  // A change of outfit lets the old board leave before the new one rises, as on Today.
  const stageOutfit: StageOutfit | null = placeWeather
    ? (ruled ? (ruled.unisex
      ? { key: ruled.unisex.map(({ garmentTypeId }) => garmentTypeId).join(','), pieces: ruled.unisex, palette: palette(ruled.unisex, false) }
      : { key: 'sample', pieces: unisexPreviewPieces, palette: palette(unisexPreviewPieces, true) }) : null)
    : waitingForPlaceWeather ? null
      : { key: 'sample', pieces: unisexPreviewPieces, palette: palette(unisexPreviewPieces, true) };
  const [stageKey, setStageKey] = useState(stageOutfit?.key ?? null);
  const [leavingOutfit, setLeavingOutfit] = useState<StageOutfit | null>(null);
  const [shownOutfit, setShownOutfit] = useState(stageOutfit);
  if (step === 'location' && (stageOutfit?.key ?? null) !== stageKey) {
    // A board already leaving keeps leaving; the newest outfit rises after it.
    if (shownOutfit && !leavingOutfit) setLeavingOutfit(shownOutfit);
    setStageKey(stageOutfit?.key ?? null);
    setShownOutfit(stageOutfit);
  }
  const clearLeavingOutfit = useCallback(() => setLeavingOutfit(null), []);

  // On the steps that ask, the board answers each choice: the gender being chosen draws its
  // outfit, and on the styles step the outfit the chosen styles put first on the place's weather.
  const previewGender = step === 'location' ? null : draft.gender;
  const styledPieces = step === 'styles' && placeWeather && draft.gender && draft.dressStyle
    && draft.styleAesthetics.length > 0
    ? onboardingStyledOutfit(placeWeather, draft.gender, draft.dressStyle, draft.styleAesthetics) : null;
  const answerPieces = previewGender
    ? styledPieces ?? choicePieces[previewGender][draft.dressStyle ?? 'casual']
    : ruled?.unisex ?? unisexPreviewPieces;
  // The preview is drawn in the cut of the gender being chosen; until one is, the unisex cut.
  const previewCut = previewGender ? catalogPreferenceByGender[previewGender] : unisexPreviewCut;
  // The later steps' tiles are drawn in the chosen gender's cut too.
  const answerCut = draft.gender ? catalogPreferenceByGender[draft.gender] : unisexPreviewCut;
  const temperature = `${formatWholeTemperatureValue(sky.temperatureC, language, temperatureUnit)}°`;
  const placeName = activeLocation?.displayName ?? messages.weather.currentLocation;
  const previewTitle = placeWeather
    ? copy.previewPlaceTitle(placeName, temperature, messages.weather.conditions[sky.condition])
    : waitingForPlaceWeather ? placeName : copy.previewSampleTitle;

  const board = previewWidth <= 0 ? null : step === 'location' ? (
    <>
      {leavingOutfit ? (
        <View style={[styles.boardLayer, { height: boardHeight }]}>
          <GarmentBoard
            accessibilityLabel=""
            decorative
            key={`leaving-${leavingOutfit.key}`}
            onLeft={clearLeavingOutfit}
            palette={leavingOutfit.palette}
            pieces={leavingOutfit.pieces}
            preset="today"
            stageColor={plateColor}
            testID="onboarding-leaving-board"
            width={fitted(leavingOutfit.pieces, unisexPreviewCut)}
          />
        </View>
      ) : null}
      {stageOutfit ? (
        <View style={[styles.boardLayer, { height: boardHeight }]}>
          <GarmentBoard
            accessibilityLabel=""
            decorative
            key={stageOutfit.key}
            palette={stageOutfit.palette}
            pieces={stageOutfit.pieces}
            preset="today"
            replaces={leavingOutfit !== null}
            rise
            stageColor={plateColor}
            testID="onboarding-welcome-board"
            width={fitted(stageOutfit.pieces, unisexPreviewCut)}
          />
        </View>
      ) : null}
    </>
  ) : (
    <View style={[styles.boardLayer, { height: boardHeight }]}>
      <GarmentPreviewBoard
        height={boardHeight}
        palette={palette(answerPieces, answerPieces === unisexPreviewPieces)}
        pieces={answerPieces}
        stageColor={plateColor}
        testID="onboarding-welcome-board"
        width={fitted(answerPieces, previewCut)}
      />
    </View>
  );
  const previewStage = (
    <TintingPlate
      accessibilityElementsHidden
      color={plateColor}
      importantForAccessibility="no-hide-descendants"
      onLayout={({ nativeEvent }) => setPreviewWidth(nativeEvent.layout.width)}
      style={styles.stage}
      testID="onboarding-welcome-preview">
      <View style={styles.previewTitle}>
        {/* The glyph and the numbers belong to a real sky, so they arrive with it. */}
        {skyCondition ? (
          <FadeIn duration={theme.motion.normal}>
            <Icon
              color={plateTheme(theme, plateColor).condition[skyCondition.ink]}
              name={skyCondition.shape}
              size={20}
            />
          </FadeIn>
        ) : null}
        <Crossfade contentKey={previewTitle} style={styles.previewTitleText}>
          <AppText style={styles.previewTitleText} tabularNumbers variant="bodyStrong">{previewTitle}</AppText>
        </Crossfade>
      </View>
      <GarmentCutProvider cut={previewCut}>
        <View style={[styles.board, { height: boardHeight }]}>{board}</View>
      </GarmentCutProvider>
    </TintingPlate>
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
      {step === 'consent' ? (
        // The settings sentence belongs to the body's group, as on the Today sheet.
        <View style={styles.paragraphs}>
          <AppText colorRole="textSecondary">{stepBody}</AppText>
          <AppText colorRole="textSecondary">{messages.analytics.consentSettingsBody}</AppText>
        </View>
      ) : (
        <AppText colorRole="textSecondary">{stepBody}</AppText>
      )}
      </Entrance>
    </View>
  );

  // The first step: the welcome, the plate, then the question the controls under it answer.
  const locationHeader = (
    <View style={styles.panel}>
      {heading}
      {previewStage}
      <View style={styles.label}>
        <AppText accessibilityRole="header" variant="bodyStrong">{copy.locationQuestion}</AppText>
        {locationRationale}
      </View>
    </View>
  );
  const choiceStage = step === 'dress' || step === 'styles';

  return (
    <GarmentCutProvider cut={answerCut}>
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {step === 'location' ? (
        <SafeAreaView edges={['top']} style={styles.screen}>
          {locationStep({ header: locationHeader, testID: `onboarding-step-${draft.step + 1}` })}
        </SafeAreaView>
      ) : (
        <Screen
          contentContainerStyle={styles.content}
          ref={scrollRef}
          testID={`onboarding-step-${draft.step + 1}`}>
          {heading}

      {/* The steps that ask how to dress share one plate: it arrives once and stays, and only
          the pieces an answer changes move. */}
      {choiceStage ? (
        <Entrance index={1} key="choice-stage">{previewStage}</Entrance>
      ) : null}

      <Entrance index={choiceStage ? 2 : 1} key={`panel-${draft.step}`}>
      {step === 'dress' ? (
        <View style={styles.panel}>
          <View accessibilityLabel={preferenceCopy.genderTitle} style={styles.group}>
            <AppText accessibilityRole="header" variant="bodyStrong">{preferenceCopy.genderTitle}</AppText>
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
          </View>
          <View accessibilityLabel={preferenceCopy.dressStyleTitle} style={styles.group}>
            <AppText accessibilityRole="header" variant="bodyStrong">{copy.dressStyleGroup}</AppText>
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
            {/* One line for both questions, so it stays above the footer. */}
            {draft.hasValidationError && (!draft.gender || !draft.dressStyle) ? (
              <AppText
                accessibilityLiveRegion="assertive"
                accessibilityRole="alert"
                colorRole="textSecondary"
                testID="onboarding-dress-style-error">
                {copy.dressRequiredError}
              </AppText>
            ) : null}
          </View>
        </View>
      ) : null}

      {step === 'styles' ? (
        <View style={styles.panel}>
          <ChoiceTileGrid columns={3} testID="onboarding-style-option">
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

      {step === 'about' ? (
        <View style={styles.panel}>
          {/* The greeting Today will show, in its words on the ground. */}
          <View style={styles.label} testID="onboarding-name-preview">
            <AppText variant="title">
              {typedName.trim() && !nameError
                ? messages.today.greetingFirstNamed(typedName.trim())
                : copy.nameGreetingEmpty}
            </AppText>
            <AppText colorRole="textSecondary" variant="caption">{copy.nameGreetingCaption}</AppText>
          </View>
          <View ref={aboutFieldsRef} style={styles.panel}>
            <View style={styles.label}>
              {/* The field speaks this label itself, so the drawn one is not read twice. */}
              <AppText accessibilityElementsHidden importantForAccessibility="no-hide-descendants" variant="bodyStrong">
                {copy.nameLabel}
              </AppText>
              <NameInput
                accessibilityLabel={copy.nameLabel}
                onChangeText={(value) => dispatch({ type: 'set-display-name', value })}
                skippable
                testID="onboarding-name"
                value={typedName}
              />
            </View>
            <View style={styles.label}>
              <View style={styles.birthDateRow}>
                <AppText style={styles.birthDateTitle} variant="bodyStrong">{preferenceCopy.birthDateTitle}</AppText>
                {/* A picker always draws a date, so an unset birth date shows only Add; the wheel
                    it opens stores nothing until it is turned. Remove takes its place once a
                    date is set. */}
                {draft.birthDate !== null ? (
                  <Button
                    accessibilityLabel={copy.birthDateClearAction}
                    label={copy.birthDateRemove}
                    onPress={() => {
                      setAddingBirthDate(false);
                      dispatch({ type: 'select-birth-date', value: null });
                    }}
                    testID="onboarding-birth-date-remove"
                    variant="plain"
                  />
                ) : !addingBirthDate ? (
                  <Button
                    accessibilityLabel={copy.birthDateAddLabel}
                    label={copy.birthDateAdd}
                    onPress={() => setAddingBirthDate(true)}
                    testID="onboarding-birth-date-add"
                    variant="tonal"
                  />
                ) : null}
              </View>
              <AppText colorRole="textSecondary" variant="caption">{copy.birthDateBody}</AppText>
            </View>
          </View>
          {draft.birthDate !== null || addingBirthDate ? (
            <NativeDatePicker
              accessibilityLabel={preferenceCopy.birthDateTitle}
              initialSelection={birthDatePickerStart(maximumBirthDate)}
              language={language}
              maximumDate={maximumBirthDate}
              minimumDate={minimumBirthDate}
              onChange={(value) => dispatch({ type: 'select-birth-date', value })}
              standalone
              testID="onboarding-birth-date"
              value={draft.birthDate}
            />
          ) : null}
          {/* The Closet, promised in words beside a small rack of sample pieces in the chosen
              cut; the drawing is decoration, the words carry the meaning. */}
          <View style={styles.closetRow}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.closetRack}
              testID="onboarding-closet-rack">
              <ClosetRack pieces={closetSample} />
            </View>
            <View style={[styles.label, styles.closetText]}>
              <AppText variant="bodyStrong">{copy.closetTitle}</AppText>
              <AppText colorRole="textSecondary">{copy.closetPromise}</AppText>
            </View>
          </View>
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
        {/* ADR 0033 section 6: accept and the same-size decline directly beneath it are the
            step's only exits; either answer finishes setup. The stacked pair stretches both to
            the full width, and only the pressed answer shows progress. */}
        {step === 'consent' ? (
          <ButtonPair
            primary={(
              <Button
                label={messages.analytics.acceptAction}
                loading={savingAnswer === 'granted'}
                onPress={() => void complete('granted')}
                size="large"
                testID="onboarding-consent-accept"
                variant="prominent"
              />
            )}
            secondary={(
              <Button
                label={messages.analytics.declineAction}
                loading={savingAnswer === 'withdrawn'}
                onPress={() => void complete('withdrawn')}
                size="large"
                testID="onboarding-consent-decline"
                variant="tonal"
              />
            )}
            stacked
            testID="onboarding-actions-row"
          />
        ) : (
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
          ) : (
            <Button
              label={messages.common.continue}
              onPress={goForward}
              size="large"
              style={styles.primaryAction}
              testID="onboarding-continue"
            />
          )}
          secondary={draft.step > 0 ? (
            <Button
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
        )}
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
  // A group label and what it names.
  group: {
    gap: spacing.sm,
  },
  // A label bound to its control or its caption.
  label: {
    gap: spacing.xs,
  },
  stage: {
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  // The glyph sits with the first line of wrapped words, as every glyph-and-words row does.
  previewTitle: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  // Beside the glyph a long condition wraps inside the plate, whose edge clips.
  previewTitleText: { flexShrink: 1, minWidth: 0 },
  board: { width: '100%' },
  // Each board centred in the board area, a leaving one under the one rising after it.
  boardLayer: {
    alignItems: 'center',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  birthDateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  birthDateTitle: { flexShrink: 1 },
  closetRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  closetRack: { width: CLOSET_RACK_WIDTH },
  closetText: { flex: 1 },
  primaryAction: {
    flexGrow: 1,
  },
  skipAction: {
    width: '100%',
  },
  paragraphs: {
    gap: spacing.sm,
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
