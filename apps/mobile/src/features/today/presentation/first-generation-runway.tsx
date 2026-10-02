import { useEffect, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { Alert, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import {
  AppText,
  Button,
  Crossfade,
  GarmentRunwayBoard,
  Icon,
  ProgressFill,
  runwayDressingDuration,
  Screen,
  ShrinkingPlate,
  type PlateRect,
  type ShrinkingPlateProps,
  type RunwayBoardOutfit,
} from '@/components/ui';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
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
import { OnPlate } from '@/theme/plate-theme';
import { layout, plateTheme, radii, spacing, type KuyaraTheme } from '@/theme/theme';
import { KuyaraThemeContext, useKuyaraTheme } from '@/theme/theme-context';

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

// In the dark appearance the board stands on the garment plate inside the field, with Today's
// stage corner, and that plate is what shrinks into Today's stage.
const PLATE_RADIUS = 26;

// The track is derived from the field, never a new hue.
const TRACK_TONE = { light: 0.16, dark: 0.22 } as const;

export type RunwayOutfit = RunwayBoardOutfit;

// The plain button's ink is `brandAccent`, measured on the app's own planes, not on the
// runway's fields: it reads 3.05:1 on the light rain field. On the field the Skip wears the
// runway's text ink instead, which clears 4.5:1 on every field in both appearances; every
// other role, the pressed capsule's fill included, keeps its value.
const onField = (theme: KuyaraTheme): KuyaraTheme =>
  ({ ...theme, colors: { ...theme.colors, brandAccent: theme.colors.textPrimary } });

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
  stageRef,
  textStyle,
}: Readonly<{
  viewportHeight: number;
  heading: ReactNode;
  board: (size: Size) => ReactNode;
  text: ReactNode;
  stageRef: RefObject<View | null>;
  /** The heading and the text group leave together when the runway hands over to Today. */
  textStyle: ComponentProps<typeof Animated.View>['style'];
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
      <Animated.View
        onLayout={(event) => setHeadingHeight(sizeOf(event).height)}
        style={[styles.headingBlock, textStyle]}>
        {heading}
      </Animated.View>
      <View
        onLayout={(event) => setStage(sizeOf(event))}
        ref={stageRef}
        style={{ height: areaHeight }}
        testID="first-generation-stage">
        {board(stage)}
      </View>
      <Animated.View onLayout={(event) => setTextHeight(sizeOf(event).height)} style={[styles.textBlock, textStyle]}>
        {text}
      </Animated.View>
    </Screen>
  );
}

/** The dark field leaves as effects motion (Law 7) while the plate travels to Today's stage. */
function FadingField({ color }: Readonly<{ color: string }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(withTiming(0, { duration: theme.motion.normal }));
  }, [opacity, theme.motion.normal]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }, style]} />;
}

/** Skip arrives as content entering (Law 7): it fades in on `fast`. */
function FadeInFast({ children }: Readonly<{ children: ReactNode }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.set(withTiming(1, { duration: theme.motion.fast }));
  }, [opacity, theme.motion.fast]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Today's stage, which the runway's field and outfit hand over to when the wait completes. */
export type RunwayHandoffTarget = Readonly<{
  node: View;
  color: string;
  radius: number;
}>;

type Handoff = Readonly<{
  plate: Readonly<{
    from: ShrinkingPlateProps['from'];
    to: PlateRect;
    color: string;
    radius: number;
  }>;
  board: Readonly<{ x: number; y: number; width: number }>;
}>;

/**
 * The first-generation runway (O1, O17). The day's field fills Today's area from behind the
 * status bar down to the tab bar, which stays usable (M22). Before the answer only neutral
 * drafts come onto the board; the chosen outfit arrives once, when the answer is in, and is
 * dressed piece by piece. The progress bar and the line say what is happening, so no state
 * lives in the motion alone.
 */
