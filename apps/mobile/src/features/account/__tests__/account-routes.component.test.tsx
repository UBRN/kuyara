import { render } from '@testing-library/react-native';
import type { ComponentType, PropsWithChildren } from 'react';
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
jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual('react-native') as typeof import('react-native');
  return {
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

function renderRoute(Route: ComponentType) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <Route />
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
    </SafeAreaProvider>,
  );
}

const routes = [
  ['Account', () => jest.requireActual('@/app/(tabs)/(profile)/settings/account').default],
  ['Delete account', () => jest.requireActual('@/app/(tabs)/(profile)/settings/delete-account').default],
] as const;

afterEach(() => {
  mockEnabled = false;
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
