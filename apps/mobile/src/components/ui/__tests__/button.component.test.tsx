import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { ButtonPair } from '@/components/ui/button-pair';
import { haptics } from '@/components/ui/haptics';
import { lightTheme, radii } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/ui/haptics', () => ({ haptics: { impactLight: jest.fn() } }));

const originalWindow = Dimensions.get('window');

function Providers({ children }: PropsWithChildren) {
  return (
    <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>
  );
}

afterEach(() => {
  Dimensions.set({ window: originalWindow });
  jest.clearAllMocks();
});

test('a pressed button steps its fill and never drops its opacity', async () => {
  const { getByTestId } = await render(
    <Providers>
      <Button label="Continue" onPress={jest.fn()} testID="button" />
    </Providers>,
  );

  const resting = StyleSheet.flatten(getByTestId('button').props.style);
  expect(resting).toMatchObject({
    backgroundColor: lightTheme.colors.primaryFill,
    borderRadius: radii.pill,
  });
  expect(resting.opacity).toBeUndefined();

  await fireEvent(getByTestId('button'), 'pressIn');
  await waitFor(() => {
    const pressed = StyleSheet.flatten(getByTestId('button').props.style);
    expect(pressed.backgroundColor).toBe(lightTheme.colors.primaryFillPressed);
    expect(pressed.opacity).toBeUndefined();
  });
});

test('only the prominent role confirms its own press with a haptic (Law 8)', async () => {
  const { getByTestId } = await render(
    <Providers>
      <Button label="Continue" onPress={jest.fn()} testID="prominent" />
      <Button label="Not now" onPress={jest.fn()} testID="plain" variant="plain" />
      <Button label="Ask again" onPress={jest.fn()} testID="tonal" variant="tonal" />
    </Providers>,
  );

  await fireEvent(getByTestId('plain'), 'pressIn');
  await fireEvent(getByTestId('tonal'), 'pressIn');
  expect(haptics.impactLight).not.toHaveBeenCalled();
  await fireEvent(getByTestId('prominent'), 'pressIn');
  expect(haptics.impactLight).toHaveBeenCalledTimes(1);
});

test('loading keeps the label, shows the spinner in the leading slot and reports busy', async () => {
  const onPress = jest.fn();
  const { getByTestId, getByText, toJSON } = await render(
    <Providers>
      <Button icon="refresh" label="Refresh" loading onPress={onPress} testID="button" />
    </Providers>,
  );

  const button = getByTestId('button');
  expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  expect(getByText('Refresh', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(JSON.stringify(toJSON())).toContain('"type":"ActivityIndicator"');
  // Loading is not disabled: the fill stays the role's own.
  expect(StyleSheet.flatten(button.props.style).backgroundColor)
    .toBe(lightTheme.colors.primaryFill);
  await fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
});

test('disabled is the muted fill with the defined-border ink', async () => {
  const { getByTestId, getByText } = await render(
    <Providers>
      <Button disabled label="Continue" onPress={jest.fn()} testID="button" />
    </Providers>,
  );

  expect(StyleSheet.flatten(getByTestId('button').props.style).backgroundColor)
    .toBe(lightTheme.colors.surfaceMuted);
  expect(getByText('Continue', { includeHiddenElements: true }))
    .toHaveStyle({ color: lightTheme.colors.borderDefined });
  expect(getByTestId('button').props.accessibilityState).toMatchObject({ disabled: true });
});

test.each([
  [1, 'row', ['back', 'continue']],
  [1.3, 'column', ['continue', 'back']],
] as const)('at text factor %s a trailing pair lays out as a %s', async (fontScale, direction, order) => {
  Dimensions.set({ window: { ...originalWindow, fontScale } });
  const { getByTestId } = await render(
    <Providers>
      <ButtonPair
        primary={<Button label="Continue" onPress={jest.fn()} testID="continue" />}
        secondary={<Button label="Back" onPress={jest.fn()} testID="back" variant="plain" />}
        testID="pair"
      />
    </Providers>,
  );

  const pair = getByTestId('pair');
  expect(StyleSheet.flatten(pair.props.style).flexDirection).toBe(direction);
  expect(pair.props.children.map((child: { props: { testID: string } }) => child.props.testID))
    .toEqual(order);
});
