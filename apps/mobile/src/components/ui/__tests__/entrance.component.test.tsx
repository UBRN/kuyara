import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { Entrance } from '@/components/ui/entrance';
import { lightTheme, spacing } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function Providers({ children }: PropsWithChildren) {
  return (
    <KuyaraThemeContext.Provider value={lightTheme}>
      {children}
    </KuyaraThemeContext.Provider>
  );
}

test('renders its children and starts them below their resting position', async () => {
  // The test mock lands every spring at once; hold the landing to read the first frame.
  const withSpring = jest.spyOn(Reanimated, 'withSpring').mockImplementation((toValue) => toValue);
  const result = await render(
    <Providers>
      <Entrance index={1}>
        <Text>Other options</Text>
      </Entrance>
    </Providers>,
  );

  result.getByText('Other options');

  const style = StyleSheet.flatten(result.toJSON()!.props.style);
  expect(style.opacity).toBe(0);
  expect(style.transform).toEqual([{ translateY: spacing.md }]);
  withSpring.mockRestore();
});

// Once landed, React itself holds the resting style, so a re-render after Reanimated
// dropped its settled props (a JS stall 1 to 2 s after the last frame) cannot commit the
// zero-opacity start again.
test('a landed entrance leaves no zero-opacity start in the props React commits', async () => {
  const result = await render(
    <Providers>
      <Entrance index={1}>
        <Text>Other options</Text>
      </Entrance>
    </Providers>,
  );

  const style = StyleSheet.flatten(result.toJSON()!.props.style) ?? {};
  expect(style.opacity ?? 1).toBe(1);
  expect(style.transform ?? []).toEqual([]);
});
