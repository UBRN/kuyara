import { StatusBar } from 'expo-status-bar';
import {
  type ComponentType,
  createContext,
  type PropsWithChildren,
  type Ref,
  use,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Appearance, AppState, StyleSheet, useWindowDimensions, View } from 'react-native';
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
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { brandColors, standardMotion } from '@/theme/theme';

import { brandSymbolPaths, brandSymbolViewBox } from './brand-symbol';
import { fadeEasing, fadeTo } from './fade';
import { WindowOverlay } from './window-overlay';

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
 * How the first screen tells the launch that it has drawn what the device holds, so the dive
 * never plays over the first render of local data. Only a screen the launch waits for
 * provides a reader.
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

/** How long the app must have been away, reaching the background, for its return to play the launch. */
export const RETURN_AWAY_MS = 60_000;

type LaunchMotion = 'dive' | 'short' | 'late' | 'failed' | 'return';

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
// Mounting and drawing the first screen holds the UI thread, and a motion that starts meanwhile
// is spent unseen: the clock runs on while no frame is drawn. The motion starts once the UI
// thread draws this many frames in a row, each within 50 ms of the one before: iOS can run a
// still screen at 24 frames a second, about 42 ms apart, while a stall lasts hundreds.
export const LAUNCH_STEADY_FRAMES = 3;
const STEADY_FRAME_MS = 50;
// Under sustained load the frames never come steadily, and the opaque layer must not outlast it:
// the wait ends after this many frames or this long since its first frame, whichever comes first.
export const LAUNCH_STEADY_FRAME_LIMIT = 20;
export const LAUNCH_STEADY_WAIT_MS = 400;

type Scheme = 'light' | 'dark';

