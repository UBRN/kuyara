import { fireEvent, render } from '@testing-library/react-native';
import * as React from 'react';
import * as ReactNative from 'react-native';

import { NativePickerRow } from '@/components/ui/native-picker-row';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const { Alert, Dimensions, Platform } = ReactNative;
const mockSelectionHaptic = jest.fn();
const originalWindowDimensions = Dimensions.get('window');

jest.mock('@/components/ui/haptics', () => ({
  haptics: { selection: () => mockSelectionHaptic() },
}));
jest.mock('@expo/ui', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

// The row resolves its SwiftUI module once, when it is first imported, so the Android branch
// is only reachable by loading the row again in a registry whose Platform is Android. React and
// React Native stay the single copies the renderer already uses; only Platform differs there.
const androidPlatform = Object.create(Platform, {
  OS: { value: 'android' },
  select: { value: (spec: { default: unknown }) => spec.default },
}) as typeof Platform;
const androidReactNative = new Proxy(ReactNative, {
  get: (target, property) => (property === 'Platform' ? androidPlatform : Reflect.get(target, property)),
});

let androidRow: typeof import('@/components/ui/native-picker-row') | undefined;
let androidThemeContext: typeof import('@/theme/theme-context') | undefined;

jest.isolateModules(() => {
  jest.doMock('react', () => React);
  jest.doMock('react-native', () => androidReactNative);
  /* eslint-disable @typescript-eslint/no-require-imports -- A second module registry, not an import. */
  androidThemeContext = require('@/theme/theme-context') as typeof import('@/theme/theme-context');
  androidRow = require('@/components/ui/native-picker-row') as typeof import('@/components/ui/native-picker-row');
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.dontMock('react');
jest.dontMock('react-native');

if (!androidRow || !androidThemeContext) {
  throw new Error('The Android module registry did not load the picker row.');
}

const AndroidPickerRow = androidRow.NativePickerRow;
const AndroidThemeContext = androidThemeContext.KuyaraThemeContext;

afterEach(() => {
  mockSelectionHaptic.mockClear();
  Dimensions.set({ window: originalWindowDimensions });
});

function ThemeWrapper({ children }: Readonly<{ children: React.ReactNode }>) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

function mockFontScale(fontScale: number) {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale } });
}

