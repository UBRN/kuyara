import { act, isHiddenFromAccessibility, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { Crossfade } from '@/components/ui';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function Providers({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

const line = (key: string, text: string) => (
  <Providers>
    <Crossfade contentKey={key}>
      <Text testID="line">{text}</Text>
    </Crossfade>
  </Providers>
);
const hidden = { includeHiddenElements: true };

type Landing = (finished: boolean) => void;

test('content there on mount is drawn at rest', async () => {
  const withTiming = jest.spyOn(Reanimated, 'withTiming');
  const result = await render(line('a', 'Rain Ready'));
  expect(result.getByText('Rain Ready')).toBeOnTheScreen();
  expect(withTiming).not.toHaveBeenCalledWith(0, expect.anything(), expect.anything());
  expect(result.getAllByTestId('line', hidden)).toHaveLength(1);
  withTiming.mockRestore();
});

test('a new key fades the old content out on fast, and the new waits for it, then fades in on normal', async () => {
  const landings: Landing[] = [];
  const withDelay = jest.spyOn(Reanimated, 'withDelay').mockImplementation(
    ((_delay: number, animation: unknown) => animation) as typeof Reanimated.withDelay,
  );
  const withTiming = jest.spyOn(Reanimated, 'withTiming').mockImplementation(((
    toValue: number, _config: unknown, callback?: Landing,
  ) => {
    if (callback) landings.push(callback);
    return toValue;
  }) as typeof Reanimated.withTiming);
  const result = await render(line('a', 'Rain Ready'));
  withTiming.mockClear();

  await result.rerender(line('b', 'City Layers'));
  expect(withDelay).toHaveBeenCalledWith(lightTheme.motion.fast, 1);
  expect(withTiming).toHaveBeenCalledWith(1, { duration: lightTheme.motion.normal });
  expect(withTiming).toHaveBeenCalledWith(0, { duration: lightTheme.motion.fast }, expect.any(Function));
  // Both are drawn while they cross; only the new one is in the reading order.
  expect(result.getByText('City Layers')).toBeOnTheScreen();
  const leaving = result.getByText('Rain Ready', hidden);
  expect(isHiddenFromAccessibility(leaving)).toBe(true);
  expect(result.queryByText('Rain Ready')).toBeNull();

  await act(() => landings.forEach((land) => land(true)));
  expect(result.queryByText('Rain Ready', hidden)).toBeNull();
  expect(result.getAllByTestId('line', hidden)).toHaveLength(1);
  withTiming.mockRestore();
  withDelay.mockRestore();
});

test('the same key re-renders in place, and the latest content is what leaves', async () => {
  const withTiming = jest.spyOn(Reanimated, 'withTiming').mockImplementation(
    ((toValue: number) => toValue) as typeof Reanimated.withTiming,
  );
  const result = await render(line('a', 'Choosing for 15:00'));
  await result.rerender(line('a', 'Choosing for 16:00'));
  expect(result.getAllByTestId('line', hidden)).toHaveLength(1);
  expect(result.getByText('Choosing for 16:00')).toBeOnTheScreen();

  await result.rerender(line('b', 'Warm until 20:00'));
  expect(result.getByText('Choosing for 16:00', hidden)).toBeTruthy();
  expect(result.queryByText('Choosing for 15:00', hidden)).toBeNull();
  withTiming.mockRestore();
});
