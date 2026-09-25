import { fireEvent, render } from '@testing-library/react-native';

import { haptics } from '@/components/ui/haptics';
import { NativeWheelPicker } from '@/components/ui/native-wheel-picker';
import { darkTheme, lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@/components/ui/haptics', () => ({
  haptics: { selection: jest.fn() },
}));

// `@expo/ui` renders native views that do not mount under Jest (ADR 0019), so the wrapper is
// tested against a mocked universal `Host` and `Picker`: each item is a pressable, and the
// props this wrapper passes down stay readable.
jest.mock('@expo/ui', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Pressable: MockPressable, Text: MockText, View: MockView } = jest.requireActual('react-native');
  function Item() { return null; }
  function Picker({ appearance, children, onValueChange, selectedValue, testID }: Readonly<{
    appearance?: string;
    children?: React.ReactNode;
    onValueChange: (value: string) => void;
    selectedValue: string;
    testID?: string;
  }>) {
    const items = React.Children.toArray(children).flatMap((child) =>
      React.isValidElement<{ label: string; value: string }>(child) ? [child.props] : []);
    return (
      <MockView {...{ appearance, selectedValue }} testID={testID}>
        {items.map((item) => (
          <MockPressable key={item.value} onPress={() => onValueChange(item.value)} testID={`item-${item.value}`}>
            <MockText>{item.label}</MockText>
          </MockPressable>
        ))}
      </MockView>
    );
  }
  Picker.Item = Item;
  return {
    Host: ({ children, colorScheme, style }: Readonly<{ children?: React.ReactNode; colorScheme?: string; style?: unknown }>) =>
      <MockView {...{ colorScheme, style }} testID="wheel-host">{children}</MockView>,
    Picker,
  };
});

const options = [
  { value: 'a', label: '16:15' },
  { value: 'b', label: '16:30' },
] as const;

test('draws a native wheel at the rotor height and reports a new selection once', async () => {
  const onSelectionChange = jest.fn();
  const view = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <NativeWheelPicker onSelectionChange={onSelectionChange} options={options} selection="a" testID="wheel" />
    </KuyaraThemeContext.Provider>,
  );
  expect(view.getByTestId('wheel').props).toMatchObject({ appearance: 'wheel', selectedValue: 'a' });
  expect(view.getByTestId('wheel-host').props).toMatchObject({ colorScheme: 'light', style: { height: 216 } });
  expect(view.getByText('16:30')).toBeOnTheScreen();

  await fireEvent.press(view.getByTestId('item-a'));
  expect(onSelectionChange).not.toHaveBeenCalled();
  await fireEvent.press(view.getByTestId('item-b'));
  expect(onSelectionChange).toHaveBeenCalledWith('b');
  expect(haptics.selection).toHaveBeenCalledTimes(1);
});

test('follows the dark appearance', async () => {
  const view = await render(
    <KuyaraThemeContext.Provider value={darkTheme}>
      <NativeWheelPicker onSelectionChange={jest.fn()} options={options} selection="a" />
    </KuyaraThemeContext.Provider>,
  );
  expect(view.getByTestId('wheel-host').props.colorScheme).toBe('dark');
});
