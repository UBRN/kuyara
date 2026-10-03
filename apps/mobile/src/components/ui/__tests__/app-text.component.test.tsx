import { act, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const originalWindow = Dimensions.get('window');

beforeEach(() => {
  Dimensions.set({ window: { ...originalWindow, fontScale: 1 } });
});

afterEach(() => {
  Dimensions.set({ window: originalWindow });
});

async function changeFontScale(fontScale: number) {
  await act(async () => {
    Dimensions.set({ window: { ...originalWindow, fontScale } });
  });
}

function Heading() {
  return (
    <KuyaraThemeContext.Provider value={lightTheme}>
      <AppText testID="heading" variant="title">Gardırop</AppText>
    </KuyaraThemeContext.Provider>
  );
}

// A text size changed in iOS Settings while kuyara runs keeps a text's old measured frame
// unless the text itself changes, so a heading grown from XXL to the largest standard size
// drew its taller glyphs in the shorter box and lost its descenders. Each text size gets a
// fresh native text, which React Native measures at the new size.
test('a changed text size replaces the native text so it is measured again', async () => {
  await render(<Heading />);
  const before = screen.getByTestId('heading');

  await changeFontScale(1.353);
  const grown = screen.getByTestId('heading');

  expect(grown).not.toBe(before);
  expect(grown).toHaveTextContent('Gardırop');
});

test('a render at the same text size keeps the native text', async () => {
  const result = await render(<Heading />);
  const before = screen.getByTestId('heading');

  await result.rerender(<Heading />);

  expect(screen.getByTestId('heading')).toBe(before);
});
