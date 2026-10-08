import { render } from '@testing-library/react-native';
import { SymbolView } from 'expo-symbols';
import { StyleSheet } from 'react-native';

import { iconNames } from '@/components/ui/icon';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: jest.fn(() => null) }));

const symbols = () => jest.mocked(SymbolView).mock.calls.map(([props]) => props.name);
const fill = (element: Readonly<{ props: Readonly<Record<string, unknown>> }>) => StyleSheet.flatten(element.props.style as never);

afterEach(() => jest.mocked(SymbolView).mockClear());

test('the toggle is named by its label, at least 44 points tall, with a check only when selected', async () => {
  const view = (selected: boolean) => (
    <KuyaraThemeContext value={lightTheme}>
      <ToggleChip label="Not my style" onPress={jest.fn()} selected={selected} />
    </KuyaraThemeContext>
  );
  const result = await render(view(false));
  const chip = result.getByRole('button', { name: 'Not my style' });
  expect(chip.props.accessibilityState).toEqual({ selected: false });
  expect(fill(chip)).toMatchObject({ minHeight: 44, borderColor: lightTheme.colors.borderDefined });
  expect(symbols()).toEqual([]);

  await result.rerender(view(true));
  expect(result.getByRole('button', { name: 'Not my style' }).props.accessibilityState).toEqual({ selected: true });
  expect(symbols().at(-1)).toBe(iconNames.check);
});
