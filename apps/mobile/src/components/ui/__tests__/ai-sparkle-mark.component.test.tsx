import { act, isHiddenFromAccessibility, render } from '@testing-library/react-native';
import { SymbolView } from 'expo-symbols';
import { Platform, processColor, StyleSheet } from 'react-native';
import { withSequence } from 'react-native-reanimated';
import type { PropsWithChildren } from 'react';

import { AiSparkleMark, sparkleTwinkleInterval } from '@/components/ui/ai-sparkle-mark';
import { darkTheme, lightTheme, type KuyaraTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: jest.fn(() => null) }));
jest.mock('react-native-reanimated', () => {
  const reanimated = jest.requireActual('react-native-reanimated/mock');
  return { ...reanimated, withSequence: jest.fn(reanimated.withSequence) };
});

const sequences = withSequence as unknown as jest.Mock;
const hidden = { includeHiddenElements: true };
// The appear ends after two stagger steps and one arrival spring; the first twinkle follows.
const appearEnd = lightTheme.motion.stagger * 2 + lightTheme.springs.arrival.duration;
// One twinkle eases scale and turn on each of the three stars.
const perTwinkle = 6;

function withTheme(theme: KuyaraTheme) {
  return function Providers({ children }: PropsWithChildren) {
    return <KuyaraThemeContext.Provider value={theme}>{children}</KuyaraThemeContext.Provider>;
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  sequences.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
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

test('twinkles once after the appear, then every six seconds, and stops on unmount', async () => {
  const result = await render(<AiSparkleMark color="#000000" size={16} />, { wrapper: withTheme(lightTheme) });
  expect(sequences).not.toHaveBeenCalled();

  await act(async () => { jest.advanceTimersByTime(appearEnd); });
  expect(sequences).toHaveBeenCalledTimes(perTwinkle);

  await act(async () => { jest.advanceTimersByTime(sparkleTwinkleInterval - 1); });
  expect(sequences).toHaveBeenCalledTimes(perTwinkle);
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(sequences).toHaveBeenCalledTimes(perTwinkle * 2);

  await result.unmount();
  jest.advanceTimersByTime(sparkleTwinkleInterval * 3);
  expect(sequences).toHaveBeenCalledTimes(perTwinkle * 2);
});

test('the Settings row mark waits to be seen, plays its appear once and never twinkles', async () => {
  const result = await render(
    <AiSparkleMark color="#000000" play={false} repeats={false} size={16} />,
    { wrapper: withTheme(lightTheme) },
  );
  await act(async () => { jest.advanceTimersByTime(appearEnd + sparkleTwinkleInterval * 3); });
  expect(sequences).not.toHaveBeenCalled();

  await result.rerender(<AiSparkleMark color="#000000" play repeats={false} size={16} />);
  expect(result.getByTestId('ai-sparkle-mark', hidden)).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(appearEnd + sparkleTwinkleInterval * 3); });
  expect(sequences).not.toHaveBeenCalled();
});

test('Android keeps the Material glyph in the badge ink and schedules nothing', async () => {
  const os = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  try {
    const result = await render(<AiSparkleMark color="#123456" size={16} />, { wrapper: withTheme(lightTheme) });

    expect(result.queryByTestId('ai-sparkle-mark', hidden)).toBeNull();
    expect((SymbolView as unknown as jest.Mock).mock.calls.at(-1)?.[0]).toMatchObject({
      name: expect.objectContaining({ android: 'auto_awesome' }),
      tintColor: '#123456',
    });
    await act(async () => { jest.advanceTimersByTime(appearEnd + sparkleTwinkleInterval); });
    expect(sequences).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  }
});
