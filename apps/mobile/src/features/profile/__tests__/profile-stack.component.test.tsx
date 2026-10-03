import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockScreens: Record<string, unknown>[] = [];
jest.mock('expo-router', () => {
  const Stack = ({ children }: { children?: ReactNode }) => children ?? null;
  Stack.Screen = function Screen(props: Record<string, unknown>) {
    mockScreens.push(props);
    return null;
  };
  return { Stack };
});

// eslint-disable-next-line import/first
import ProfileStack from '@/app/(tabs)/(profile)/_layout';

// Editing a Closet piece slides up from the bottom as a full-height page, over the tab bar.
test('the Closet piece form is presented full screen from the bottom', async () => {
  await render(<ProfileStack />);
  expect(mockScreens).toContainEqual({
    name: 'wardrobe/[id]',
    options: expect.objectContaining({ headerShown: true, presentation: 'fullScreenModal' }),
  });
});
