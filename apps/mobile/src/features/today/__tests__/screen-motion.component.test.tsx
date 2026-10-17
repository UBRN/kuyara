import { act, render } from '@testing-library/react-native';
import { Animated, AppState, View } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { useAmbientPulse } from '@/components/ui/use-ambient-pulse';
import { type SymbolMotion, useConditionSymbolMotion } from '@/components/ui/use-condition-symbol-motion';
import { RunwayParticles } from '@/features/today/presentation/runway-particles';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const mockFocusSubscribers = new Set<(focused: boolean) => void>();
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        let cleanup = callback();
        const subscriber = (focused: boolean) => {
          if (focused) cleanup = callback();
          else cleanup?.();
        };
        mockFocusSubscribers.add(subscriber);
        return () => { mockFocusSubscribers.delete(subscriber); cleanup?.(); };
      }, [callback]);
    },
  };
});

function ConditionSample({ motion = 'fall' }: Readonly<{ motion?: SymbolMotion }>) {
  useConditionSymbolMotion(motion, lightTheme.motion.ambient.intense);
  return <View />;
}

function PulseSample() {
  useAmbientPulse();
  return <View />;
}

function ParticleSample() {
  return <RunwayParticles color="#ffffff" height={100} kind="rain" width={100} />;
}

afterEach(() => { jest.restoreAllMocks(); mockFocusSubscribers.clear(); });

// The condition symbol loops on React Native's native driver, the others on Reanimated: each
// row names the call that starts its loop and the one that stops it.
function nativeLoopSpies() {
  const stop = jest.fn();
  const start = jest.fn();
  jest.spyOn(Animated, 'loop').mockReturnValue({ reset: jest.fn(), start, stop } as unknown as Animated.CompositeAnimation);
  return { start, stop };
}

function reanimatedLoopSpies() {
  return { start: jest.spyOn(Reanimated, 'withRepeat'), stop: jest.spyOn(Reanimated, 'cancelAnimation') };
}

test.each([
  ['condition symbol', ConditionSample, nativeLoopSpies],
  ['ambient pulse', PulseSample, reanimatedLoopSpies],
  ['runway particles', ParticleSample, reanimatedLoopSpies],
] as const)('%s stops on blur or background and resumes when visible', async (_name, Sample, spies) => {
  const appStateSubscribers = new Set<(state: string) => void>();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event, callback) => {
    const subscriber = callback as (state: string) => void;
    appStateSubscribers.add(subscriber);
    return { remove: () => appStateSubscribers.delete(subscriber) } as ReturnType<typeof AppState.addEventListener>;
  }) as typeof AppState.addEventListener);
  const { start: repeat, stop: cancel } = spies();
  const result = await render(
    <KuyaraThemeContext.Provider value={lightTheme}><Sample /></KuyaraThemeContext.Provider>,
  );
  expect(repeat).toHaveBeenCalled();
  expect(mockFocusSubscribers.size).toBe(1);

  cancel.mockClear();
  await act(() => { mockFocusSubscribers.forEach((subscriber) => subscriber(false)); });
  expect(cancel).toHaveBeenCalled();
  repeat.mockClear();
  await act(() => {
    appStateSubscribers.forEach((subscriber) => subscriber('background'));
    mockFocusSubscribers.forEach((subscriber) => subscriber(true));
  });
  expect(repeat).not.toHaveBeenCalled();

  await act(() => { appStateSubscribers.forEach((subscriber) => subscriber('active')); });
  expect(repeat).toHaveBeenCalled();
  cancel.mockClear();
  await act(() => { appStateSubscribers.forEach((subscriber) => subscriber('background')); });
  expect(cancel).toHaveBeenCalled();
  await result.unmount();
});

// A Reanimated loop commits the shadow tree on every frame, so each frame relaid and walked
// the whole window while a screen sat idle. The native driver moves the view alone.
test.each([
  ['turn', 1, [0, 0.25, 0.5, 0.75, 1]],
  ['drift', 2, [0, 0.5, 1, 0.5, 0]],
  ['fall', 2, [0, 0.5, 1, 0.5, 0]],
] as const)('the %s loop runs on the native driver with the same legs', async (motion, legs, curve) => {
  const timing = jest.spyOn(Animated, 'timing');
  const loop = jest.spyOn(Animated, 'loop');
  const result = await render(
    <KuyaraThemeContext.Provider value={lightTheme}><ConditionSample motion={motion} /></KuyaraThemeContext.Provider>,
  );

  expect(loop).toHaveBeenCalledTimes(1);
  const config = timing.mock.calls[0][1];
  expect(config).toMatchObject({
    duration: legs * lightTheme.motion.ambient.intense,
    toValue: 1,
    useNativeDriver: true,
  });
  expect([0, 0.25, 0.5, 0.75, 1].map((t) => config.easing?.(t))).toEqual(curve);
  // A drift or fall leg keeps Reanimated's default quadratic ease in and out.
  if (legs === 2) expect(config.easing?.(0.125)).toBeCloseTo(0.125);
  await result.unmount();
});
