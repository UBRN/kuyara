import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { makeMutable } from 'react-native-reanimated';

import { ScrollDepth } from '@/components/ui';
import { DEPTH_INERT_SHARE, DEPTH_SCALE, DEPTH_TRAVEL } from '@/components/ui/scroll-depth';

const header = (offset: number) => (
  <ScrollDepth scrollOffset={makeMutable(offset)}>
    <Text>Weather</Text>
  </ScrollDepth>
);
const styleOf = (result: Awaited<ReturnType<typeof render>>) => StyleSheet.flatten(result.root!.props.style);

test('at the top, and in a pull past it, the header is at rest', async () => {
  for (const offset of [0, -80]) {
    const result = await render(header(offset));
    await fireEvent(result.root!, 'layout', { nativeEvent: { layout: { height: 40 } } });
    expect(styleOf(result)).toMatchObject({
      opacity: 1,
      transform: [{ translateY: 0 }, { scale: 1 }],
    });
  }
});

test('the header recedes over its own height and holds there once it has', async () => {
  for (const [offset, share] of [[20, 0.5], [40, 1], [400, 1]] as const) {
    const result = await render(header(offset));
    await fireEvent(result.root!, 'layout', { nativeEvent: { layout: { height: 40 } } });
    expect(styleOf(result)).toMatchObject({
      opacity: 1 - share,
      transform: [{ translateY: 40 * share * DEPTH_TRAVEL }, { scale: 1 - (1 - DEPTH_SCALE) * share }],
    });
  }
});

test('the header carries no accessibility node of its own', async () => {
  const result = await render(header(0));
  expect(result.root!.props.accessible).toBeUndefined();
  expect(result.getByText('Weather')).toBeOnTheScreen();
});

test('a header that has all but faded takes no touches, and takes them again at rest', async () => {
  for (const [offset, pointerEvents] of [
    [0, 'auto'], [20, 'auto'], [40 * DEPTH_INERT_SHARE - 1, 'auto'], [40 * DEPTH_INERT_SHARE, 'none'], [400, 'none'],
  ] as const) {
    const result = await render(header(offset));
    await fireEvent(result.root!, 'layout', { nativeEvent: { layout: { height: 40 } } });
    expect(styleOf(result)).toMatchObject({ pointerEvents });
  }
});
