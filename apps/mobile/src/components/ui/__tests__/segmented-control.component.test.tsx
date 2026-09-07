import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { darkTheme, lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@/components/ui/haptics', () => ({
  haptics: { selection: jest.fn() },
}));

// `@expo/ui` renders native views that do not mount under Jest (ADR 0019), so the
// wrapper is tested against a mocked module, exactly as `primary-tabs.tsx`'s test mocks
// `expo-router/unstable-native-tabs`. The mock exposes each segment as a pressable so a
// test can both read the props this wrapper passed down and simulate a native change
// event coming back up through `onChange`.
jest.mock('@expo/ui/community/segmented-control', () => {
  const { Pressable: MockPressable, View: MockView } = jest.requireActual('react-native');

  function MockSegmentedControl({
    appearance,
    enabled,
    onChange,
    selectedIndex,
    style,
    testID,
    tintColor,
    values,
  }: Readonly<{
    appearance?: string;
    enabled?: boolean;
    onChange?: (event: { nativeEvent: { selectedSegmentIndex: number; value: string } }) => void;
    selectedIndex?: number;
    style?: unknown;
    testID?: string;
    tintColor?: string;
    values?: string[];
  }>) {
    return (
      <MockView appearance={appearance} style={style} testID={testID} tintColor={tintColor}>
        {(values ?? []).map((label, index) => (
          <MockPressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !enabled, selected: index === selectedIndex }}
            key={label}
            onPress={() =>
              onChange?.({ nativeEvent: { selectedSegmentIndex: index, value: label } })
            }
            testID={testID ? `${testID}-segment-${index}` : undefined}
          />
        ))}
      </MockView>
    );
  }

  return { SegmentedControl: MockSegmentedControl };
});

function TestProviders({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

function DarkTestProviders({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={darkTheme}>{children}</KuyaraThemeContext.Provider>;
}

const options = [
  { label: 'Owned', value: 'owned' },
  { label: 'Wanted', value: 'wanted' },
] as const;

test('resolves the selected segment from value and forwards the resolved theme and brand tint', async () => {
  const result = await render(
    <TestProviders>
      <SegmentedControl onChange={() => {}} options={options} testID="control" value="wanted" />
    </TestProviders>,
  );

  const control = result.getByTestId('control');
  expect(control.props.appearance).toBe('light');
  expect(control.props.tintColor).toBe(lightTheme.colors.brandPrimary);
  expect(StyleSheet.flatten(control.props.style).height).toBe(44);
  expect(
    result.getByTestId('control-segment-1').props.accessibilityState.selected,
  ).toBe(true);
  expect(
    result.getByTestId('control-segment-0').props.accessibilityState.selected,
  ).toBe(false);
});

test('follows the resolved dark theme rather than the device appearance', async () => {
  const result = await render(
    <DarkTestProviders>
      <SegmentedControl onChange={() => {}} options={options} testID="control" value="owned" />
    </DarkTestProviders>,
  );

  expect(result.getByTestId('control').props.appearance).toBe('dark');
  expect(result.getByTestId('control').props.tintColor).toBe(darkTheme.colors.brandPrimary);
});

test('fires the selection haptic and reports the new value only on an actual change', async () => {
  const haptics = jest.requireMock('@/components/ui/haptics') as { haptics: { selection: jest.Mock } };
  const onChange = jest.fn();
  const result = await render(
    <TestProviders>
      <SegmentedControl onChange={onChange} options={options} testID="control" value="owned" />
    </TestProviders>,
  );

  await fireEvent.press(result.getByTestId('control-segment-0'));
  expect(onChange).not.toHaveBeenCalled();
  expect(haptics.haptics.selection).not.toHaveBeenCalled();

  await fireEvent.press(result.getByTestId('control-segment-1'));
  expect(onChange).toHaveBeenCalledWith('wanted');
  expect(haptics.haptics.selection).toHaveBeenCalledTimes(1);
});
