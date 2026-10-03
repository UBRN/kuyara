import { act, fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { Presence } from '@/components/ui';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function Providers({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

const block = (visible: boolean) => (
  <Providers>
    <Presence testID="presence" visible={visible}>
      <Text>Rain at 15:00</Text>
    </Presence>
  </Providers>
);
const hidden = { includeHiddenElements: true };

test('a block hidden before it was ever measured leaves the tree, and returns with the block', async () => {
  const result = await render(block(true));
  expect(result.getByText('Rain at 15:00', hidden)).toBeTruthy();

  await result.rerender(block(false));
  expect(result.queryByText('Rain at 15:00', hidden)).toBeNull();

  await result.rerender(block(true));
  expect(result.getByText('Rain at 15:00', hidden)).toBeTruthy();
});

test('a block that mounts shown, hides before it is measured and shows again enters text after container', async () => {
  // Hold the spring open and land it by hand: the text may fade in only once the container has.
  const springs: ((finished: boolean) => void)[] = [];
  const withSpring = jest.spyOn(Reanimated, 'withSpring').mockImplementation(((
    toValue: number, _config: unknown, callback?: (finished: boolean) => void,
  ) => {
    if (callback) springs.push(callback);
    return toValue;
  }) as never);
  const withTiming = jest.spyOn(Reanimated, 'withTiming').mockImplementation(((toValue: number) => toValue) as never);
  try {
    const result = await render(block(true));
    await result.rerender(block(false));
    await result.rerender(block(true));
    await fireEvent(result.getByText('Rain at 15:00', hidden).parent!, 'layout',
      { nativeEvent: { layout: { height: 20 } } });
    // The container opens first: nothing fades the text in yet.
    expect(springs).toHaveLength(1);
    expect(withTiming).not.toHaveBeenCalled();
    // Once it has opened, the text follows on `fast`.
    await act(() => springs[0](true));
    expect(withTiming).toHaveBeenCalledWith(1, { duration: lightTheme.motion.fast, easing: expect.anything() });
  } finally {
    withSpring.mockRestore();
    withTiming.mockRestore();
  }
});
