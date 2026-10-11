import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { TintingPlate } from '@/components/ui/tinting-plate';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const plate = (color: string) => (
  <KuyaraThemeContext value={lightTheme}>
    <TintingPlate color={color} testID="plate"><Text>Sky</Text></TintingPlate>
  </KuyaraThemeContext>
);

afterEach(() => jest.restoreAllMocks());

// Law 7: a plate already on screen takes a new sky's colour as effects motion on `normal`; a
// plate that mounts stands at rest in its colour, and its content reads on the colour it is
// moving to.
test('a plate stands at rest on mount and moves to a new colour on motion.normal', async () => {
  const withTiming = jest.spyOn(Reanimated, 'withTiming');
  // The mock leaves colour interpolation out: the ends of the range stand for it.
  jest.spyOn(Reanimated, 'interpolateColor').mockImplementation(
    ((value: number, _input: readonly number[], output: readonly string[]) =>
      output[value >= 1 ? 1 : 0]) as typeof Reanimated.interpolateColor,
  );
  const result = await render(plate(lightTheme.atmosphere.veiledDay));
  expect(result.getByTestId('plate')).toHaveStyle({ backgroundColor: lightTheme.atmosphere.veiledDay });
  expect(withTiming).not.toHaveBeenCalled();

  await result.rerender(plate(lightTheme.atmosphere.fallingDay));
  expect(withTiming).toHaveBeenCalledWith(1, { duration: lightTheme.motion.normal, easing: expect.anything() });
  expect(result.getByTestId('plate')).toHaveStyle({ backgroundColor: lightTheme.atmosphere.fallingDay });
  expect(result.getByText('Sky')).toBeOnTheScreen();
});
