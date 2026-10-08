import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PrivacySettingsRoute from '@/app/(tabs)/(profile)/settings/privacy';
import { PRIVACY_POLICY_URL } from '@/features/analytics/domain/privacy-policy';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useFocusEffect: () => undefined,
}));

jest.mock('@/features/analytics/application/use-screen-viewed', () => ({
  useScreenViewed: () => undefined,
}));

let mockRemoveWithdrawnIdentifier: () => void = () => undefined;
// The grant stores the answer and starts the identifier without re-rendering the route itself.
let mockConsent: 'withdrawn' | 'granted' = 'withdrawn';
let mockIdentifier: string | null = null;

jest.mock('@/features/analytics/application/use-analytics-consent', () => ({
  useAnalyticsConsent: () => ({
    consent: mockConsent,
    getIdentifier: () => mockIdentifier,
    getWithdrawnIdentifier: () => 'kept-identifier',
    removeWithdrawnIdentifier: () => mockRemoveWithdrawnIdentifier(),
    grant: jest.fn(async () => {
      mockConsent = 'granted';
      mockIdentifier = 'new-identifier';
    }),
    withdraw: jest.fn(async () => undefined),
    decline: jest.fn(async () => undefined),
  }),
}));

jest.mock('@/features/profile/application/profile-context', () => ({
  useProfileApplication: () => ({ state: { status: 'ready' } }),
}));

afterEach(() => {
  mockConsent = 'withdrawn';
  mockIdentifier = null;
});

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

test.each([
  ['en', 'https://ubrn.github.io/kuyara/privacy-policy?lang=en'],
  ['tr', 'https://ubrn.github.io/kuyara/tr/privacy-policy?lang=tr'],
] as const)('the Privacy route opens the %s privacy policy', async (language, url) => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const result = await render(
    <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <PrivacySettingsRoute />
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>,
  );

  fireEvent.press(result.getByTestId('settings-privacy-policy-row'));

  expect(PRIVACY_POLICY_URL[language]).toBe(url);
  expect(openURL).toHaveBeenCalledTimes(1);
  expect(openURL).toHaveBeenCalledWith(url);
  openURL.mockRestore();
});

describe('removing the kept identifier', () => {
  async function renderRoute() {
    return render(
      <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <PrivacySettingsRoute />
          </SafeAreaProvider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>,
    );
  }

  afterEach(() => {
    mockRemoveWithdrawnIdentifier = () => undefined;
  });

  test('a removed identifier leaves the screen', async () => {
    const result = await renderRoute();
    expect(result.getByTestId('settings-privacy-withdrawn-identifier')).toHaveTextContent('kept-identifier');
    await fireEvent.press(result.getByTestId('settings-privacy-remove-identifier-row'));
    expect(result.queryByTestId('settings-privacy-withdrawn-identifier-group')).toBeNull();
  });

  test('a file that cannot be deleted keeps the row and breaks nothing', async () => {
    mockRemoveWithdrawnIdentifier = () => { throw new Error('delete failed'); };
    const result = await renderRoute();
    await fireEvent.press(result.getByTestId('settings-privacy-remove-identifier-row'));
    expect(result.getByTestId('settings-privacy-withdrawn-identifier')).toHaveTextContent('kept-identifier');
  });
});

test('turning sharing on shows the new identifier without reopening the screen', async () => {
  const result = await render(
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <PrivacySettingsRoute />
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>,
  );
  expect(result.queryByTestId('settings-privacy-identifier')).toBeNull();

  await act(async () => {
    fireEvent(result.getByTestId('settings-privacy-toggle-row-toggle'), 'valueChange', true);
  });

  await waitFor(() => expect(result.getByTestId('settings-privacy-identifier')).toHaveTextContent('new-identifier'));
});
