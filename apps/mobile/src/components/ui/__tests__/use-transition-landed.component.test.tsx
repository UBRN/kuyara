import { act, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { Entrance } from '@/components/ui/entrance';
import { useTransitionLanded } from '@/components/ui/use-transition-landed';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

type TransitionEnd = (event: { data: { closing: boolean } }) => void;

const mockNavigation = { index: 1, listeners: [] as TransitionEnd[] };
jest.mock('expo-router', () => ({
  useNavigation: () => ({
    addListener: (_type: string, listener: TransitionEnd) => {
      mockNavigation.listeners.push(listener);
      return () => {
        mockNavigation.listeners = mockNavigation.listeners.filter((each) => each !== listener);
      };
    },
    getState: () => ({ index: mockNavigation.index }),
  }),
}));

function PushedContent() {
  const landed = useTransitionLanded();
  return (
    <Entrance waiting={!landed}>
      <Text>History</Text>
    </Entrance>
  );
}

const screen = (
  <KuyaraThemeContext.Provider value={lightTheme}>
    <PushedContent />
  </KuyaraThemeContext.Provider>
);

beforeEach(() => {
  mockNavigation.listeners = [];
});

test('a pushed screen holds its content until the push lands, then it arrives', async () => {
  mockNavigation.index = 1;
  const withSpring = jest.spyOn(Reanimated, 'withSpring').mockImplementation((toValue) => toValue);
  const result = await render(screen);

  expect(withSpring).not.toHaveBeenCalled();
  expect(StyleSheet.flatten(result.toJSON()!.props.style).opacity).toBe(0);

  // The screen below leaving is not this screen landing.
  await act(() => mockNavigation.listeners.forEach((listener) => listener({ data: { closing: true } })));
  expect(withSpring).not.toHaveBeenCalled();

  await act(() => mockNavigation.listeners.forEach((listener) => listener({ data: { closing: false } })));
  expect(withSpring).toHaveBeenCalledWith(0, lightTheme.springs.spatial, expect.any(Function));
  expect(mockNavigation.listeners).toHaveLength(0);
  withSpring.mockRestore();
});

test("a navigator's first screen was not pushed and arrives at once", async () => {
  mockNavigation.index = 0;
  const withSpring = jest.spyOn(Reanimated, 'withSpring').mockImplementation((toValue) => toValue);
  await render(screen);

  expect(withSpring).toHaveBeenCalledWith(0, lightTheme.springs.spatial, expect.any(Function));
  expect(mockNavigation.listeners).toHaveLength(0);
  withSpring.mockRestore();
});
