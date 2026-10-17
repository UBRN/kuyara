import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Appearance, AppState, type AppStateStatus, Dimensions, processColor, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import * as Worklets from 'react-native-worklets';

import {
  LAUNCH_IDLE_TIMEOUT_MS,
  LAUNCH_READY_CEILING_MS,
  LAUNCH_STEADY_FRAME_LIMIT,
  LAUNCH_STEADY_FRAMES,
  LAUNCH_STEADY_WAIT_MS,
  LaunchCurtain,
  type LaunchReadiness,
  LaunchScreenReadyContext,
  RETURN_AWAY_MS,
  useLaunchOpen,
  useLaunchReveal,
  useLaunchScreenReady,
} from '@/components/ui/launch-curtain';
import { usePresentationHeld } from '@/components/ui/presentation-hold';
import { brandColors, standardMotion } from '@/theme/theme';

const { fast, launch, normal } = standardMotion;

function Probe() {
  const { done, revealing } = useLaunchReveal();
  return <Text testID="probe">{`${revealing ? 'revealing' : 'covered'} ${done ? 'done' : 'playing'}`}</Text>;
}

// Which open the app is in, and whether anything holds the screen, the curtain included.
function OpenProbe() {
  return <Text testID="open">{`open ${useLaunchOpen()} ${usePresentationHeld() ? 'held' : 'clear'}`}</Text>;
}
const opened = () => screen.getByTestId('open').props.children as string;
const openCurtain = (readiness: LaunchReadiness, cold = true) => (
  <LaunchCurtain cold={cold} onFirstFrame={jest.fn()} readiness={readiness} seen>
    <OpenProbe />
  </LaunchCurtain>
);

const curtain = (readiness: LaunchReadiness, onFirstFrame = jest.fn(), cold = true, seen = true) => (
  <LaunchCurtain cold={cold} onFirstFrame={onFirstFrame} readiness={readiness} seen={seen}>
    <Probe />
  </LaunchCurtain>
);

// The layer is hidden from assistive technology, so queries must look past that.
const hidden = { includeHiddenElements: true };

// The ground is the first shape the layer draws, under the symbol.
const groundFill = () => {
  const [ground] = screen.getByTestId('launch-curtain-ground', hidden).children as unknown as {
    props: Record<string, unknown>;
  }[];
  return ground!.props.fill;
};
const brush = (colour: string) => ({ type: 0, payload: processColor(colour) });

const probe = () => screen.getByTestId('probe').props.children as string;

async function advance(ms: number) {
  await act(() => jest.advanceTimersByTime(ms));
}

// The layer's first frame is laid out, then drawn on the next frame.
async function drawFirstFrame() {
  await fireEvent(screen.getByTestId('launch-curtain', hidden), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
  });
  await advance(16);
}

// The launch moves once the JavaScript thread is idle and the UI thread then draws steady
// frames; React Native provides the idle callback, Jest's environment does not.
const FRAME = 16;
const nextFrame = () => advance(2 * FRAME);

// The UI thread's frames, each as late as the test says: by default at once, as on an idle
// UI thread; a UI thread busy mounting and drawing a screen delivers its next frame late.
let frameDelay = 0;
let frameDelays: number[] = [];

// Under sustained load the idle callback never comes by itself; only its timeout does.
let busy = false;

// The motion runs on the UI thread, which can start it late. Every timing that reports its
// end is held here, by duration, until the test ends it, as the UI thread would.
let running: { duration: number; end: (finished: boolean) => void }[] = [];
const durations = () => running.map(({ duration }) => duration);

// A timing cancelled before its end, as when its layer is taken away, reports it unfinished.
async function end(duration: number, finished = true) {
  const index = running.findIndex((timing) => timing.duration === duration);
  expect(index).toBeGreaterThanOrEqual(0);
  const [timing] = running.splice(index, 1);
  await act(() => timing!.end(finished));
  // The end reaches this thread as a microtask.
  await advance(0);
}

// The app's state as React Native reports it, moved by the test.
let appStateListeners: ((state: AppStateStatus) => void)[] = [];
async function moveApp(state: AppStateStatus) {
  await act(() => appStateListeners.forEach((listener) => listener(state)));
}

