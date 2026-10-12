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

// Adding or editing a Closet piece slides up from the bottom as a full-height page, over
// the tab bar. A pushed form left the tab bar reachable: tapping Profile popped the stack
// natively past the form's discard guard, and the guard's held removal left the
// navigation state out of step with the native stack.
test.each(['wardrobe/new', 'wardrobe/[id]'])(
  'the Closet piece form %s is presented full screen from the bottom',
  async (name) => {
    await render(<ProfileStack />);
    expect(mockScreens).toContainEqual({
      name,
      options: expect.objectContaining({ headerShown: true, presentation: 'fullScreenModal' }),
    });
  },
);
