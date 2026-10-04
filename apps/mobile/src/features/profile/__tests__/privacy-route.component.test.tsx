import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PrivacySettingsRoute from '@/app/(tabs)/(profile)/settings/privacy';
import { PRIVACY_POLICY_URL } from '@/features/analytics/domain/privacy-policy';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useFocusEffect: () => undefined,
}));

jest.mock('@/features/analytics/application/use-screen-viewed', () => ({
  useScreenViewed: () => undefined,
}));

jest.mock('@/features/analytics/application/use-analytics-consent', () => ({
  useAnalyticsConsent: () => ({
    consent: 'withdrawn',
    getIdentifier: () => null,
    grant: jest.fn(async () => undefined),
    withdraw: jest.fn(async () => undefined),
    decline: jest.fn(async () => undefined),
  }),
}));

jest.mock('@/features/profile/application/profile-context', () => ({
  useProfileApplication: () => ({ state: { status: 'ready' } }),
}));

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
