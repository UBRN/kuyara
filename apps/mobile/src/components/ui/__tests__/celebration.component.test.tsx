import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Celebration } from '@/components/ui/celebration';
import { usePresentationHeld } from '@/components/ui/presentation-hold';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function HeldProbe() {
  return <Text testID="held">{usePresentationHeld() ? 'held' : 'clear'}</Text>;
}

const moment = (play: number) => (
  <KuyaraThemeContext.Provider value={lightTheme}>
    <HeldProbe />
    <Celebration colors={['#000000']} play={play} radius={26} seed="2026-10-17" />
  </KuyaraThemeContext.Provider>
);

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

// The worn moment plays over the outfit's board, so the rating request never lands on it.
test('the worn moment holds the screen while it plays, and lets go once it has played', async () => {
  const view = await render(moment(0));
  expect(view.getByTestId('held')).toHaveTextContent('clear');
  await view.rerender(moment(1));
  expect(view.getByTestId('held')).toHaveTextContent('held');
  await act(() => jest.advanceTimersByTime(lightTheme.motion.celebration - 1));
  expect(view.getByTestId('held')).toHaveTextContent('held');
  await act(() => jest.advanceTimersByTime(1));
  expect(view.getByTestId('held')).toHaveTextContent('clear');
});
