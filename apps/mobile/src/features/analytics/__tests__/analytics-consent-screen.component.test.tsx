import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AnalyticsConsentRoute from '@/app/analytics-consent';
import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { AnalyticsConsentScreen } from '@/features/analytics/presentation/analytics-consent-screen';
import {
  ProfileApplicationContext,
  type ProfileApplicationValue,
} from '@/features/profile/application/profile-context';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: () => undefined,
}));

const mockRouter = jest.requireMock('expo-router').router as { back: jest.Mock };
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};
const profile = {
  id: 'profile-id',
  gender: 'woman' as const,
  clothingPreference: 'womens' as const,
  dressStyle: 'smart' as const,
  birthDate: null,
  languagePreference: 'en' as const,
  themePreference: 'light' as const,
  onboardingCompleted: true,
  notificationsOptIn: false,
  analyticsConsent: 'undecided' as const,
  createdAt: '2026-09-09T12:00:00.000Z',
  updatedAt: '2026-09-09T12:00:00.000Z',
};

async function renderRoute(analytics: RecordingProductAnalytics) {
  const persisted: string[] = [];
  const application = {
    state: { status: 'ready' as const, profile, isSaving: false },
    updateAnalyticsConsent: async (consent: string) => { persisted.push(consent); },
  } as ProfileApplicationValue;
  const rendered = await render(
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ProfileApplicationContext value={application}>
            <ProductAnalyticsProvider analytics={analytics}>
              <AnalyticsConsentRoute />
            </ProductAnalyticsProvider>
          </ProfileApplicationContext>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>,
  );
  return { analytics, persisted, rendered };
}

beforeEach(() => mockRouter.back.mockClear());

test('accept opts in, records the first consent event, persists, and closes', async () => {
  const result = await renderRoute(new RecordingProductAnalytics('undecided'));

  await act(async () => {
    fireEvent.press(result.rendered.getByTestId('analytics-consent-accept'));
  });

  await waitFor(() => expect(result.persisted).toEqual(['granted']));
  expect(result.analytics.names()).toEqual(['analytics_consent_granted']);
  expect(result.analytics.captures[0].properties).toEqual({
    schema_version: 1,
    surface: 'first_launch_sheet',
  });
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});

test('decline persists without opting in or capturing anything', async () => {
  const result = await renderRoute(new RecordingProductAnalytics('undecided'));

  await act(async () => {
    fireEvent.press(result.rendered.getByTestId('analytics-consent-decline'));
  });

  await waitFor(() => expect(result.persisted).toEqual(['withdrawn']));
  expect(result.analytics.optInCount).toBe(0);
  expect(result.analytics.captures).toEqual([]);
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});

test('a rejected answer stays open and can be retried without an unhandled rejection', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const onFailure = jest.fn(async () => {
    throw new Error('persistence unavailable');
  });
  const rendered = await render(
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <AnalyticsConsentScreen onAccept={onFailure} onDecline={onFailure} />
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>,
  );

  await act(async () => {
    fireEvent.press(rendered.getByTestId('analytics-consent-accept'));
  });
  await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
  expect(rendered.getByTestId('analytics-consent-accept').props.accessibilityState.disabled)
    .toBe(false);
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(analytics.captures).toEqual([]);
});
