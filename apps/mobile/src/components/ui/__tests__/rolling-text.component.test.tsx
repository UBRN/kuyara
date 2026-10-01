import { act, isHiddenFromAccessibility, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import * as Reanimated from 'react-native-reanimated';

import { RollingText } from '@/components/ui';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function Providers({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

const hero = (text: string, value: number) => (
  <Providers>
    <RollingText tabularNumbers value={value} variant="display">{text}</RollingText>
  </Providers>
);
const hidden = { includeHiddenElements: true };
type Landing = (finished: boolean) => void;

test('a value shown on mount is drawn at rest, as one text', async () => {
  const withTiming = jest.spyOn(Reanimated, 'withTiming');
  const result = await render(hero('14°', 14));
  expect(result.getByText('14°')).toBeOnTheScreen();
  expect(result.queryByText('4', hidden)).toBeNull();
  expect(withTiming).not.toHaveBeenCalled();
  withTiming.mockRestore();
});

test('a changed value rolls only its changed characters once on normal, then rests as one text again', async () => {
  const landings: Landing[] = [];
  const withTiming = jest.spyOn(Reanimated, 'withTiming').mockImplementation(((
    toValue: number, _config: unknown, callback?: Landing,
  ) => {
    if (callback) landings.push(callback);
    return toValue;
  }) as typeof Reanimated.withTiming);
  const result = await render(hero('14°', 14));

  await result.rerender(hero('15°', 15));
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
  expect(result.queryByText('5', hidden)).toBeNull();
  expect(result.getByText('15°')).toBeOnTheScreen();
  withTiming.mockRestore();
});

test('a value that gains a digit rolls whole, from where it stood', async () => {
  const withTiming = jest.spyOn(Reanimated, 'withTiming').mockImplementation(
    ((toValue: number) => toValue) as typeof Reanimated.withTiming,
  );
  const result = await render(hero('9°', 9));
  await result.rerender(hero('10°', 10));
  expect(result.getByText('9°', hidden)).toBeTruthy();
  expect(result.getAllByText('10°', hidden)).toHaveLength(2);
  withTiming.mockRestore();
});

test('the same value re-rendered does not roll', async () => {
  const result = await render(hero('14°', 14));
  const withTiming = jest.spyOn(Reanimated, 'withTiming');
  await result.rerender(hero('14°', 14));
  expect(withTiming).not.toHaveBeenCalled();
  withTiming.mockRestore();
});
