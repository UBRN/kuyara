import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NativeDatePicker } from '@/components/ui/native-date-picker';
import type { SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
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
  options: Readonly<{ standalone?: boolean; value?: string | null }> = {},
) {
  return render(
    <TestProviders>
      <NativeDatePicker
        accessibilityLabel="Doğum tarihi"
        initialSelection="2001-01-01"
        language={language}
        maximumDate={new Date(2026, 8, 9, 12)}
        minimumDate={new Date(1900, 0, 1, 12)}
        onChange={jest.fn()}
        standalone={options.standalone ?? true}
        testID="birth-date"
        value={options.value ?? null}
      />
    </TestProviders>,
  );
}

// The wheel shows the whole date at once, so a far year is a flick away; its label is the
// caller's own visible text, so the native one is hidden at every text size, and the picker
// follows the app language rather than the device locale.
test.each([
  ['tr', 1],
  ['en', 3],
] as const)('the %s wheel at fontScale %s hides its native label in a wheel-tall host', async (language, fontScale) => {
  mockFontScale(fontScale);
  const standalone = await renderPicker(language);
  expect(standalone.getByTestId('birth-date').props.modifiers).toEqual([
    { $type: 'environment', key: 'locale', value: nativeLocale[language] },
    { $type: 'datePickerStyle', style: 'wheel' },
    { $type: 'labelsHidden' },
    { $type: 'tint', color: lightTheme.colors.brandPrimary },
  ]);
  expect(StyleSheet.flatten(standalone.getByTestId('expo-ui-host').props.style)).toMatchObject({ height: 216 });
  expect(standalone.queryByText('Doğum tarihi', { includeHiddenElements: true })).toBeNull();
  expect(standalone.getByTestId('birth-date').props.accessibilityLabel).toBe('Doğum tarihi');
  await standalone.unmount();

  // Inside a native list the list's host holds it, and the system tints it.
  const listed = await renderPicker(language, { standalone: false });
  expect(listed.getByTestId('birth-date').props.modifiers).toEqual([
    { $type: 'environment', key: 'locale', value: nativeLocale[language] },
    { $type: 'datePickerStyle', style: 'wheel' },
    { $type: 'labelsHidden' },
  ]);
  expect(listed.queryByTestId('expo-ui-host')).toBeNull();
});

// An unset value is not today: the caller names where the picker opens, and nothing is stored
// until the person turns it (the iOS view reports only a changed date).
test('an unset value opens at the caller\'s initial selection, and a set value wins over it', async () => {
  mockFontScale(1);
  const unset = await renderPicker('tr');
  expect(unset.getByTestId('birth-date').props.accessibilityValue.text).toContain('2001-01-01');
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

// Compose's picker reports the date it opens on as soon as it is drawn, and its dates are UTC
// midnights. The date it already shows is not a choice, so Add stores nothing unturned; a turned
// date is read on the UTC calendar, so it never lands a day early west of UTC.
test('on Android the date the picker opens on is not stored, and a turned date keeps its calendar day', async () => {
  const props: { current: { initialDate?: string; onDateSelected?: (date: Date) => void } } = { current: {} };
  const onChange = jest.fn();
  // The wrapper picks its platform's picker when it loads, so it loads afresh as Android, with
  // its theme context from the same fresh registry and the one React the renderer runs.
  let renderAndroid: () => Promise<unknown> = async () => undefined;
  const react = jest.requireActual<typeof import('react')>('react');
  jest.isolateModules(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
    // One React for the hooks the fresh modules call and the renderer that runs them.
    jest.doMock('react', () => react);
    jest.doMock('@expo/ui/jetpack-compose', () => ({
      DateTimePicker: (received: typeof props.current) => {
        props.current = received;
        return null;
      },
    }));
    const { NativeDatePicker: AndroidPicker } = jest.requireActual<typeof import('@/components/ui/native-date-picker')>(
      '@/components/ui/native-date-picker');
    const { KuyaraThemeContext: Theme } = jest.requireActual<typeof import('@/theme/theme-context')>('@/theme/theme-context');
    renderAndroid = () => render(
      <Theme.Provider value={lightTheme}>
        <AndroidPicker
          accessibilityLabel="Doğum tarihi"
          initialSelection="2001-01-01"
          language="tr"
          maximumDate={new Date(2026, 8, 9, 12)}
          minimumDate={new Date(1900, 0, 1, 12)}
          onChange={onChange}
          testID="birth-date"
          value={null}
        />
      </Theme.Provider>,
    );
  });
  await renderAndroid();
  jest.restoreAllMocks();
  expect(props.current.initialDate).toBe('2001-01-01T00:00:00.000Z');
  props.current.onDateSelected?.(new Date(Date.UTC(2001, 0, 1)));
  expect(onChange).not.toHaveBeenCalled();
  props.current.onDateSelected?.(new Date(Date.UTC(1994, 2, 14)));
  expect(onChange).toHaveBeenCalledWith('1994-03-14');
});
