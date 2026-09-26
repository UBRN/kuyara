import { Tabs, router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import * as profileStackLayout from '@/app/(tabs)/(profile)/_layout';
import * as todayStackLayout from '@/app/(tabs)/(today)/_layout';
import * as weatherStackLayout from '@/app/(tabs)/weather/_layout';

// The real tab-stack layout modules (with their `unstable_settings`) over stub leaves with
// the real file names. Expo Router orders a stack's routes index first, then by name
// length, so without an anchor `history` (7 letters, alphabetically before `profile`) is
// the Profile stack's first route: a fresh or remounted Profile tab then opens History as
// its root, with no back, and a deep link to a pushed screen has nothing beneath it.
function leaf(label: string) {
  return function Leaf() {
    return <Text>{label}</Text>;
  };
}

async function renderApp(initialUrl = '/') {
  // RNTL 14 renders asynchronously; `renderRouter` hands back its pending render.
  await renderRouter(
    {
      '(tabs)/_layout': () => <Tabs />,
      '(tabs)/(today)/_layout': todayStackLayout,
      '(tabs)/(today)/index': leaf('Today root'),
      '(tabs)/(today)/[id]': leaf('Outfit detail'),
      '(tabs)/weather/_layout': weatherStackLayout,
      '(tabs)/weather/index': leaf('Weather root'),
      '(tabs)/weather/location': leaf('Location search'),
      '(tabs)/(profile)/_layout': profileStackLayout,
      '(tabs)/(profile)/history': leaf('History'),
      '(tabs)/(profile)/profile': leaf('Profile root'),
      '(tabs)/(profile)/settings/index': leaf('Settings'),
      '(tabs)/(profile)/settings/privacy': leaf('Privacy'),
      '(tabs)/(profile)/wardrobe/index': leaf('Closet'),
      '(tabs)/(profile)/wardrobe/new': leaf('Add a piece'),
      '(tabs)/(profile)/wardrobe/[id]': leaf('Edit piece'),
    },
    { initialUrl },
  );
}

describe('primary tab stacks keep their root', () => {
  it('opens the Profile root, not History, when the Profile tab mounts fresh', async () => {
    await renderApp('/');
    expect(screen.getByText('Today root')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: /profile/i }));

    expect(screen.queryByText('History')).toBeNull();
    expect(screen.getByText('Profile root')).toBeOnTheScreen();
  });

  it.each([
    ['/history', 'History'],
    ['/settings/privacy', 'Privacy'],
    ['/wardrobe/new', 'Add a piece'],
  ])('lays the Profile root beneath a deep link to %s', async (url, pushed) => {
    await renderApp(url);
    expect(screen.getByText(pushed)).toBeOnTheScreen();

    await act(() => router.back());
    expect(screen.getByText('Profile root')).toBeOnTheScreen();
  });

  it('lands a Profile deep link on the Profile root', async () => {
    await renderApp('/profile');
    expect(screen.getByText('Profile root')).toBeOnTheScreen();
    expect(screen.queryByText('History')).toBeNull();
  });

  it.each([
    ['/some-outfit-id', 'Outfit detail', 'Today root'],
    ['/weather/location', 'Location search', 'Weather root'],
  ])('lays the tab root beneath a deep link to %s', async (url, pushed, root) => {
    await renderApp(url);
    expect(screen.getByText(pushed)).toBeOnTheScreen();
    await act(() => router.back());
    expect(screen.getByText(root)).toBeOnTheScreen();
  });
});