// The native splash follows the system appearance, not the app's theme setting, which is
// applied only once the profile has loaded.
const systemScheme = (): Scheme => (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');

const ink = Object.freeze({ light: brandColors.deepAtmosphere, dark: brandColors.quietSky });
const ground = Object.freeze({ light: brandColors.softMist, dark: brandColors.nightLayer });

/** Calls `then` once the UI thread draws steady frames, or has waited as long as it may. */
function afterSteadyFrames(then: () => void) {
  'worklet';
  let frames = 0;
  let steady = 0;
  let first = -1;
  let last = -1;
  const frame = (now: number) => {
    frames += 1;
    if (first < 0) first = now;
    steady = last >= 0 && now - last <= STEADY_FRAME_MS ? steady + 1 : 0;
    last = now;
    const waited = frames >= LAUNCH_STEADY_FRAME_LIMIT || now - first >= LAUNCH_STEADY_WAIT_MS;
    if (steady >= LAUNCH_STEADY_FRAMES || waited) scheduleOnRN(then);
    else requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
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
  /**
   * The launch is on screen. iOS can start the process in the background, where the whole UI
   * renders unseen; the ceiling and the motion wait for the first time someone sees it.
   */
  seen: boolean;
  /** The layer's first frame is on screen, so the native splash may go. */
  onFirstFrame: () => void;
}>;

/**
 * The cold launch. The layer's first frame is the native splash's last: the system
 * appearance's ground with the master symbol at its centre. It stays still until the first
 * screen is drawn, then the symbol breathes in, the camera dives into its upper piece while
 * the pieces turn Calm Current, and that colour, now the whole screen, fades on `normal`.
 * A notification or a link skips the dive: the colour fades in and out. A return after at
 * least `RETURN_AWAY_MS` in the background fades the resting symbol in over the screen it
 * left and plays the same dive, holding back nothing that waits for the cold launch. A
 * first screen later than the ceiling, or a failed one, only fades the layer away. The
 * layer is never read by assistive technology. It takes the touches meant for the first screen
 * while it is opaque, so nothing under it can be pressed unseen, and none once it starts to lift.
 */
export function LaunchCurtain({ children, cold, onFirstFrame, readiness, seen }: LaunchCurtainProps) {
  const [scheme] = useState(systemScheme);
  const [reveal, setReveal] = useState<LaunchReveal>(cold ? { revealing: false, done: false } : revealed);
  const [drawn, setDrawn] = useState(false);
  const [late, setLate] = useState(false);
  // The launch moves once the JavaScript thread is idle and the UI thread then draws steady
  // frames, so the first screen's render, its mounting and its drawing are behind it, and an
  // answer refined meanwhile (a drawn first screen that turns out to be a notification's) is
  // the one played. Once moving, a later answer (a retry, a ready after the ceiling) changes
  // nothing.
  const [motion, setMotion] = useState<LaunchMotion | null>(null);
  const answer = cold ? motionFor(readiness, late) : null;

  useEffect(() => {
    if (!cold || !seen) return undefined;
    const ceiling = setTimeout(() => setLate(true), LAUNCH_READY_CEILING_MS);
    return () => clearTimeout(ceiling);
  }, [cold, seen]);

  useEffect(() => {
    if (!drawn || !seen || motion !== null || answer === null) return undefined;
    let live = true;
    const idle = requestIdleCallback(() => {
      scheduleOnUI(afterSteadyFrames, () => {
        if (live) setMotion(answer);
      });
    }, { timeout: LAUNCH_IDLE_TIMEOUT_MS });
    return () => {
      live = false;
      cancelIdleCallback(idle);
    };
  }, [answer, drawn, motion, seen]);

  // The motion itself says when the curtain lifts and when the layer has gone. The UI thread
  // can still be mounting the first screen when the motion is asked for and start it hundreds
  // of milliseconds late; a clock on this thread would take the layer away mid-dive.
  const lifting = useCallback(() => {
    setReveal((current) => (current.revealing ? current : { revealing: true, done: false }));
  }, []);
  const gone = useCallback(() => setReveal(revealed), []);

  // A return after a long enough time in the background plays the launch over the screen it
  // left, when no curtain is on screen at that moment; a curtain still there finishes as it
  // is. Each return is its own layer; it holds back nothing that waits for the cold launch,
  // and it takes touches only until its curtain lifts. The layer is drawn, unseen and taking
  // no touches, when the app leaves, so coming back only starts its motion, without waiting
  // for a render; one that does not play is taken away. The listener reads the layer as it
  // stands, not as the last render saw it.
  const [returning, setReturning] = useState<ReturnLayer | null>(null);
  const [returnLifted, setReturnLifted] = useState(false);
  const layer = useRef<ReturnLayer | null>(null);
  const returnStart = useRef<CurtainStart | null>(null);
  const showReturn = useCallback((next: ReturnLayer | null) => {
    layer.current = next;
    setReturning(next);
  }, []);
  const idle = useRef(false);
  useEffect(() => {
    idle.current = reveal.done && !returning?.playing;
  }, [reveal.done, returning]);
  // Every time away is timed, whatever is on screen when it starts, from the moment the app
  // stops being active: iOS can suspend the process before this thread hears `background`,
  // and then delivers it on resume, just before `active`. Only a time that reached the
  // background counts, so Control Center or the app switcher plays nothing.
  const away = useRef<{ since: number; background: boolean } | null>(null);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') {
        const left = away.current ?? { since: Date.now(), background: false };
        away.current = state === 'background' ? { ...left, background: true } : left;
        if (layer.current === null) showReturn({ key: Date.now(), playing: false, scheme: systemScheme() });
        return;
      }
      if (state !== 'active') return;
      const left = away.current;
      away.current = null;
      const prepared = layer.current?.playing ? null : layer.current;
      if (!left?.background || Date.now() - left.since < RETURN_AWAY_MS || !idle.current) {
        if (prepared) showReturn(null);
        return;
      }
      // The ground follows the system appearance the app returns to: if it changed while the
      // app was away, a layer is drawn afresh in it and starts once mounted.
      const scheme = systemScheme();
      const ready = prepared?.scheme === scheme;
      if (ready) returnStart.current?.play();
      setReturnLifted(false);
      showReturn(ready ? { ...prepared, playing: true } : { key: Date.now(), playing: true, scheme });
    });
    return () => subscription.remove();
  }, [showReturn]);
  const returnLifting = useCallback(() => setReturnLifted(true), []);
  const returnGone = useCallback(() => showReturn(null), [showReturn]);
  const ignoreLayout = useCallback(() => undefined, []);

  // A mount that is not the cold launch draws no layer, but a scene reconnecting in the same
  // process shows the native splash again, so its first frame hands over all the same.
  useEffect(() => {
    if (cold) return undefined;
    const frame = requestAnimationFrame(() => onFirstFrame());
    return () => cancelAnimationFrame(frame);
  }, [cold, onFirstFrame]);

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
      {reveal.done ? null : (
        <CurtainLayer
          blocking={!reveal.revealing}
          motion={motion}
          onGone={gone}
          onLayout={reportDrawn}
          onLifting={lifting}
          scheme={scheme}
        />
      )}
      {/* A return can find a sheet presented over the app, so its layer is drawn above the
          whole window; the cold launch has nothing presented over it. */}
      {returning === null ? null : (
        <WindowOverlay key={returning.key}>
          <CurtainLayer
            appears
            blocking={returning.playing && !returnLifted}
            motion={returning.playing ? 'return' : null}
            onGone={returnGone}
            onLayout={ignoreLayout}
            onLifting={returnLifting}
            ref={returnStart}
            scheme={returning.scheme}
          />
        </WindowOverlay>
      )}
    </>
  );
}

