import { use, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';
import type { DressStyle } from '@kuyara/contracts';

import {
  AppText,
  Button,
  ButtonPair,
  Entrance,
  haptics,
  Icon,
  Presence,
  Screen,
  TextButton,
  useRefreshOutcomeHaptics,
  useTextScaling,
} from '@/components/ui';
import { useLaunchReveal } from '@/components/ui/launch-curtain';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import { useSinglePush } from '@/components/ui/use-single-push';
import { useStatusAnnouncement } from '@/components/ui/use-status-announcement';
import type { NotificationOptInOutcome } from '@/features/notifications/application/notification-application-controller';
import { RecommendationApplicationContext } from '@/features/recommendation/application/recommendation-application-context';
import type { WeatherAlertOfferReason } from '@/features/notifications/domain/weather-alert-offer';
import {
  alertOfferAfterAccept,
  alertOfferMessage,
  alertOfferToRender,
  isGenerationRunning,
  isUpdatingOutfit,
  showsAskAgain,
  settledFirstOutfit,
  todayPresentationState,
  tomorrowStrip,
} from '@/features/today/application/today-surface';
import { paletteBasisOf } from '@/features/today/application/today-state';
import type { TodayScreenState } from '@/features/today/model';
import {
  FirstGenerationRunway,
  type RunwayHandoffTarget,
} from '@/features/today/presentation/first-generation-runway';
import { MoreIdeas, TodayAlternates, TomorrowStrip } from '@/features/today/presentation/today-alternates';
import { TodayHeader } from '@/features/today/presentation/today-header';
import {
  TodayFeedbackCard,
  TodayLoadingContent,
  TodayNoOutfit,
} from '@/features/today/presentation/today-interludes';
import {
  ArrivesAfterHandoff,
  HandoffHoldContext,
  ProvenanceBadge,
  type GenerationMode,
} from '@/features/today/presentation/today-motion';
import {
  TodayOutfit,
  type OutfitDetailLink,
  type StageOutfit,
} from '@/features/today/presentation/today-outfit';
import { TodayFreshness, TodayOutfitNotes } from '@/features/today/presentation/today-outfit-notes';
import {
  createTodayPresentation,
  createTomorrowPreviewPresentation,
  garmentPaletteDay,
  outfitBoardPieces,
  outfitGarmentPalette,
  runwayWeather,
} from '@/features/today/presentation/today-presentation';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { formatWallClockTime } from '@/presentation/format-clock-time';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { ambientIntensityOf } from '@/features/weather/domain/ambient-intensity';
import { activeLocationSnapshot } from '@/features/weather/domain/weather';
import { TourTarget } from '@/features/walkthrough/application/tour-target';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useEasierToSee } from '@/theme/easier-to-see';
import { useKuyaraTheme } from '@/theme/theme-context';

// Law 5's escalation point, for the generic line alone. A narrated wait says what it is
// doing, so it never needs the escalation; past this the unnarrated line has stopped being
// informative on its own.
const LONG_WAIT_MS = 8_000;

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
  /** The refused offer's card was dismissed: a permission granted later opts in nothing. */
  onDismissBlocked: () => void;
  onOpenSystemSettings: () => void;
}>;

type TodayScreenProps = Readonly<{
  state: TodayScreenState;
  language: SupportedLanguage;
  displayName?: string | null;
  isRefreshing?: boolean;
  alertOffer?: TodayAlertOffer | null;
  /** The refused offer's permission was granted in system Settings and the accept finished. */
  alertOfferFinished?: boolean;
  onOpenOutfitDetail: (id: string) => void;
  /**
   * The route's link to an outfit's detail. With it each alternative opens as a link, and on
   * iOS the detail zooms out of the alternative's drawing and shrinks back into it; elsewhere
   * it is the stack's plain push. `onPress` is the route's single-tap guard.
   */
  outfitDetailLink?: OutfitDetailLink;
  /** Opens the detail of tomorrow's previewed outfit, from the evening strip. */
  onOpenTomorrowDetail?: (id: string) => void;
  onRefresh: () => void;
  /** Opens the "Ask the stylist again" sheet (O3). The pull gesture never changes the outfit. */
  onAskAgain: () => void;
  laterReadyLine?: string | null;
  /** Set while a day-type answer from the morning or evening sheet is regenerating the outfit. */
  updatingDayType?: DressStyle | null;
  /** The first dressing day, the day the profile was set up, takes its own greeting. */
  firstDressingDay?: boolean;
  /** Set while the morning or evening question is unanswered, so the wait is on the person. */
  awaitingDayQuestion?: boolean;
  /** The first-generation runway shows or leaves (the Phase 8 tour never opens over it). */
  onRunwayVisibleChange?: (visible: boolean) => void;
}>;

