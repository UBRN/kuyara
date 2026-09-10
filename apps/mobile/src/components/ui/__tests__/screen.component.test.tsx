import { render } from '@testing-library/react-native';
import { Platform, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Screen } from '@/components/ui/screen';
import { lightTheme, spacing } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

function renderScreen(contentContainerStyle?: { gap: number }, fill?: boolean) {
  return render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <Screen contentContainerStyle={contentContainerStyle} fill={fill} testID="test-screen">
          <Text>Content</Text>
        </Screen>
      </SafeAreaProvider>
    </KuyaraThemeContext.Provider>,
  );
}

async function flattenedContentStyle(contentContainerStyle?: { gap: number }, fill?: boolean) {
  const result = await renderScreen(contentContainerStyle, fill);
  return StyleSheet.flatten(result.getByTestId('test-screen').props.contentContainerStyle);
}

// On iOS contentInsetAdjustmentBehavior="automatic" supplies the bottom safe area,
// and under native tabs that inset already includes the tab bar (ADR 0027 section 4),
// so Screen adds only its own trailing spacing there.
test('on iOS leaves the bottom safe-area inset to the automatic content inset', async () => {
  const contentStyle = await flattenedContentStyle();

  expect(contentStyle.paddingBottom).toBe(spacing.md);
});

test('keeps the bottom spacing when the caller supplies content layout', async () => {
  const contentStyle = await flattenedContentStyle({ gap: spacing.md });

  expect(contentStyle.gap).toBe(spacing.md);
  expect(contentStyle.paddingBottom).toBe(spacing.md);
});

test('on Android applies the bottom safe-area inset itself', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    const contentStyle = await flattenedContentStyle();

    expect(contentStyle.paddingBottom).toBe(initialMetrics.insets.bottom + spacing.md);
  } finally {
    platform.restore();
  }
});

// The scroll view's frame includes the area under the tab bar, so a container grown to
// that frame leaves slack above the bar once short content is scrolled to its end.
// Screens that centre or bottom-align their content opt in with `fill`.
test('does not grow the content container to the frame unless asked to fill', async () => {
  const contentStyle = await flattenedContentStyle();

  expect(contentStyle.flexGrow).toBeUndefined();
});

test('grows the content container to the frame when the caller asks to fill', async () => {
  const contentStyle = await flattenedContentStyle(undefined, true);

  expect(contentStyle.flexGrow).toBe(1);
});
