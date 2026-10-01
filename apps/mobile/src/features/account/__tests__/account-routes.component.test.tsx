import { render } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
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