// A shared value keeps its identity across renders, as on a device; the library's mock
// makes a new one each render, which would start the motion again on every render.
const librarySharedValue = Reanimated.useSharedValue;

beforeAll(() => {
  Object.assign(globalThis, {
    requestIdleCallback: (callback: () => void, options?: { timeout?: number }) =>
      setTimeout(callback, busy ? (options?.timeout ?? 1e9) : 1),
    cancelIdleCallback: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
  });
});

beforeEach(() => {
  busy = false;
  frameDelay = 0;
  frameDelays = [];
  running = [];
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: (state: AppStateStatus) => void,
  ) => {
    appStateListeners.push(listener);
    return { remove: () => { appStateListeners = appStateListeners.filter((item) => item !== listener); } };
  }) as unknown as typeof AppState.addEventListener);
  jest.useFakeTimers();
  // Installed over the fake timers' own frames, which would come every 16 ms whatever the test says.
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: (now: number) => void) =>
      setTimeout(() => callback(performance.now()), frameDelays.shift() ?? frameDelay),
    cancelAnimationFrame: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
  });
  jest.spyOn(Reanimated, 'withTiming').mockImplementation(((
    toValue: number,
    config?: { duration?: number },
    callback?: (finished?: boolean) => void,
  ) => {
    if (callback) running.push({ duration: config?.duration ?? 0, end: (finished) => callback(finished) });
    return toValue;
  }) as unknown as typeof Reanimated.withTiming);
  jest.spyOn(Reanimated, 'useSharedValue').mockImplementation(((initial: number) => {
    const [value] = useState(() => librarySharedValue(initial));
    return value;
  }) as unknown as typeof Reanimated.useSharedValue);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('the first frame is the native splash in the system appearance, and the splash goes once it is drawn', async () => {
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');
  const onFirstFrame = jest.fn();
  await render(curtain('pending', onFirstFrame));

  const layer = screen.getByTestId('launch-curtain', hidden);
  // While opaque the layer takes the touches, so no hidden control is pressed.
  expect(layer.props.pointerEvents).toBe('auto');
  expect(layer.props.accessibilityElementsHidden).toBe(true);
  expect(layer.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(groundFill()).toEqual(brush(brandColors.nightLayer));
  expect(screen.getByTestId('launch-curtain-colour', hidden).props.opacity).toBe(0);
  // 160 pt of the 1024 viewBox, centred in the window, as the native splash draws it.
  const symbol = screen.getByTestId('launch-curtain-symbol', hidden);
  const unit = 160 / 1024;
  const { height, width } = Dimensions.get('window');
  expect(symbol.props.matrix).toEqual([unit, 0, 0, unit, width / 2 - 80, height / 2 - 80]);
  const [inkGroup, calmGroup] = symbol.children as unknown as { props: Record<string, unknown> }[];
  expect(inkGroup!.props.fill).toEqual(brush(brandColors.quietSky));
  expect(calmGroup!.props.fill).toEqual(brush(brandColors.calmCurrent));
  expect(calmGroup!.props.opacity).toBe(0);
  expect(onFirstFrame).not.toHaveBeenCalled();

  await drawFirstFrame();
  expect(onFirstFrame).toHaveBeenCalledTimes(1);
  expect(probe()).toBe('covered playing');
});

test('a cold launch dives, lifts the curtain when the dive ends, and leaves when it has faded', async () => {
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');
  const result = await render(curtain('pending'));
  await drawFirstFrame();
  expect(groundFill()).toEqual(brush(brandColors.softMist));
  // The symbol stays still for as long as the first screen takes, under the ceiling.
  await advance(500);
  expect(probe()).toBe('covered playing');

  await result.rerender(curtain('ready'));
  await nextFrame();
  // The dive into the symbol, then the curtain's fade.
  expect(durations()).toEqual([launch, normal]);
  // A UI thread still mounting the first screen starts the motion late: no time on this
  // thread lifts the curtain or takes the layer away before the motion has played.
  await advance(fast + launch + normal + 1000);
  expect(probe()).toBe('covered playing');
  await end(launch);
  expect(probe()).toBe('revealing playing');
  expect(screen.getByTestId('launch-curtain', hidden)).toBeTruthy();
  await end(normal);
  expect(probe()).toBe('revealing done');
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
});

test('the opaque layer takes touches until the curtain lifts, then lets them through', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();
  await result.rerender(curtain('ready'));
  await nextFrame();
  expect(screen.getByTestId('launch-curtain', hidden).props.pointerEvents).toBe('auto');
  await end(launch);
  expect(screen.getByTestId('launch-curtain', hidden).props.pointerEvents).toBe('none');
});

