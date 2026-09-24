import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import {
  AppText,
  GarmentRunwayBoard,
  Icon,
  ProgressFill,
  Screen,
  type GarmentBoardPiece,
} from '@/components/ui';
import type { RecommendationPhase } from '@/features/recommendation/application/recommendation-application-controller';
import { SKELETON_PIECES } from '@/features/today/presentation/garment-board-skeleton';
import { runwayParticleColor, runwayParticleKind } from '@/features/today/presentation/runway-palette';
import { RunwayParticles } from '@/features/today/presentation/runway-particles';
import type { runwayWeather } from '@/features/today/presentation/today-presentation';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { blend } from '@/theme/color-blend';
import { layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const ROTATION_MS = 2_000;
const SKIP_MS = 10_000;
const SUCCESS_MS = 800;
// One piece glides onto the board every 1.2 seconds.
const PLACE_MS = 1_200;
const PROGRESS_HEIGHT = 4;

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

// The track is derived from the day's atmosphere, never a new hue.
const TRACK_TONE = { light: 0.16, dark: 0.22 } as const;

export type RunwayOutfit = Readonly<{ id: string; pieces: readonly GarmentBoardPiece[] }>;

/**
 * M8's first-generation runway. It fills Today's area with the day's atmosphere, from behind
 * the status bar down to the tab bar, which stays usable (M22). The pieces glide onto their
 * landing marks one by one while particles move in the board band; the progress bar and the
 * rotating line say what is happening, so no state lives in the motion alone.
 */
export function FirstGenerationRunway({ active, completed, language, phase, weather, outfit, onSkip }: Readonly<{
  active: boolean;
  completed: boolean;
  language: SupportedLanguage;
  phase: RecommendationPhase | null;
  weather: ReturnType<typeof runwayWeather> | null;
  /** The deterministic preview while the wait runs, the chosen outfit once it completes. */
  outfit: RunwayOutfit | null;
  onSkip: () => void;
}>) {
  const theme = useKuyaraTheme();
  const copy = getMessages(language).today;
  const [visible, setVisible] = useState(active);
  // Completion runs in two steps: every remaining piece lands and the bar fills, then "All
  // set" shows and holds, so the words never arrive over an unfinished board.
  const [finishing, setFinishing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [placed, setPlaced] = useState(0);
  // The board band's size: its width lays out the board, its height bounds the particles.
  const [band, setBand] = useState({ width: 0, height: 0 });
  const hadActive = useRef(active);

  useEffect(() => {
    if (active) {
      hadActive.current = true;
      const timer = setTimeout(() => {
        setVisible(true);
        setFinishing(false);
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
    // The last pieces land together on the spatial spring, which also outlasts the bar's
    // fill on `motion.deliberate`; "All set" follows once both have settled.
    const landing = theme.springs.spatial.duration;
    const finish = setTimeout(() => setFinishing(true), 0);
    const start = setTimeout(() => setSuccess(true), landing);
    const timer = setTimeout(() => setVisible(false), landing + SUCCESS_MS);
    return () => { clearTimeout(finish); clearTimeout(start); clearTimeout(timer); };
  }, [active, completed, theme.springs.spatial.duration]);

  useEffect(() => {
    if (!active) return undefined;
    const reset = setTimeout(() => { setElapsed(0); setPlaced(0); }, 0);
    const rotation = setInterval(() => setElapsed((value) => value + 1), ROTATION_MS);
    const placing = setInterval(() => setPlaced((value) => value + 1), PLACE_MS);
    return () => { clearTimeout(reset); clearInterval(rotation); clearInterval(placing); };
  }, [active]);

  if (!visible) return null;

  const pieces = outfit?.pieces ?? SKELETON_PIECES;
  // Without an outfit the marks stand alone; with one, completion lands every piece at once.
  const placedCount = !outfit ? 0 : finishing ? pieces.length : Math.min(placed, pieces.length);
  const plane = theme.atmosphere[weather?.atmosphere ?? 'neutral'];
  const particleKind = weather ? runwayParticleKind(weather.condition) : null;
  const trackColor = blend(plane, theme.colors.textPrimary, TRACK_TONE[theme.colorScheme]);
  const progress = finishing ? 1 : PHASE_PROGRESS[phase ?? 'starting'];
  const progressText = placedCount >= pieces.length
    ? copy.loading.progressComplete
    : copy.loading.progress[Math.min(placedCount, copy.loading.progress.length - 1)];
  const phaseSentence = phase ? copy.phase[phase] : copy.loading.phase;
  const lines = [...(weather?.insight ? [weather.insight] : []), phaseSentence, copy.loading.tip];
  const line = lines[elapsed % lines.length];
  const showSkip = active && elapsed * ROTATION_MS >= SKIP_MS;

  return (
    // An in-screen layer, not a modal: it covers Today's own content and nothing else, so
    // the native tab bar above it keeps working.
    <View accessibilityViewIsModal style={StyleSheet.absoluteFill} testID="first-generation-runway">
      <Screen style={{ backgroundColor: plane }} testID="first-generation-runway-scroll">
        <AppText accessibilityRole="header" style={styles.heading} variant="title">
          {copy.loading.heading}
        </AppText>
        <View
          onLayout={({ nativeEvent }) => setBand({
            width: nativeEvent.layout.width,
            height: nativeEvent.layout.height,
          })}
          testID="first-generation-stage">
          {particleKind ? (
            <RunwayParticles
              color={runwayParticleColor(theme, plane, weather?.condition ?? '')}
              height={band.height}
              kind={particleKind}
              style={styles.particles}
              width={band.width + 2 * spacing.lg}
            />
          ) : null}
          <GarmentRunwayBoard
            optionId={outfit?.id}
            pieces={pieces}
            placedCount={placedCount}
            stageColor={plane}
            testID="first-generation-board"
            width={band.width}
          />
        </View>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100), text: progressText }}
          style={styles.progress}
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
            style={[styles.success, { backgroundColor: theme.colors.successContainer }]}
            testID="first-generation-success">
            <Icon color={theme.colors.successInk} name="statusRunning" size={20} />
            <AppText colorRole="successInk" variant="bodyStrong">{copy.loading.allSet}</AppText>
          </View>
        ) : (
          <>
            <AppText
              accessibilityLabel={phaseSentence}
              accessibilityLiveRegion="polite"
              style={styles.line}
              testID="first-generation-line">
              {line}
            </AppText>
            {showSkip ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => Alert.alert(copy.loading.heading, undefined, [
                  { text: copy.loading.keepWaiting, isPreferred: true, style: 'cancel' },
                  { text: copy.loading.skipWait, style: 'destructive', onPress: onSkip },
                ])}
                style={({ pressed }) => [styles.skip, { opacity: pressed ? theme.interaction.pressedOpacity : 1 }]}
                testID="first-generation-skip">
                <AppText colorRole="brandAccent" variant="bodyStrong">
                  {copy.loading.skipWait}
                </AppText>
              </Pressable>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  // The heading starts one container inset below the top safe area; Screen owns the inset.
  heading: { marginBottom: spacing.md, marginTop: spacing.lg },
  // The band runs to the screen's edges, past the content inset, and stays inside the board.
  particles: { bottom: 0, left: -spacing.lg, right: -spacing.lg, top: 0 },
  progress: { marginTop: spacing.md },
  progressTrack: { borderRadius: radii.pill, height: PROGRESS_HEIGHT },
  // Two lines' worth of room, so a rotation to a longer sentence never moves the skip.
  line: { marginTop: spacing.md, minHeight: 50 },
  skip: { alignSelf: 'flex-start', justifyContent: 'center', marginTop: spacing.md, minHeight: layout.minimumTouchTarget },
  success: { alignItems: 'center', borderRadius: radii.control, flexDirection: 'row', gap: spacing.sm,
    marginTop: spacing.md, minHeight: layout.minimumTouchTarget, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
