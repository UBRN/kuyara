import { use, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import {
  AppText,
  Button,
  Entrance,
  GarmentBoard,
  GarmentTileArtwork,
  haptics,
  Icon,
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
import type { WeatherAlertOfferReason } from '@/features/notifications/domain/weather-alert-offer';
import type { TodayScreenState } from '@/features/today/model';
import { GarmentBoardSkeleton } from '@/features/today/presentation/garment-board-skeleton';
import {
  createTodayPresentation,
  type LoadedOutfitPresentation,
  type LoadedTodayPresentation,
} from '@/features/today/presentation/today-presentation';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { WeatherGlyph } from '@/features/today/presentation/weather-glyph';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { ambientIntensityOf } from '@/features/weather/domain/ambient-intensity';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { useLocalization } from '@/localization/use-messages';
import { layout, spacing, type AmbientIntensity } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// Law 5's escalation point, for the generic line alone. A narrated wait says what it is
// doing, so it never needs the escalation; past this the unnarrated line has stopped being
// informative on its own.
const LONG_WAIT_MS = 8_000;
// Law 6's standalone step, and the size the recommendation detail already draws an accessory
// at. The artwork fills about 60 percent of its box, so a caption-sized badge would put the
// garment at roughly 9.6 points with a fixed 1.9 point stroke: the ribs, fingers and folds
// that tell the accessory silhouettes apart disappear. This row carries no adjacent text, so
// it is a standalone mark rather than a caption glyph and does not share that constant.
const ACCESSORY_BADGE_SIZE = 28;

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
  /** Regenerates the recommendation only. The pull gesture still refreshes weather too. */
  onRegenerate: () => void;
}>;

export function TodayScreen({
  state,
  language,
  displayName = null,
  isRefreshing = false,
  alertOffer = null,
  onOpenOutfitDetail,
  onRefresh,
  onRegenerate,
}: TodayScreenProps) {
  const router = useRouter();
  const recommendationApplication = use(RecommendationApplicationContext);
  const weatherApplication = useWeatherApplication();
  const { hour12 } = useLocalization();
  const now = useForegroundClock();
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
  // The glyph draws the same rain at every tempo; only the condition's ambient step says
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
        <View style={styles.placeRow}>
          <Icon name="location" color={theme.colors.iconSecondary} size={13} />
          <AppText colorRole="textSecondary" numberOfLines={2} style={styles.location} variant="caption">
            {presentation.header.location}
          </AppText>
        </View>

        {displayName ? (
          <AppText colorRole="textSecondary" testID="today-greeting" variant="bodyStrong">
            {copy.greetingNamed(displayName)}
          </AppText>
        ) : null}
        <AppText accessibilityRole="header" style={styles.todayTitle} tabularNumbers testID="today-title" variant="title">
          {presentation.title}
        </AppText>
        {presentation.generationMode ? (
          <ProvenanceBadge
            accessibilityLabel={presentation.generationMode.accessibilityLabel}
            label={presentation.generationMode.label}
          />
        ) : null}

        {primary ? (
          <>
            <Pressable
              accessible
              accessibilityLabel={presentation.stageAccessibilityLabel}
              accessibilityRole="button"
              onPress={() => onOpenOutfitDetail(primary.id)}
              style={({ pressed }) => ({ opacity: pressed ? theme.interaction.pressedOpacity : 1 })}>
              <AppText style={styles.archetypeName} testID="today-archetype" variant="label">
                {primary.title}
              </AppText>
              {usesAccessibilityLayout ? <Sky intensity={ambientIntensity} weather={presentation.weather} /> : null}
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
                {!usesAccessibilityLayout ? <Sky intensity={ambientIntensity} overlay weather={presentation.weather} /> : null}
              </View>
            </Pressable>
            {presentation.dayInsight || presentation.dayWindow ? (
              <View style={styles.insights}>
                {presentation.dayInsight ? (
                  <AppText testID="today-day-insight" variant="body">{presentation.dayInsight}</AppText>
                ) : null}
                {presentation.dayWindow ? (
                  <AppText testID="today-day-window" variant="body">{presentation.dayWindow}</AppText>
                ) : null}
              </View>
            ) : null}
            <AccessoryBadges caption={presentation.copy.finishingTouchesHeading} suggestion={primary} />
          </>
        ) : (
          <View accessible accessibilityLabel={presentation.weather.accessibilityLabel}>
            <Sky intensity={ambientIntensity} weather={presentation.weather} />
          </View>
        )}

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
            style={styles.feedbackCard}
            variant="muted">
            <AppText accessibilityRole="header" style={styles.centerText} variant="title">
              {presentation.noOutfit.title}
            </AppText>
            <AppText colorRole="textSecondary" style={styles.centerText}>
              {presentation.noOutfit.body}
            </AppText>
          </Surface>
        ) : null}

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

        {primary && !exhausted ? (
          <View style={styles.regenerateGroup}>
            <PressScale
              accessibilityRole="button"
              onPress={onRegenerate}
              style={({ pressed }) => [
                styles.regenerate,
                { opacity: pressed ? theme.interaction.pressedOpacity : 1 },
              ]}
              testID="today-regenerate">
              <AppText variant="label">{copy.regenerateAction}</AppText>
            </PressScale>
            <AppText testID="today-regenerate-caption" variant="caption">
              {copy.regenerateCaption}
            </AppText>
          </View>
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
  const { controlScale, usesStackedLayout } = useTextScaling();
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
      <View style={[styles.alertOfferActions, usesStackedLayout && styles.stackedAlertOfferActions]}>
        <Pressable
          accessibilityRole="button"
          disabled={isAnswering}
          onPress={() => void accept()}
          style={({ pressed }) => [
            styles.alertOfferAction,
            { opacity: pressed ? theme.interaction.pressedOpacity : 1 },
          ]}
          testID="today-alert-offer-accept">
          <AppText colorRole="brandAccent" variant="label">{acceptLabel}</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={isAnswering}
          onPress={() => void dismiss()}
          style={({ pressed }) => [
            styles.alertOfferAction,
            { opacity: pressed ? theme.interaction.pressedOpacity : 1 },
          ]}
          testID="today-alert-offer-dismiss">
          <AppText colorRole="textSecondary" variant="label">{copy.offer.dismissAction}</AppText>
        </Pressable>
      </View>
    </Surface>
  );
}