test('a JavaScript thread that is never idle still lets the launch move, within the idle timeout', async () => {
  busy = true;
  const result = await render(curtain('pending'));
  await drawFirstFrame();
  await result.rerender(curtain('ready'));
  await advance(LAUNCH_IDLE_TIMEOUT_MS - 1);
  expect(durations()).toEqual([]);
  await advance(1);
  await nextFrame();
  expect(durations()).toEqual([launch, normal]);
});

test('the dive waits until the UI thread has drawn the first screen and draws steady frames again', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();
  // Mounting and drawing the first screen holds the UI thread: one of its frames comes late.
  frameDelay = FRAME;
  frameDelays = [FRAME, 300];
  await result.rerender(curtain('ready'));
  // Idle, then the frame before the stall, the stall, and all but the last steady frame.
  await advance(1 + FRAME + 300 + (LAUNCH_STEADY_FRAMES - 1) * FRAME);
  expect(durations()).toEqual([]);
  expect(probe()).toBe('covered playing');
  await nextFrame();
  expect(durations()).toEqual([launch, normal]);
});

test('frames at a low dynamic frame rate still count as steady', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();
  // 24 frames a second, as iOS may run a still screen.
  frameDelay = 42;
  await result.rerender(curtain('ready'));
  // Idle, the first frame, and the steady ones after it, but for the last moment.
  await advance(1 + 42 + LAUNCH_STEADY_FRAMES * 42 - 1);
  expect(durations()).toEqual([]);
  await nextFrame();
  expect(durations()).toEqual([launch, normal]);
});

test('a UI thread that never draws steadily still lets the launch move, within a bounded time', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();
  const slow = 100;
  frameDelay = slow;
  await result.rerender(curtain('ready'));
  // Idle, the first frame, then frames until the wait has lasted its longest.
  await advance(1 + slow + LAUNCH_STEADY_WAIT_MS - 1);
  expect(durations()).toEqual([]);
  await nextFrame();
  expect(durations()).toEqual([launch, normal]);
});

test('frames that come unevenly but fast still let the launch move, within a bounded number of frames', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();
  // Two quick frames and a slow one, over and over: never steady, never long.
  frameDelays = Array.from({ length: 2 * LAUNCH_STEADY_FRAME_LIMIT }, (_, index) => (index % 3 === 2 ? 52 : 1));
  const lastFrame = 1 + frameDelays.slice(0, LAUNCH_STEADY_FRAME_LIMIT).reduce((sum, delay) => sum + delay, 0);
  await result.rerender(curtain('ready'));
  await advance(lastFrame - 1);
  expect(durations()).toEqual([]);
  await nextFrame();
  expect(durations()).toEqual([launch, normal]);
});

test('an answer refined while the UI thread is still drawing is the one played, never the one before it', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();
  // The wait for the drawn first screen stalls on its second frame.
  frameDelays = [0, 300];
  await result.rerender(curtain('ready'));
  await advance(100);
  expect(durations()).toEqual([]);
  // A notification's: the shortened launch starts its own wait, and the first one's end is ignored.
  await result.rerender(curtain('shortened'));
  await nextFrame();
  expect(durations()).toEqual([fast, normal]);
  await advance(300);
  await nextFrame();
  expect(durations()).toEqual([fast, normal]);
});

test('a launch from a notification or a link skips the dive: the colour fades in, then away', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();

  await result.rerender(curtain('shortened'));
  await nextFrame();
  expect(durations()).toEqual([fast, normal]);
  expect(probe()).toBe('covered playing');
  await end(fast);
  expect(probe()).toBe('revealing playing');
  await end(normal);
  expect(probe()).toBe('revealing done');
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
});

test('a drawn first screen that turns out to be a notification\'s, within the frame, plays the short launch', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();

  await result.rerender(curtain('ready'));
  await result.rerender(curtain('shortened'));
  await nextFrame();
  // The veil and its fade, not the dive.
  expect(durations()).toEqual([fast, normal]);
});

