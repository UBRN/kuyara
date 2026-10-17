import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { usePresentationHeld } from '@/components/ui/presentation-hold';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/features/wardrobe/presentation/wardrobe-item-routes', () => ({
  WardrobeEditItemRoute: () => null,
  WardrobeNewItemRoute: () => null,
}));
jest.mock('@/features/wardrobe/application/use-visible-closet-categories', () => ({
  useVisibleClosetCategories: () => [],
}));
jest.mock('@/localization/use-messages', () => ({
  useMessages: () => ({ wardrobe: { editTitle: 'Edit', newTitle: 'New' } }),
}));

// eslint-disable-next-line import/first
import WardrobeItemRoute from '@/app/(tabs)/(profile)/wardrobe/[id]';
// eslint-disable-next-line import/first
import WardrobeNewRoute from '@/app/(tabs)/(profile)/wardrobe/new';

function HeldProbe() {
  return <Text testID="held">{usePresentationHeld() ? 'held' : 'clear'}</Text>;
}

// The Closet piece forms are full-screen modals over the tab (the Profile stack's layout), so
// what must never appear over a presentation waits while one is open.
test.each([
  ['add', WardrobeNewRoute],
  ['edit', WardrobeItemRoute],
] as const)('the Closet %s form holds the screen while it is presented', async (_name, Form) => {
  const view = await render(<><HeldProbe /><Form /></>);
  expect(view.getByTestId('held')).toHaveTextContent('held');
  await view.rerender(<HeldProbe />);
  expect(view.getByTestId('held')).toHaveTextContent('clear');
});