export function TodayScreen(props: TodayScreenProps) {
  const application = use(RecommendationApplicationContext);
  const weather = useWeatherApplication();
  const { hour12 } = useLocalization();
  const now = useForegroundClock();
  const recommendationState = application?.state.status === 'ready' ? application.state : null;
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
  // Derived after the last hook, so React Compiler can memoize them: a value built before a
  // hook and used after it is recomputed on every render.
  const snapshot = recommendationState?.snapshot;
  const settled = settledFirstOutfit(snapshot, now);
  // The runway draws neutral drafts while the wait runs and receives the chosen outfit
  // once, when the answer is in (N2, O1); skipping makes the device's pick that answer.
  const runwayOutfit = settled;
  // S3: the runway reads the weather of the active place only, never a previous place's.
  const placeSnapshot = weather.state.status === 'ready'
    ? activeLocationSnapshot(weather.state.snapshot, weather.state.activeLocation) : null;

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
          palette: outfitGarmentPalette(runwayOutfit, garmentPaletteDay(placeSnapshot, now, paletteBasisOf(snapshot))),
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
  alertOfferFinished = false,
  onOpenOutfitDetail,
  outfitDetailLink,
  onOpenTomorrowDetail,
  onRefresh,
  onAskAgain,
  laterReadyLine = null,
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
  // Memoized as one value, so React Compiler keeps everything derived from it across the
  // hooks below rather than rebuilding it on every render.
  const presentation = useMemo(
    () => createTodayPresentation(
      todayPresentationState(state, weatherApplication.state), language, hour12, temperatureUnit, now),
    [hour12, language, now, state, temperatureUnit, weatherApplication.state],
  );
  const copy = getMessages(language).today;
  const theme = useKuyaraTheme();
  // One shared threshold (ADR 0019): the stacked layout is the same rule ListRow applies.
  const { usesStackedLayout: usesAccessibilityLayout } = useTextScaling();
  // Measure the content after Screen applies its safe-area insets and width cap.
  const [contentWidth, setContentWidth] = useState(0);
  // Waiting for the day question is not a slow generation, so its clock starts at the answer.
  const isGenerating = isGenerationRunning(presentation.kind, awaitingDayQuestion);
  // Law 5's warning structure: the same fact, plus what is still happening, once the
  // wait has run past the point where the first line alone stops being informative.
  const [isLongWait, setIsLongWait] = useState(false);
  // Either action ends the offer here rather than waiting for the durable flag to come back
  // through the prop. Accepting spends it whatever the OS answers, so a refusal arrives after
  // the prop is already gone, and the refused offer is kept to explain itself.
  const [offerAnswered, setOfferAnswered] = useState(false);
  const [refusedOffer, setRefusedOffer] = useState<TodayAlertOffer | null>(null);
  // Finished from system Settings: the refusal no longer applies, and the offer stays answered.
  const blockedOffer = alertOfferFinished ? null : refusedOffer;
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
  const offerToRender = alertOfferToRender(blockedOffer, offerAnswered || alertOfferFinished, alertOffer);
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
      if (alertOfferAfterAccept(result) === 'blocked') setRefusedOffer(alertOffer);
      else setOfferAnswered(true);
    } catch {
      // The durable flag did not commit, so the once-only offer must remain answerable.
    }
  };
  const dismissOffer = async () => {
    if (blockedOffer) {
      blockedOffer.onDismissBlocked();
      setOfferAnswered(true);
      setRefusedOffer(null);
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
      // Only the person's own pull spins the control, as on Weather; a background refresh is
      // told by the freshness line alone.
      refreshing={isRefreshing}
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
      // The stage is a cornerless band, so the runway's plate lands square.
      ? { node: stageView.current, color: loadedStageColor, radius: 0 }
      : null;
  });

  if (presentation.kind !== 'loaded' && stageLaidOut) setStageLaidOut(false);
  // A loading or error interlude unmounts the stage and the leaving board, so neither is on
  // screen when the outfit returns: the leaving board can never report that it has left, and
  // the outfit the stage held is gone, so nothing drops away above the next one.
  if (presentation.kind !== 'loaded' && leavingOutfit) setLeavingOutfit(null);
  if (presentation.kind !== 'loaded' && stageOutfit) setStageOutfit(null);

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
          <TodayLoadingContent
            body={presentation.body}
            contentWidth={contentWidth}
            showsPhaseMark={Boolean(presentation.phase)}
            status={presentation.phase
              ? copy.phase[presentation.phase]
              : isLongWait
                ? copy.generatingLongWaitStatus
                : copy.generatingStatus}
            title={presentation.title}
          />
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
        <TodayFeedbackCard
          accessibilityLabel={presentation.accessibilityLabel}
          actionLabel={presentation.actionLabel}
          body={presentation.body}
          noActiveLocation={presentation.reason === 'no-active-location'}
          onAction={
            presentation.reason === 'no-active-location'
              ? () => push('/weather/location')
              : onRefresh
          }
          title={presentation.title}
        />
      </Screen>
    );
  }

  const stageColor = theme.atmosphere[presentation.atmosphere];
  const choosing = presentation.choosingCaption;
  // The symbol draws the same rain at every tempo; only the condition's ambient step says
  // how fast it falls.
  const ambientIntensity = state.kind === 'loaded'
    ? ambientIntensityOf(state.snapshot.weather.current.condition)
    : 'calm';
  const [primary, ...alternates] = presentation.suggestions;
  if (primary && primary.id !== stageOutfit?.id) {
    // An outfit still waiting for the one before it to leave was never drawn, so it has nothing
    // to drop: the board already leaving keeps leaving, and the newest outfit rises after it.
    setLeavingOutfit(leavingOutfit ?? stageOutfit);
    setStageOutfit({
      id: primary.id, boardPieces: primary.boardPieces, palette: primary.palette, replaced: stageOutfit !== null,
    });
  }
  const updating = isUpdatingOutfit(updatingDayType, choosing);
  const generationMode = presentation.generationMode;
  if (generationMode && (shownGenerationMode?.mode !== generationMode.mode
    || shownGenerationMode.label !== generationMode.label
    || shownGenerationMode.accessibilityLabel !== generationMode.accessibilityLabel)) {
    setShownGenerationMode(generationMode);
  }
  const exhausted = recommendationApplication?.state.status === 'ready'
    && recommendationApplication.state.exhausted;
  // In the evening, the next dressing day's outfit, after today's alternatives.
  const tomorrowPreview = recommendationApplication?.tomorrowPreview ?? null;
  const tomorrowWeather = weatherApplication.state.status === 'ready'
    ? activeLocationSnapshot(weatherApplication.state.snapshot, weatherApplication.state.activeLocation)
    : null;
  const tomorrow = primary && tomorrowPreview && tomorrowWeather
    ? createTomorrowPreviewPresentation(tomorrowPreview, tomorrowWeather, language, temperatureUnit, now)
    : null;
  const tomorrowRow = tomorrowStrip(tomorrow, onOpenTomorrowDetail);

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
        <TodayHeader
          ambientIntensity={ambientIntensity}
          copy={copy}
          displayName={displayName}
          firstDressingDay={firstDressingDay}
          presentation={presentation}
          scrollOffset={scrollOffset}
        />
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
            <TodayOutfit
              carriedOutfitId={carriedOutfitId}
              contentWidth={contentWidth}
              holdRise={holdRise || !stageLaidOut}
              leavingOutfit={leavingOutfit}
              onLeavingLeft={clearLeavingOutfit}
              onOpenOutfitDetail={onOpenOutfitDetail}
              onStageLayout={stageLaidOut ? undefined : () => setStageLaidOut(true)}
              outfitDetailLink={outfitDetailLink}
              primary={primary}
              replaces={stageOutfit?.replaced === true}
              scrollBy={scrollBy}
              stageAccessibilityLabel={presentation.stageAccessibilityLabel}
              stageColor={stageColor}
              stageRef={stageView}
              updating={updating}
            />
            <TodayOutfitNotes
              copy={copy}
              presentation={presentation}
              primary={primary}
              stageColor={stageColor}
              updating={updating}
              updatingDayType={updatingDayType}
            />
          </>
        ) : null}

        <TodayFreshness header={presentation.header} usesAccessibilityLayout={usesAccessibilityLayout} />

        {presentation.noOutfit ? (
          <TodayNoOutfit body={presentation.noOutfit.body} title={presentation.noOutfit.title} />
        ) : null}

        {alternates.length > 0 ? (
          <ArrivesAfterHandoff index={6}>
            <TodayAlternates
              alternates={alternates}
              contentWidth={contentWidth}
              heading={presentation.copy.otherOptionsHeading}
              onOpenOutfitDetail={onOpenOutfitDetail}
              outfitDetailLink={outfitDetailLink}
            />
          </ArrivesAfterHandoff>
        ) : null}

        {/* The composed pool past the outfits on screen, one sideways row
            under the alternatives. It asks for nothing; each tile opens the ordinary detail. */}
        {presentation.moreIdeasCaption ? (
          <ArrivesAfterHandoff index={7}>
            <MoreIdeas
              caption={presentation.moreIdeasCaption}
              heading={presentation.copy.moreIdeasHeading}
              ideas={presentation.moreIdeas}
              onOpenOutfitDetail={onOpenOutfitDetail}
              outfitDetailLink={outfitDetailLink}
            />
          </ArrivesAfterHandoff>
        ) : null}

        {/* B: in the evening, tomorrow's outfit is one thin strip under the alternatives, a
            single target that opens its detail. It shows only while the preview is ready. */}
        {tomorrowRow ? (
          <Entrance index={alternates.length + 1}>
            <TomorrowStrip
              onPress={() => tomorrowRow.onOpenDetail(tomorrowRow.tomorrow.id)}
              tomorrow={tomorrowRow.tomorrow}
            />
          </Entrance>
        ) : null}

        {/* O4: one tonal Large capsule, followed only by the notification offer. A7 hides it
            and puts nothing in its place. */}
        {showsAskAgain(primary, exhausted) ? (
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
        {laterReadyLine ? (
          <AppText colorRole="textSecondary" style={styles.laterReady} tabularNumbers
            testID="today-later-ready" variant="caption">
            {laterReadyLine}
          </AppText>
        ) : null}

        {/* ADR 0004's offer is the very end of the content, one line and its actions under
            "Ask the stylist again" (S15). Either answer closes the row in place. */}
        {shownOffer ? (
          <Presence visible={offerToRender !== null}>
            <Entrance index={alternates.length + (tomorrowRow ? 2 : 1)}>
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
      </View>
    </Screen>
  );
}

/**
 * ADR 0004's contextual offer, as one quiet line and its pair of actions on the ground plane
 * at the end of the content (S15), never a card (Law 3). It carries no accent fill (Law 1): the primary action is accent ink and the
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
  // O13: while "Easier to see" is on the two actions stack, each with a 56-point target.
  const easierToSee = useEasierToSee();
  const { hour12 } = useLocalization();
  const [isAnswering, setIsAnswering] = useState(false);
  const actionSize = easierToSee ? 'large' : 'small';
  const copy = getMessages(language).notifications;
  // A refused permission is explained with the Settings surface's own copy and its own way
  // out, rather than with a second wording of the same fact.
  const message = alertOfferMessage(
    copy,
    blocked,
    ruleId,
    (time) => formatWallClockTime(time, language, hour12),
  );
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
    <View style={styles.alertOffer} testID="today-alert-offer">
      <View style={styles.alertOfferMessage}>
        <Icon color={theme.colors.iconSecondary} name="bell" size={16 * controlScale} />
        <AppText
          accessible
          accessibilityLiveRegion={blocked ? 'polite' : 'none'}
          accessibilityRole="text"
          colorRole="textSecondary"
          style={styles.alertOfferText}
          testID="today-alert-offer-message"
          variant="caption">
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
        // The dismissal is a small text link, still a full-size target.
        secondary={(
          <TextButton
            disabled={isAnswering}
            label={copy.offer.dismissAction}
            onPress={() => void dismiss()}
            testID="today-alert-offer-dismiss"
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  provenanceBadge: { marginTop: spacing.sm },
  askAgain: { marginTop: spacing.md },
  laterReady: { marginTop: spacing.xs },
  // S15: a quiet line on the ground plane, never a card, after the last button.
  alertOffer: { gap: spacing.sm, marginTop: spacing.lg },
  alertOfferMessage: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  alertOfferText: { flex: 1, flexShrink: 1 },
  feedbackContent: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg },
});