test('the symbol waits for a slow first screen, and withdraws at the ceiling without a dive', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();

  await advance(LAUNCH_READY_CEILING_MS - FRAME - 1);
  await nextFrame();
  expect(probe()).toBe('covered playing');
  await advance(1);
  await nextFrame();
  await advance(0);
  expect(probe()).toBe('revealing playing');
  expect(durations()).toEqual([normal]);
  // A first screen that arrives now changes nothing.
  await result.rerender(curtain('ready'));
  await nextFrame();
  expect(durations()).toEqual([normal]);
  await end(normal);
  expect(probe()).toBe('revealing done');
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
});

test('a launch iOS starts in the background holds off screen and dives once it is first seen', async () => {
  const onFirstFrame = jest.fn();
  const result = await render(curtain('pending', onFirstFrame, true, false));
  await drawFirstFrame();
  // The splash still goes with the first frame, but nobody is watching: no ceiling, no motion.
  expect(onFirstFrame).toHaveBeenCalledTimes(1);
  await result.rerender(curtain('ready', onFirstFrame, true, false));
  await advance(LAUNCH_READY_CEILING_MS * 4);
  await nextFrame();
  expect(probe()).toBe('covered playing');
  expect(durations()).toEqual([]);

  await result.rerender(curtain('ready', onFirstFrame, true, true));
  await nextFrame();
  expect(durations()).toEqual([launch, normal]);
});

test('a failed launch fades the layer away at once and the app is never left behind it', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();

  await result.rerender(curtain('failed'));
  await nextFrame();
  await advance(0);
  expect(probe()).toBe('revealing playing');
  expect(durations()).toEqual([fast]);
  await end(fast);
  expect(probe()).toBe('revealing done');
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
});

test('a mount that is not the cold launch, a scene reconnecting included, plays nothing and hands over once', async () => {
  const onFirstFrame = jest.fn();
  await render(curtain('pending', onFirstFrame, false));

  expect(probe()).toBe('revealing done');
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
  // A scene reconnecting in the same process shows the native splash again, so the first
  // frame still hands over, or the launch image would cover the app for good.
  await nextFrame();
  expect(onFirstFrame).toHaveBeenCalledTimes(1);
  await advance(LAUNCH_READY_CEILING_MS);
  expect(onFirstFrame).toHaveBeenCalledTimes(1);
});

test('outside a launch, what waits for it is never held', async () => {
  await render(<Probe />);

  expect(probe()).toBe('revealing done');
});


test('the first screen reports its content drawn once, when it has it, and only to a launch that waits', async () => {
  function Screen({ ready }: Readonly<{ ready: boolean }>) {
    useLaunchScreenReady(ready);
    return null;
  }
  const report = jest.fn();
  const tree = (ready: boolean) => (
    <LaunchScreenReadyContext value={report}>
      <Screen ready={ready} />
    </LaunchScreenReadyContext>
  );
  const result = await render(tree(false));
  expect(report).not.toHaveBeenCalled();
  await result.rerender(tree(true));
  expect(report).toHaveBeenCalledTimes(1);

  // Outside a launch nothing listens.
  await result.rerender(<Screen ready />);
});

test('a return after at least a minute away fades the symbol in over the screen, then dives', async () => {
  await render(curtain('ready', jest.fn(), false));
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();

  await moveApp('background');
  await advance(RETURN_AWAY_MS);
  await moveApp('active');
  expect(screen.getByTestId('launch-curtain', hidden)).toBeTruthy();
  // What waits for the cold launch is not held again.
  expect(probe()).toBe('revealing done');
  await nextFrame();
  expect(durations()).toEqual([launch, normal]);
  await end(launch);
  await end(normal);
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
});

