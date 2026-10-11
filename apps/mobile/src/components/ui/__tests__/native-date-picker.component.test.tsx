import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NativeDatePicker } from '@/components/ui/native-date-picker';
import type { SupportedLanguage } from '@/localization/messages';
import { lightTheme, spacing } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';
import { mockFontScale } from '../../../../test/font-scale';

// The native identifiers of the one English convention (en-GB) and of Turkish; a bare `en` draws
// the US month-first, Sunday-first picker.
const nativeLocale = { en: 'en_GB', tr: 'tr_TR' } as const;

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

afterEach(() => {
  Dimensions.set({ window: originalWindowDimensions });
});

async function renderPicker(
  language: SupportedLanguage,
  options: Readonly<{
    initialSelection?: string;
    standalone?: boolean;
    value?: string | null;
    wheel?: boolean;
  }> = {},
) {
  return render(
    <TestProviders>
      <NativeDatePicker
        accessibilityLabel="Doğum tarihi"
        initialSelection={options.initialSelection}
        language={language}
        maximumDate={new Date(2026, 8, 9, 12)}
        minimumDate={new Date(1900, 0, 1, 12)}
        onChange={jest.fn()}
        standalone={options.standalone ?? true}
        testID="birth-date"
        value={options.value ?? null}
        wheel={options.wheel}
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
      { $type: 'environment', key: 'locale', value: nativeLocale[language] },
      { $type: 'tint', color: lightTheme.colors.brandPrimary },
    ]);
    await standalone.unmount();

    // Inside a native list the system draws the row, so only the locale is pushed.
    const listed = await renderPicker(language, { standalone: false });
    expect(listed.getByTestId('birth-date').props.modifiers).toEqual([
      { $type: 'environment', key: 'locale', value: nativeLocale[language] },
    ]);
    expect(listed.queryByTestId('expo-ui-host')).toBeNull();
  },
);

test.each([
  [1, 48],
  [1.5, 72],
])('at fontScale %s the standalone picker keeps its native label in one %s-point row', async (
  fontScale,
  height,
) => {
  mockFontScale(fontScale);
  const result = await renderPicker('tr');

  expect(StyleSheet.flatten(result.getByTestId('expo-ui-host').props.style))
    .toMatchObject({ height });
  expect(result.getByTestId('birth-date').props.modifiers).toEqual([
    { $type: 'environment', key: 'locale', value: nativeLocale.tr },
    { $type: 'tint', color: lightTheme.colors.brandPrimary },
  ]);
  expect(result.queryByText('Doğum tarihi', { includeHiddenElements: true })).toBeNull();
  expect(result.getByTestId('birth-date').props.accessibilityLabel).toBe('Doğum tarihi');
});

test('above fontScale 1.5 the standalone title stacks above a single-row picker', async () => {
  mockFontScale(3);
  const result = await renderPicker('tr');

  expect(StyleSheet.flatten(result.getByTestId('expo-ui-host').props.style))
    .toMatchObject({ height: 96 });
  expect(result.getByTestId('birth-date').props.modifiers).toEqual([
    { $type: 'environment', key: 'locale', value: nativeLocale.tr },
    { $type: 'labelsHidden' },
    { $type: 'tint', color: lightTheme.colors.brandPrimary },
  ]);
  expect(result.getByTestId('birth-date').props.accessibilityLabel).toBe('Doğum tarihi');
  const visualTitle = result.getByText('Doğum tarihi', { includeHiddenElements: true });
  expect(visualTitle).toHaveProp('accessibilityElementsHidden', true);
  expect(visualTitle).toHaveProp('importantForAccessibility', 'no-hide-descendants');
  expect(StyleSheet.flatten(visualTitle.props.style)).toMatchObject({ marginBottom: spacing.sm });
});

test('the list-mounted picker keeps the native row at accessibility sizes', async () => {
  mockFontScale(3);
  const result = await renderPicker('tr', { standalone: false });

  expect(result.getByTestId('birth-date').props.modifiers).toEqual([
    { $type: 'environment', key: 'locale', value: nativeLocale.tr },
  ]);
  expect(result.queryByText('Doğum tarihi', { includeHiddenElements: true })).toBeNull();
  expect(result.queryByTestId('expo-ui-host')).toBeNull();
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

test('the picker offers only dates between the minimum and the maximum', async () => {
  mockFontScale(1);
  const result = await renderPicker('en');
  const { start, end } = result.getByTestId('birth-date').props.range;

  expect(start.getFullYear()).toBe(1900);
  expect(end.getFullYear()).toBe(2026);
});

// An unset value is not today: the caller names where the picker opens, and nothing is stored
// until the person turns it (the native view reports only a changed date).
test('an unset value opens at the caller\'s initial selection, and a set value wins over it', async () => {
  mockFontScale(1);
  const unset = await renderPicker('en', { initialSelection: '2001-01-01' });
  expect(unset.getByTestId('birth-date').props.accessibilityValue.text).toContain('2001-01-01');
  await unset.unmount();

  const set = await renderPicker('en', { initialSelection: '2001-01-01', value: '1994-03-14' });
  expect(set.getByTestId('birth-date').props.accessibilityValue.text).toContain('1994-03-14');
});

// The wheel shows the whole date at once, so a far year is a flick away; its label is the
// caller's own visible text, so the native one is hidden at every text size.
test.each([1, 3])('at fontScale %s the wheel style hides its native label in a wheel-tall host', async (fontScale) => {
  mockFontScale(fontScale);
  const standalone = await renderPicker('tr', { wheel: true });
  expect(standalone.getByTestId('birth-date').props.modifiers).toEqual([
    { $type: 'environment', key: 'locale', value: nativeLocale.tr },
    { $type: 'datePickerStyle', style: 'wheel' },
    { $type: 'labelsHidden' },
    { $type: 'tint', color: lightTheme.colors.brandPrimary },
  ]);
  expect(StyleSheet.flatten(standalone.getByTestId('expo-ui-host').props.style)).toMatchObject({ height: 216 });
  expect(standalone.queryByText('Doğum tarihi', { includeHiddenElements: true })).toBeNull();
  expect(standalone.getByTestId('birth-date').props.accessibilityLabel).toBe('Doğum tarihi');
  await standalone.unmount();

  const listed = await renderPicker('tr', { standalone: false, wheel: true });
  expect(listed.getByTestId('birth-date').props.modifiers).toEqual([
    { $type: 'environment', key: 'locale', value: nativeLocale.tr },
    { $type: 'datePickerStyle', style: 'wheel' },
    { $type: 'labelsHidden' },
  ]);
});
