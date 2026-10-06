import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ColorWellFace } from '@/garment-art';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const hidden = { includeHiddenElements: true };

const face = (hex: string | null) => (
  <KuyaraThemeContext.Provider value={lightTheme}>
    <ColorWellFace hex={hex} testID="well" />
  </KuyaraThemeContext.Provider>
);

// O8 follow-up 1: the well is drawn at the swatch discs' 36 points. A chosen custom colour
// is a checked disc; an empty well is the multicolour ring.
test('a chosen custom colour is a checked disc at the swatch size', async () => {
  const result = await render(face('#3C8D2F'));
  expect(StyleSheet.flatten(result.getByTestId('well-disc', hidden).props.style)).toMatchObject({ height: 36, width: 36 });
  expect(result.getByTestId('well-disc-check', hidden)).toBeOnTheScreen();
  expect(result.queryByTestId('well-mark', hidden)).toBeNull();
});

test('an empty well is the ring at the swatch size, with no disc or check', async () => {
  const result = await render(face(null));
  expect(StyleSheet.flatten(result.getByTestId('well-mark', hidden).props.style)).toMatchObject({ height: 36, width: 36 });
  expect(result.queryByTestId('well-disc', hidden)).toBeNull();
  expect(result.queryByTestId('well-disc-check', hidden)).toBeNull();
});