// A return's layer is drawn when the app leaves, so coming back has only to start its motion.
test('leaving prepares an unseen return layer that takes no touches, and a return after a minute plays it', async () => {
  await render(curtain('ready', jest.fn(), false));
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();

  await moveApp('background');
  const layer = screen.getByTestId('launch-curtain', hidden);
  expect(layer.props.pointerEvents).toBe('none');
  expect(layer.props.accessibilityElementsHidden).toBe(true);
  expect(layer.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(screen.getByTestId('launch-curtain-appear', hidden).props.opacity).toBe(0);
  expect(durations()).toEqual([]);
  await advance(RETURN_AWAY_MS);
  expect(durations()).toEqual([]);

  await moveApp('active');
  expect(screen.getByTestId('launch-curtain', hidden).props.pointerEvents).toBe('auto');
  await nextFrame();
  expect(durations()).toEqual([launch, normal]);
  await end(launch);
  expect(screen.getByTestId('launch-curtain', hidden).props.pointerEvents).toBe('none');
  await end(normal);
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
});

// Coming back, the UI thread can be busy drawing the screen again: a motion started meanwhile
// would play its fade-in unseen.
test('a return starts its motion on the first frame the UI thread draws after the app is back', async () => {
  await render(curtain('ready', jest.fn(), false));
  await moveApp('background');
  await advance(RETURN_AWAY_MS);
  frameDelays = [300];
  await moveApp('active');
  await advance(299);
  expect(durations()).toEqual([]);
  await advance(1);
  expect(durations()).toEqual([launch, normal]);
});

test('a return whose system appearance changed while away plays a layer drawn in the new one', async () => {
  const scheme = jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');
  await render(curtain('ready', jest.fn(), false));
  await moveApp('background');
  expect(groundFill()).toEqual(brush(brandColors.softMist));
  scheme.mockReturnValue('dark');
  await advance(RETURN_AWAY_MS);
  await moveApp('active');
  await nextFrame();
  expect(groundFill()).toEqual(brush(brandColors.nightLayer));
  expect(durations()).toEqual([launch, normal]);
  await end(launch);
  await end(normal);
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
});

// While it is opaque, nothing under the layer can be pressed unseen: it blocks touches before
// the UI thread is asked to start its motion.
test('a return blocks touches before its motion is asked of the UI thread', async () => {
  await render(curtain('ready', jest.fn(), false));
  await moveApp('background');
  await advance(RETURN_AWAY_MS);
  const blocking: unknown[] = [];
  const schedule = Worklets.scheduleOnUI;
  jest.spyOn(Worklets, 'scheduleOnUI').mockImplementation(((...args: Parameters<typeof schedule>) => {
    blocking.push(screen.getByTestId('launch-curtain', hidden).props.pointerEvents);
    return schedule(...args);
  }) as typeof schedule);
  await moveApp('active');
  await nextFrame();
  expect(durations()).toEqual([launch, normal]);
  expect(blocking).toEqual(['auto']);
});

// Taken away mid-motion, a layer's timings end unfinished; they must not act on the next layer.
test('a return motion cut short neither lets touches through nor takes a layer away', async () => {
  await render(curtain('ready', jest.fn(), false));
  await moveApp('background');
  await advance(RETURN_AWAY_MS);
  await moveApp('active');
  await nextFrame();
  await end(launch, false);
  expect(screen.getByTestId('launch-curtain', hidden).props.pointerEvents).toBe('auto');
  await end(normal, false);
  expect(screen.getByTestId('launch-curtain', hidden)).toBeTruthy();
});

// Control Center, Siri, Face ID and permission alerts make the app inactive without sending
// it to the background; a layer then would hide the app from VoiceOver.
test('a passing system overlay prepares no layer, and a prepared one is modal to VoiceOver only while it plays', async () => {
  await render(curtain('ready', jest.fn(), false));
  await moveApp('inactive');
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
  await moveApp('background');
  expect(windowOverlay()!.props.accessibilityContainerViewIsModal).toBe(false);
  await advance(RETURN_AWAY_MS);
  await moveApp('active');
  expect(windowOverlay()!.props.accessibilityContainerViewIsModal).toBe(true);
});

test('a return inside a minute, or from a passing system overlay, plays nothing', async () => {
  await render(curtain('ready', jest.fn(), false));

  await moveApp('background');
  await advance(RETURN_AWAY_MS - 1);
  await moveApp('active');
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();

  await moveApp('inactive');
  await advance(RETURN_AWAY_MS * 5);
  await moveApp('active');
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
});

test('a return while the cold launch still plays adds no second launch', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();
  await moveApp('background');
  await advance(RETURN_AWAY_MS);
  await moveApp('active');
  await result.rerender(curtain('ready'));
  await nextFrame();
  expect(durations()).toEqual([launch, normal]);
  await end(launch);
  await end(normal);
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
});

