import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import * as Reanimated from 'react-native-reanimated';

import { CoachMarkLayer, type CoachMarkRect } from '@/components/ui/coach-mark-layer';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function LightTheme({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

const here: CoachMarkRect = { x: 16, y: 120, width: 358, height: 300, radius: 26 };
const there: CoachMarkRect = { x: 16, y: 640, width: 358, height: 64, radius: 16 };
const layer = (hole: CoachMarkRect, betweenScreens = false) => (
  <CoachMarkLayer
    accessibilityLabel="Tour"
    betweenScreens={betweenScreens}
    hole={hole}
    layer={0}
    onAccessibilityEscape={jest.fn()}
    onHidden={jest.fn()}
    ring={null}
    visible>
    {null}
  </CoachMarkLayer>
);

afterEach(() => jest.restoreAllMocks());

// Within a screen the lit area travels on the spatial spring.
test('a step on the same screen springs the lit area to its next place', async () => {
  const result = await render(layer(here), { wrapper: LightTheme });
  const withSpring = jest.spyOn(Reanimated, 'withSpring');
  await result.rerender(layer(there));
  expect(withSpring).toHaveBeenCalledWith(there.y, lightTheme.springs.spatial);
});

// Across screens the lit area never stays open over content sliding under it, nor sweeps across
// the new screen: it closes on `fast` while the screens change and opens at its new place on
// `normal`.
test('a step on another screen closes the lit area and opens it at the new place', async () => {
  const result = await render(layer(here), { wrapper: LightTheme });
  const withSpring = jest.spyOn(Reanimated, 'withSpring');
  const withTiming = jest.spyOn(Reanimated, 'withTiming');

  await result.rerender(layer(here, true));
  expect(withTiming).toHaveBeenCalledWith(1, { duration: lightTheme.motion.fast });

  await result.rerender(layer(there));
  expect(withTiming).toHaveBeenCalledWith(0, { duration: lightTheme.motion.normal });
  expect(withSpring).not.toHaveBeenCalled();
});
