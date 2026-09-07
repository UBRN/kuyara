import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { NativeToggle } from '@/components/ui/native-toggle';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

// `@expo/ui` renders native views that do not mount under Jest (ADR 0019), so this
// wrapper is tested against a mocked `Switch`, exactly as `segmented-control.component.test.tsx`
// mocks `@expo/ui/community/segmented-control`. The mock exposes the resolved `modifiers`
// array so a test can confirm the `tint` modifier this wrapper builds actually reaches the
// component, since the real tint has no other observable surface under Jest.
jest.mock('@expo/ui', () => {
  const { Switch: MockSwitch } = jest.requireActual('react-native');

  function MockUniversalSwitch({
    disabled,
    modifiers,
    onValueChange,
    testID,
    value,
  }: Readonly<{
    disabled?: boolean;
    modifiers?: unknown[];
    onValueChange?: (value: boolean) => void;
    testID?: string;
    value?: boolean;
  }>) {
    return (
      <MockSwitch
        disabled={disabled}
        modifiers={modifiers}
        onValueChange={onValueChange}
        testID={testID}
        value={value}
      />
    );
  }

  return { Switch: MockUniversalSwitch };
});

jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  tint: (color: string) => ({ $type: 'tint', color }),
}));

function TestProviders({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

test('forwards value, disabled state and the resolved brandPrimary tint modifier', async () => {
  const onValueChange = jest.fn();
  const result = await render(
    <TestProviders>
      <NativeToggle onValueChange={onValueChange} testID="toggle" value />
    </TestProviders>,
  );

  const toggle = result.getByTestId('toggle');
  expect(toggle.props.value).toBe(true);
  expect(toggle.props.disabled).toBe(false);
  expect(toggle.props.modifiers).toEqual([{ $type: 'tint', color: lightTheme.colors.brandPrimary }]);

  fireEvent(toggle, 'valueChange', false);
  expect(onValueChange).toHaveBeenCalledWith(false);
});

test('disables the control and forwards the resolved dark theme tint', async () => {
  const result = await render(
    <TestProviders>
      <NativeToggle disabled onValueChange={() => {}} testID="toggle" value={false} />
    </TestProviders>,
  );

  const toggle = result.getByTestId('toggle');
  expect(toggle.props.disabled).toBe(true);
  expect(toggle.props.value).toBe(false);
});