test('the cold launch is the first open, and its curtain holds the screen until it has gone', async () => {
  const result = await render(openCurtain('pending'));
  await drawFirstFrame();
  expect(opened()).toBe('open 0 held');
  await result.rerender(openCurtain('ready'));
  await nextFrame();
  await end(launch);
  expect(opened()).toBe('open 0 held');
  await end(normal);
  expect(opened()).toBe('open 0 clear');
});

test('each return that plays the launch is the next open, held until its curtain has gone', async () => {
  await render(openCurtain('ready', false));
  expect(opened()).toBe('open 0 clear');

  // The return layer prepared as the app leaves is unseen and holds nothing; a 20 s return
  // plays nothing and stays in the same open.
  await moveApp('background');
  expect(opened()).toBe('open 0 clear');
  await advance(20_000);
  await moveApp('active');
  expect(opened()).toBe('open 0 clear');

  await moveApp('background');
  await advance(RETURN_AWAY_MS);
  await moveApp('active');
  expect(opened()).toBe('open 1 held');
  await nextFrame();
  await end(launch);
  await end(normal);
  expect(opened()).toBe('open 1 clear');

  await moveApp('background');
  await advance(RETURN_AWAY_MS);
  await moveApp('active');
  await nextFrame();
  await end(launch);
  await end(normal);
  expect(opened()).toBe('open 2 clear');
});

// The person leaves while the cold launch dives; the motion ends while the app is away.
async function leaveDuringColdLaunch() {
  const result = await render(curtain('pending'));
  await drawFirstFrame();
  await result.rerender(curtain('ready'));
  await nextFrame();
  await moveApp('inactive');
  await moveApp('background');
  await end(launch);
  await end(normal);
  expect(probe()).toBe('revealing done');
  // Only the return layer prepared on leaving is left, unseen.
  expect(screen.getByTestId('launch-curtain', hidden).props.pointerEvents).toBe('none');
  expect(durations()).toEqual([]);
}

test('a time away that starts while the cold launch plays is timed, and a long one plays the return', async () => {
  await leaveDuringColdLaunch();
  await advance(RETURN_AWAY_MS + 1_000);
  await moveApp('active');
  expect(screen.getByTestId('launch-curtain', hidden)).toBeTruthy();
  await nextFrame();
  expect(durations()).toEqual([launch, normal]);
});

test('a short time away that starts while the cold launch plays returns to the screen as it is', async () => {
  await leaveDuringColdLaunch();
  await advance(20_000);
  await moveApp('active');
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
});

// iOS can suspend the process before this thread hears `background`; it then hears it on
// resume, just before `active`. The time away runs from the moment the app stopped being active.
test('a background heard only on resume still counts the time since the app went inactive', async () => {
  await render(curtain('ready', jest.fn(), false));

  await moveApp('inactive');
  await advance(RETURN_AWAY_MS + 1_000);
  await moveApp('background');
  await moveApp('active');
  expect(screen.getByTestId('launch-curtain', hidden)).toBeTruthy();
  await nextFrame();
  await end(launch);
  await end(normal);

  // Control Center or the app switcher: inactive and back, never in the background.
  await moveApp('inactive');
  await advance(RETURN_AWAY_MS + 1_000);
  await moveApp('active');
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
});

// The layer sits in the iOS full-window overlay, which draws above presented sheets.
function windowOverlay() {
  type Node = { type: unknown; parent: Node | null; props: Record<string, unknown> };
  let node = (screen.getByTestId('launch-curtain', hidden) as unknown as Node).parent;
  for (; node; node = node.parent) if (node.type === 'RNSFullWindowOverlay') return node;
  return null;
}
const inWindowOverlay = () => windowOverlay() !== null;

test('a return draws above presented sheets, and the cold launch stays in the app\'s own window', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();
  expect(inWindowOverlay()).toBe(false);
  await result.rerender(curtain('ready'));
  await nextFrame();
  await end(launch);
  await end(normal);

  await moveApp('background');
  await advance(RETURN_AWAY_MS);
  await moveApp('active');
  expect(inWindowOverlay()).toBe(true);
});
