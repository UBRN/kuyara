import { act, fireEvent, isHiddenFromAccessibility, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { RollingText } from '@/components/ui';
import { rollFootprintGap, rollScale, rollsUp } from '@/components/ui/rolling-text';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function Providers({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

const hero = (text: string) => (
  <Providers>
    <RollingText tabularNumbers variant="display">{text}</RollingText>
  </Providers>
);
const hidden = { includeHiddenElements: true };
type Landing = (finished: boolean) => void;
type Result = Awaited<ReturnType<typeof render>>;

/** Lays the value out: its width on screen, and its width with nothing constraining it. */
async function layOut(result: Result, text: string, fitted: number, natural = fitted) {
  await fireEvent(result.getByText(text), 'layout', { nativeEvent: { layout: { width: fitted } } });
  await fireEvent(result.getByTestId('rolling-text-measure', hidden), 'layout', {
    nativeEvent: { layout: { width: natural } },
  });
}
const measureNew = (result: Result, width: number) => fireEvent(
  result.getByTestId('rolling-text-measure', hidden), 'layout', { nativeEvent: { layout: { width } } },
);
const clipOf = (result: Result) => StyleSheet.flatten(
  result.getByTestId('rolling-text-clip', hidden).props.style,
) ?? {};
const footprintOf = (result: Result) => StyleSheet.flatten(
  result.getByTestId('rolling-text-frame', hidden).props.style,
) ?? {};

test('a value shown on mount is drawn at rest, as one text', async () => {
  const withTiming = jest.spyOn(Reanimated, 'withTiming');
  const result = await render(hero('14°'));
  await layOut(result, '14°', 100);
  expect(result.getByText('14°')).toBeOnTheScreen();
  expect(result.queryByText('4', hidden)).toBeNull();
  expect(result.queryByTestId('rolling-text-roll', hidden)).toBeNull();
  expect(withTiming).not.toHaveBeenCalled();
  withTiming.mockRestore();
});

test('a changed value rolls only its changed characters once on normal, once the new text is measured', async () => {
  const landings: Landing[] = [];
  const withTiming = jest.spyOn(Reanimated, 'withTiming').mockImplementation(((
    _toValue: number, _config: unknown, callback?: Landing,
  ) => {
    if (callback) landings.push(callback);
    return 0;
  }) as typeof Reanimated.withTiming);
  const result = await render(hero('14°'));
  await layOut(result, '14°', 100);

  await result.rerender(hero('15°'));
  // Until the new text is measured the old one stays, and nothing moves.
  expect(result.getByText('14°')).toBeOnTheScreen();
  expect(withTiming).not.toHaveBeenCalled();

  await measureNew(result, 100);
  expect(withTiming).toHaveBeenCalledTimes(1);
  expect(withTiming).toHaveBeenCalledWith(
    1, expect.objectContaining({ duration: lightTheme.motion.normal }), expect.any(Function),
  );
  // The resting text holds the layout and stays the one the screen reader meets.
  expect(result.getByText('15°')).toBeOnTheScreen();
  // The roll draws the unchanged characters once and the changed cell twice, old and new.
  for (const character of ['4', '5', '1', '°']) {
    const drawn = result.getAllByText(character, hidden);
    expect(drawn).toHaveLength(1);
    expect(isHiddenFromAccessibility(drawn[0])).toBe(true);
  }

  await act(() => landings.forEach((land) => land(true)));
  expect(result.queryByTestId('rolling-text-roll', hidden)).toBeNull();
  expect(result.getByText('15°')).toBeOnTheScreen();
  withTiming.mockRestore();
});

test('a value that loses a digit holds its old width as the roll starts, so the label beside it never sits under it', async () => {
  // Held at the start: the label is where it was, then follows the width down with the roll.
  const withTiming = jest.spyOn(Reanimated, 'withTiming').mockImplementation(
    (() => 0) as unknown as typeof Reanimated.withTiming,
  );
  const result = await render(hero('11.4°'));
  await layOut(result, '11.4°', 150);
  expect(result.queryByTestId('rolling-text-frame', hidden)).toBeNull();

  await result.rerender(hero('8.4°'));
  await measureNew(result, 120);
  // The new text lays out at 120; the footprint keeps the old 150 until the roll moves it.
  expect(footprintOf(result).marginRight).toBe(30);
  // The roll is drawn inside the old width, so the wider old value never reaches the label.
  expect(clipOf(result).width).toBe(150);
  // The old value rolls as one piece, at least as wide as it was, from where it stood.
  expect(result.getByText('11.4°', hidden)).toBeTruthy();
  withTiming.mockRestore();
});

test('a value that gains a digit starts from its old width too, and the gap closes to nothing at rest', async () => {
  const landings: Landing[] = [];
  const withTiming = jest.spyOn(Reanimated, 'withTiming').mockImplementation(((
    _toValue: number, _config: unknown, callback?: Landing,
  ) => {
    if (callback) landings.push(callback);
    return 0;
  }) as typeof Reanimated.withTiming);
  const result = await render(hero('9.4°'));
  await layOut(result, '9.4°', 120);
  await result.rerender(hero('10.4°'));
  await measureNew(result, 150);
  expect(footprintOf(result).marginRight).toBe(-30);
  // The wider new value is drawn inside the width the label has made room for so far.
  expect(clipOf(result).width).toBe(120);

  await act(() => landings.forEach((land) => land(true)));
  // At rest the value is one plain text again, holding only its own width.
  expect(result.queryByTestId('rolling-text-frame', hidden)).toBeNull();
  expect(result.getByText('10.4°')).toBeOnTheScreen();
  withTiming.mockRestore();
});

test('a value that shrank to fit rolls at the size it was drawn at', async () => {
  const withTiming = jest.spyOn(Reanimated, 'withTiming').mockImplementation(
    (() => 0) as unknown as typeof Reanimated.withTiming,
  );
  const result = await render(hero('14°'));
  // Drawn at 80 of its natural 100: the fitted size is four fifths of the role's.
  await layOut(result, '14°', 80, 100);
  await result.rerender(hero('15°'));
  await measureNew(result, 100);
  expect(StyleSheet.flatten(result.getByTestId('rolling-text-roll', hidden).props.style))
    .toMatchObject({ transform: [{ scale: 0.8 }], transformOrigin: 'left top' });
  withTiming.mockRestore();
});

test('the footprint gap and the fitted scale', () => {
  const roll = { fromNatural: 150, fromFitted: 150, toNatural: 120 };
  expect(rollScale(roll)).toBe(1);
  expect(rollFootprintGap({ ...roll, from: '', to: '', up: true, id: 1 })).toBe(30);
  expect(rollScale({ fromNatural: 100, fromFitted: 80 })).toBe(0.8);
  expect(rollScale({ fromNatural: 0, fromFitted: 0 })).toBe(1);
});

test('the same value re-rendered does not roll', async () => {
  const result = await render(hero('14°'));
  const withTiming = jest.spyOn(Reanimated, 'withTiming');
  await result.rerender(hero('14°'));
  expect(withTiming).not.toHaveBeenCalled();
  withTiming.mockRestore();
});

// The roll travels the way the shown number moved, whatever unit or language it is shown in.
test('the roll direction follows the displayed number', () => {
  expect(rollsUp('14°', '15°')).toBe(true);
  expect(rollsUp('15°', '14°')).toBe(false);
  expect(rollsUp('-2,5°', '-4,0°')).toBe(false);
  expect(rollsUp('-4.0°', '-2.5°')).toBe(true);
  expect(rollsUp('\u22122°', '1°')).toBe(true);
  // Celsius 16.3 to Fahrenheit 61.3 is a rise on screen; back again is a fall.
  expect(rollsUp('16.3°', '61.3°')).toBe(true);
  expect(rollsUp('61.3°', '16.3°')).toBe(false);
  expect(rollsUp('', '14°')).toBe(true);
});
