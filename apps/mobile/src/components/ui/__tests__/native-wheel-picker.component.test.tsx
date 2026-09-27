import { fireEvent, render } from '@testing-library/react-native';
import * as React from 'react';
import * as ReactNative from 'react-native';

import { NativeWheelPicker } from '@/components/ui/native-wheel-picker';
import { darkTheme, lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const { Platform } = ReactNative;

const mockSelectionHaptic = jest.fn();

jest.mock('@/components/ui/haptics', () => ({
  haptics: { selection: () => mockSelectionHaptic() },
}));

// `@expo/ui` renders native views that do not mount under Jest (ADR 0019). iOS draws the
// SwiftUI picker, mocked by the shared passthrough; Android keeps the universal `Picker`,
// mocked here with each item as a pressable so the props this wrapper passes stay readable.
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui', () => {
  // `require`, not `requireActual`: the Android registry below must get its own React Native.
  /* eslint-disable @typescript-eslint/no-require-imports -- Resolved per module registry. */
  const MockReact = require('react') as typeof import('react');
  const { Pressable: MockPressable, Text: MockText, View: MockView } =
    require('react-native') as typeof import('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  function Item() { return null; }
  function Picker({ appearance, children, onValueChange, selectedValue, testID }: Readonly<{
    appearance?: string;
    children?: React.ReactNode;
    onValueChange: (value: string) => void;
    selectedValue: string;
    testID?: string;
  }>) {
    const items = MockReact.Children.toArray(children).flatMap((child) =>
      MockReact.isValidElement<{ label: string; value: string }>(child) ? [child.props] : []);
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
    Host: ({ children, colorScheme, style }: Readonly<{
      children?: React.ReactNode;
      colorScheme?: string;
      style?: ReactNative.StyleProp<ReactNative.ViewStyle>;
    }>) =>
      <MockView {...{ colorScheme, style }} testID="wheel-host">{children}</MockView>,
    Picker,
  };
});

// The wrapper resolves its SwiftUI module once, when it is first imported, so the Android
// branch is only reachable by loading it again in a registry whose Platform is Android.
const androidPlatform = Object.create(Platform, {
  OS: { value: 'android' },
  select: { value: (spec: { default: unknown }) => spec.default },
}) as typeof Platform;
const androidReactNative = new Proxy(ReactNative, {
  get: (target, property) => (property === 'Platform' ? androidPlatform : Reflect.get(target, property)),
});

let androidWheel: typeof import('@/components/ui/native-wheel-picker') | undefined;
let androidThemeContext: typeof import('@/theme/theme-context') | undefined;

jest.isolateModules(() => {
  jest.doMock('react', () => React);
  jest.doMock('react-native', () => androidReactNative);
  /* eslint-disable @typescript-eslint/no-require-imports -- A second module registry, not an import. */
  androidThemeContext = require('@/theme/theme-context') as typeof import('@/theme/theme-context');
  androidWheel = require('@/components/ui/native-wheel-picker') as typeof import('@/components/ui/native-wheel-picker');
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.dontMock('react');
jest.dontMock('react-native');

if (!androidWheel || !androidThemeContext) {
  throw new Error('The Android module registry did not load the wheel picker.');
}

const AndroidWheelPicker = androidWheel.NativeWheelPicker;
const AndroidThemeContext = androidThemeContext.KuyaraThemeContext;

const options = [
  { value: 'a', label: '16:15' },
  { value: 'b', label: '16:30' },
] as const;
const label = 'When are you heading out?';

beforeEach(() => {
  mockSelectionHaptic.mockClear();
});

test('draws a native wheel at the rotor height and reports a new selection once', async () => {
  const onSelectionChange = jest.fn();
  const view = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <NativeWheelPicker
        label={label}
        onSelectionChange={onSelectionChange}
        options={options}
        selection="a"
        testID="wheel"
      />
    </KuyaraThemeContext.Provider>,
  );
  const wheel = view.getByTestId('wheel');
  expect(wheel.props.selection).toBe('a');
  expect(wheel.props.modifiers).toContainEqual({ $type: 'pickerStyle', style: 'wheel' });
  expect(wheel.props.options).toEqual([{ label: '16:15', value: 'a' }, { label: '16:30', value: 'b' }]);
  expect(view.getByTestId('wheel-host').props).toMatchObject({ colorScheme: 'light', style: { height: 216 } });

  await fireEvent(wheel, 'selectionChange', 'a');
  expect(onSelectionChange).not.toHaveBeenCalled();
  await fireEvent(wheel, 'selectionChange', 'b');
  expect(onSelectionChange).toHaveBeenCalledWith('b');
  expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
});

// R10-5: VoiceOver read only the chosen time and "adjustable", never what the time is for.
test('names the wheel for VoiceOver without drawing the name', async () => {
  const view = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <NativeWheelPicker label={label} onSelectionChange={jest.fn()} options={options} selection="a" testID="wheel" />
    </KuyaraThemeContext.Provider>,
  );
  const wheel = view.getByTestId('wheel');
  // SwiftUI gives a hidden Picker label to VoiceOver; the host renders no text for it.
  expect(wheel).toHaveAccessibleName(label);
  expect(wheel.props.modifiers).toEqual(expect.arrayContaining([{ $type: 'labelsHidden' }]));
  expect(wheel.props.modifiers).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ $type: 'accessibilityLabel' }),
  ]));
  expect(view.queryByText(label)).toBeNull();
});

test('follows the dark appearance', async () => {
  const view = await render(
    <KuyaraThemeContext.Provider value={darkTheme}>
      <NativeWheelPicker label={label} onSelectionChange={jest.fn()} options={options} selection="a" />
    </KuyaraThemeContext.Provider>,
  );
  expect(view.getByTestId('wheel-host').props.colorScheme).toBe('dark');
});

test('Android keeps the universal wheel, which falls back to the platform dropdown', async () => {
  const onSelectionChange = jest.fn();
  const view = await render(
    <AndroidThemeContext.Provider value={lightTheme}>
      <AndroidWheelPicker
        label={label}
        onSelectionChange={onSelectionChange}
        options={options}
        selection="a"
        testID="wheel"
      />
    </AndroidThemeContext.Provider>,
  );
  expect(view.getByTestId('wheel').props).toMatchObject({ appearance: 'wheel', selectedValue: 'a' });
  expect(view.getByTestId('wheel-host').props).toMatchObject({ colorScheme: 'light', style: { height: 216 } });
  await fireEvent.press(view.getByTestId('item-a'));
  expect(onSelectionChange).not.toHaveBeenCalled();
  await fireEvent.press(view.getByTestId('item-b'));
  expect(onSelectionChange).toHaveBeenCalledWith('b');
  expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
});
