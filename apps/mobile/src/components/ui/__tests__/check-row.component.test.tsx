import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

import { CheckRow } from '@/components/ui/check-row';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

async function renderRow(props: Partial<Parameters<typeof CheckRow>[0]> = {}) {
  const onPress = jest.fn();
  const result = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <CheckRow checked={false} label="Sweater" leading={<View testID="art" />} onPress={onPress}
        supportingText="Top" testID="row" {...props} />
    </KuyaraThemeContext.Provider>,
  );
  return { result, onPress, row: result.getByTestId('row') };
}

test('a checkbox row speaks its words and its state, and a press toggles it', async () => {
  const { result, onPress, row } = await renderRow();
  expect(row.props.accessibilityRole).toBe('checkbox');
  expect(row.props.accessibilityLabel).toBe('Sweater, Top');
  expect(row.props.accessibilityState).toEqual({ checked: false, disabled: false });
  expect(result.getByTestId('art')).toBeTruthy();
  expect(result.getByTestId('row-unchecked')).toBeTruthy();
  await fireEvent.press(row);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('a checked row shows the filled check', async () => {
  const { result, row } = await renderRow({ checked: true });
  expect(row.props.accessibilityState.checked).toBe(true);
  expect(result.getByTestId('row-checked')).toBeTruthy();
});

test('an unavailable row says so, keeps its words and ignores a press', async () => {
  const { onPress, row } = await renderRow({ accessibilityHint: 'Three pieces are chosen.', unavailable: true });
  expect(row.props.accessibilityState).toEqual({ checked: false, disabled: true });
  expect(row.props.accessibilityHint).toBe('Three pieces are chosen.');
  expect(StyleSheet.flatten(row.props.style).opacity).toBe(lightTheme.interaction.disabledOpacity);
  await fireEvent.press(row);
  expect(onPress).not.toHaveBeenCalled();
});
