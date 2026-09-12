import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';

import { PressScale } from '@/components/ui/press-scale';
import { createKuyaraTheme, lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const reducedMotionTheme = createKuyaraTheme('light', true);

function Providers({ children, reduceMotion = false }: PropsWithChildren<{ reduceMotion?: boolean }>) {
  return (
    <KuyaraThemeContext.Provider value={reduceMotion ? reducedMotionTheme : lightTheme}>
      {children}
    </KuyaraThemeContext.Provider>
  );
}

test('renders its children and forwards the press', async () => {
  const onPress = jest.fn();

  const { getByTestId, getByText } = await render(
    <Providers>
      <PressScale onPress={onPress} testID="press-target">
        <Text>Open detail</Text>
      </PressScale>
    </Providers>,
  );

  getByText('Open detail');
  fireEvent.press(getByTestId('press-target'));

  expect(onPress).toHaveBeenCalledTimes(1);
});

// Law 7's first hard rule: motion is never the only indication of a state change, so the
// pressed state has to reach both the style callback and the children callback whether or
// not the scale animation runs. The scale itself is a shared value and the Reanimated test
// mock rebuilds shared values on every render, so its value is not observable here.
test.each([
  ['standard motion', false],
  ['Reduce Motion', true],
])('keeps the pressed state visible without motion under %s', async (_name, reduceMotion) => {
  const { getByTestId, getByText } = await render(
    <Providers reduceMotion={reduceMotion}>
      <PressScale style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })} testID="press-target">
        {({ pressed }) => <Text>{pressed ? 'pressed' : 'resting'}</Text>}
      </PressScale>
    </Providers>,
  );

  const target = getByTestId('press-target');
  expect(StyleSheet.flatten(target.props.style).opacity).toBe(1);

  fireEvent(target, 'pressIn');
  await waitFor(() => {
    expect(StyleSheet.flatten(getByTestId('press-target').props.style).opacity).toBe(0.6);
  });
  getByText('pressed');

  fireEvent(target, 'pressOut');
  await waitFor(() => {
    expect(StyleSheet.flatten(getByTestId('press-target').props.style).opacity).toBe(1);
  });
  getByText('resting');
});
