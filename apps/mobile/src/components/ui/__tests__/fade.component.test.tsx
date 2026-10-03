import { render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { FadeIn } from '@/components/ui/fade';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

test('shared fade keeps its start, duration and delay while using the theme curve', async () => {
  const timing = jest.spyOn(Reanimated, 'withTiming');
  const delay = jest.spyOn(Reanimated, 'withDelay');
  const bezier = jest.spyOn(Reanimated.Easing, 'bezier');
  const result = await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <FadeIn animate delay={45} duration={lightTheme.motion.normal}>
        <Text>Arriving</Text>
      </FadeIn>
    </KuyaraThemeContext.Provider>,
  );
  expect(timing).toHaveBeenCalledWith(1, {
    duration: lightTheme.motion.normal,
    easing: expect.objectContaining({ factory: expect.any(Function) }),
  });
  expect(delay).toHaveBeenCalledWith(45, expect.anything());
  expect(bezier).toHaveBeenCalledWith(...lightTheme.motion.fadeCurve);
  expect(StyleSheet.flatten(result.getByText('Arriving').parent!.props.style).opacity).toBeDefined();
  timing.mockRestore();
  delay.mockRestore();
  bezier.mockRestore();
});