test('the full-width menu row renders the native picker options and changes selection once', async () => {
  mockFontScale(1);
  const onSelectionChange = jest.fn();
  const result = await render(
    <NativePickerRow
      label="Appearance"
      onSelectionChange={onSelectionChange}
      options={[
        { label: 'System', value: 'system' },
        { label: 'Light', value: 'light' },
        { label: 'Dark', value: 'dark' },
      ]}
      selection="light"
      icon="theme"
      testID="picker"
    />,
    { wrapper: ThemeWrapper },
  );

  const menu = result.getByTestId('picker');
  // The row speaks label and value as one string, the way the NativeListRow rows beside it do.
  // A separate accessibility value would reach the tree as the element's text on its own.
  expect(menu).toHaveAccessibleName('Appearance, Light');
  expect(menu.props.modifiers).toEqual([
    { $type: 'accessibilityLabel', label: 'Appearance, Light' },
    { $type: 'menuIndicator', visibility: 'hidden' },
  ]);

  const row = result.getAllByTestId('expo-ui-hstack')[0];
  expect(row.props.modifiers).toEqual([
    { $type: 'frame', maxWidth: Infinity, alignment: 'leading' },
  ]);
  // ListItem's own leading spacing, so the label starts where every tiled row's does.
  expect(row.props.spacing).toBe(12);
  // O14 anatomy A: the label reads in the system label ink, never the Menu's tint.
  expect(result.getByText('Appearance').props.modifiers).toEqual([
    { $type: 'foregroundStyle', style: ReactNative.PlatformColor('label') },
  ]);
  // The 28-point tile, drawn in SwiftUI with ListRowTile's geometry, fill and ink.
  expect(result.getByTestId('picker-tile').props.modifiers).toEqual([
    { $type: 'font', size: 20 },
    { $type: 'foregroundStyle', style: lightTheme.colors.textPrimary },
    { $type: 'frame', width: 28, height: 28 },
    {
      $type: 'background',
      style: 'rgba(20, 47, 59, 0.08)',
      shape: { shape: 'roundedRectangle', cornerRadius: 7 },
    },
    { $type: 'accessibilityHidden', hidden: true },
  ]);
  expect(result.getByText('Light').props.modifiers).toEqual([
    { $type: 'font', textStyle: 'body' },
    { $type: 'foregroundStyle', style: { type: 'hierarchical', style: 'secondary' } },
  ]);
  expect(result.getByTestId('picker-tile').props.systemName).toBe('circle.lefthalf.filled');
  expect(result.getAllByTestId('expo-ui-image').map((image) => image.props.systemName)).toEqual([
    'chevron.up.chevron.down',
  ]);
  expect(result.queryByTestId('expo-ui-vstack')).toBeNull();

  const picker = result.getByTestId('expo-ui-picker');
  expect(picker.props.selection).toBe('light');
  expect(picker.props.modifiers).toEqual([
    { $type: 'pickerStyle', style: 'inline' },
    { $type: 'labelsHidden' },
  ]);
  expect(picker.props.options).toEqual([
    { label: 'System', value: 'system' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
  ]);

  await fireEvent(picker, 'selectionChange', 'light');
  expect(onSelectionChange).not.toHaveBeenCalled();
  expect(mockSelectionHaptic).not.toHaveBeenCalled();

  await fireEvent(picker, 'selectionChange', 'dark');
  expect(onSelectionChange).toHaveBeenCalledWith('dark');
  expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
});

test('a disabled menu row ignores picker changes', async () => {
  const onSelectionChange = jest.fn();
  const result = await render(
    <NativePickerRow
      disabled
      label="Language"
      onSelectionChange={onSelectionChange}
      options={[
        { label: 'System', value: 'system' },
        { label: 'English', value: 'en' },
      ]}
      selection="system"
      testID="picker"
    />,
    { wrapper: ThemeWrapper },
  );

  const menu = result.getByTestId('picker');
  expect(menu).toBeDisabled();
  expect(menu).toHaveAccessibleName('Language, System');
  expect(menu.props.modifiers).toEqual([
    { $type: 'accessibilityLabel', label: 'Language, System' },
    { $type: 'menuIndicator', visibility: 'hidden' },
    { $type: 'disabled', disabled: true },
  ]);
  const picker = result.getByTestId('expo-ui-picker');
  await fireEvent(picker, 'selectionChange', 'en');
  expect(onSelectionChange).not.toHaveBeenCalled();
  expect(mockSelectionHaptic).not.toHaveBeenCalled();
});

test('at accessibility text size the value and menu indicator stack under the label', async () => {
  mockFontScale(3.118);

  const result = await render(
    <NativePickerRow
      label="Appearance"
      onSelectionChange={() => {}}
      options={[
        { label: 'System', value: 'system' },
        { label: 'Light', value: 'light' },
      ]}
      selection="light"
      icon="theme"
      testID="picker"
    />,
    { wrapper: ThemeWrapper },
  );

  const stackedLabel = result.getByTestId('expo-ui-vstack');
  expect(stackedLabel.props.alignment).toBe('leading');
  expect(stackedLabel.props.spacing).toBe(2);
  expect(result.getByText('Appearance').parent).toBe(stackedLabel);
  expect(result.getByText('Light').parent?.parent).toBe(stackedLabel);
  expect(result.getByTestId('picker')).toHaveAccessibleName('Appearance, Light');
});

test('on Android the row opens an alert that carries every option', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const onSelectionChange = jest.fn();
  const result = await render(
    <AndroidThemeContext.Provider value={lightTheme}>
      <AndroidPickerRow
        label="Appearance"
        onSelectionChange={onSelectionChange}
        options={[
          { label: 'System', value: 'system' },
          { label: 'Light', value: 'light' },
          { label: 'Dark', value: 'dark' },
        ]}
        selection="light"
        testID="picker"
      />
    </AndroidThemeContext.Provider>,
  );

  // Android has no SwiftUI menu: the row is a list row and the options live in the alert.
  expect(result.queryByTestId('expo-ui-picker')).toBeNull();
  await fireEvent.press(result.getByTestId('picker'));

  const [title, message, buttons] = alert.mock.calls[0];
  expect(title).toBe('Appearance');
  expect(message).toBeUndefined();
  expect(buttons?.map((button) => button.text)).toEqual(['System', 'Light', 'Dark']);

  buttons?.[1]?.onPress?.();
  expect(onSelectionChange).not.toHaveBeenCalled();
  expect(mockSelectionHaptic).not.toHaveBeenCalled();

  buttons?.[2]?.onPress?.();
  expect(onSelectionChange).toHaveBeenCalledWith('dark');
  expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);

  alert.mockRestore();
});
