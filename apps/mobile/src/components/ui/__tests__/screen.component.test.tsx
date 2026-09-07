import { render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Screen } from '@/components/ui/screen';
import { lightTheme, spacing } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

function renderScreen(contentContainerStyle?: { gap: number }) {
  return render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <Screen contentContainerStyle={contentContainerStyle} testID="test-screen">
          <Text>Content</Text>
        </Screen>
      </SafeAreaProvider>
    </KuyaraThemeContext.Provider>,
  );
}

test('adds the bottom safe-area inset to the screen default spacing', async () => {
  const result = await renderScreen();
  const contentStyle = StyleSheet.flatten(
    result.getByTestId('test-screen').props.contentContainerStyle,
  );

  expect(contentStyle.paddingBottom).toBe(initialMetrics.insets.bottom + spacing.md);
});

test('keeps the bottom inset when the caller supplies content layout', async () => {
  const result = await renderScreen({ gap: spacing.md });
  const contentStyle = StyleSheet.flatten(
    result.getByTestId('test-screen').props.contentContainerStyle,
  );

  expect(contentStyle.gap).toBe(spacing.md);
  expect(contentStyle.paddingBottom).toBe(initialMetrics.insets.bottom + spacing.md);
});
