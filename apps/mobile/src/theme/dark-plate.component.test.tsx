import { render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { ChoiceTile } from '@/garment-art';
import { DarkPlate } from '@/theme/plate-theme';
import { darkTheme, lightSemanticColors, lightTheme, type KuyaraTheme } from '@/theme/theme';
import { KuyaraThemeContext, useKuyaraTheme } from '@/theme/theme-context';

function Ink() {
  return <Text testID="ink">{useKuyaraTheme().colors.textPrimary}</Text>;
}

const within = (theme: KuyaraTheme, children: React.ReactNode) => (
  <KuyaraThemeContext.Provider value={theme}>{children}</KuyaraThemeContext.Provider>
);

// A drawing that stands straight on the page or a card in light gets the garment plate in
// dark, and what stands on it takes the light roles; the light appearance renders no wrapper.
test('DarkPlate draws the garment plate only in the dark appearance', async () => {
  const dark = await render(within(darkTheme, <DarkPlate style={{ padding: 4 }} testID="plate"><Ink /></DarkPlate>));
  expect(StyleSheet.flatten(dark.getByTestId('plate').props.style))
    .toMatchObject({ backgroundColor: darkTheme.colors.garmentTile, padding: 4 });
  expect(dark.getByTestId('ink').props.children).toBe(lightSemanticColors.textPrimary);

  const light = await render(within(lightTheme, <DarkPlate style={{ padding: 4 }} testID="plate"><Ink /></DarkPlate>));
  expect(light.queryByTestId('plate')).toBeNull();
  expect(light.getByTestId('ink').props.children).toBe(lightTheme.colors.textPrimary);
});

test('a choice tile stands its drawings on the plate in dark only', async () => {
  const tile = (theme: KuyaraTheme) => within(theme, (
    <ChoiceTile drawings={[{ garmentTypeId: 't_shirt', category: 'top' }]} label="Casual" onPress={() => undefined}
      role="radio" selected={false} testID="tile" />
  ));
  expect((await render(tile(darkTheme))).getByTestId('tile-plate')).toBeTruthy();
  expect((await render(tile(lightTheme))).queryByTestId('tile-plate')).toBeNull();
});
