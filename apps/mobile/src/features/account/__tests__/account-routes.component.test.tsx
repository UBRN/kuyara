import { act, render } from '@testing-library/react-native';
import type { ComponentType, PropsWithChildren } from 'react';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    BottomSheet: ({ children, index }: PropsWithChildren<{ index: number }>) =>
      (index >= 0 ? React.createElement(View, { testID: 'sheet-host' }, children) : null),
  };
});
jest.mock('@/navigation/primary-tabs', () => ({ PrimaryTabs: () => null }));
jest.mock('@/features/profile/application/profile-context', () => ({
  useProfileApplication: () => ({ state: { status: 'ready', profile: {} } }),
}));
jest.mock('@/features/profile/application/profile-route-gate', () => ({ resolveProfileHomeRoute: () => 'today' }));
// Whether the mounted route is the focused screen; a test flips it and re-renders to move focus.
let mockFocused = true;
jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual('react-native') as typeof import('react-native');
  const { useEffect } = jest.requireActual('react') as typeof import('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      const focused = mockFocused;
      useEffect(() => (focused ? callback() : undefined), [callback, focused]);
    },
    Redirect: ({ href }: { href: string }) => <MockText testID="redirect">{href}</MockText>,
    Stack: { Screen: () => null },
    router: { dismissTo: jest.fn() },
    useLocalSearchParams: () => ({}),
    useRouter: () => ({ push: jest.fn() }),
  };
});

let mockEnabled = false;
jest.mock('@/features/account/application/account-screens-flag', () => ({
  get ACCOUNT_SCREENS_ENABLED() {
    return mockEnabled;
  },
}));

function inProviders(Route: ComponentType) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <Route />
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
    </SafeAreaProvider>
  );
}

function renderRoute(Route: ComponentType) {
  return render(inProviders(Route));
}

const routes = [
  ['Account', () => jest.requireActual('@/app/(tabs)/(profile)/settings/account').default],
  ['Delete account', () => jest.requireActual('@/app/(tabs)/(profile)/settings/delete-account').default],
] as const;

afterEach(() => {
  mockEnabled = false;
  mockFocused = true;
  jest.mocked(router.dismissTo).mockClear();
});

test.each(routes)('while the switch is off, the %s route sends a link back to Settings', async (_name, load) => {
  const screen = await renderRoute(load());
  expect(screen.getByTestId('redirect')).toHaveTextContent('/settings');
});

test('with the switch on, the routes draw their screens', async () => {
  mockEnabled = true;
  // The in-memory port starts signed out, so a signed-in scenario is loaded first.
  const { AccountScreensContext } = jest.requireActual('@/features/account/application/account-screens-context');
  const { accountScenarios, createInMemoryAccountScreens } = jest.requireActual('@/features/account/application/account-screens');
  const port = createInMemoryAccountScreens(accountScenarios.upToDate);
  for (const [, load] of routes) {
    const Route = load();
    const screen = await renderRoute(() => (
      <AccountScreensContext.Provider value={port}><Route /></AccountScreensContext.Provider>
    ));
    expect(screen.queryByTestId('redirect')).toBeNull();
    expect(screen.queryByTestId('account-screen') ?? screen.queryByTestId('delete-account-screen')).toBeTruthy();
    await screen.unmount();
  }
});

describe('the Account route after the account ends', () => {
  async function renderSignedInAccount() {
    mockEnabled = true;
    const { AccountScreensContext } = jest.requireActual('@/features/account/application/account-screens-context');
    const { accountScenarios, createInMemoryAccountScreens } = jest.requireActual('@/features/account/application/account-screens');
    const Route = routes[0][1]();
    const port = createInMemoryAccountScreens(accountScenarios.upToDate);
    const tree = () => <AccountScreensContext.Provider value={port}><Route /></AccountScreensContext.Provider>;
    const screen = await renderRoute(tree);
    return { port, screen, tree };
  }

  test('while focused, the route returns to Settings once the person is signed out', async () => {
    const { port } = await renderSignedInAccount();
    expect(router.dismissTo).not.toHaveBeenCalled();
    await act(async () => { await port.signOut(); });
    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith('/settings');
  });

  test('while another tab is focused, the route leaves navigation alone and returns when focus comes back', async () => {
    mockFocused = false;
    const { port, screen, tree } = await renderSignedInAccount();
    await act(async () => { await port.signOut(); });
    expect(router.dismissTo).not.toHaveBeenCalled();
    mockFocused = true;
    await screen.rerender(inProviders(tree));
    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith('/settings');
  });
});

describe('the tab layout', () => {
  const load = () => jest.requireActual('@/app/(tabs)/_layout').default;

  test('with the switch on, a deletion result shows on the app-wide sheet over every tab', async () => {
    mockEnabled = true;
    const { AccountScreensContext } = jest.requireActual('@/features/account/application/account-screens-context');
    const { accountScenarios, createInMemoryAccountScreens } = jest.requireActual('@/features/account/application/account-screens');
    const Layout = load();
    const screen = await renderRoute(() => (
      <AccountScreensContext.Provider value={createInMemoryAccountScreens(accountScenarios.deletedAppleUnrevoked)}>
        <Layout />
      </AccountScreensContext.Provider>
    ));
    expect(screen.getByTestId('account-sheet-app')).toBeTruthy();
    expect(screen.getByTestId('account-result-apple-unrevoked')).toHaveTextContent(messages.en.account.deleted.appleUnrevoked);
  });

  test('while the switch is off, the layout mounts no account sheet', async () => {
    const Layout = load();
    const screen = await renderRoute(Layout);
    expect(screen.queryByTestId('account-sheet-app')).toBeNull();
  });
});
