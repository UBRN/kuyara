import { act, render } from '@testing-library/react-native';
import { Platform, StyleSheet, View } from 'react-native';

import { COLOR_WELL_TOUCH_SCALE, NativeColorWell } from '@/components/ui/native-color-well';
import { layout, lightTheme } from '@/theme/theme';
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
        testID="well" value={null} {...props}>
        <View testID="well-face" />
      </NativeColorWell>
    </KuyaraThemeContext.Provider>
  );
}

const modifier = (node: { props: Record<string, unknown> }, type: string) =>
  (node.props.modifiers as Record<string, unknown>[]).find((entry) => entry.$type === type);

// O8 follow-up 1: the whole 44-point slot takes the touch, and the caller's drawing sits
// centred over it.
test('the well is a 44-point target with its face centred over the native picker', async () => {
  const result = await render(well());
  expect(StyleSheet.flatten(result.getByTestId('well').props.style)).toMatchObject({
    height: layout.minimumTouchTarget, width: layout.minimumTouchTarget,
  });
  const picker = result.getByTestId('well-picker', hidden);
  // SwiftUI's 28-point well, scaled to cover the slot.
  expect(28 * (modifier(picker, 'scaleEffect')!.scale as number)).toBeGreaterThanOrEqual(layout.minimumTouchTarget);
  expect(COLOR_WELL_TOUCH_SCALE * 28).toBeGreaterThanOrEqual(layout.minimumTouchTarget);
  expect(result.getByTestId('well-face', hidden)).toBeOnTheScreen();
});

// O8 follow-up 4: one radio in the palette's set with one name; the native control is not a
// second element, and an empty well speaks no value.
test('the well is one named radio, and the native picker is hidden from assistive technology', async () => {
  const result = await render(well());
  expect(result.getAllByLabelText('More colors')).toHaveLength(1);
  const radio = result.getByRole('radio', { name: 'More colors' });
  expect(radio.props.testID).toBe('well');
  expect(radio.props.accessibilityState).toEqual({ disabled: false, selected: false });
  expect(radio.props.accessibilityValue).toBeUndefined();
  expect(result.getByTestId('well-picker', hidden)).toHaveProp('accessibilityElementsHidden', true);
  expect(result.queryAllByRole('button')).toHaveLength(0);
});

// O8 follow-up 2 and 3: a chosen custom colour is the picker's selection with the swatches'
// ring; once another option is chosen the well is empty again and keeps no old colour.
test('a chosen custom colour is selected, and the well empties when it is no longer the choice', async () => {
  const onChange = jest.fn();
  const result = await render(well({ onChange }));
  const picker = result.getByTestId('well-picker', hidden);
  expect(picker).toHaveProp('supportsOpacity', false);
  await act(() => picker.props.onSelectionChange('#3c8d2f'));
  await act(() => picker.props.onSelectionChange('#3C8D2F80'));
  await act(() => picker.props.onSelectionChange(''));
  expect(onChange.mock.calls).toEqual([['#3C8D2F']]);

  await result.rerender(well({ onChange, selected: true, value: '#3C8D2F', accessibilityValue: 'Green' }));
  expect(result.getByRole('radio', { name: 'More colors' }).props.accessibilityState.selected).toBe(true);
  expect(result.getByRole('radio', { name: 'More colors' })).toHaveAccessibilityValue({ text: 'Green' });
  expect(result.getByTestId('well-picker', hidden)).toHaveProp('selection', '#3C8D2F');
  // Law 1: selection is the accent ring, never a fill.
  expect(StyleSheet.flatten(result.getByTestId('well-ring', hidden).props.style))
    .toMatchObject({ borderColor: lightTheme.colors.brandAccent });

  await result.rerender(well({ onChange, selected: false, value: null }));
  expect(result.getByTestId('well-picker', hidden)).toHaveProp('selection', null);
  expect(result.getByRole('radio', { name: 'More colors' }).props.accessibilityValue).toBeUndefined();
  expect(StyleSheet.flatten(result.getByTestId('well-ring', hidden).props.style))
    .toMatchObject({ borderColor: 'transparent' });
});

test('a disabled well is disabled natively and for assistive technology', async () => {
  const result = await render(well({ disabled: true }));
  expect(result.getByRole('radio', { name: 'More colors' }).props.accessibilityState.disabled).toBe(true);
  expect(modifier(result.getByTestId('well-picker', hidden), 'disabled')).toBeDefined();
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
