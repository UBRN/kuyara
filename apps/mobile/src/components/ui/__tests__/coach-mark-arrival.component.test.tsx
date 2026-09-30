import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { CoachMarkArrival } from '@/components/ui/coach-mark-layer';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

// ADR 0020: the overshooting `arrival` spring is reserved for garment pieces landing on a
// board; the coach-mark bubble travels on the default `spatial` spring.
test('the coach-mark bubble settles on the spatial spring, not the arrival spring', async () => {
  const withSpring = jest.spyOn(Reanimated, 'withSpring');
  await render(
    <KuyaraThemeContext.Provider value={lightTheme}>
      <CoachMarkArrival from="below">
        <Text>Tip</Text>
      </CoachMarkArrival>
    </KuyaraThemeContext.Provider>,
  );

  expect(withSpring).toHaveBeenCalledWith(0, lightTheme.springs.spatial);
  expect(withSpring).not.toHaveBeenCalledWith(expect.anything(), lightTheme.springs.arrival);
  withSpring.mockRestore();
});