/**
 * The provenance badge: one controlled-role Pill under the title, on the page ground.
 * Law 7: it arrives as a state change of something already on screen, so it takes the
 * `normal` duration and moves nothing but opacity, whether it mounts with a cached answer or
 * replaces the phase line when a live answer lands. The words and the colour carry the
 * signal; the fade is never the only one, and under Reduce Motion it rests at full opacity.
 */
function ProvenanceBadge({
  accessibilityLabel,
  label,
}: Readonly<{ accessibilityLabel: string; label: string }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue<number>(theme.isReduceMotionEnabled ? 1 : 0);

  useEffect(() => {
    opacity.set(withTiming(1, { duration: theme.motion.normal }));
  }, [opacity, theme.motion.normal]);

  const arrivalStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={styles.provenanceBadge}
      testID="today-provenance-badge">
      <Animated.View style={arrivalStyle}>
        <Pill label={label} testID="today-generation-mode" tone="provenance" />
      </Animated.View>
    </View>
  );
}

/**
 * The accessories the outfit finishes with, as silhouettes at Law 6's standalone mark size.
 * They are one accessible element that reads the names, never an accent and never animated,
 * because they answer a question the card has already answered in words. A day that asks for
 * no accessory renders nothing at all.
 */
function AccessoryBadges({
  caption,
  suggestion,
}: Readonly<{ caption: string; suggestion: LoadedOutfitPresentation }>) {
  if (suggestion.accessories.length === 0) {
    return null;
  }

  return (
    <View
      accessible
      accessibilityLabel={suggestion.accessoriesAccessibilityLabel}
      style={styles.accessoryBadges}
      testID="today-accessory-badges">
      {suggestion.accessories.map((accessory) => (
        <GarmentTileArtwork
          category={accessory.category}
          colorFamily={null}
          glyphSize={ACCESSORY_BADGE_SIZE}
          height={ACCESSORY_BADGE_SIZE}
          key={accessory.accessorySlot}
          photoTestID={`today-accessory-photo-${accessory.garmentTypeId}`}
          photoUri={null}
          placeholderTestID={`today-accessory-glyph-${accessory.garmentTypeId}`}
          silhouetteTestID={`today-accessory-${accessory.garmentTypeId}`}
          garmentTypeId={accessory.garmentTypeId}
          width={ACCESSORY_BADGE_SIZE}
        />
      ))}
      {/* Law 6: the silhouettes alone say what they are to nobody who has not learned them,
          so the row names itself. The accessible label already opens with the same words. */}
      <AppText style={styles.accessoryCaption} variant="caption">
        {caption}
      </AppText>
    </View>
  );
}

