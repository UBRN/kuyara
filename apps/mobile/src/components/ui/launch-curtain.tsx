import { StatusBar } from 'expo-status-bar';
import {
  type ComponentType,
  createContext,
  type PropsWithChildren,
  use,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Appearance, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { type ColumnMajorTransformMatrix, G, type GProps, Path, Rect } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { brandColors, standardMotion } from '@/theme/theme';

import { brandSymbolPaths, brandSymbolViewBox } from './brand-symbol';

// The group's native transform is its `matrix`, which the typed props leave out.
const AnimatedG = Animated.createAnimatedComponent(
  G as unknown as ComponentType<GProps & Readonly<{ matrix?: readonly number[] }>>,
);

/**
 * Where the cold launch stands, for what must wait for it. `revealing` turns true when the
 * curtain starts to lift, `done` when the layer has gone; neither turns back. Outside a
 * launch (tests, a remounted root) both are true from the start.
 */
export type LaunchReveal = Readonly<{ revealing: boolean; done: boolean }>;

const revealed: LaunchReveal = Object.freeze({ revealing: true, done: true });

export const LaunchRevealContext = createContext<LaunchReveal>(revealed);

export function useLaunchReveal(): LaunchReveal {
  return use(LaunchRevealContext);
}

/**
 * How the first screen tells the launch that its content is drawn, so the dive never plays
 * over that screen's heaviest render. Only a screen the launch waits for provides a reader.
 */
export const LaunchScreenReadyContext = createContext<(() => void) | null>(null);

export function useLaunchScreenReady(ready: boolean): void {
  const report = use(LaunchScreenReadyContext);
  useEffect(() => {
    if (ready) report?.();
  }, [ready, report]);
}

/**
 * What the composition knows about the first screen: still loading, drawn, drawn for a
 * notification or a link (the shortened launch), or failed.
 */
export type LaunchReadiness = 'pending' | 'ready' | 'shortened' | 'failed';

/** How long the symbol waits, still, for the first screen before the layer withdraws. */
export const LAUNCH_READY_CEILING_MS = 1_500;

type LaunchMotion = 'dive' | 'short' | 'late' | 'failed';

// The native splash draws the symbol 160 pt wide at the window's centre (app.json
// `imageWidth`), so the layer's first frame does too.
const SYMBOL_SIDE = 160;
// The dive's focus is a point inside the upper piece: scaled about it, that piece alone
// covers the screen, with no shape that is not the symbol's own.
const FOCUS = Object.freeze({ x: 427, y: 358 });
const BREATH_SCALE = 0.94;
// Measured on a 390 x 844 pt screen: at 26 times the upper piece covers it, corners included.
const COVER_SCALE = 26;
const COVER_SCREEN = Object.freeze({ width: 390, height: 844 });
// The camera brings the focus to the screen's centre over the dive's first 70 percent; the
// fill turns from the splash ink to Calm Current between 15 and 70 percent of it.
const CAMERA_SHARE = 0.7;
const FILL_FROM = 0.15;
const FILL_TO = 0.7;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const DIVE_EASING = Easing.bezier(0.65, 0, 0.35, 1);
const GLIDE_EASING = Easing.bezier(0.77, 0, 0.175, 1);
// The longest the launch waits for an idle JavaScript thread: under sustained load the idle
// callback never comes, and the opaque layer must not outlast it.
export const LAUNCH_IDLE_TIMEOUT_MS = 300;

type Scheme = 'light' | 'dark';

const ink = Object.freeze({ light: brandColors.deepAtmosphere, dark: brandColors.quietSky });
const ground = Object.freeze({ light: brandColors.softMist, dark: brandColors.nightLayer });

/** When the curtain starts to lift and when the layer is gone, from the moment it moves. */
function launchTimeline(motion: LaunchMotion): Readonly<{ reveal: number; done: number }> {
  const { fast, launch, normal } = standardMotion;
  switch (motion) {
    case 'dive': return { reveal: fast + launch, done: fast + launch + normal };
    case 'short': return { reveal: fast, done: fast + normal };
    case 'late': return { reveal: 0, done: normal };
    case 'failed': return { reveal: 0, done: fast };
  }
}

function motionFor(readiness: LaunchReadiness, late: boolean): LaunchMotion | null {
  if (readiness === 'ready') return 'dive';
  if (readiness === 'shortened') return 'short';
  if (readiness === 'failed') return 'failed';
  return late ? 'late' : null;
}

export type LaunchCurtainProps = PropsWithChildren<{
  /** This mount is the process's cold launch; any other mount reveals at once. Never changes. */
  cold: boolean;
  readiness: LaunchReadiness;
  /** The layer's first frame is on screen, so the native splash may go. */
  onFirstFrame: () => void;
}>;

/**
 * The cold launch. The layer's first frame is the native splash's last: the system
 * appearance's ground with the master symbol at its centre. It stays still until the first
 * screen is drawn, then the symbol breathes in, the camera dives into its upper piece while
 * the pieces turn Calm Current, and that colour, now the whole screen, fades on `normal`.
 * A notification or a link skips the dive: the colour fades in and out. A
 * first screen later than the ceiling, or a failed one, only fades the layer away. The
 * layer is never read by assistive technology and never takes a touch.
 */
export function LaunchCurtain({ children, cold, onFirstFrame, readiness }: LaunchCurtainProps) {
  const [reveal, setReveal] = useState<LaunchReveal>(cold ? { revealing: false, done: false } : revealed);
  const [drawn, setDrawn] = useState(false);
  const [late, setLate] = useState(false);
  // The launch moves once the JavaScript thread is idle and on the frame after, so the first
  // screen's render and its native mount are behind it and never stall its frames, and an
  // answer refined meanwhile (a drawn first screen that turns out to be a notification's) is
  // the one played. Once moving, a later answer (a retry, a ready after the ceiling) changes
  // nothing.
  const [motion, setMotion] = useState<LaunchMotion | null>(null);
  const answer = cold ? motionFor(readiness, late) : null;

  useEffect(() => {
    if (!cold) return undefined;
    const ceiling = setTimeout(() => setLate(true), LAUNCH_READY_CEILING_MS);
    return () => clearTimeout(ceiling);
  }, [cold]);

  useEffect(() => {
    if (!drawn || motion !== null || answer === null) return undefined;
    let frame: number | null = null;
    const idle = requestIdleCallback(() => {
      frame = requestAnimationFrame(() => setMotion(answer));
    }, { timeout: LAUNCH_IDLE_TIMEOUT_MS });
    return () => {
      cancelIdleCallback(idle);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [answer, drawn, motion]);

  useEffect(() => {
    if (motion === null) return undefined;
    const timeline = launchTimeline(motion);
    const lifting = setTimeout(() => setReveal({ revealing: true, done: false }), timeline.reveal);
    const gone = setTimeout(() => setReveal(revealed), timeline.done);
    return () => {
      clearTimeout(lifting);
      clearTimeout(gone);
    };
  }, [motion]);

  const reported = useRef(false);
  const reportDrawn = () => {
    if (reported.current) return;
    reported.current = true;
    requestAnimationFrame(() => {
      onFirstFrame();
      setDrawn(true);
    });
  };

  return (
    <>
      <LaunchRevealContext value={reveal}>{children}</LaunchRevealContext>
      {reveal.done ? null : <CurtainLayer blocking={!reveal.revealing} motion={motion} onLayout={reportDrawn} />}
    </>
  );
}

function CurtainLayer({
  blocking,
  motion,
  onLayout,
}: Readonly<{ blocking: boolean; motion: LaunchMotion | null; onLayout: () => void }>) {
  // The native splash follows the system appearance, not the app's theme setting, which is
  // applied only once the profile has loaded; the layer reads it once, on mount.
  const [scheme] = useState<Scheme>(() => (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'));
  const { height, width } = useWindowDimensions();
  const breath = useSharedValue(0);
  const dive = useSharedValue(0);
  const camera = useSharedValue(0);
  const fill = useSharedValue(0);
  const veil = useSharedValue(0);
  const lift = useSharedValue(1);
  const withdraw = useSharedValue(1);

  useEffect(() => {
    if (motion === null) return;
    const { fast, launch, normal } = standardMotion;
    if (motion === 'dive') {
      breath.set(withTiming(1, { duration: fast, easing: EASE_OUT }));
      dive.set(withDelay(fast, withTiming(1, { duration: launch, easing: DIVE_EASING })));
      camera.set(withDelay(fast, withTiming(1, { duration: launch * CAMERA_SHARE, easing: GLIDE_EASING })));
      fill.set(withDelay(
        fast + launch * FILL_FROM,
        withTiming(1, { duration: launch * (FILL_TO - FILL_FROM), easing: GLIDE_EASING }),
      ));
      lift.set(withDelay(fast + launch, withTiming(0, { duration: normal, easing: EASE_OUT })));
    } else if (motion === 'short') {
      veil.set(withTiming(1, { duration: fast, easing: EASE_OUT }));
      lift.set(withDelay(fast, withTiming(0, { duration: normal, easing: EASE_OUT })));
    } else {
      withdraw.set(withTiming(0, { duration: motion === 'late' ? normal : fast, easing: EASE_OUT }));
    }
  }, [breath, camera, dive, fill, lift, motion, veil, withdraw]);

  const short = motion === 'short';
  // The curtain is the one colour the dive or the veil arrives at. Until it has arrived, the
  // ground and the symbol are what is seen; from then on, only the curtain.
  // Each worklet reads its shared values itself: a value read only through a helper
  // worklet is not tracked, and the style would never update.
  const curtainOpacity = useDerivedValue(() => {
    const arrived = short ? veil.get() >= 1 : dive.get() >= 1;
    if (arrived) return lift.get();
    return short ? veil.get() : 0;
  });
  const curtainProps = useAnimatedProps(() => ({ opacity: curtainOpacity.get() }));
  const groundProps = useAnimatedProps(() => {
    const arrived = short ? veil.get() >= 1 : dive.get() >= 1;
    return { opacity: arrived ? 0 : withdraw.get() };
  });

  const unit = SYMBOL_SIDE / brandSymbolViewBox;
  const centreX = width / 2;
  const centreY = height / 2;
  const restX = centreX - SYMBOL_SIDE / 2 + FOCUS.x * unit;
  const restY = centreY - SYMBOL_SIDE / 2 + FOCUS.y * unit;
  const coverScale = COVER_SCALE * Math.max(width / COVER_SCREEN.width, height / COVER_SCREEN.height);
  // The symbol is redrawn from its vectors at every scale, so its edges stay sharp: the
  // scale is logarithmic in the dive, and the focus glides to the screen's centre.
  const symbolProps = useAnimatedProps(() => {
    const breathed = 1 + (BREATH_SCALE - 1) * breath.get();
    const scale = breathed * Math.exp((Math.log(coverScale) - Math.log(BREATH_SCALE)) * dive.get());
    const focusX = restX + (centreX - restX) * camera.get();
    const focusY = restY + (centreY - restY) * camera.get();
    const a = unit * scale;
    return { matrix: [a, 0, 0, a, focusX - FOCUS.x * a, focusY - FOCUS.y * a] };
  });
  const fillProps = useAnimatedProps(() => ({ opacity: fill.get() }));
  // The first frame is also drawn by React, so it holds before any animated value arrives:
  // the symbol 160 pt wide at the centre, in the splash ink.
  const restMatrix: ColumnMajorTransformMatrix = [unit, 0, 0, unit, centreX - SYMBOL_SIDE / 2, centreY - SYMBOL_SIDE / 2];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      pointerEvents={blocking ? 'auto' : 'none'}
      style={StyleSheet.absoluteFill}
      testID="launch-curtain">
      {/* One drawing, every layer of it redrawn by the same animated SVG props: the ground
          and the symbol, then the curtain over them. */}
      <Svg height={height} width={width}>
        <AnimatedG animatedProps={groundProps} opacity={1} testID="launch-curtain-ground">
          <Rect fill={ground[scheme]} height={height} width={width} />
          <AnimatedG animatedProps={symbolProps} transform={restMatrix} testID="launch-curtain-symbol">
            <G fill={ink[scheme]}>
              {brandSymbolPaths.map((d) => <Path d={d} key={d} />)}
            </G>
            <AnimatedG animatedProps={fillProps} fill={brandColors.calmCurrent} opacity={0}>
              {brandSymbolPaths.map((d) => <Path d={d} key={d} />)}
            </AnimatedG>
          </AnimatedG>
        </AnimatedG>
        <AnimatedG animatedProps={curtainProps} opacity={0} testID="launch-curtain-colour">
          <Rect fill={brandColors.calmCurrent} height={height} width={width} />
        </AnimatedG>
      </Svg>
      <CurtainStatusBar covered={curtainOpacity} />
    </View>
  );
}

/**
 * Over Calm Current the status bar reads light; it returns to the app's own once the
 * curtain is more than half gone. Mounted after the shell's, its style wins while it lasts.
 */
function CurtainStatusBar({ covered }: Readonly<{ covered: SharedValue<number> }>) {
  const [light, setLight] = useState(false);
  useAnimatedReaction(() => covered.get() >= 0.5, (now, was) => {
    if (now !== was) scheduleOnRN(setLight, now);
  });
  return light ? <StatusBar style="light" /> : null;
}