export function FirstGenerationRunway({
  active, completed, language, phase, weather, outfit, onSkip, onVisibleChange,
  handoffTarget, onLeave, onHandedOff,
}: Readonly<{
  active: boolean;
  completed: boolean;
  language: SupportedLanguage;
  phase: RecommendationPhase | null;
  weather: ReturnType<typeof runwayWeather> | null;
  /** The chosen outfit, set only once the answer is in; never a provisional preview. */
  outfit: RunwayOutfit | null;
  onSkip: () => void;
  /**
   * Reports each show and hide, so nothing opens over the runway (Phase 8): shown as it
   * starts to fade in, hidden once its fade-out has finished and it has left the screen.
   */
  onVisibleChange?: (visible: boolean) => void;
  /**
   * Today's stage once it is drawn. A wait that completes hands over to it: the field shrinks
   * once into the stage plate and each piece travels to its place there (ADR 0020). Without
   * it, or after a skip, the runway fades out over Today.
   */
  handoffTarget?: RefObject<RunwayHandoffTarget | null>;
  /** The runway starts to leave; `handingOff` says whether it hands over or fades. */
  onLeave?: (handingOff: boolean) => void;
  /** Every piece has reached Today's stage; the runway leaves the tree in the same update. */
  onHandedOff?: () => void;
}>) {
  const theme = useKuyaraTheme();
  const copy = getMessages(language).today;
  const [visible, setVisible] = useState(active);
  // The layer stays mounted while it fades out, and leaves the tree once the fade has ended.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
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
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const layerRef = useRef<View>(null);
  const stageAreaRef = useRef<View>(null);
  const skipped = useRef(false);
  // Read when the wait completes, so a timer started earlier hands over to today's values.
  const onPlate = theme.isDark;
  const leaveRef = useRef({ handoffTarget, onLeave, answered: outfit !== null, onPlate });
  useEffect(() => {
    leaveRef.current = { handoffTarget, onLeave, answered: outfit !== null, onPlate };
  });

  useEffect(() => {
    dressingRef.current = dressing;
  }, [dressing]);

  useEffect(() => {
    onVisibleChange?.(mounted);
  }, [mounted, onVisibleChange]);

  // A full-screen transition (Law 7): the whole layer fades on `deliberate`. A runway there
  // on mount arrives with the screen and is drawn at rest.
  const layerOpacity = useSharedValue(visible ? 1 : 0);
  const faded = useRef(visible);
  useEffect(() => {
    if (faded.current === visible) return;
    faded.current = visible;
    // A hand-off leaves on the field and the pieces; the layer itself does not fade.
    if (!visible && handoff) return;
    layerOpacity.set(withTiming(visible ? 1 : 0, { duration: theme.motion.deliberate }, (finished) => {
      if (finished && !visible) scheduleOnRN(setMounted, false);
    }));
  }, [handoff, layerOpacity, theme.motion.deliberate, visible]);
  const layerStyle = useAnimatedStyle(() => ({ opacity: layerOpacity.get() }));

  // The runway's words leave first, on `fast`, so only the field and the outfit travel.
  const textOpacity = useSharedValue(1);
  useEffect(() => {
    if (handoff) textOpacity.set(withTiming(0, { duration: theme.motion.fast }));
  }, [handoff, textOpacity, theme.motion.fast]);
  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.get() }));

  useEffect(() => {
    if (active) {
      hadActive.current = true;
      skipped.current = false;
      const timer = setTimeout(() => {
        setVisible(true);
        setSuccess(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    if (!hadActive.current) return undefined;
    hadActive.current = false;
    if (!completed) {
      const timer = setTimeout(() => {
        setVisible(false);
        leaveRef.current.onLeave?.(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    // The board dresses first; "All set" shows once every piece has poured, then holds.
    const fade = () => {
      setVisible(false);
      leaveRef.current.onLeave?.(false);
    };
    const leave = () => {
      const { handoffTarget: target, answered: dressed, onPlate: fromPlate } = leaveRef.current;
      const current = target?.current;
      const stage = current?.node;
      const layer = layerRef.current;
      const area = stageAreaRef.current;
      if (!current || !stage || !layer || !area || !dressed || skipped.current) {
        fade();
        return;
      }
      layer.measureInWindow((layerX, layerY, layerWidth, layerHeight) => {
        area.measureInWindow((areaX, areaY, areaWidth, areaHeight) => {
          stage.measureInWindow((stageX, stageY, stageWidth, stageHeight) => {
            if (!(layerWidth > 0 && layerHeight > 0 && stageWidth > 0 && stageHeight > 0)) {
              fade();
              return;
            }
            setHandoff({
              plate: {
                from: fromPlate
                  ? { x: areaX - layerX, y: areaY - layerY, width: areaWidth, height: areaHeight, radius: PLATE_RADIUS }
                  : { width: layerWidth, height: layerHeight },
                to: { x: stageX - layerX, y: stageY - layerY, width: stageWidth, height: stageHeight },
                color: current.color,
                radius: current.radius,
              },
              board: { x: stageX - areaX, y: stageY - areaY, width: stageWidth },
            });
            setVisible(false);
            leaveRef.current.onLeave?.(true);
          });
        });
      });
    };
    const start = setTimeout(() => setSuccess(true), dressingRef.current);
    const timer = setTimeout(leave, dressingRef.current + SUCCESS_MS);
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

  // The runway's lines carry live regions for Android; VoiceOver ignores them. Each phase is
  // spoken once when it begins and "All set" when the outfit is dressed; the rotating tips are
  // not, so the wait stays quiet between phases.
  useErrorAnnouncement(!visible ? null
    : success ? copy.loading.allSet
      : active && !answered ? (phase ? copy.phase[phase] : copy.loading.phase) : null);

  if (!mounted) return null;

  const finishHandoff = () => {
    onHandedOff?.();
    setMounted(false);
  };

  const field = theme.runway[runwayField(weather?.condition ?? null)];
  // What the board stands on: the field itself in the light appearance, the plate in the dark.
  const plate = onPlate ? theme.colors.stage : null;
  const boardGround = plate ?? field;
  const boardTheme = plateTheme(theme, boardGround);
  const particleKind = weather ? runwayParticleKind(weather.condition) : null;
  const particleInks = weather ? runwayParticleInks(boardTheme, weather.condition, weather.daypart) : null;
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
    // the native tab bar above it keeps working. A leaving layer is out of the reading order
    // and takes no touch, so Today answers while the field fades.
    <Animated.View
      accessibilityElementsHidden={!visible}
      accessibilityViewIsModal={visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      onLayout={(event) => setViewportHeight(sizeOf(event).height)}
      pointerEvents={visible ? 'auto' : 'none'}
      ref={layerRef}
      style={[StyleSheet.absoluteFill, { backgroundColor: handoff ? 'transparent' : field }, layerStyle]}
      testID="first-generation-runway">
      {handoff && plate ? <FadingField color={field} /> : null}
      {handoff ? (
        <ShrinkingPlate
          from={handoff.plate.from}
          fromColor={boardGround}
          testID="first-generation-plate"
          to={handoff.plate.to}
          toColor={handoff.plate.color}
          toRadius={handoff.plate.radius}
        />
      ) : null}
      <SafeAreaProvider style={styles.fill}>
        <RunwayFrame
          board={(stage) => {
            const particles = particleKind && particleInks ? (
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, textStyle]}>
                <RunwayParticles
                  color={particleInks.ink}
                  height={stage.height}
                  kind={particleKind}
                  sparkle={particleInks.sparkle}
                  style={plate ? styles.particlesOnPlate : styles.particles}
                  width={plate ? stage.width : stage.width + 2 * spacing.lg}
                />
              </Animated.View>
            ) : null;
            return (
              <OnPlate color={boardGround}>
                {/* The plate holds the particles; the pieces stay outside it, so they can
                    travel past its edge to Today's stage. */}
                {plate ? (
                  <View
                    pointerEvents="none"
                    style={[styles.plate, { backgroundColor: handoff ? 'transparent' : plate }]}
                    testID="first-generation-plate-ground">
                    {particles}
                  </View>
                ) : particles}
                <GarmentRunwayBoard
                  draftInk={boardTheme.colors.iconSecondary}
                  drafts={SKELETON_PIECES}
                  field={boardGround}
                  handoff={handoff?.board ?? null}
                  height={stage.height}
                  onHandedOff={finishHandoff}
                  outfit={outfit}
                  outlineInk={boardTheme.colors.textPrimary}
                  placedCount={placed}
                  testID="first-generation-board"
                  width={stage.width}
                />
              </OnPlate>
            );
          }}
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
              {/* Each new line and "All set" crossfade in. The spoken line is one node that
                  stays while its visible words rotate, so what it announces is unchanged. */}
              <Crossfade contentKey={success ? 'success' : 'line'}>
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
                  <View
                    accessible
                    accessibilityLabel={answered ? copy.loading.chosen : phaseSentence}
                    accessibilityLiveRegion="polite"
                    accessibilityRole="text"
                    style={styles.line}
                    testID="first-generation-line">
                    <Crossfade contentKey={line}>
                      <AppText>{line}</AppText>
                    </Crossfade>
                  </View>
                )}
              </Crossfade>
              {/* The slot keeps its height when Skip is hidden, so the board never resizes. */}
              <View style={styles.skipSlot}>
                {showSkip ? (
                  <FadeInFast>
                    <KuyaraThemeContext value={onField(theme)}>
                      <Button
                        icon="skipForward"
                        label={copy.loading.skipWait}
                        onPress={() => Alert.alert(copy.loading.heading, undefined, [
                          { text: copy.loading.keepWaiting, isPreferred: true, style: 'cancel' },
                          {
                            text: copy.loading.skipWait,
                            style: 'destructive',
                            onPress: () => {
                              skipped.current = true;
                              onSkip();
                            },
                          },
                        ])}
                        style={styles.skip}
                        testID="first-generation-skip"
                        variant="plain"
                      />
                    </KuyaraThemeContext>
                  </FadeInFast>
                ) : null}
              </View>
            </>
          )}
          stageRef={stageAreaRef}
          textStyle={textStyle}
          viewportHeight={viewportHeight}
        />
      </SafeAreaProvider>
    </Animated.View>
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
  particlesOnPlate: { bottom: 0, left: 0, right: 0, top: 0 },
  plate: { bottom: 0, borderRadius: PLATE_RADIUS, left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: 0 },
  textBlock: { paddingTop: spacing.md },
  progressTrack: { borderRadius: radii.pill, height: PROGRESS_HEIGHT },
  // Two lines' worth of room, so a rotation to a longer sentence never moves the skip.
  line: { marginTop: spacing.md, minHeight: 50 },
  skipSlot: { marginTop: spacing.xs, minHeight: layout.minimumTouchTarget },
  skip: { alignSelf: 'flex-start' },
  success: { alignItems: 'center', borderRadius: radii.control, flexDirection: 'row', gap: spacing.sm,
    marginTop: spacing.md, minHeight: 50, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
