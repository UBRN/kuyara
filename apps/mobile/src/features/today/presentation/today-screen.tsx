import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { RefreshControl, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { DressStyle } from '@kuyara/contracts';

import {
  AppText,
  Button,
  ButtonPair,
  Crossfade,
  Entrance,
  GarmentBoard,
  GarmentDrawing,
  haptics,
  Icon,
  PressScale,
  measureGarmentBoardHeight,
  Pill,
  Presence,
  useGarmentRoles,
  Screen,
  Surface,
  useRefreshOutcomeHaptics,
  useTextScaling,
} from '@/components/ui';
import { AiSparkleMark } from '@/components/ui/ai-sparkle-mark';
import { useLaunchReveal } from '@/components/ui/launch-curtain';
import { useAmbientPulse } from '@/components/ui/use-ambient-pulse';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import { useSinglePush } from '@/components/ui/use-single-push';
import { useStatusAnnouncement } from '@/components/ui/use-status-announcement';
import type { NotificationOptInOutcome } from '@/features/notifications/application/notification-application-controller';
import { RecommendationApplicationContext } from '@/features/recommendation/application/recommendation-application-context';
import { localDayKey } from '@/features/recommendation/application/recommendation-application-controller';
import { morningBriefingLocalHour } from '@/features/notifications/domain/morning-briefing';
import type { WeatherAlertOfferReason } from '@/features/notifications/domain/weather-alert-offer';
import type { TodayScreenState } from '@/features/today/model';
import { GarmentBoardSkeleton } from '@/features/today/presentation/garment-board-skeleton';
import {
  FirstGenerationRunway,
  type RunwayHandoffTarget,
} from '@/features/today/presentation/first-generation-runway';
import {
  createTodayPresentation,
  createTomorrowPreviewPresentation,
  garmentPaletteDay,
  outfitBoardPieces,
  outfitGarmentPalette,
  runwayWeather,
  type LoadedOutfitPresentation,
  type LoadedTodayPresentation,
} from '@/features/today/presentation/today-presentation';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { TitleWeatherSymbol } from '@/features/today/presentation/title-weather-symbol';
import { formatWallClockTime } from '@/presentation/format-clock-time';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { ambientIntensityOf } from '@/features/weather/domain/ambient-intensity';
import { activeLocationSnapshot } from '@/features/weather/domain/weather';
import { TourTarget } from '@/features/walkthrough/application/tour-target';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { useLocalization } from '@/localization/use-messages';
import { radii, spacing } from '@/theme/theme';
import { easierToSee as easierToSeeValues, useEasierToSee, useStrongEdge } from '@/theme/easier-to-see';
import { useKuyaraTheme } from '@/theme/theme-context';

type GenerationMode = NonNullable<LoadedTodayPresentation['generationMode']>;
type StageOutfit = Pick<LoadedOutfitPresentation, 'id' | 'boardPieces' | 'palette'> & Readonly<{ replaced: boolean }>;

// Law 5's escalation point, for the generic line alone. A narrated wait says what it is
// doing, so it never needs the escalation; past this the unnarrated line has stopped being
// informative on its own.
const LONG_WAIT_MS = 8_000;
// Law 6: a drawing beside caption text is drawn at the caption's 16 points, cropped to its
// own artwork so the garment itself is that tall. "Easier to see" draws it at 24 (O13).
const ACCESSORY_CAPTION_SIZE = 16;

function useAccessoryDrawingSize(): number {
  const { controlScale } = useTextScaling();
  return (useEasierToSee() ? easierToSeeValues.accessoryDrawingSize : ACCESSORY_CAPTION_SIZE) * controlScale;
}

/**
 * ADR 0004's one contextual offer, handed down already decided: the route owns the rule, and
 * Today only renders it and reports which action the user took. Absent when no alert would
 * have fired today, when the offer was already made, or when the user is already opted in.
 */
export type TodayAlertOffer = Readonly<{
  ruleId: WeatherAlertOfferReason;
  /** The Settings opt-in flow, OS permission prompt included. */
  onAccept: () => Promise<NotificationOptInOutcome>;
  onDismiss: () => Promise<void>;
  onOpenSystemSettings: () => void;
}>;

type TodayScreenProps = Readonly<{
  state: TodayScreenState;
  language: SupportedLanguage;
  displayName?: string | null;
  isRefreshing?: boolean;
  alertOffer?: TodayAlertOffer | null;
  onOpenOutfitDetail: (id: string) => void;
  onRefresh: () => void;
  /** Opens the "Ask the stylist again" sheet (O3). The pull gesture never changes the outfit. */
  onAskAgain: () => void;
  /** Set while a day-type answer from the morning or evening sheet is regenerating the outfit. */
  updatingDayType?: DressStyle | null;
  /** The first dressing day, the day the profile was set up, takes its own greeting. */
  firstDressingDay?: boolean;
  /** Set while the morning or evening question is unanswered, so the wait is on the person. */
  awaitingDayQuestion?: boolean;
  /** The first-generation runway shows or leaves (the Phase 8 tour never opens over it). */
  onRunwayVisibleChange?: (visible: boolean) => void;
}>;

// The stage plate's corner radius; the first-generation runway's field shrinks to it.
const STAGE_RADIUS = 26;

// While the first-generation runway hands its outfit to Today, the words around the stage
// wait unseen; once the field has shrunk into the stage plate they arrive in reading order.
const HandoffHoldContext = createContext(false);

/**
 * One block of Today's words in reading order. It takes part only if it was drawn while
 * the runway's hand-off was pending; anywhere else it is drawn at rest, as it always is.
 */
function ArrivesAfterHandoff({ children, index }: Readonly<{ children: ReactNode; index: number }>) {
  const holding = use(HandoffHoldContext);
  const [arrives] = useState(holding);
  return arrives ? <Entrance index={index} waiting={holding}>{children}</Entrance> : children;
}

export function TodayScreen(props: TodayScreenProps) {
  const application = use(RecommendationApplicationContext);
  const weather = useWeatherApplication();
  const { hour12 } = useLocalization();
  const now = useForegroundClock();
  const recommendationState = application?.state.status === 'ready' ? application.state : null;
  const snapshot = recommendationState?.snapshot;
  const settled = snapshot?.localDayKey === localDayKey(new Date(now))
    && snapshot.recommendation.status === 'recommended'
    ? snapshot.recommendation.outfits[0] ?? null
    : null;
  // The runway draws neutral drafts while the wait runs and receives the chosen outfit
  // once, when the answer is in (N2, O1); skipping makes the device's pick that answer.
  const runwayOutfit = settled;
  // S3: the runway reads the weather of the active place only, never a previous place's.
  const placeSnapshot = weather.state.status === 'ready'
    ? activeLocationSnapshot(weather.state.snapshot, weather.state.activeLocation) : null;
  const runwayActive = recommendationState?.showFirstGenerationOverlay ?? false;
  // The outfit's rise waits until the runway has left the screen, so the arrival is seen.
  const [runwayShown, setRunwayShown] = useState(false);
  const { onRunwayVisibleChange } = props;
  const reportRunway = useCallback((visible: boolean) => {
    setRunwayShown(visible);
    onRunwayVisibleChange?.(visible);
  }, [onRunwayVisibleChange]);
  // ADR 0020's one exception: a wait that completes hands its field and outfit to Today's
  // stage. A skipped wait or a failure fades the runway out over Today at rest.
  const theme = useKuyaraTheme();
  const stageTargetRef = useRef<RunwayHandoffTarget | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [leaving, setLeaving] = useState<'handoff' | 'fade' | null>(null);
  const [wordsReleased, setWordsReleased] = useState(false);
  // The outfit the runway carried onto the stage has arrived; its board draws at rest.
  const [carriedOutfitId, setCarriedOutfitId] = useState<string | null>(null);
  useEffect(() => {
    if (leaving === null) return undefined;
    // The words follow once the field has mostly become the stage plate.
    const timer = setTimeout(() => setWordsReleased(true), leaving === 'handoff' ? theme.motion.deliberate : 0);
    return () => clearTimeout(timer);
  }, [leaving, theme.motion.deliberate]);
  const holdingWords = (runwayActive || runwayShown) && !skipped && !wordsReleased;
  // On a cold launch the outfit rises as the launch curtain lifts, so the arrival is seen.
  const launch = useLaunchReveal();

  return (
    <View style={styles.root}>
      <HandoffHoldContext value={holdingWords}>
        <TodayScreenContent
          {...props}
          carriedOutfitId={carriedOutfitId}
          holdRise={runwayActive || runwayShown || !launch.revealing}
          now={now}
          stageTargetRef={stageTargetRef}
        />
      </HandoffHoldContext>
      <FirstGenerationRunway
        active={runwayActive}
        completed={settled !== null}
        handoffTarget={stageTargetRef}
        language={props.language}
        onHandedOff={() => setCarriedOutfitId(runwayOutfit?.optionId ?? null)}
        onLeave={(handingOff) => setLeaving(handingOff ? 'handoff' : 'fade')}
        onSkip={() => {
          setSkipped(true);
          void application?.skipWait();
        }}
        onVisibleChange={reportRunway}
        outfit={runwayOutfit && placeSnapshot ? {
          id: runwayOutfit.optionId,
          pieces: outfitBoardPieces(runwayOutfit),
          palette: outfitGarmentPalette(runwayOutfit, garmentPaletteDay(
            placeSnapshot, now,
            snapshot?.paletteWeather
              ? { ...snapshot.paletteWeather, localDayKey: snapshot.localDayKey }
              : undefined,
          )),
        } : null}
        phase={recommendationState?.phase ?? null}
        weather={placeSnapshot && weather.state.status === 'ready'
          ? runwayWeather(
            placeSnapshot,
            weather.state.activeLocation?.coordinates ?? null,
            props.language,
            hour12,
            now,
          )
          : null}
      />
    </View>
  );
}

function TodayScreenContent({
  carriedOutfitId,
  holdRise,
  now,
  stageTargetRef,
  state,
  language,
  displayName = null,
  isRefreshing = false,
  alertOffer = null,
  onOpenOutfitDetail,
  onRefresh,
  onAskAgain,
  updatingDayType = null,
  firstDressingDay = false,
  awaitingDayQuestion = false,
}: TodayScreenProps & Readonly<{
  carriedOutfitId: string | null;
  holdRise: boolean;
  now: number;
  stageTargetRef: RefObject<RunwayHandoffTarget | null>;
}>) {
  const push = useSinglePush();
  // The Phase 8 tour asks Today to bring its outfit or its last action into view, and to
  // scroll further when the scroll view's end leaves that action under the tab bar.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const scrollBy = (dy: number) => scrollRef.current?.scrollTo({ animated: true, y: scrollOffset.get() + dy });
  const recommendationApplication = use(RecommendationApplicationContext);
  const weatherApplication = useWeatherApplication();
  const { hour12, temperatureUnit } = useLocalization();
  const presentationState =
    state.kind === 'unavailable' &&
    weatherApplication.state.status === 'ready' &&
    weatherApplication.state.activeLocation === null
      ? { ...state, reason: 'no-active-location' as const }
      : state;
  const presentation = createTodayPresentation(presentationState, language, hour12, temperatureUnit, now);
  const copy = getMessages(language).today;
  const theme = useKuyaraTheme();
  const easierToSee = useEasierToSee();
  // The one source for the strong edge: the switch or iOS Increase
  // Contrast. A full-width row wears it; a two-up tile wears it on its drawing plate.
  const strongEdge = useStrongEdge();
  // One shared threshold (ADR 0019): the stacked layout is the same rule ListRow applies.
  const { usesStackedLayout: usesAccessibilityLayout } = useTextScaling();
  // Measure the content after Screen applies its safe-area insets and width cap.
  const [contentWidth, setContentWidth] = useState(0);
  // Waiting for the day question is not a slow generation, so its clock starts at the answer.
  const isGenerating = presentation.kind === 'loading' && !awaitingDayQuestion;
  // Law 5's warning structure: the same fact, plus what is still happening, once the
  // wait has run past the point where the first line alone stops being informative.
  const [isLongWait, setIsLongWait] = useState(false);
  // Either action ends the offer here rather than waiting for the durable flag to come back
  // through the prop. Accepting spends it whatever the OS answers, so a refusal arrives after
  // the prop is already gone, and the refused offer is kept to explain itself.
  const [offerAnswered, setOfferAnswered] = useState(false);
  const [blockedOffer, setBlockedOffer] = useState<TodayAlertOffer | null>(null);
  // The badge row closes in place when a new outfit carries no source, so while it closes it
  // keeps drawing the source it last showed.
  const [shownGenerationMode, setShownGenerationMode] = useState<GenerationMode | null>(null);
  // Law 7's exit: the outfit on the stage, whether it took another one's place while Today was
  // shown, and the outfit it took the place of while that one leaves, so a new outfit rises
  // only once the pieces it replaces have dropped away.
  const [stageOutfit, setStageOutfit] = useState<StageOutfit | null>(null);
  const [leavingOutfit, setLeavingOutfit] = useState<StageOutfit | null>(null);
  const clearLeavingOutfit = useCallback(() => setLeavingOutfit(null), []);
  // Held until the hero stage has laid out once, so the first outfit's rise starts after the
  // screen has been drawn rather than being spent while the loaded screen is still mounting.
  const [stageLaidOut, setStageLaidOut] = useState(false);
  const offerToRender = blockedOffer ?? (offerAnswered ? null : alertOffer);
  // The row leaves in place, so while it closes it keeps drawing the offer it last showed.
  const [shownOffer, setShownOffer] = useState<Readonly<{ offer: TodayAlertOffer; blocked: boolean }> | null>(null);
  if (offerToRender && (shownOffer?.offer !== offerToRender || shownOffer.blocked !== (blockedOffer !== null))) {
    setShownOffer({ offer: offerToRender, blocked: blockedOffer !== null });
  }
  const answerOffer = async () => {
    if (blockedOffer) {
      blockedOffer.onOpenSystemSettings();
      return;
    }
    if (!alertOffer) return;
    try {
      const result = await alertOffer.onAccept();
      if (result.outcome === 'blocked') setBlockedOffer(alertOffer);
      else setOfferAnswered(true);
    } catch {
      // The durable flag did not commit, so the once-only offer must remain answerable.
    }
  };
  const dismissOffer = async () => {
    if (blockedOffer) {
      setOfferAnswered(true);
      setBlockedOffer(null);
      return;
    }
    if (!alertOffer) return;
    try {
      await alertOffer.onDismiss();
      setOfferAnswered(true);
    } catch {
      // Keep the row visible when the durable once-only flag could not be written.
    }
  };
  useEffect(() => {
    if (!isGenerating) return undefined;
    const timer = setTimeout(() => setIsLongWait(true), LONG_WAIT_MS);
    return () => {
      clearTimeout(timer);
      setIsLongWait(false);
    };
  }, [isGenerating]);
  useRefreshOutcomeHaptics(
    presentation.kind === 'loaded' && presentation.header.isRefreshing,
    state.kind === 'loaded' && state.refreshFailed,
  );
  // Only the focused screen speaks: Today also shows a refresh pulled on Weather, and iOS
  // would otherwise say both screens' lines at once.
  // The freshness line's live region covers Android; VoiceOver hears each change once.
  useStatusAnnouncement(presentation.kind === 'loaded' ? presentation.header.freshness : null);
  const refreshControl = (
    <RefreshControl
      colors={[theme.colors.iconSecondary]}
      onRefresh={() => {
        haptics.impactLight();
        onRefresh();
      }}
      refreshing={presentation.kind === 'loaded' ? presentation.header.isRefreshing : isRefreshing}
      tintColor={theme.colors.iconSecondary}
    />
  );

  // A confirmed re-ask brings the outfit's stage back into view on the platform's own
  // scroll, so the new outfit's rise is seen rather than spent below the fold. Read at the
  // top, nothing moves.
  const reasking = presentation.kind === 'loaded' && presentation.choosingCaption !== null;
  const wasReasking = useRef(reasking);
  useEffect(() => {
    if (reasking && !wasReasking.current) scrollRef.current?.scrollTo({ animated: true, y: 0 });
    wasReasking.current = reasking;
  }, [reasking, scrollRef]);

  // The runway reads the drawn stage when its wait completes.
  const stageView = useRef<View>(null);
  const loadedStageColor = presentation.kind === 'loaded' ? theme.atmosphere[presentation.atmosphere] : null;
  useEffect(() => {
    stageTargetRef.current = stageView.current && loadedStageColor
      ? { node: stageView.current, color: loadedStageColor, radius: STAGE_RADIUS }
      : null;
  });

  if (presentation.kind !== 'loaded' && stageLaidOut) setStageLaidOut(false);

  if (presentation.kind === 'loading') {
    return (
      <Screen
        accessibilityActions={[{ name: 'refresh', label: copy.refreshAction }]}
        alwaysBounceVertical
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'refresh') onRefresh();
        }}
        // Every branch carries the scroll ref: React keeps one scroll view across them, and
        // Reanimated attaches a ref only when the view mounts.
        ref={scrollRef}
        refreshControl={refreshControl}
        testID="today-screen">
        <View
          onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width)}
          testID="today-loading-screen">
          {/* The wait says what is being prepared. Without it the first run is a breathing
              placeholder and one status line, and the mapper's own title and body had no
              reader on this screen. */}
          <View style={styles.loadingIntro} testID="today-loading-intro">
            <AppText accessibilityRole="header" variant="title">
              {presentation.title}
            </AppText>
            <AppText colorRole="textSecondary">{presentation.body}</AppText>
          </View>
          {/* The plate takes its height from the placeholders it holds, the way the
              loaded stage takes its own from the drawn pieces. */}
          <View
            style={[styles.stage, { backgroundColor: theme.colors.stage }]}
            testID="today-skeleton-stage">
            <GarmentBoardSkeleton testID="today-skeleton-board" width={contentWidth} />
          </View>
          {/* Law 7: the breathing placeholders and the breathing mark are never the only
              signal. This line is the state, and it is what a screen reader is given. */}
          <View style={styles.generatingStatus} testID="today-generating-status-row">
            {presentation.phase ? <PhaseMark size={20} testID="today-generating-mark" /> : null}
            <AppText
              accessibilityLiveRegion="polite"
              colorRole="textSecondary"
              style={styles.generatingStatusText}
              testID="today-generating-status">
              {presentation.phase
                ? copy.phase[presentation.phase]
                : isLongWait
                  ? copy.generatingLongWaitStatus
                  : copy.generatingStatus}
            </AppText>
          </View>
        </View>
      </Screen>
    );
  }

  if (presentation.kind !== 'loaded') {
    return (
      <Screen
        accessibilityActions={[{ name: 'refresh', label: copy.refreshAction }]}
        accessibilityLabel={presentation.accessibilityLabel}
        alwaysBounceVertical
        contentContainerStyle={styles.feedbackContent}
        fill
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'refresh') onRefresh();
        }}
        ref={scrollRef}
        refreshControl={refreshControl}
        testID="today-screen">
        <Surface
          style={styles.feedbackCard}
          testID={
            presentation.reason === 'no-active-location'
              ? 'today-no-location'
              : 'today-unavailable-screen'
          }
          variant="elevated">
          {/* The text reads as one alert and the action beside it stays its own element: on
              iOS an accessible view hides everything inside it from VoiceOver. */}
          <View
            accessible
            accessibilityLabel={presentation.accessibilityLabel}
            accessibilityRole="alert"
            style={styles.feedbackText}>
            <AppText accessibilityRole="header" variant="title" style={styles.centerText}>
              {presentation.title}
            </AppText>
            <AppText colorRole="textSecondary" style={styles.centerText}>
              {presentation.body}
            </AppText>
          </View>
          {presentation.actionLabel ? (
            <Button
              label={presentation.actionLabel}
              onPress={
                presentation.reason === 'no-active-location'
                  ? () => push('/weather/location')
                  : onRefresh
              }
            />
          ) : null}
        </Surface>
      </Screen>
    );
  }

  const stageColor = theme.atmosphere[presentation.atmosphere];
  const choosing = presentation.choosingCaption;
  const updating = updatingDayType !== null || choosing !== null;
  // The symbol draws the same rain at every tempo; only the condition's ambient step says
  // how fast it falls.
  const ambientIntensity = state.kind === 'loaded'
    ? ambientIntensityOf(state.snapshot.weather.current.condition)
    : 'calm';
  const [primary, ...alternates] = presentation.suggestions;
  if (primary && primary.id !== stageOutfit?.id) {
    setLeavingOutfit(stageOutfit);
    setStageOutfit({
      id: primary.id, boardPieces: primary.boardPieces, palette: primary.palette, replaced: stageOutfit !== null,
    });
  }
  const generationMode = presentation.generationMode;
  if (generationMode && (shownGenerationMode?.mode !== generationMode.mode
    || shownGenerationMode.label !== generationMode.label
    || shownGenerationMode.accessibilityLabel !== generationMode.accessibilityLabel)) {
    setShownGenerationMode(generationMode);
  }
  const exhausted = recommendationApplication?.state.status === 'ready'
    && recommendationApplication.state.exhausted;
  // In the evening, the next dressing day's outfit under its own heading, after today's.
  const tomorrowPreview = recommendationApplication?.tomorrowPreview ?? null;
  const tomorrowWeather = weatherApplication.state.status === 'ready'
    ? activeLocationSnapshot(weatherApplication.state.snapshot, weatherApplication.state.activeLocation)
    : null;
  const tomorrow = primary && tomorrowPreview && tomorrowWeather
    ? createTomorrowPreviewPresentation(tomorrowPreview, tomorrowWeather, language, temperatureUnit)
    : null;
  // The two tiles share the row's own gap, so the width follows `styles.outfitList`. O13
  //: while Easier to see is on, each alternate is a full-width row
  // with its drawing at the left, so a name is never cut and the list scrolls one way.
  const alternateWidth = easierToSee
    ? ALTERNATE_ROW_BOARD_WIDTH
    : usesAccessibilityLayout
      ? contentWidth
      : Math.max(0, (contentWidth - spacing.md) / 2);
  // Each board's stage height is derived from its own pieces, so two alternates side by
  // side would end at different heights and their captions would sit on different
  // baselines. The alternates share the taller stage and centre their board in it.
  const alternateStageHeight = Math.max(
    0,
    ...alternates.map((suggestion) =>
      measureGarmentBoardHeight(suggestion.boardPieces, alternateWidth, 'today', false, easierToSee),
    ),
  );

  return (
    <Screen
      // The visible refresh gesture cannot be performed by a screen reader. The custom
      // action gives VoiceOver and TalkBack the same refresh without adding a visible
      // control; the haptic belongs to the gesture, so it stays with the gesture.
      accessibilityActions={[{ name: 'refresh', label: copy.refreshAction }]}
      alwaysBounceVertical
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'refresh') onRefresh();
      }}
      ref={scrollRef}
      refreshControl={refreshControl}
      scrollToOverflowEnabled
      testID="today-screen">
      <View onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width)} testID="today-content">
        {/* M7: the place at left and the dressing day's date opposite it. */}
        <ArrivesAfterHandoff index={0}>
          <View style={styles.topRow} testID="today-top-row">
            <View style={styles.placeRow}>
              <Icon name="location" color={theme.colors.iconSecondary} size={16} />
              <AppText colorRole="textSecondary" numberOfLines={2} style={styles.location} variant="caption">
                {presentation.header.location}
              </AppText>
            </View>
            <AppText colorRole="textSecondary" tabularNumbers testID="today-date" variant="caption">
              {presentation.date}
            </AppText>
          </View>
        </ArrivesAfterHandoff>

        {displayName ? (
          <ArrivesAfterHandoff index={1}>
            <AppText colorRole="textSecondary" style={styles.greeting} testID="today-greeting" variant="bodyStrong">
              {firstDressingDay ? copy.greetingFirstNamed(displayName) : copy.greetingNamed(displayName)}
            </AppText>
          </ArrivesAfterHandoff>
        ) : null}
        {/* O2: Today has no day-type pill. Inside the title the line may break only after the
            separator: the temperature, symbol and condition stay together. */}
        <ArrivesAfterHandoff index={2}>
          <View style={styles.titleRow}>
            <View
              accessible
              accessibilityLabel={presentation.titleAccessibilityLabel}
              accessibilityRole="header"
              style={styles.title}
              testID="today-title">
              <AppText style={styles.titleText} tabularNumbers variant="title">
                {presentation.titleParts.lead}
              </AppText>
              <View style={styles.titleValues}>
                <AppText style={styles.titleText} tabularNumbers variant="title">
                  {presentation.titleParts.beforeSymbol}
                </AppText>
                <TitleWeatherSymbol
                  condition={presentation.weather.conditionCode}
                  daypart={presentation.weather.daypart}
                  intensity={ambientIntensity}
                  testID="today-title-symbol"
                />
                <AppText style={styles.titleText} variant="title">
                  {presentation.titleParts.afterSymbol}
                </AppText>
              </View>
            </View>
          </View>
        </ArrivesAfterHandoff>
        {/* The badge waits for the new outfit's own source while a day-type change or a
            re-ask runs: it fades out and keeps its place, so the outfit under it never moves,
            and the new source fades in. A new outfit with no source closes the row in place,
            so the outfit glides up instead of jumping. */}
        <Presence visible={generationMode !== null}>
          {shownGenerationMode ? (
            <TourTarget id="badge" style={styles.provenanceBadge}>
              <ProvenanceBadge
                generationMode={shownGenerationMode}
                hidden={updating || generationMode === null}
                key={shownGenerationMode.mode}
              />
            </TourTarget>
          ) : null}
        </Presence>

        {primary ? (
          <>
            <Dimmed dimmed={updating} revealKey={primary.id}>
              <TourTarget
                activate={() => onOpenOutfitDetail(primary.id)}
                id="outfit"
                label={presentation.stageAccessibilityLabel}
                scrollBy={scrollBy}
                style={styles.outfitTarget}>
                <PressScale
                  accessible
                  accessibilityLabel={presentation.stageAccessibilityLabel}
                  accessibilityRole="button"
                  onPress={() => onOpenOutfitDetail(primary.id)}
                  style={({ pressed }) => ({ opacity: pressed ? theme.interaction.pressedOpacity : 1 })}>
                  {/* A re-ask replaces the title with a crossfade rather than a snap. */}
                  <ArrivesAfterHandoff index={3}>
                    <Crossfade contentKey={primary.title}>
                      <AppText style={styles.archetypeName} testID="today-archetype" variant="label">
                        {primary.title}
                      </AppText>
                    </Crossfade>
                  </ArrivesAfterHandoff>
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={[
                      styles.stage,
                      {
                        backgroundColor: stageColor,
                        width: contentWidth,
                        // P2: the stage is as tall as its fitted board, never the free space.
                        height: measureGarmentBoardHeight(primary.boardPieces, contentWidth, 'today', true, easierToSee),
                      },
                    ]}
                    onLayout={stageLaidOut ? undefined : () => setStageLaidOut(true)}
                    ref={stageView}
                    testID="today-stage">
                    {leavingOutfit ? (
                      <View style={styles.leavingBoard}>
                        <GarmentBoard
                          accessibilityLabel=""
                          decorative
                          fit
                          key={leavingOutfit.id}
                          onLeft={clearLeavingOutfit}
                          palette={leavingOutfit.palette}
                          pieces={leavingOutfit.boardPieces}
                          preset="today"
                          stageColor={stageColor}
                          testID="today-leaving-board"
                          width={contentWidth}
                        />
                      </View>
                    ) : null}
                    <GarmentBoard
                      accessibilityLabel={presentation.stageAccessibilityLabel}
                      // ADR 0021 section 10's transition between suggestions: the key is the
                      // option identity, so a new recommendation re-mounts the board: the old
                      // pieces drop and fade, then the new ones rise, while a refresh that
                      // returns the same outfit leaves it still. The rise is never the only
                      // signal; the archetype and freshness line also change with it.
                      key={primary.id}
                      fit
                      holdRise={holdRise || !stageLaidOut}
                      replaces={stageOutfit?.replaced === true}
                      palette={primary.palette}
                      pieces={primary.boardPieces}
                      preset="today"
                      // The outfit the runway carried onto the stage has already arrived.
                      rise={primary.id !== carriedOutfitId}
                      stageColor={stageColor}
                      testID={`today-primary-board-${primary.id}`}
                      width={contentWidth}
                    />
                  </View>
                </PressScale>
              </TourTarget>
            </Dimmed>
            <ArrivesAfterHandoff index={4}>
              {/* N18 and N15: the outfit's claim sits directly under the board, where it is read
                  with the outfit, never beside the button. While a re-ask runs, its window
                  replaces the claim and says why the outfit is dimmed; each hand-off crossfades. */}
              <Crossfade
                contentKey={choosing ? `choosing:${choosing}` : `claim:${presentation.coverageCaption ?? ''}`}>
                {choosing ? (
                  <View style={styles.captionRow}>
                    <PhaseMark size={16} testID="today-choosing-mark" />
                    <AppText
                      accessibilityLiveRegion="polite"
                      colorRole="textSecondary"
                      style={styles.captionText}
                      tabularNumbers
                      testID="today-choosing-caption"
                      variant="caption">
                      {choosing}
                    </AppText>
                  </View>
                ) : presentation.coverageCaption ? (
                  <View accessible style={styles.captionRow} testID="today-coverage-caption">
                    <Icon color={theme.colors.iconSecondary} name="clock" size={16} />
                    <AppText colorRole="textSecondary" style={styles.captionText} tabularNumbers variant="caption">
                      {presentation.coverageCaption}
                    </AppText>
                  </View>
                ) : null}
              </Crossfade>
              {/* Law 4: a status is ink, glyph and text together. */}
              {presentation.driftCaption ? (
                <View accessible style={styles.captionRow} testID="today-drift-caption">
                  <Icon color={theme.colors.warningInk} name="warning" size={16} />
                  <AppText colorRole="warningInk" style={styles.captionText} tabularNumbers variant="caption">
                    {presentation.driftCaption}
                  </AppText>
                </View>
              ) : null}
              {/* f7: a morning or evening answer is regenerating the outfit; this line says why
                  it is dimmed, and it stays until the new outfit lands. */}
              {updatingDayType && !choosing ? (
                <View style={styles.updatingRow}>
                  <PhaseMark size={16} testID="today-updating-mark" />
                  <AppText
                    accessibilityLiveRegion="polite"
                    colorRole="textSecondary"
                    style={styles.updatingText}
                    testID="today-updating-status"
                    variant="caption">
                    {copy.dailyStyle.updating[updatingDayType]}
                  </AppText>
                </View>
              ) : null}
              {presentation.dayInsight ? (
                <Dimmed dimmed={updating} style={styles.insight}>
                  <Crossfade contentKey={presentation.dayInsight}>
                    <AppText testID="today-day-insight" variant="body">{presentation.dayInsight}</AppText>
                  </Crossfade>
                </Dimmed>
              ) : null}
              {primary.accessories.length > 0 || presentation.coolSpellCaption ? (
                <View style={styles.finishingTouches}>
                  <AccessoryCaption
                    caption={presentation.copy.finishingTouchesHeading}
                    stageColor={stageColor}
                    suggestion={primary}
                  />
                  {presentation.coolSpellCaption ? (
                    <CoolSpellLine caption={presentation.coolSpellCaption} />
                  ) : null}
                </View>
              ) : null}
            </ArrivesAfterHandoff>
          </>
        ) : null}

        {/* O5: "Last updated" sits under the finishing touches; it no longer describes a button.
            Each new line crossfades, and the mark arrives and leaves with its own line, so it
            never pushes a line that is already showing. */}
        <ArrivesAfterHandoff index={5}>
          <Crossfade contentKey={presentation.header.freshness} style={styles.provenanceSlot} testID="today-provenance">
            <View style={[styles.provenance, usesAccessibilityLayout && styles.stackedProvenance]}>
              {presentation.header.phase ? <PhaseMark size={16} testID="today-phase-mark" /> : null}
              <AppText
                accessibilityLiveRegion={presentation.header.announceFreshness ? 'polite' : 'none'}
                colorRole="textSecondary"
                style={[styles.freshness, usesAccessibilityLayout && styles.stackedFreshness]}
                tabularNumbers
                testID="today-freshness"
                variant="caption">
                {presentation.header.freshness}
              </AppText>
            </View>
          </Crossfade>
        </ArrivesAfterHandoff>

        {presentation.noOutfit ? (
          <Surface
            accessible
            accessibilityLabel={`${presentation.noOutfit.title}. ${presentation.noOutfit.body}`}
            accessibilityRole="alert"
            style={[styles.feedbackCard, styles.noOutfit]}
            variant="muted">
            <AppText accessibilityRole="header" style={styles.centerText} variant="title">
              {presentation.noOutfit.title}
            </AppText>
            <AppText colorRole="textSecondary" style={styles.centerText}>
              {presentation.noOutfit.body}
            </AppText>
          </Surface>
        ) : null}

        {alternates.length > 0 ? (
          <ArrivesAfterHandoff index={6}>
            <View style={styles.alternates}>
              <View
                style={[styles.alternatesHeading, { borderBottomColor: theme.colors.borderSubtle }]}
                testID="today-alternates-heading">
                <AppText accessibilityRole="header" variant="bodyStrong">
                  {presentation.copy.otherOptionsHeading}
                </AppText>
              </View>
              <View
                style={[styles.outfitList, (usesAccessibilityLayout || easierToSee) && styles.stackedOutfitList]}
                testID="today-outfit-list">
                {alternates.map((suggestion, index) => (
                  <Entrance index={index + 1} key={suggestion.id}>
                    <PressScale
                      accessible
                      accessibilityLabel={suggestion.boardAccessibilityLabel}
                      accessibilityRole="button"
                      onPress={() => onOpenOutfitDetail(suggestion.id)}
                      style={({ pressed }) => [
                        easierToSee ? [styles.alternateRow, strongEdge] : { width: alternateWidth },
                        { opacity: pressed ? theme.interaction.pressedOpacity : 1 },
                      ]}
                      testID={`today-alternate-${suggestion.id}`}>
                      <View
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={[
                          styles.alternateStage,
                          { height: alternateStageHeight, width: alternateWidth },
                          easierToSee ? null : strongEdge,
                        ]}
                        testID={`today-alternate-stage-${suggestion.id}`}>
                        {/* O15: each alternate stands on the page ground in its own palette, so
                            it looks the same here as on Today's stage once chosen. */}
                        <GarmentBoard
                          accessibilityLabel={suggestion.boardAccessibilityLabel}
                          palette={suggestion.palette}
                          pieces={suggestion.boardPieces}
                          preset="today"
                          testID={`today-alternate-board-${suggestion.id}`}
                          width={alternateWidth}
                        />
                      </View>
                      <View style={[styles.alternateTitleRow, easierToSee && styles.alternateRowTitle]}>
                        <AppText numberOfLines={2} style={styles.outfitName} variant="label">
                          {suggestion.title}
                        </AppText>
                        <Icon color={theme.colors.iconSecondary} name="chevronRight" size={16} />
                      </View>
                    </PressScale>
                  </Entrance>
                ))}
              </View>
            </View>
          </ArrivesAfterHandoff>
        ) : null}

        {tomorrow ? (
          <Entrance index={alternates.length + 1}>
            <View style={styles.alternates} testID="today-tomorrow">
              <View style={[styles.alternatesHeading, { borderBottomColor: theme.colors.borderSubtle }]}>
                <AppText accessibilityRole="header" variant="bodyStrong">{tomorrow.heading}</AppText>
              </View>
              <View style={[styles.tomorrowRow, usesAccessibilityLayout && styles.stackedTomorrowRow]}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.alternateStage, {
                    height: measureGarmentBoardHeight(tomorrow.boardPieces, ALTERNATE_ROW_BOARD_WIDTH, 'today',
                      false, easierToSee),
                    width: ALTERNATE_ROW_BOARD_WIDTH,
                  }, strongEdge]}>
                  <GarmentBoard
                    accessibilityLabel={tomorrow.boardAccessibilityLabel}
                    palette={tomorrow.palette}
                    pieces={tomorrow.boardPieces}
                    preset="today"
                    testID="today-tomorrow-board"
                    width={ALTERNATE_ROW_BOARD_WIDTH}
                  />
                </View>
                <View accessible accessibilityLabel={`${tomorrow.boardAccessibilityLabel} ${tomorrow.weatherAccessibilityLabel}`}
                  style={styles.tomorrowText}>
                  <AppText testID="today-tomorrow-title" variant="label">{tomorrow.title}</AppText>
                  <AppText colorRole="textSecondary" tabularNumbers testID="today-tomorrow-weather" variant="caption">
                    {tomorrow.weather}
                  </AppText>
                </View>
              </View>
            </View>
          </Entrance>
        ) : null}

        {/* ADR 0004's offer comes last, after the alternatives (f12). Either answer closes
            the row in place, so the button under it glides up instead of jumping. */}
        {shownOffer ? (
          <Presence visible={offerToRender !== null}>
            <Entrance index={alternates.length + (tomorrow ? 2 : 1)}>
              <WeatherAlertOfferRow
                blocked={shownOffer.blocked}
                language={language}
                onAccept={answerOffer}
                onDismiss={dismissOffer}
                ruleId={shownOffer.offer.ruleId}
              />
            </Entrance>
          </Presence>
        ) : null}

        {/* O4: the last element of the content, one tonal Large capsule. A7 hides it and puts
            nothing in its place. */}
        {primary && !exhausted ? (
          <TourTarget
            id="again"
            reveal={() => scrollRef.current?.scrollToEnd({ animated: true })}
            scrollBy={scrollBy}
            style={styles.askAgain}>
            <Button
              accessibilityHint={copy.askAgain.hint}
              icon="refresh"
              label={copy.askAgain.action}
              onPress={onAskAgain}
              size="large"
              testID="today-ask-again"
              variant="tonal"
            />
          </TourTarget>
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * ADR 0004's contextual offer, as a quiet row on the ground plane rather than a card on a
 * card (Law 3). It carries no accent fill (Law 1): the primary action is accent ink and the
 * secondary is the secondary ink, both at the same size, the way the consent sheet's pair is.
 * Law 7's "content arrives": the row fades and travels one rhythm unit into place on the
 * screen it appears on, and either action ends it: it fades and closes in place.
 */
function WeatherAlertOfferRow({
  blocked,
  language,
  onAccept,
  onDismiss,
  ruleId,
}: Readonly<{
  blocked: boolean;
  language: SupportedLanguage;
  onAccept: () => Promise<void>;
  onDismiss: () => Promise<void>;
  ruleId: WeatherAlertOfferReason;
}>) {
  const theme = useKuyaraTheme();
  const { controlScale } = useTextScaling();
  // O13: while "Easier to see" is on the two actions stack as 56-point buttons, and the row
  // takes the strong edge while higher contrast applies.
  const easierToSee = useEasierToSee();
  const strongEdge = useStrongEdge();
  const actionSize = easierToSee ? 'large' : 'small';
  const copy = getMessages(language).notifications;
  const { hour12 } = useLocalization();
  const [isAnswering, setIsAnswering] = useState(false);
  // A refused permission is explained with the Settings surface's own copy and its own way
  // out, rather than with a second wording of the same fact.
  const message = blocked
    ? copy.permissionDeniedHint
    : ruleId === 'morning_briefing'
      ? copy.offer.morningBriefingSentence(
        formatWallClockTime({ hour: morningBriefingLocalHour, minute: 0 }, language, hour12),
      )
      : copy.offer.sentences[ruleId];
  const acceptLabel = blocked ? copy.openSettingsAction : copy.offer.acceptAction;
  // The live region below covers Android; VoiceOver keeps focus on the button and hears nothing.
  useErrorAnnouncement(blocked ? copy.permissionDeniedHint : null);
  const accept = async () => {
    setIsAnswering(true);
    await onAccept().finally(() => setIsAnswering(false));
  };
  const dismiss = async () => {
    setIsAnswering(true);
    await onDismiss().finally(() => setIsAnswering(false));
  };

  return (
    <Surface style={[styles.alertOffer, strongEdge]} testID="today-alert-offer" variant="muted">
      <View style={styles.alertOfferMessage}>
        <Icon color={theme.colors.iconSecondary} name="bell" size={20 * controlScale} />
        <AppText
          accessible
          accessibilityLiveRegion={blocked ? 'polite' : 'none'}
          accessibilityRole="text"
          style={styles.alertOfferText}
          testID="today-alert-offer-message">
          {message}
        </AppText>
      </View>
      <ButtonPair
        align="leading"
        stacked={easierToSee}
        primary={(
          <Button
            disabled={isAnswering}
            label={acceptLabel}
            onPress={() => void accept()}
            size={actionSize}
            testID="today-alert-offer-accept"
            variant="tonal"
          />
        )}
        secondary={(
          <Button
            disabled={isAnswering}
            label={copy.offer.dismissAction}
            onPress={() => void dismiss()}
            size={actionSize}
            testID="today-alert-offer-dismiss"
            variant="plain"
          />
        )}
      />
    </Surface>
  );
}

/**
 * The provenance badge under the title (ADR 0034 section 4, M1). Apple Intelligence: the
 * multicolor `apple.intelligence` symbol and the words on the muted neutral, never purple.
 * The Worker's AI: the multicolour animated `sparkles` (O11) on the provenance container. The
 * badge speaks one sentence; its visible words are grouped under it. Law 7: it arrives and
 * leaves as a state change, so it fades on the `normal` duration and moves nothing. A hidden
 * badge keeps its space and is out of the reading order.
 */
function ProvenanceBadge({
  generationMode,
  hidden,
}: Readonly<{ generationMode: GenerationMode; hidden: boolean }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue<number>(0);
  const onDevice = generationMode.mode === 'on-device-ai';

  useEffect(() => {
    opacity.set(withTiming(hidden ? 0 : 1, { duration: theme.motion.normal }));
  }, [hidden, opacity, theme.motion.normal]);

  const arrivalStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <View
      accessibilityElementsHidden={hidden}
      accessibilityLabel={generationMode.accessibilityLabel}
      accessible={!hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      testID="today-provenance-badge">
      <Animated.View style={arrivalStyle}>
        <Pill
          icon={(color) => (onDevice ? (
            <Icon color={color} name="appleIntelligence" rendering="multicolor" size={16} />
          ) : (
            <AiSparkleMark color={color} size={16} />
          ))}
          label={generationMode.label}
          testID="today-generation-mode"
          tone={onDevice ? 'muted' : 'provenance'}
        />
      </Animated.View>
    </View>
  );
}

/**
 * Dims the outfit while a day-type change regenerates it (f7), on the `normal` duration. Given
 * a `revealKey`, new content arriving while still dimmed (the new outfit landing before the
 * wait has closed) lifts the dim on `fast`, with the rise's own fade, so the new outfit is
 * never seen arriving under grey.
 */
function Dimmed({
  children,
  dimmed,
  revealKey,
  style,
}: Readonly<{ children: ReactNode; dimmed: boolean; revealKey?: string; style?: StyleProp<ViewStyle> }>) {
  const theme = useKuyaraTheme();
  // The content the dim began on; any other content under the same dim is the new arrival.
  const [dimmedKey, setDimmedKey] = useState<string | undefined>(dimmed ? revealKey : undefined);
  if (dimmed && dimmedKey === undefined && revealKey !== undefined) setDimmedKey(revealKey);
  if (!dimmed && dimmedKey !== undefined) setDimmedKey(undefined);
  const replaced = dimmed && dimmedKey !== undefined && dimmedKey !== revealKey;
  const target = dimmed && !replaced ? theme.interaction.disabledOpacity : 1;
  const duration = replaced ? theme.motion.fast : theme.motion.normal;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(target, { duration }),
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/**
 * The accessories the outfit finishes with: the caption, then each drawing at the caption's
 * size (Law 6), cropped to its own artwork with the stroke scaled to it (M21), in the colours
 * the outfit's palette gave it with the board (O15). One accessible element reads the names,
 * never animated. A day that asks for no accessory renders nothing at all.
 */
function AccessoryCaption({
  caption,
  stageColor,
  suggestion,
}: Readonly<{ caption: string; stageColor: string; suggestion: LoadedOutfitPresentation }>) {
  const drawingSize = useAccessoryDrawingSize();
  // The board's own resolution, read back from the palette memo: accessories stand on the
  // page ground, which the palette already measures them against.
  const roles = useGarmentRoles(suggestion.palette, stageColor);
  if (suggestion.accessories.length === 0) {
    return null;
  }

  return (
    <View
      accessible
      accessibilityLabel={suggestion.accessoriesAccessibilityLabel}
      style={styles.accessoryCaption}
      testID="today-accessory-badges">
      <AppText colorRole="textSecondary" variant="caption">
        {caption}
      </AppText>
      <View style={styles.accessoryGlyphs}>
        {suggestion.accessories.map((accessory) => (
          <GarmentDrawing
            category={accessory.category}
            garmentTypeId={accessory.garmentTypeId}
            key={accessory.accessorySlot}
            roles={roles.get(accessory.accessorySlot)}
            size={drawingSize}
            testID={`today-accessory-${accessory.garmentTypeId}`}
          />
        ))}
      </View>
    </View>
  );
}

// N19: a later short cool spell is one finishing-touch line, led by the cardigan
// silhouette at caption size (law 6), so the layer it asks for is named and drawn.
function CoolSpellLine({ caption }: Readonly<{ caption: string }>) {
  const drawingSize = useAccessoryDrawingSize();
  return (
    <View accessible accessibilityLabel={caption} style={styles.coolSpell} testID="today-cool-spell">
      <GarmentDrawing
        category="top"
        garmentTypeId="cardigan"
        size={drawingSize}
        testID="today-cool-spell-cardigan"
      />
      <AppText colorRole="textSecondary" style={styles.captionText} tabularNumbers variant="caption">
        {caption}
      </AppText>
    </View>
  );
}

// Law 6: a waiting mark, sized to the text it sits beside and drawn in the secondary icon
// ink rather than the accent, because the wait is not the screen's one accent-filled
// element. It is a clock rather than a sparkle: `visual-identity.md` refuses the AI-sparkle
// convention, and the pulsing mark is where that convention was most visible. Law 7: it
// breathes on the ambient moderate step and stays out
// of the accessibility tree because the adjacent line is the state.
function PhaseMark({ size, testID }: Readonly<{ size: number; testID: string }>) {
  const theme = useKuyaraTheme();
  const pulse = useAmbientPulse();
  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={animatedStyle}
      testID={testID}>
      <Icon color={theme.colors.iconSecondary} name="clock" size={size} />
    </Animated.View>
  );
}

// O13: the drawing inside a full-width alternate row, the mockup's 128 points.
const ALTERNATE_ROW_BOARD_WIDTH = 128;

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  placeRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.xs },
  location: { flex: 1, flexShrink: 1 },
  greeting: { marginBottom: spacing.xs },
  titleRow: { alignItems: 'center', columnGap: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
  title: { alignItems: 'center', columnGap: spacing.sm, flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap' },
  titleValues: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  titleText: { fontWeight: '700' },
  provenanceBadge: { marginTop: spacing.sm },
  // The gap above the outfit sits outside its tour target, so the tour's ring clears the badge.
  outfitTarget: { marginTop: spacing.md },
  archetypeName: { marginBottom: spacing.sm },
  stage: { borderRadius: STAGE_RADIUS, overflow: 'hidden' },
  leavingBoard: { left: 0, position: 'absolute', top: 0 },
  captionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  captionText: { flexShrink: 1 },
  updatingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  updatingText: { flexShrink: 1 },
  outfitName: { flex: 1, flexShrink: 1 },
  insight: { marginTop: spacing.xl },
  finishingTouches: { gap: spacing.sm, marginTop: spacing.md },
  accessoryCaption: { alignItems: 'center', columnGap: spacing.sm, flexDirection: 'row', flexWrap: 'wrap',
    rowGap: spacing.xs },
  coolSpell: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  accessoryGlyphs: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  loadingIntro: { gap: spacing.xs, marginBottom: spacing.md },
  generatingStatus: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  generatingStatusText: { flexShrink: 1 },
  askAgain: { marginTop: spacing.md },
  provenanceSlot: { marginTop: spacing.sm },
  provenance: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stackedProvenance: { alignItems: 'flex-start', flexDirection: 'column' },
  freshness: { flexShrink: 1 },
  stackedFreshness: { width: '100%' },
  noOutfit: { marginTop: spacing.md },
  alertOffer: { gap: spacing.md, marginTop: spacing.md, padding: spacing.lg },
  alertOfferMessage: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  alertOfferText: { flex: 1, flexShrink: 1 },
  alternates: { marginTop: spacing.md },
  alternatesHeading: { paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  outfitList: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  // O13's alternate row: 60-point target and card radius; its edge is `strongEdge`.
  alternateRow: { alignItems: 'center', borderRadius: radii.card, flexDirection: 'row', gap: spacing.md,
    minHeight: easierToSeeValues.rowHeight, padding: spacing.md },
  alternateRowTitle: { flex: 1, marginTop: 0 },
  stackedOutfitList: { flexDirection: 'column', gap: spacing.md },
  alternateStage: { borderRadius: 14, justifyContent: 'center', overflow: 'hidden' },
  tomorrowRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  stackedTomorrowRow: { alignItems: 'flex-start', flexDirection: 'column' },
  tomorrowText: { flex: 1, flexShrink: 1, gap: spacing.xs },
  alternateTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  feedbackContent: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg },
  feedbackCard: { alignItems: 'center', gap: spacing.md, maxWidth: 520, padding: spacing.lg, width: '100%' },
  // The card's own centring and gap, carried inside the grouped text so nothing moves.
  feedbackText: { alignItems: 'center', alignSelf: 'stretch', gap: spacing.md },
  centerText: { textAlign: 'center' },
});