// Law 6: a waiting mark, sized to the text it sits beside and drawn in the secondary icon
// ink rather than the accent, because the wait is not the screen's one accent-filled
// element. It is a clock rather than a sparkle: `visual-identity.md` refuses the AI-sparkle
// convention, and the pulsing mark is where that convention was most visible. Law 7: it
// breathes on the ambient moderate step, holds still under Reduce Motion, and stays out
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

function Sky({ intensity, weather, overlay = false }: Readonly<{
  intensity: AmbientIntensity;
  weather: LoadedTodayPresentation['weather'];
  overlay?: boolean;
}>) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.sky, overlay ? styles.skyOverlay : styles.skyAbove]}
      testID="today-sky">
      <View style={styles.weatherGlyph}>
        <WeatherGlyph
          condition={weather.conditionCode}
          daypart={weather.daypart}
          intensity={intensity}
          testID="today-header-weather-glyph"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  placeRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  location: { flex: 1, flexShrink: 1 },
  todayTitle: { fontWeight: '700' },
  archetypeName: { marginBottom: spacing.sm, marginTop: spacing.sm },
  stage: { borderRadius: 26, overflow: 'hidden' },
  outfitName: { flex: 1, flexShrink: 1 },
  disclosure: { opacity: 0.55 },
  provenanceBadge: { marginTop: spacing.xs },
  insights: { gap: spacing.sm, marginTop: spacing.xl },
  accessoryBadges: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  accessoryCaption: { flexShrink: 1, marginLeft: spacing.xs },
  loadingIntro: { gap: spacing.xs, marginBottom: spacing.md },
  generatingStatus: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  generatingStatusText: { flexShrink: 1 },
  sky: { alignItems: 'flex-end' },
  skyOverlay: { position: 'absolute', top: 18, left: 20, right: 20 },
  skyAbove: { marginBottom: spacing.md },
  weatherGlyph: { transform: [{ scale: 31 / 36 }] },
  provenance: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  stackedProvenance: { alignItems: 'flex-start', flexDirection: 'column' },
  freshness: { flexShrink: 1 },
  stackedFreshness: { width: '100%' },
  alertOffer: { gap: spacing.md, marginTop: spacing.md, padding: spacing.lg },
  alertOfferMessage: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  alertOfferText: { flex: 1, flexShrink: 1 },
  alertOfferActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  stackedAlertOfferActions: { alignItems: 'flex-start', flexDirection: 'column', gap: spacing.sm },
  alertOfferAction: { justifyContent: 'center', minHeight: layout.minimumTouchTarget },
  alternates: { marginTop: spacing.md },
  alternatesHeading: { paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  outfitList: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  stackedOutfitList: { flexDirection: 'column', gap: spacing.md },
  alternateStage: { borderRadius: 14, justifyContent: 'center', overflow: 'hidden' },
  alternateTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  regenerate: { justifyContent: 'center', marginTop: spacing.md, minHeight: layout.minimumTouchTarget },
  regenerateGroup: { gap: spacing.xs },
  feedbackContent: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg },
  feedbackCard: { alignItems: 'center', gap: spacing.md, maxWidth: 520, padding: spacing.lg, width: '100%' },
  centerText: { textAlign: 'center' },
});
