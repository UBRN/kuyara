import { fireEvent, render } from '@testing-library/react-native';
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

test('the round toggle is a labelled 44-point outlined button whose glyph fills when selected', async () => {
  const onPress = jest.fn();
  const view = (selected: boolean) => (
    <KuyaraThemeContext value={lightTheme}>
      <ToggleChip accessibilityLabel="I like it" icon="thumbsUp" onPress={onPress} selected={selected}
        selectedIcon="thumbsUpFilled" testID="toggle" />
    </KuyaraThemeContext>
  );
  const result = await render(view(false));
  const toggle = result.getByRole('button', { name: 'I like it' });
  expect(toggle.props.accessibilityState).toEqual({ selected: false });
  expect(fill(toggle)).toMatchObject({
    width: 44, height: 44, backgroundColor: 'transparent', borderColor: lightTheme.colors.borderDefined,
  });
  expect(symbols().at(-1)).toBe(iconNames.thumbsUp);
  await fireEvent.press(toggle);
  expect(onPress).toHaveBeenCalledTimes(1);

  await result.rerender(view(true));
  const chosen = result.getByRole('button', { name: 'I like it' });
  expect(chosen.props.accessibilityState).toEqual({ selected: true });
  // The neutral interactive surface, never the accent.
  expect(fill(chosen)).toMatchObject({ backgroundColor: lightTheme.colors.surfaceInteractive });
  expect(symbols().at(-1)).toBe(iconNames.thumbsUpFilled);
});

test('the labelled toggle is named by its label, at least 44 points tall, with a check only when selected', async () => {
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
