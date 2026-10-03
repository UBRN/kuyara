import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Appearance, Dimensions, processColor, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import {
  LAUNCH_IDLE_TIMEOUT_MS,
  LAUNCH_READY_CEILING_MS,
  LaunchCurtain,
  type LaunchReadiness,
  LaunchScreenReadyContext,
  useLaunchReveal,
  useLaunchScreenReady,
} from '@/components/ui/launch-curtain';
import { brandColors, standardMotion } from '@/theme/theme';

const { fast, launch, normal } = standardMotion;

function Probe() {
  const { done, revealing } = useLaunchReveal();
  return <Text testID="probe">{`${revealing ? 'revealing' : 'covered'} ${done ? 'done' : 'playing'}`}</Text>;
}

const curtain = (readiness: LaunchReadiness, onFirstFrame = jest.fn(), cold = true) => (
  <LaunchCurtain cold={cold} onFirstFrame={onFirstFrame} readiness={readiness}>
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

// The launch moves once the JavaScript thread is idle, on the frame after; React Native
// provides the idle callback, Jest's environment does not.
const FRAME = 16;
const nextFrame = () => advance(2 * FRAME);

// Under sustained load the idle callback never comes by itself; only its timeout does.
let busy = false;

// The motion runs on the UI thread, which can start it late. Every timing that reports its
// end is held here, by duration, until the test ends it, as the UI thread would.
let running: { duration: number; end: () => void }[] = [];
const durations = () => running.map(({ duration }) => duration);

async function end(duration: number) {
  const index = running.findIndex((timing) => timing.duration === duration);
  expect(index).toBeGreaterThanOrEqual(0);
  const [timing] = running.splice(index, 1);
  await act(() => timing!.end());
  // The end reaches this thread as a microtask.
  await advance(0);
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
  running = [];
  jest.useFakeTimers();
  jest.spyOn(Reanimated, 'withTiming').mockImplementation(((
    toValue: number,
    config?: { duration?: number },
    callback?: (finished?: boolean) => void,
  ) => {
    if (callback) running.push({ duration: config?.duration ?? 0, end: () => callback(true) });
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

test('a mount that is not the cold launch, a return from the background included, plays nothing', async () => {
  const onFirstFrame = jest.fn();
  await render(curtain('pending', onFirstFrame, false));

  expect(probe()).toBe('revealing done');
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
  await advance(LAUNCH_READY_CEILING_MS);
  expect(onFirstFrame).not.toHaveBeenCalled();
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
