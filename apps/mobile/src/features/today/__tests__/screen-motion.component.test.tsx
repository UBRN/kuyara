import { act, render } from '@testing-library/react-native';
import { Animated, AppState, StyleSheet, View } from 'react-native';

import { AMBIENT_PULSE_FLOOR, useAmbientPulse } from '@/components/ui/use-ambient-pulse';
import { type SymbolMotion, useConditionSymbolMotion } from '@/components/ui/use-condition-symbol-motion';
import { RunwayParticles } from '@/features/today/presentation/runway-particles';
import type { RunwayParticleKind } from '@/features/today/presentation/runway-palette';
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

function PulseSample({ index = 0 }: Readonly<{ index?: number }>) {
  return <Animated.View style={{ opacity: useAmbientPulse(index) }} testID="pulse" />;
}

function ParticleSample({ kind = 'rain' }: Readonly<{ kind?: RunwayParticleKind }>) {
  return <RunwayParticles color="#ffffff" height={100} kind={kind} width={100} />;
}

afterEach(() => { jest.restoreAllMocks(); mockFocusSubscribers.clear(); });

function nativeLoopSpies() {
  const stop = jest.fn();
  const start = jest.fn();
  jest.spyOn(Animated, 'loop').mockReturnValue({ reset: jest.fn(), start, stop } as unknown as Animated.CompositeAnimation);
  return { start, stop };
}

test.each([
  ['condition symbol', ConditionSample],
  ['ambient pulse', PulseSample],
  ['runway particles', ParticleSample],
] as const)('%s stops on blur or background and resumes when visible', async (_name, Sample) => {
  const appStateSubscribers = new Set<(state: string) => void>();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event, callback) => {
    const subscriber = callback as (state: string) => void;
    appStateSubscribers.add(subscriber);
    return { remove: () => appStateSubscribers.delete(subscriber) } as ReturnType<typeof AppState.addEventListener>;
  }) as typeof AppState.addEventListener);
  const { start: repeat, stop: cancel } = nativeLoopSpies();
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
// the whole window while a screen sat idle or waited. The native driver moves the view alone.
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

test('the ambient pulse breathes on the native driver from its floor, one leg later per index', async () => {
  const timing = jest.spyOn(Animated, 'timing');
  const { moderate } = lightTheme.motion.ambient;
  const result = await render(
    <KuyaraThemeContext.Provider value={lightTheme}><PulseSample index={2} /></KuyaraThemeContext.Provider>,
  );

  const [progress, config] = timing.mock.calls[0];
  expect(config).toMatchObject({ delay: 2 * moderate, duration: 2 * moderate, toValue: 1, useNativeDriver: true });
  expect([0, 0.25, 0.5, 0.75, 1].map((t) => config.easing?.(t))).toEqual([0, 0.5, 1, 0.5, 0]);
  // The breath runs from the floor at rest to 1 at its crest.
  const opacity = () => StyleSheet.flatten(result.getByTestId('pulse').props.style).opacity;
  expect(opacity()).toBe(AMBIENT_PULSE_FLOOR);
  await act(() => { (progress as Animated.Value).setValue(1); });
  expect(opacity()).toBe(1);
  await result.unmount();
});

test.each([
  ['rain', 46, 1],
  ['snow', 34, 1],
  ['wisp', 14, 1],
  ['mote', 24, 2],
] as const)('every %s particle loops on the native driver', async (kind, count, legs) => {
  const timing = jest.spyOn(Animated, 'timing');
  const loop = jest.spyOn(Animated, 'loop');
  const result = await render(
    <KuyaraThemeContext.Provider value={lightTheme}><ParticleSample kind={kind} /></KuyaraThemeContext.Provider>,
  );

  expect(loop).toHaveBeenCalledTimes(count);
  for (const [, config] of timing.mock.calls) expect(config.useNativeDriver).toBe(true);
  const config = timing.mock.calls[0][1];
  // A mote breathes there and back on two eased legs; the others travel one way, linear.
  expect(config.easing?.(0.5)).toBe(legs === 2 ? 1 : 0.5);
  expect(config.easing?.(1)).toBe(legs === 2 ? 0 : 1);
  await result.unmount();
});
