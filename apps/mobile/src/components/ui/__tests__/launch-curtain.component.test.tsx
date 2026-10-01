import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Appearance, Dimensions, processColor, Text } from 'react-native';

import {
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

beforeAll(() => {
  Object.assign(globalThis, {
    requestIdleCallback: (callback: () => void) => setTimeout(callback, 1),
    cancelIdleCallback: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
  });
});

beforeEach(() => {
  jest.useFakeTimers();
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
  expect(layer.props.pointerEvents).toBe('none');
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

test('a cold launch dives, lifts the curtain, then leaves', async () => {
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');
  const result = await render(curtain('pending'));
  await drawFirstFrame();
  expect(groundFill()).toEqual(brush(brandColors.softMist));
  // The symbol stays still for as long as the first screen takes, under the ceiling.
  await advance(500);
  expect(probe()).toBe('covered playing');

  await result.rerender(curtain('ready'));
  await nextFrame();
  await advance(fast + launch - 1);
  expect(probe()).toBe('covered playing');
  await advance(1);
  expect(probe()).toBe('revealing playing');
  await advance(normal - 1);
  expect(screen.getByTestId('launch-curtain', hidden)).toBeTruthy();
  await advance(1);
  expect(probe()).toBe('revealing done');
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
});

test('a launch from a notification or a link skips the dive: the colour fades in, then away', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();

  await result.rerender(curtain('shortened'));
  await nextFrame();
  await advance(fast - 1);
  expect(probe()).toBe('covered playing');
  await advance(1);
  expect(probe()).toBe('revealing playing');
  await advance(normal);
  expect(probe()).toBe('revealing done');
  expect(screen.queryByTestId('launch-curtain', hidden)).toBeNull();
});

test('a drawn first screen that turns out to be a notification\'s, within the frame, plays the short launch', async () => {
  const result = await render(curtain('pending'));
  await drawFirstFrame();

  await result.rerender(curtain('ready'));
  await result.rerender(curtain('shortened'));
  await nextFrame();
  await advance(fast + normal);
  // The dive would still be covering the screen here.
  expect(probe()).toBe('revealing done');
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
  // A first screen that arrives now changes nothing.
  await result.rerender(curtain('ready'));
  await advance(normal);
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
  await advance(fast);
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
