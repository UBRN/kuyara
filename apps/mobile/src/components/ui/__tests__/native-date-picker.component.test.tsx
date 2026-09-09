import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NativeDatePicker } from '@/components/ui/native-date-picker';
import type { SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

function TestProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 59, right: 0, bottom: 34, left: 0 },
      }}>
      <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>
    </SafeAreaProvider>
  );
}

const originalWindowDimensions = Dimensions.get('window');

function mockFontScale(fontScale: number) {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale } });
}

afterEach(() => {
  Dimensions.set({ window: originalWindowDimensions });
});

async function renderPicker(
  language: SupportedLanguage,
  options: Readonly<{ standalone?: boolean; value?: string | null }> = {},
) {
  return render(
    <TestProviders>
      <NativeDatePicker
        accessibilityLabel="Doğum tarihi"
        language={language}
        maximumDate={new Date(2026, 8, 9, 12)}
        onChange={jest.fn()}
        standalone={options.standalone ?? true}
        testID="birth-date"
        value={options.value ?? null}
      />
    </TestProviders>,
  );
}

test.each(['tr', 'en'] as const)(
  'the picker follows the app language %s rather than the device locale',
  async (language) => {
    mockFontScale(1);
    const standalone = await renderPicker(language);

    expect(standalone.getByTestId('birth-date').props.modifiers).toEqual([
      { $type: 'environment', key: 'locale', value: language },
      { $type: 'lineLimit', limit: undefined },
      { $type: 'tint', color: lightTheme.colors.brandPrimary },
    ]);
    await standalone.unmount();

    // Inside a native list the system draws the row, so only the locale is pushed.
    const listed = await renderPicker(language, { standalone: false });
    expect(listed.getByTestId('birth-date').props.modifiers).toEqual([
      { $type: 'environment', key: 'locale', value: language },
    ]);
    expect(listed.queryByTestId('expo-ui-host')).toBeNull();
  },
);

test.each([
  [1, 48],
  [1.5, 72],
  [3, 192],
])('at fontScale %s the standalone row reserves %s points for a wrapping title', async (
  fontScale,
  height,
) => {
  mockFontScale(fontScale);
  const result = await renderPicker('tr');

  expect(StyleSheet.flatten(result.getByTestId('expo-ui-host').props.style))
    .toMatchObject({ height });
  // The title is never truncated to fit one line, and it stays the accessibility name.
  expect(result.getByTestId('birth-date').props.modifiers).toContainEqual({
    $type: 'lineLimit',
    limit: undefined,
  });
  expect(result.getByTestId('birth-date').props.accessibilityLabel).toBe('Doğum tarihi');
});

test('an unset value starts the picker at the maximum date and keeps the ISO contract', async () => {
  mockFontScale(1);
  const unset = await renderPicker('tr');
  expect(unset.getByTestId('birth-date').props.accessibilityValue.text)
    .toContain('2026-09-09');
  await unset.unmount();

  const set = await renderPicker('en', { value: '1994-03-14' });
  expect(set.getByTestId('birth-date').props.accessibilityValue.text).toContain('1994-03-14');
});
