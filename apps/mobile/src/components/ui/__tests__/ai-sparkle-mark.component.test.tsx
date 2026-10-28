import { act, isHiddenFromAccessibility, render } from '@testing-library/react-native';
import { SymbolView } from 'expo-symbols';
import { Animated, AppState, Platform, processColor, StyleSheet } from 'react-native';
import type { PropsWithChildren } from 'react';

import { AiSparkleMark, sparkleTwinkleInterval } from '@/components/ui/ai-sparkle-mark';
import { darkTheme, lightTheme, type KuyaraTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: jest.fn(() => null) }));
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

const hidden = { includeHiddenElements: true };
// The appear ends after two stagger steps and one arrival spring; the first twinkle follows.
const appearEnd = lightTheme.motion.stagger * 2 + lightTheme.springs.arrival.duration;
const leg = lightTheme.motion.ambient.intense;

function withTheme(theme: KuyaraTheme) {
  return function Providers({ children }: PropsWithChildren) {
    return <KuyaraThemeContext.Provider value={theme}>{children}</KuyaraThemeContext.Provider>;
  };
}

function appStateEvents() {
  const subscribers = new Set<(state: string) => void>();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event, callback) => {
    const subscriber = callback as (state: string) => void;
    subscribers.add(subscriber);
    return { remove: () => subscribers.delete(subscriber) } as ReturnType<typeof AppState.addEventListener>;
  }) as typeof AppState.addEventListener);
  return (state: string) => subscribers.forEach((subscriber) => subscriber(state));
}

function loopSpies() {
  const start = jest.fn();
  const stop = jest.fn();
  jest.spyOn(Animated, 'loop').mockReturnValue({ reset: jest.fn(), start, stop } as unknown as Animated.CompositeAnimation);
  return { start, stop };
}

afterEach(() => {
  jest.restoreAllMocks();
  mockFocusSubscribers.clear();
});

test.each([lightTheme, darkTheme])('draws three separately inked stars, hidden from the reader', async (theme) => {
  const result = await render(<AiSparkleMark color="#000000" size={16} />, { wrapper: withTheme(theme) });

  const mark = result.getByTestId('ai-sparkle-mark', hidden);
  expect(isHiddenFromAccessibility(mark)).toBe(true);
  expect(StyleSheet.flatten(mark.props.style)).toMatchObject({ height: 16, width: 16 });
  // The drawn star paths, read as painted: one ink each, never the badge ink it was handed.
  const inks = result.container.queryAll((node) => typeof node.props.d === 'string'
    && typeof node.props.fill === 'object' && node.props.fill !== null)
    .map((node) => (node.props.fill as { payload: unknown }).payload);
  expect(inks).toHaveLength(3);
  expect(new Set(inks).size).toBe(3);
  expect(inks).not.toContain(processColor('#000000'));
  expect(SymbolView).not.toHaveBeenCalled();
});

// A Reanimated loop commits the shadow tree on every frame; the native driver moves the stars
// alone. Each star twinkles once in every interval, small, middle, large, half a leg apart.
test('twinkles on the native driver once after the appear, then every six seconds', async () => {
  const timing = jest.spyOn(Animated, 'timing');
  const loop = jest.spyOn(Animated, 'loop');
  const result = await render(<AiSparkleMark color="#000000" size={16} />, { wrapper: withTheme(lightTheme) });

  expect(loop).toHaveBeenCalledTimes(3);
  // Stars are drawn large, middle, small; the cascade starts with the small one.
  timing.mock.calls.forEach(([, config], index) => {
    expect(config).toMatchObject({
      delay: appearEnd, duration: sparkleTwinkleInterval, toValue: 1, useNativeDriver: true,
    });
    const start = (2 - index) * (leg / 2);
    const at = (ms: number) => config.easing?.(ms / sparkleTwinkleInterval);
    expect(at(0)).toBe(0);
    expect(at(start)).toBe(0);
    expect(at(start + leg / 4)).toBeCloseTo(0.5);
    expect(at(start + leg / 2)).toBeCloseTo(1);
    expect(at(start + leg)).toBe(0);
    expect(at(sparkleTwinkleInterval)).toBe(0);
  });
  await result.unmount();
});

test('the twinkle stops on blur or background and resumes when Today is seen again', async () => {
  const appState = appStateEvents();
  const { start, stop } = loopSpies();
  const result = await render(<AiSparkleMark color="#000000" size={16} />, { wrapper: withTheme(lightTheme) });
  expect(start).toHaveBeenCalledTimes(3);

  await act(() => { mockFocusSubscribers.forEach((subscriber) => subscriber(false)); });
  expect(stop).toHaveBeenCalledTimes(3);
  start.mockClear();
  await act(() => {
    appState('background');
    mockFocusSubscribers.forEach((subscriber) => subscriber(true));
  });
  expect(start).not.toHaveBeenCalled();

  await act(() => { appState('active'); });
  expect(start).toHaveBeenCalledTimes(3);
  stop.mockClear();
  await act(() => { appState('background'); });
  expect(stop).toHaveBeenCalledTimes(3);
  await act(() => { appState('active'); });
  stop.mockClear();
  await result.unmount();
  expect(stop).toHaveBeenCalledTimes(3);
});

test('the Settings row mark waits to be seen, plays its appear once and never twinkles', async () => {
  const { start } = loopSpies();
  const result = await render(
    <AiSparkleMark color="#000000" play={false} repeats={false} size={16} />,
    { wrapper: withTheme(lightTheme) },
  );
  await result.rerender(<AiSparkleMark color="#000000" play repeats={false} size={16} />);
  expect(result.getByTestId('ai-sparkle-mark', hidden)).toBeTruthy();
  expect(start).not.toHaveBeenCalled();
});

test('Android keeps the Material glyph in the badge ink and schedules nothing', async () => {
  const os = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  try {
    const { start } = loopSpies();
    const result = await render(<AiSparkleMark color="#123456" size={16} />, { wrapper: withTheme(lightTheme) });

    expect(result.queryByTestId('ai-sparkle-mark', hidden)).toBeNull();
    expect((SymbolView as unknown as jest.Mock).mock.calls.at(-1)?.[0]).toMatchObject({
      name: expect.objectContaining({ android: 'auto_awesome' }),
      tintColor: '#123456',
    });
    expect(start).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  }
});
