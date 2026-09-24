import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';

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
});
