import { use, useEffect, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import type { DressStyle } from '@kuyara/contracts';

import {
  AppText,
  Button,
  ButtonPair,
  Entrance,
  GarmentBoard,
  GarmentDrawing,
  haptics,
  Icon,
  ListRow,
  ListRowGroup,
  PressScale,
  measureGarmentBoardHeight,
  Pill,
  Screen,
  Surface,
  useRefreshOutcomeHaptics,
  useTextScaling,
} from '@/components/ui';
import { useAmbientPulse } from '@/components/ui/use-ambient-pulse';
import type { NotificationOptInOutcome } from '@/features/notifications/application/notification-application-controller';
import { RecommendationApplicationContext } from '@/features/recommendation/application/recommendation-application-context';
import { localDayKey } from '@/features/recommendation/application/recommendation-application-controller';
import type { WeatherAlertOfferReason } from '@/features/notifications/domain/weather-alert-offer';
import type { TodayScreenState } from '@/features/today/model';
import { GarmentBoardSkeleton } from '@/features/today/presentation/garment-board-skeleton';
import { FirstGenerationRunway } from '@/features/today/presentation/first-generation-runway';
import {
  createTodayPresentation,
  outfitBoardPieces,
  runwayWeather,
  type LoadedOutfitPresentation,
  type LoadedTodayPresentation,
} from '@/features/today/presentation/today-presentation';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { TitleWeatherSymbol } from '@/features/today/presentation/weather-glyph';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { ambientIntensityOf } from '@/features/weather/domain/ambient-intensity';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { useLocalization } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// Law 5's escalation point, for the generic line alone. A narrated wait says what it is
// doing, so it never needs the escalation; past this the unnarrated line has stopped being
// informative on its own.
const LONG_WAIT_MS = 8_000;
// Law 6: a drawing beside caption text is drawn at the caption's 16 points, cropped to its
// own artwork so the garment itself is that tall.
const ACCESSORY_CAPTION_SIZE = 16;

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
  /** The Plan row (N23), already worded for the target day. */
  planRow?: Readonly<{ label: string; value: string; accessibilityLabel: string }>;
  onPlanTomorrow?: () => void;
}>;

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
  // The runway draws the deterministic preview while the wait runs and the chosen outfit
  // once it lands, so an AI pick that differs moves the pieces to its own board.
  const runwayOutfit = settled ?? recommendationState?.firstGenerationPreview ?? null;
  const weatherState = weather.state.status === 'ready' ? weather.state : null;

  return (
    <View style={styles.root}>
      <TodayScreenContent {...props} now={now} />
      <FirstGenerationRunway
        active={recommendationState?.showFirstGenerationOverlay ?? false}
        completed={settled !== null}
        language={props.language}
        onSkip={() => { void application?.skipWait(); }}
        outfit={runwayOutfit ? { id: runwayOutfit.optionId, pieces: outfitBoardPieces(runwayOutfit) } : null}
        phase={recommendationState?.phase ?? null}
        weather={weatherState?.snapshot
          ? runwayWeather(
            weatherState.snapshot,
            weatherState.activeLocation?.coordinates ?? null,
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
  now,
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
  planRow,
  onPlanTomorrow,
}: TodayScreenProps & Readonly<{ now: number }>) {
  const router = useRouter();
  const recommendationApplication = use(RecommendationApplicationContext);
  const weatherApplication = useWeatherApplication();
  const { hour12 } = useLocalization();
  const presentationState =
    state.kind === 'unavailable' &&
    weatherApplication.state.status === 'ready' &&
    weatherApplication.state.activeLocation === null
      ? { ...state, reason: 'no-active-location' as const }
      : state;
  const presentation = createTodayPresentation(presentationState, language, hour12, now);
  const copy = getMessages(language).today;
  const theme = useKuyaraTheme();
  // One shared threshold (ADR 0019): the stacked layout is the same rule ListRow applies.
  const { usesStackedLayout: usesAccessibilityLayout } = useTextScaling();
  // Measure the content after Screen applies its safe-area insets and width cap.
  const [contentWidth, setContentWidth] = useState(0);
  const isGenerating = presentation.kind === 'loading';
  // Law 5's warning structure: the same fact, plus what is still happening, once the
  // wait has run past the point where the first line alone stops being informative.
  const [isLongWait, setIsLongWait] = useState(false);
  // Either action ends the offer here rather than waiting for the durable flag to come back
  // through the prop. Accepting spends it whatever the OS answers, so a refusal arrives after
  // the prop is already gone, and the refused offer is kept to explain itself.
  const [offerAnswered, setOfferAnswered] = useState(false);
  const [blockedOffer, setBlockedOffer] = useState<TodayAlertOffer | null>(null);
  const offerToRender = blockedOffer ?? (offerAnswered ? null : alertOffer);
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

  if (presentation.kind === 'loading') {
    return (
      <Screen
        accessibilityActions={[{ name: 'refresh', label: copy.refreshAction }]}
        alwaysBounceVertical
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'refresh') onRefresh();
        }}
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
        refreshControl={refreshControl}
        testID="today-screen">
        <Surface
          accessible
          accessibilityLabel={presentation.accessibilityLabel}
          accessibilityRole="alert"
          style={styles.feedbackCard}
          testID={
            presentation.reason === 'no-active-location'
              ? 'today-no-location'
              : 'today-unavailable-screen'
          }
          variant="elevated">
          <AppText accessibilityRole="header" variant="title" style={styles.centerText}>
            {presentation.title}
          </AppText>
          <AppText colorRole="textSecondary" style={styles.centerText}>
            {presentation.body}
          </AppText>
          {presentation.actionLabel ? (
            <Button
              label={presentation.actionLabel}
              onPress={
                presentation.reason === 'no-active-location'
                  ? () => router.push('/weather/location')
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
  const exhausted = recommendationApplication?.state.status === 'ready'
    && recommendationApplication.state.exhausted;
  // The two tiles share the row's own gap, so the width follows `styles.outfitList`.
  const alternateWidth = usesAccessibilityLayout
    ? contentWidth
    : Math.max(0, (contentWidth - spacing.md) / 2);
  // Each board's stage height is derived from its own pieces, so two alternates side by
  // side would end at different heights and their captions would sit on different
  // baselines. The alternates share the taller stage and centre their board in it.
  const alternateStageHeight = Math.max(
    0,
    ...alternates.map((suggestion) =>
      measureGarmentBoardHeight(suggestion.boardPieces, alternateWidth, 'today'),
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
      refreshControl={refreshControl}
      testID="today-screen">
      <View onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width)} testID="today-content">
        {/* M7: the place at left and the dressing day's date opposite it. */}
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

        {displayName ? (
          <AppText colorRole="textSecondary" style={styles.greeting} testID="today-greeting" variant="bodyStrong">
            {firstDressingDay ? copy.greetingFirstNamed(displayName) : copy.greetingNamed(displayName)}
          </AppText>
        ) : null}
        {/* O2: Today has no day-type pill. Inside the title the line may break only after the
            separator: the temperature, symbol and condition stay together. */}
        <View style={styles.titleRow}>
          <View
            accessible
            accessibilityLabel={presentation.title}
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
        {/* The badge waits for the new outfit's own source while a day-type change runs. */}
        {presentation.generationMode && !updating ? (
          <ProvenanceBadge generationMode={presentation.generationMode} />
        ) : null}

        {primary ? (
          <>
            <Dimmed dimmed={updating}>
              <Pressable
                accessible
                accessibilityLabel={presentation.stageAccessibilityLabel}
                accessibilityRole="button"
                onPress={() => onOpenOutfitDetail(primary.id)}
                style={({ pressed }) => ({ opacity: pressed ? theme.interaction.pressedOpacity : 1 })}>
                <AppText style={styles.archetypeName} testID="today-archetype" variant="label">
                  {primary.title}
                </AppText>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.stage,
                    {
                      backgroundColor: stageColor,
                      width: contentWidth,
                      height: measureGarmentBoardHeight(primary.boardPieces, contentWidth, 'today'),
                    },
                  ]}
                  testID="today-stage">
                  <GarmentBoard
                    accessibilityLabel={presentation.stageAccessibilityLabel}
                    // ADR 0021 section 10's transition between suggestions: the key is the
                    // option identity, so a new recommendation re-mounts the board and the
                    // pieces rise once more, while a refresh that returns the same outfit
                    // leaves it still. The rise is never the only signal; the archetype and
                    // freshness line also change with it.
                    key={primary.id}
                    // Today's subject is the primary composition, so it is the one board that
                    // carries a coloured piece; the alternates below stay neutral.
                    optionId={primary.id}
                    pieces={primary.boardPieces}
                    preset="today"
                    rise
                    stageColor={stageColor}
                    testID={`today-primary-board-${primary.id}`}
                    width={contentWidth}
                  />
                </View>
              </Pressable>
            </Dimmed>
            {/* N18 and N15: the outfit's claim sits directly under the board, where it is read
                with the outfit, never beside the button. While a re-ask runs, its window
                replaces the claim and says why the outfit is dimmed. */}
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
            {presentation.dayInsight || presentation.dayWindow ? (
              <Dimmed dimmed={updating} style={styles.insights}>
                {presentation.dayInsight ? (
                  <AppText testID="today-day-insight" variant="body">{presentation.dayInsight}</AppText>
                ) : null}
                {presentation.dayWindow ? (
                  <AppText testID="today-day-window" variant="body">{presentation.dayWindow}</AppText>
                ) : null}
              </Dimmed>
            ) : null}
            {primary.accessories.length > 0 || presentation.coolSpellCaption ? (
              <View style={styles.finishingTouches}>
                <AccessoryCaption caption={presentation.copy.finishingTouchesHeading} suggestion={primary} />
                {presentation.coolSpellCaption ? (
                  <CoolSpellLine caption={presentation.coolSpellCaption} />
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        {/* O5: "Last updated" sits under the finishing touches; it no longer describes a button. */}
        <View
          style={[styles.provenance, usesAccessibilityLayout && styles.stackedProvenance]}
          testID="today-provenance">
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

        {/* One row in the Profile row anatomy: the target day as its label, the date as its value. */}
        {planRow && onPlanTomorrow ? (
          <View style={styles.planTomorrow}>
            <ListRowGroup>
              <ListRow
                accessibilityLabel={planRow.accessibilityLabel}
                glyph={({ color, size }) => <Icon color={color} name="calendar" size={size} />}
                label={planRow.label}
                onPress={onPlanTomorrow}
                testID="today-plan-tomorrow"
                value={planRow.value}
              />
            </ListRowGroup>
          </View>
        ) : null}

        {alternates.length > 0 ? (
          <View style={styles.alternates}>
            <View
              style={[styles.alternatesHeading, { borderBottomColor: theme.colors.borderSubtle }]}
              testID="today-alternates-heading">
              <AppText accessibilityRole="header" variant="bodyStrong">
                {presentation.copy.otherOptionsHeading}
              </AppText>
            </View>
            <View
              style={[styles.outfitList, usesAccessibilityLayout && styles.stackedOutfitList]}
              testID="today-outfit-list">
              {alternates.map((suggestion, index) => (
                <Entrance index={index + 1} key={suggestion.id}>
                  <PressScale
                    accessible
                    accessibilityLabel={suggestion.boardAccessibilityLabel}
                    accessibilityRole="button"
                    onPress={() => onOpenOutfitDetail(suggestion.id)}
                    style={({ pressed }) => [
                      { width: alternateWidth, opacity: pressed ? theme.interaction.pressedOpacity : 1 },
                    ]}
                    testID={`today-alternate-${suggestion.id}`}>
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={[styles.alternateStage, { height: alternateStageHeight }]}
                      testID={`today-alternate-stage-${suggestion.id}`}>
                      {/* The alternates stand on the page ground and take the neutral stage
                          fill, so the screen carries one chromatic event: the primary
                          composition. A plate tinted with its own fill would read 1.0:1. */}
                      <GarmentBoard
                        accessibilityLabel={suggestion.boardAccessibilityLabel}
                        pieces={suggestion.boardPieces}
                        preset="today"
                        testID={`today-alternate-board-${suggestion.id}`}
                        width={alternateWidth}
                      />
                    </View>
                    <View style={styles.alternateTitleRow}>
                      <AppText numberOfLines={2} style={styles.outfitName} variant="label">
                        {suggestion.title}
                      </AppText>
                      <View style={styles.disclosure}>
                        <Icon color={theme.colors.textPrimary} name="chevronRight" size={12} />
                      </View>
                    </View>
                  </PressScale>
                </Entrance>
              ))}
            </View>
          </View>
        ) : null}

        {/* ADR 0004's offer comes last, after the alternatives (f12). */}
        {offerToRender ? (
          <Entrance>
            <WeatherAlertOfferRow
              blocked={blockedOffer !== null}
              language={language}
              onAccept={answerOffer}
              onDismiss={dismissOffer}
              ruleId={offerToRender.ruleId}
            />
          </Entrance>
        ) : null}

        {/* O4: the last element of the content, one tonal Large capsule. A7 hides it and puts
            nothing in its place. */}
        {primary && !exhausted ? (
          <Button
            accessibilityHint={copy.askAgain.hint}
            icon="refresh"
            label={copy.askAgain.action}
            onPress={onAskAgain}
            size="large"
            style={styles.askAgain}
            testID="today-ask-again"
            variant="tonal"
          />
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
 * screen it appears on, and either action ends it. It carries no exit motion.
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
  const copy = getMessages(language).notifications;
  const [isAnswering, setIsAnswering] = useState(false);
  // A refused permission is explained with the Settings surface's own copy and its own way
  // out, rather than with a second wording of the same fact.
  const message = blocked ? copy.permissionDeniedHint : copy.offer.sentences[ruleId];
  const acceptLabel = blocked ? copy.openSettingsAction : copy.offer.acceptAction;
  const accept = async () => {
    setIsAnswering(true);
    try {
      await onAccept();
    } finally {
      setIsAnswering(false);
    }
  };
  const dismiss = async () => {
    setIsAnswering(true);
    try {
      await onDismiss();
    } finally {
      setIsAnswering(false);
    }
  };

  return (
    <Surface style={styles.alertOffer} testID="today-alert-offer" variant="muted">
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
        primary={(
          <Button
            disabled={isAnswering}
            label={acceptLabel}
            onPress={() => void accept()}
            size="small"
            testID="today-alert-offer-accept"
            variant="tonal"
          />
        )}
        secondary={(
          <Button
            disabled={isAnswering}
            label={copy.offer.dismissAction}
            onPress={() => void dismiss()}
            size="small"
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
 * The Worker's AI: `sparkles` in the purple-family inks on the provenance container. The
 * badge speaks one sentence; its visible words are grouped under it. Law 7: it arrives as a
 * state change, so it fades on the `normal` duration and moves nothing.
 */
function ProvenanceBadge({
  generationMode,
}: Readonly<{ generationMode: NonNullable<LoadedTodayPresentation['generationMode']> }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue<number>(0);
  const onDevice = generationMode.mode === 'on-device-ai';

  useEffect(() => {
    opacity.set(withTiming(1, { duration: theme.motion.normal }));
  }, [opacity, theme.motion.normal]);

  const arrivalStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <View
      accessible
      accessibilityLabel={generationMode.accessibilityLabel}
      style={styles.provenanceBadge}
      testID="today-provenance-badge">
      <Animated.View style={arrivalStyle}>
        <Pill
          icon={(color) => (onDevice ? (
            <Icon color={color} name="appleIntelligence" rendering="multicolor" size={16} />
          ) : (
            <Icon
              color={color}
              name="sparkle"
              rendering={{ palette: [
                theme.condition.mostlyClearNight,
                theme.condition.partlyCloudyNight,
                theme.colors.provenanceInk,
              ] }}
              size={16}
            />
          ))}
          label={generationMode.label}
          testID="today-generation-mode"
          tone={onDevice ? 'muted' : 'provenance'}
        />
      </Animated.View>
    </View>
  );
}

/** Dims the outfit while a day-type change regenerates it (f7), on the `normal` duration. */
function Dimmed({
  children,
  dimmed,
  style,
}: Readonly<{ children: ReactNode; dimmed: boolean; style?: StyleProp<ViewStyle> }>) {
  const theme = useKuyaraTheme();
  const target = dimmed ? theme.interaction.disabledOpacity : 1;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(target, { duration: theme.motion.normal }),
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/**
 * The accessories the outfit finishes with: the caption, then each drawing at the caption's
 * size (Law 6), cropped to its own artwork with the stroke scaled to it (M21). One accessible
 * element reads the names, never an accent and never animated. A day that asks for no
 * accessory renders nothing at all.
 */
function AccessoryCaption({
  caption,
  suggestion,
}: Readonly<{ caption: string; suggestion: LoadedOutfitPresentation }>) {
  const { controlScale } = useTextScaling();
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
            size={ACCESSORY_CAPTION_SIZE * controlScale}
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
  const { controlScale } = useTextScaling();
  return (
    <View accessible accessibilityLabel={caption} style={styles.coolSpell} testID="today-cool-spell">
      <GarmentDrawing
        category="top"
        garmentTypeId="cardigan"
        size={ACCESSORY_CAPTION_SIZE * controlScale}
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
  archetypeName: { marginBottom: spacing.sm, marginTop: spacing.md },
  stage: { borderRadius: 26, overflow: 'hidden' },
  captionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  captionText: { flexShrink: 1 },
  updatingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  updatingText: { flexShrink: 1 },
  outfitName: { flex: 1, flexShrink: 1 },
  disclosure: { opacity: 0.55 },
  insights: { gap: spacing.sm, marginTop: spacing.xl },
  finishingTouches: { gap: spacing.sm, marginTop: spacing.md },
  accessoryCaption: { alignItems: 'center', columnGap: spacing.sm, flexDirection: 'row', flexWrap: 'wrap',
    rowGap: spacing.xs },
  coolSpell: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  accessoryGlyphs: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  loadingIntro: { gap: spacing.xs, marginBottom: spacing.md },
  generatingStatus: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  generatingStatusText: { flexShrink: 1 },
  askAgain: { marginTop: spacing.md },
  provenance: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  stackedProvenance: { alignItems: 'flex-start', flexDirection: 'column' },
  freshness: { flexShrink: 1 },
  stackedFreshness: { width: '100%' },
  planTomorrow: { marginTop: spacing.md },
  noOutfit: { marginTop: spacing.md },
  alertOffer: { gap: spacing.md, marginTop: spacing.md, padding: spacing.lg },
  alertOfferMessage: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  alertOfferText: { flex: 1, flexShrink: 1 },
  alternates: { marginTop: spacing.md },
  alternatesHeading: { paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  outfitList: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  stackedOutfitList: { flexDirection: 'column', gap: spacing.md },
  alternateStage: { borderRadius: 14, justifyContent: 'center', overflow: 'hidden' },
  alternateTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  feedbackContent: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg },
  feedbackCard: { alignItems: 'center', gap: spacing.md, maxWidth: 520, padding: spacing.lg, width: '100%' },
  centerText: { textAlign: 'center' },
});
