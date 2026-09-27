import { act, render } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { NativeColorWell } from '@/components/ui/native-color-well';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const hidden = { includeHiddenElements: true };

function well(props: Partial<React.ComponentProps<typeof NativeColorWell>> = {}) {
  return (
    <KuyaraThemeContext.Provider value={lightTheme}>
      <NativeColorWell accessibilityLabel="More colors" onChange={jest.fn()} selected={false}
        testID="well" value={null} {...props} />
    </KuyaraThemeContext.Provider>
  );
}

// O8, HIG Color wells: the SwiftUI colour picker, named, with the selected trait while a
// custom colour is chosen, reporting an uppercase #RRGGBB and nothing else.
test('the iOS well speaks its name and selection and reports an uppercase hex', async () => {
  const onChange = jest.fn();
  const result = await render(well({ onChange }));
  const picker = result.getByTestId('well-picker');
  expect(picker).toHaveProp('accessibilityLabel', 'More colors');
  expect(picker.props.accessibilityState.selected).toBe(false);
  expect(picker).toHaveProp('supportsOpacity', false);
  expect(picker).toHaveProp('selection', null);

  await act(() => picker.props.onSelectionChange('#3c8d2f'));
  await act(() => picker.props.onSelectionChange('#3C8D2F80'));
  await act(() => picker.props.onSelectionChange(''));
  expect(onChange.mock.calls).toEqual([['#3C8D2F']]);

  await result.rerender(well({ onChange, selected: true, value: '#3C8D2F', accessibilityValue: 'Green' }));
  const chosen = result.getByTestId('well-picker');
  expect(chosen.props.accessibilityState.selected).toBe(true);
  expect(chosen).toHaveAccessibilityValue({ text: 'Green' });
  expect(chosen).toHaveProp('selection', '#3C8D2F');
  // Law 1: selection is the accent ring, never a fill.
  const ring = result.getByTestId('well').children.at(-1) as unknown as { props: { style: unknown } };
  expect(StyleSheet.flatten(ring.props.style as never)).toMatchObject({ borderColor: lightTheme.colors.brandAccent });
});

test('a disabled well is disabled natively', async () => {
  const result = await render(well({ disabled: true }));
  expect(result.getByTestId('well-picker').props.accessibilityState.disabled).toBe(true);
});

// Android has no system colour well in this build: nothing is drawn and nothing breaks.
test('Android draws no well', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    const result = await render(well());
    expect(result.queryByTestId('well', hidden)).toBeNull();
  } finally {
    platform.restore();
  }
});
