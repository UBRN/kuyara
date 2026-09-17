import { fireEvent, render } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { NativePickerRow } from '@/components/ui/native-picker-row';

const mockSelectionHaptic = jest.fn();
const originalWindowDimensions = Dimensions.get('window');

jest.mock('@/components/ui/haptics', () => ({
  haptics: { selection: () => mockSelectionHaptic() },
}));
jest.mock('@expo/ui/swift-ui', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

afterEach(() => {
  mockSelectionHaptic.mockClear();
  Dimensions.set({ window: originalWindowDimensions });
});

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
      systemImage="circle.lefthalf.filled"
      testID="picker"
    />,
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
  expect(row.props.spacing).toBe(8);
  expect(result.getByText('Light').props.modifiers).toEqual([
    { $type: 'font', textStyle: 'body' },
    { $type: 'foregroundStyle', style: { type: 'hierarchical', style: 'secondary' } },
  ]);
  expect(result.getAllByTestId('expo-ui-image').map((image) => image.props.systemName)).toEqual([
    'circle.lefthalf.filled',
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
      systemImage="circle.lefthalf.filled"
      testID="picker"
    />,
  );

  const stackedLabel = result.getByTestId('expo-ui-vstack');
  expect(stackedLabel.props.alignment).toBe('leading');
  expect(stackedLabel.props.spacing).toBe(2);
  expect(result.getByText('Appearance').parent).toBe(stackedLabel);
  expect(result.getByText('Light').parent?.parent).toBe(stackedLabel);
  expect(result.getByTestId('picker')).toHaveAccessibleName('Appearance, Light');
});