/** A return's layer: unseen until it plays, in the system appearance it plays in. */
type ReturnLayer = Readonly<{ key: number; playing: boolean; scheme: Scheme }>;

/** Starts a return's motion without a render. */
type CurtainStart = Readonly<{ play: () => void }>;

type CurtainLayerProps = Readonly<{
  /** The layer is a return's: unseen until its motion fades it in. */
  appears?: boolean;
  blocking: boolean;
  motion: LaunchMotion | null;
  onLayout: () => void;
  /** The curtain starts to lift: the dive or the veil has arrived, or the layer withdraws. */
  onLifting: () => void;
  /** The layer has faded away. */
  onGone: () => void;
  ref?: Ref<CurtainStart>;
  scheme: Scheme;
}>;

function CurtainLayer({ appears = false, blocking, motion, onGone, onLayout, onLifting, ref, scheme }: CurtainLayerProps) {
  const { height, width } = useWindowDimensions();
  const breath = useSharedValue(0);
  const dive = useSharedValue(0);
  const camera = useSharedValue(0);
  const fill = useSharedValue(0);
  const veil = useSharedValue(0);
  // A return fades the resting symbol in over the screen before it dives.
  const appear = useSharedValue(appears ? 0 : 1);
  const lift = useSharedValue(1);
  const withdraw = useSharedValue(1);

  // A layer moves once. Coming back, the UI thread can still be drawing the screen again when
  // the return is asked for, and a fade-in started then would play unseen: a return starts on
  // the next frame the UI thread draws.
  const started = useRef(false);
  const play = useCallback((now: LaunchMotion) => {
    if (started.current) return;
    started.current = true;
    const { fast, launch, normal } = standardMotion;
    // Each ends on the UI thread, where the motion runs, however late it started.
    const lifted = () => {
      'worklet';
      scheduleOnRN(onLifting);
    };
    const faded = () => {
      'worklet';
      scheduleOnRN(onGone);
    };
    // A return builds these on the UI thread, where `fadeTo` cannot run, so their clock starts
    // there; they keep the curve `fadeTo` draws.
    const fade = fadeEasing(standardMotion);
    const diveAfter = (lead: number) => {
      'worklet';
      breath.set(withDelay(lead, withTiming(1, { duration: fast, easing: EASE_OUT })));
      dive.set(withDelay(lead + fast, withTiming(1, { duration: launch, easing: DIVE_EASING }, lifted)));
      camera.set(withDelay(lead + fast, withTiming(1, { duration: launch * CAMERA_SHARE, easing: GLIDE_EASING })));
      fill.set(withDelay(
        lead + fast + launch * FILL_FROM,
        withTiming(1, { duration: launch * (FILL_TO - FILL_FROM), easing: fade }),
      ));
      lift.set(withDelay(lead + fast + launch, withTiming(0, { duration: normal, easing: fade }, faded)));
    };
    if (now === 'return') {
      scheduleOnUI(() => {
        'worklet';
        requestAnimationFrame(() => {
          appear.set(withTiming(1, { duration: fast, easing: fade }));
          diveAfter(fast);
        });
      });
    } else if (now === 'dive') {
      diveAfter(0);
    } else if (now === 'short') {
      veil.set(fadeTo(1, fast, standardMotion, lifted));
      lift.set(withDelay(fast, fadeTo(0, normal, standardMotion, faded)));
    } else {
      onLifting();
      withdraw.set(fadeTo(0, now === 'late' ? normal : fast, standardMotion, faded));
    }
  }, [appear, breath, camera, dive, fill, lift, onGone, onLifting, veil, withdraw]);
  useImperativeHandle(ref, () => ({ play: () => play('return') }), [play]);
  useEffect(() => {
    if (motion !== null) play(motion);
  }, [motion, play]);

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
  const appearProps = useAnimatedProps(() => ({ opacity: appear.get() }));
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
        <AnimatedG animatedProps={appearProps} opacity={appears ? 0 : 1} testID="launch-curtain-appear">
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
