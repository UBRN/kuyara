import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { TextButton } from '@/components/ui/text-button';
import { lightTheme, typography } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

test('a text button looks like a caption but is a labelled button with a 44-point target', async () => {
  const onPress = jest.fn();
  const { getByTestId, getByText } = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <TextButton label="Not now" onPress={onPress} testID="link" />
    </KuyaraThemeContext.Provider>,
  );

  const link = getByTestId('link');
  expect(link.props.accessibilityRole).toBe('button');
  expect(link.props.accessibilityLabel).toBe('Not now');
  expect(StyleSheet.flatten(link.props.style)).toMatchObject({ minHeight: 44, minWidth: 44 });
  expect(getByText('Not now', { includeHiddenElements: true })).toHaveStyle({
    fontSize: typography.caption.fontSize, color: lightTheme.colors.textSecondary,
  });

  await fireEvent.press(link);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('a disabled text button ignores presses and says so', async () => {
  const onPress = jest.fn();
  const { getByTestId } = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <TextButton disabled label="Not now" onPress={onPress} testID="link" />
    </KuyaraThemeContext.Provider>,
  );

  await fireEvent.press(getByTestId('link'));
  expect(onPress).not.toHaveBeenCalled();
  expect(getByTestId('link').props.accessibilityState).toMatchObject({ disabled: true });
});

test('a link text button is drawn in the brand ink, underlined, with the same button target', async () => {
  const { getByTestId, getByText } = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <TextButton accessibilityState={{ expanded: false }} label="Read the text" link onPress={jest.fn()} testID="link" />
    </KuyaraThemeContext.Provider>,
  );
  const link = getByTestId('link');
  expect(link.props.accessibilityRole).toBe('button');
  expect(link.props.accessibilityState).toMatchObject({ expanded: false });
  expect(StyleSheet.flatten(link.props.style)).toMatchObject({ minHeight: 44, minWidth: 44 });
  expect(getByText('Read the text', { includeHiddenElements: true })).toHaveStyle({
    fontSize: typography.caption.fontSize, color: lightTheme.colors.brandPrimary, textDecorationLine: 'underline',
  });
});
