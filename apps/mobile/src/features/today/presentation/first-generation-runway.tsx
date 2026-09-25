import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  GarmentRunwayBoard,
  Icon,
  ProgressFill,
  runwayDressingDuration,
  Screen,
  type RunwayBoardOutfit,
} from '@/components/ui';
import type { RecommendationPhase } from '@/features/recommendation/application/recommendation-application-controller';
import { SKELETON_PIECES } from '@/features/today/presentation/garment-board-skeleton';
import {
  runwayField,
  runwayParticleInks,
  runwayParticleKind,
} from '@/features/today/presentation/runway-palette';
import { RunwayParticles } from '@/features/today/presentation/runway-particles';
import type { runwayWeather } from '@/features/today/presentation/today-presentation';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { blend } from '@/theme/color-blend';
import { layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const ROTATION_MS = 2_000;
const SKIP_MS = 10_000;
const SUCCESS_MS = 800;
// The first draft comes on at 0.6 seconds, then one every 1.2 seconds (the O1 timeline).
const FIRST_PLACE_MS = 600;
const PLACE_MS = 1_200;
const PROGRESS_HEIGHT = 4;
// The board band never collapses below this, even at the largest text size on a small phone.
const MIN_AREA = 120;

// The bar follows the controller's phases rather than a clock, so it never runs ahead of
// the wait it reports; the answer's arrival is the one jump, and completion fills it.
const PHASE_PROGRESS: Readonly<Record<RecommendationPhase | 'starting', number>> = {
  starting: 0.04,
  'checking-on-device': 0.2,
  'asking-stylist': 0.42,
  'using-standard': 0.78,
  'answer-received': 0.78,
  'preparing-outfits': 0.9,
};

// The track is derived from the field, never a new hue.
const TRACK_TONE = { light: 0.16, dark: 0.22 } as const;

export type RunwayOutfit = RunwayBoardOutfit;

type Size = Readonly<{ width: number; height: number }>;
const sizeOf = ({ nativeEvent }: LayoutChangeEvent): Size => ({
  width: nativeEvent.layout.width,
  height: nativeEvent.layout.height,
});

/**
 * The runway's three bands: the heading, the board band that takes whatever height is left,
 * and the text group above the tab bar. The nested provider reports the insets of the
 * runway's own view, which on iOS include the tab bar, so the band can fill the free area
 * and nothing scrolls; `Screen` still owns both insets, so if a platform reports less, the
 * content scrolls instead of passing under the bar.
 */
function RunwayFrame({
  viewportHeight,
  heading,
  board,
  text,
}: Readonly<{
  viewportHeight: number;
  heading: ReactNode;
  board: (size: Size) => ReactNode;
  text: ReactNode;
}>) {
  const insets = useSafeAreaInsets();
  const [headingHeight, setHeadingHeight] = useState(0);
  const [textHeight, setTextHeight] = useState(0);
  const [stage, setStage] = useState<Size>({ width: 0, height: 0 });
  const measured = viewportHeight > 0 && headingHeight > 0 && textHeight > 0;
  const areaHeight = measured
    ? Math.max(MIN_AREA, viewportHeight - insets.top - insets.bottom - spacing.md - headingHeight - textHeight)
    : MIN_AREA;

  return (
    <Screen style={styles.clear} testID="first-generation-runway-scroll">
      <View onLayout={(event) => setHeadingHeight(sizeOf(event).height)} style={styles.headingBlock}>
        {heading}
      </View>
      <View
        onLayout={(event) => setStage(sizeOf(event))}
        style={{ height: areaHeight }}
        testID="first-generation-stage">
        {board(stage)}
      </View>
      <View onLayout={(event) => setTextHeight(sizeOf(event).height)} style={styles.textBlock}>
        {text}
      </View>
    </Screen>
  );
}

/**
 * The first-generation runway (O1, O17). The day's field fills Today's area from behind the
 * status bar down to the tab bar, which stays usable (M22). Before the answer only neutral
 * drafts come onto the board; the chosen outfit arrives once, when the answer is in, and is
 * dressed piece by piece. The progress bar and the line say what is happening, so no state
 * lives in the motion alone.
 */
export function FirstGenerationRunway({ active, completed, language, phase, weather, outfit, onSkip }: Readonly<{
  active: boolean;
  completed: boolean;
  language: SupportedLanguage;
  phase: RecommendationPhase | null;
  weather: ReturnType<typeof runwayWeather> | null;
  /** The chosen outfit, set only once the answer is in; never a provisional preview. */
  outfit: RunwayOutfit | null;
  onSkip: () => void;
}>) {
  const theme = useKuyaraTheme();
  const copy = getMessages(language).today;
  const [visible, setVisible] = useState(active);
  const [success, setSuccess] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [placed, setPlaced] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const hadActive = useRef(active);
  const answered = outfit !== null;
  const dressing = runwayDressingDuration(outfit?.pieces.length ?? 0, theme.motion);
  // Read by the completion timers without restarting them: an outfit replaced mid-hold
  // must never cancel the hide and leave the runway over Today.
  const dressingRef = useRef(dressing);

  useEffect(() => {
    dressingRef.current = dressing;
  }, [dressing]);

  useEffect(() => {
    if (active) {
      hadActive.current = true;
      const timer = setTimeout(() => {
        setVisible(true);
        setSuccess(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    if (!hadActive.current) return undefined;
    hadActive.current = false;
    if (!completed) {
      const timer = setTimeout(() => setVisible(false), 0);
      return () => clearTimeout(timer);
    }
    // The board dresses first; "All set" shows once every piece has poured, then holds.
    const start = setTimeout(() => setSuccess(true), dressingRef.current);
    const timer = setTimeout(() => setVisible(false), dressingRef.current + SUCCESS_MS);
    return () => { clearTimeout(start); clearTimeout(timer); };
  }, [active, completed]);

  useEffect(() => {
    if (!active) return undefined;
    const reset = setTimeout(() => { setElapsed(0); setPlaced(0); }, 0);
    const rotation = setInterval(() => setElapsed((value) => value + 1), ROTATION_MS);
    return () => { clearTimeout(reset); clearInterval(rotation); };
  }, [active]);

  // Drafts keep coming on until the answer arrives; a slot that has not come on by then
  // enters already dressed.
  useEffect(() => {
    if (!active || answered) return undefined;
    let placing: ReturnType<typeof setInterval> | undefined;
    const place = () => setPlaced((value) => Math.min(value + 1, SKELETON_PIECES.length));
    const first = setTimeout(() => {
      place();
      placing = setInterval(place, PLACE_MS);
    }, FIRST_PLACE_MS);
    return () => { clearTimeout(first); if (placing) clearInterval(placing); };
  }, [active, answered]);

  if (!visible) return null;

  const field = theme.runway[runwayField(weather?.condition ?? null)];
  const particleKind = weather ? runwayParticleKind(weather.condition) : null;
  const particleInks = weather ? runwayParticleInks(theme, weather.condition, weather.daypart) : null;
  const trackColor = blend(field, theme.colors.textPrimary, TRACK_TONE[theme.colorScheme]);
  const progress = success ? 1 : answered ? PHASE_PROGRESS['preparing-outfits'] : PHASE_PROGRESS[phase ?? 'starting'];
  const progressText = success
    ? copy.loading.progress.done
    : answered ? copy.loading.progress.dressing : copy.loading.progress.waiting;
  const phaseSentence = phase ? copy.phase[phase] : copy.loading.phase;
  const lines = [...(weather?.insight ? [weather.insight] : []), phaseSentence, copy.loading.tip];
  const line = answered ? copy.loading.chosen : lines[elapsed % lines.length];
  const showSkip = active && !answered && elapsed * ROTATION_MS >= SKIP_MS;

  return (
    // An in-screen layer, not a modal: it covers Today's own content and nothing else, so
    // the native tab bar above it keeps working.
    <View
      accessibilityViewIsModal
      onLayout={(event) => setViewportHeight(sizeOf(event).height)}
      style={[StyleSheet.absoluteFill, { backgroundColor: field }]}
      testID="first-generation-runway">
      <SafeAreaProvider style={styles.fill}>
        <RunwayFrame
          board={(stage) => (
            <>
              {particleKind && particleInks ? (
                <RunwayParticles
                  color={particleInks.ink}
                  height={stage.height}
                  kind={particleKind}
                  sparkle={particleInks.sparkle}
                  style={styles.particles}
                  width={stage.width + 2 * spacing.lg}
                />
              ) : null}
              <GarmentRunwayBoard
                draftInk={theme.colors.iconSecondary}
                drafts={SKELETON_PIECES}
                field={field}
                height={stage.height}
                outfit={outfit}
                outlineInk={theme.colors.textPrimary}
                placedCount={placed}
                testID="first-generation-board"
                width={stage.width}
              />
            </>
          )}
          heading={(
            <AppText accessibilityRole="header" variant="title">
              {copy.loading.heading}
            </AppText>
          )}
          text={(
            <>
              <View
                accessible
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100), text: progressText }}
                testID="first-generation-progress">
                <ProgressFill
                  fillColor={theme.colors.textPrimary}
                  progress={progress}
                  style={styles.progressTrack}
                  trackColor={trackColor}
                />
              </View>
              {success ? (
                <View
                  accessible
                  accessibilityLabel={copy.loading.allSet}
                  accessibilityLiveRegion="polite"
                  style={[styles.success, { backgroundColor: theme.colors.successContainer }]}
                  testID="first-generation-success">
                  <Icon color={theme.colors.successInk} name="statusRunning" size={20} />
                  <AppText colorRole="successInk" variant="bodyStrong">{copy.loading.allSet}</AppText>
                </View>
              ) : (
                <AppText
                  accessibilityLabel={answered ? copy.loading.chosen : phaseSentence}
                  accessibilityLiveRegion="polite"
                  style={styles.line}
                  testID="first-generation-line">
                  {line}
                </AppText>
              )}
              {/* The slot keeps its height when Skip is hidden, so the board never resizes. */}
              <View style={styles.skipSlot}>
                {showSkip ? (
                  <Button
                    icon="skipForward"
                    label={copy.loading.skipWait}
                    onPress={() => Alert.alert(copy.loading.heading, undefined, [
                      { text: copy.loading.keepWaiting, isPreferred: true, style: 'cancel' },
                      { text: copy.loading.skipWait, style: 'destructive', onPress: onSkip },
                    ])}
                    style={styles.skip}
                    testID="first-generation-skip"
                    variant="plain"
                  />
                ) : null}
              </View>
            </>
          )}
          viewportHeight={viewportHeight}
        />
      </SafeAreaProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // The field is the runway root's own colour; the scroll view stays clear over it.
  clear: { backgroundColor: 'transparent' },
  // The heading starts one container inset below the top safe area; Screen owns the inset.
  headingBlock: { paddingBottom: spacing.md, paddingTop: spacing.lg },
  // The band runs to the screen's edges, past the content inset, and stays inside the board.
  particles: { bottom: 0, left: -spacing.lg, right: -spacing.lg, top: 0 },
  textBlock: { paddingTop: spacing.md },
  progressTrack: { borderRadius: radii.pill, height: PROGRESS_HEIGHT },
  // Two lines' worth of room, so a rotation to a longer sentence never moves the skip.
  line: { marginTop: spacing.md, minHeight: 50 },
  skipSlot: { marginTop: spacing.xs, minHeight: layout.minimumTouchTarget },
  skip: { alignSelf: 'flex-start' },
  success: { alignItems: 'center', borderRadius: radii.control, flexDirection: 'row', gap: spacing.sm,
    marginTop: spacing.md, minHeight: 50, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
