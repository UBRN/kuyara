import { fireEvent, render } from '@testing-library/react-native';
import { SymbolView } from 'expo-symbols';
import { StyleSheet } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { iconNames } from '@/components/ui/icon';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: jest.fn(() => null) }));

const symbols = () => jest.mocked(SymbolView).mock.calls.map(([props]) => props.name);
const fill = (element: Readonly<{ props: Readonly<Record<string, unknown>> }>) => StyleSheet.flatten(element.props.style as never);

afterEach(() => jest.mocked(SymbolView).mockClear());

test('the toggle is a labelled 44-point outlined button whose glyph fills when selected', async () => {
  const onPress = jest.fn();
  const view = (selected: boolean) => (
    <KuyaraThemeContext value={lightTheme}>
      <IconButton accessibilityLabel="I like it" icon="thumbsUp" onPress={onPress} selected={selected}
        selectedIcon="thumbsUpFilled" testID="toggle" />
    </KuyaraThemeContext>
  );
  const result = await render(view(false));
  const toggle = result.getByRole('button', { name: 'I like it' });
  expect(toggle.props.accessibilityState).toMatchObject({ selected: false });
  expect(fill(toggle)).toMatchObject({
    width: 44, height: 44, backgroundColor: 'transparent', borderColor: lightTheme.colors.borderDefined,
  });
  expect(symbols().at(-1)).toBe(iconNames.thumbsUp);
  await fireEvent.press(toggle);
  expect(onPress).toHaveBeenCalledTimes(1);

  await result.rerender(view(true));
  const chosen = result.getByRole('button', { name: 'I like it' });
  expect(chosen.props.accessibilityState).toMatchObject({ selected: true });
  // The neutral interactive surface, never the accent.
  expect(fill(chosen)).toMatchObject({ backgroundColor: lightTheme.colors.surfaceInteractive });
  expect(symbols().at(-1)).toBe(iconNames.thumbsUpFilled);
});

test('without selected it is the tonal circle and carries no selected state', async () => {
  const result = await render(
    <KuyaraThemeContext value={lightTheme}>
      <IconButton accessibilityLabel="Close" icon="thumbsUp" onPress={jest.fn()} />
    </KuyaraThemeContext>,
  );
  const button = result.getByRole('button', { name: 'Close' });
  expect(button.props.accessibilityState.selected).toBeUndefined();
  expect(fill(button)).not.toHaveProperty('borderColor');
});
