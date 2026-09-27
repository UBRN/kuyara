import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AnalyticsConsentRoute from '@/app/analytics-consent';
import { AnalyticsConsentGate, isAnalyticsConsentGateEligible } from '@/features/analytics/application/analytics-consent-gate';
import {
  AnalyticsConsentTriggerContext,
  AnalyticsConsentTriggerProvider,
  useAnalyticsConsentTrigger,
} from '@/features/analytics/application/analytics-consent-trigger';
import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import type { ProductAnalytics } from '@/features/analytics/domain/product-analytics';
import { AnalyticsConsentScreen } from '@/features/analytics/presentation/analytics-consent-screen';
import {
  ProfileApplicationContext,
  type ProfileApplicationValue,
} from '@/features/profile/application/profile-context';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'gate-nonce' }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(), push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => (() => void) | void) => require('react').useEffect(() => {
    if (mockRouteFocused) return effect();
    return undefined;
  }, [effect, mockRouteFocused]),
  useLocalSearchParams: () => ({ presentation: mockPresentationParam }),
}));

let mockPresentationParam: string | undefined;
let mockRouteFocused = true;
const mockRouter = jest.requireMock('expo-router').router as {
  back: jest.Mock;
  canGoBack: jest.Mock;
  push: jest.Mock;
  replace: jest.Mock;
};
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

async function renderRoute(
  analytics: ProductAnalytics,
  initialConsent: 'undecided' | 'granted' | 'withdrawn' = 'undecided',
  presentation: string | null = 'gate-nonce',
  pending: string | null = 'gate-nonce',
) {
  const persisted: string[] = [];
  let pendingPresentation = pending;
  mockPresentationParam = presentation ?? undefined;
  const trigger = {
    recommendationShown: true,
    markRecommendationShown: () => undefined,
    beginConsentPresentation: () => { pendingPresentation = 'gate-nonce'; return 'gate-nonce'; },
    matchesConsentPresentation: (nonce: string | undefined) => nonce === pendingPresentation,
    clearConsentPresentation: (nonce: string) => {
      if (pendingPresentation === nonce) pendingPresentation = null;
    },
    answeringPresentation: null,
    answerConsentPresentation: (_nonce: string, answer: () => Promise<void>) => answer(),
  };
  const application = {
    state: { status: 'ready' as const,
      profile: {
        ...profile,
        analyticsConsent: initialConsent,
      }, isSaving: false },
    updateAnalyticsConsent: async (consent: string) => { persisted.push(consent); },
  } as ProfileApplicationValue;
  const tree = (key: number) => (
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en , hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ProfileApplicationContext value={application}>
            <ProductAnalyticsProvider analytics={analytics}>
              <AnalyticsConsentTriggerContext value={trigger}>
                <AnalyticsConsentRoute key={key} />
              </AnalyticsConsentTriggerContext>
            </ProductAnalyticsProvider>
          </ProfileApplicationContext>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>
  );
  const rendered = await render(tree(0));
  return {
    analytics, persisted, rendered,
    enterAgain: () => rendered.rerender(tree(1)),
    refresh: () => rendered.rerender(tree(0)),
    pendingPresentation: () => pendingPresentation,
  };
}

beforeEach(() => {
  mockRouter.back.mockClear();
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.canGoBack.mockReset().mockReturnValue(true);
  mockPresentationParam = undefined;
  mockRouteFocused = true;
});

test('a cold direct link with granted consent replaces the route with Today without showing the question', async () => {
  mockRouter.canGoBack.mockReturnValue(false);
  const analytics = new RecordingProductAnalytics('granted');
  const result = await renderRoute(analytics, 'granted', null, null);

  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  expect(result.rendered.queryByTestId('analytics-consent-screen')).toBeNull();
  expect(result.persisted).toEqual([]);
  expect(analytics.names()).toEqual([]);
  expect(mockRouter.back).not.toHaveBeenCalled();
});

test('a deep link from Profile goes back without showing the question', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const result = await renderRoute(analytics, 'undecided', null, null);

  await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(result.rendered.queryByTestId('analytics-consent-screen')).toBeNull();
  expect(result.persisted).toEqual([]);
  expect(analytics.names()).toEqual([]);
});

test('a wrong nonce cannot take the gate presentation', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const result = await renderRoute(analytics, 'undecided', 'other-nonce');

  await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  expect(result.rendered.queryByTestId('analytics-consent-screen')).toBeNull();
  expect(result.pendingPresentation()).toBe('gate-nonce');
});

test('an undecided gate entry shows the question and answering closes to Today', async () => {
  mockRouter.canGoBack.mockReturnValue(false);
  const analytics = new RecordingProductAnalytics('undecided');
  const result = await renderRoute(analytics);

  expect(result.rendered.getByTestId('analytics-consent-screen')).toBeOnTheScreen();
  await act(async () => {
    fireEvent.press(result.rendered.getByTestId('analytics-consent-accept'));
  });

  await waitFor(() => expect(result.persisted).toEqual(['granted']));
  expect(mockRouter.replace).toHaveBeenCalledWith('/');
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(result.pendingPresentation()).toBeNull();
  await result.enterAgain();
  expect(result.rendered.queryByTestId('analytics-consent-screen')).toBeNull();
});

test('a late grant does not close the screen reached after leaving consent', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const optIn = analytics.optIn.bind(analytics);
  let releaseGrant!: () => void;
  const pendingGrant = new Promise<void>((resolve) => { releaseGrant = resolve; });
  jest.spyOn(analytics, 'optIn')
    .mockImplementation((surface) => pendingGrant.then(() => optIn(surface)));
  const result = await renderRoute(analytics);

  await act(async () => fireEvent.press(result.rendered.getByTestId('analytics-consent-accept')));
  const leaveRoute = () => result.rendered.unmount();
  await act(async () => leaveRoute());
  await act(async () => releaseGrant());

  await waitFor(() => expect(result.pendingPresentation()).toBeNull());
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

test('an unfocused pending grant redirects the still-mounted consent route on refocus', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const optIn = analytics.optIn.bind(analytics);
  let releaseGrant!: () => void;
  const pendingGrant = new Promise<void>((resolve) => { releaseGrant = resolve; });
  jest.spyOn(analytics, 'optIn')
    .mockImplementation((surface) => pendingGrant.then(() => optIn(surface)));
  const result = await renderRoute(analytics);

  await act(async () => fireEvent.press(result.rendered.getByTestId('analytics-consent-accept')));
  mockRouteFocused = false;
  await act(async () => result.refresh());
  await act(async () => releaseGrant());

  await waitFor(() => expect(result.pendingPresentation()).toBeNull());
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  await act(async () => result.refresh());
  expect(result.rendered.queryByTestId('analytics-consent-screen')).toBeNull();

  mockRouteFocused = true;
  await act(async () => result.refresh());
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(result.rendered.queryByTestId('analytics-consent-screen')).toBeNull();
});

test('a presented route retires on focus when consent was answered elsewhere', async () => {
  const analytics = new RecordingProductAnalytics('granted');
  const result = await renderRoute(analytics, 'granted');

  await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  expect(result.pendingPresentation()).toBeNull();
  expect(result.persisted).toEqual([]);
});

test('only the Today gate can present consent, across late and pending remounts', async () => {
  jest.useFakeTimers();
  const analytics = new RecordingProductAnalytics('undecided');
  const optIn = analytics.optIn.bind(analytics);
  let releaseGrant!: () => void;
  const pendingGrant = new Promise<void>((resolve) => { releaseGrant = resolve; });
  const grant = jest.spyOn(analytics, 'optIn')
    .mockImplementation((surface) => pendingGrant.then(() => optIn(surface)));
  let showToday!: () => void;
  let openDeepLink!: () => void;
  let leaveRoute!: () => void;
  function NavigationHarness() {
    const [pathname, setPathname] = useState('/profile');
    const [entry, setEntry] = useState(0);
    const trigger = useAnalyticsConsentTrigger();
    showToday = () => setPathname('/');
    openDeepLink = () => setEntry((current) => current + 1);
    leaveRoute = () => setEntry(0);
    return <>
      <AnalyticsConsentGate
        shouldPresent={isAnalyticsConsentGateEligible({
          analyticsConsent: 'undecided', onboardingCompleted: true,
          pathname, recommendationShown: true, sessionIndex: 2,
        })}
        onPresent={() => {
          const presentation = trigger.beginConsentPresentation();
          mockPresentationParam = presentation;
          mockRouter.push({ pathname: '/analytics-consent', params: { presentation } });
          setEntry((current) => current + 1);
        }}
      />
      {entry > 0 ? <AnalyticsConsentRoute key={entry} /> : null}
    </>;
  }
  const application = {
    state: { status: 'ready' as const, profile, isSaving: false },
    updateAnalyticsConsent: async () => undefined,
  } as unknown as ProfileApplicationValue;
  try {
    const rendered = await render(
      <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <ProfileApplicationContext value={application}>
              <ProductAnalyticsProvider analytics={analytics}>
                <AnalyticsConsentTriggerProvider>
                  <NavigationHarness />
                </AnalyticsConsentTriggerProvider>
              </ProductAnalyticsProvider>
            </ProfileApplicationContext>
          </SafeAreaProvider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>,
    );
    await act(async () => openDeepLink());
    expect(rendered.queryByTestId('analytics-consent-screen')).toBeNull();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(1_500));
    expect(mockRouter.push).not.toHaveBeenCalled();
    await act(async () => showToday());
    await act(async () => jest.advanceTimersByTime(1_500));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/analytics-consent', params: { presentation: expect.any(String) },
    });
    expect(rendered.getByTestId('analytics-consent-screen')).toBeOnTheScreen();
    await act(async () => leaveRoute());
    await act(async () => jest.advanceTimersByTime(5_000));
    await act(async () => openDeepLink());
    expect(rendered.getByTestId('analytics-consent-screen')).toBeOnTheScreen();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(rendered.getByTestId('analytics-consent-accept')));
    await waitFor(() => expect(grant).toHaveBeenCalledTimes(1));
    await act(async () => openDeepLink());
    const accept = rendered.getByTestId('analytics-consent-accept');
    const decline = rendered.getByTestId('analytics-consent-decline');
    expect(accept.props.accessibilityState.disabled).toBe(true);
    expect(decline.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(accept);
    fireEvent.press(decline);
    expect(grant).toHaveBeenCalledTimes(1);
    await act(async () => releaseGrant());
    await waitFor(() => expect(analytics.optInCount).toBe(1));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(analytics.declineCount).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test('captures made while the answer is undecided are dropped, and accept records only the grant', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  analytics.capture(
    'screen_viewed',
    { schema_version: 3, screen_name: 'onboarding' },
    { timestamp: '2026-09-10T08:00:00.000Z' },
  );
  expect(analytics.captures).toEqual([]);
  const result = await renderRoute(analytics);

  await act(async () => {
    fireEvent.press(result.rendered.getByTestId('analytics-consent-accept'));
  });

  await waitFor(() => expect(result.persisted).toEqual(['granted']));
  expect(analytics.names()).toEqual(['analytics_consent_granted']);
  expect(analytics.captures[0].properties).toEqual({
    schema_version: 3,
    surface: 'today_sheet',
  });
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});

test('decline persists without sending anything', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  analytics.capture('notification_opened', { schema_version: 3, kind: 'weather_alert' });
  const result = await renderRoute(analytics);

  await act(async () => {
    fireEvent.press(result.rendered.getByTestId('analytics-consent-decline'));
  });

  await waitFor(() => expect(result.persisted).toEqual(['withdrawn']));
  expect(analytics.optInCount).toBe(0);
  expect(analytics.captures).toEqual([]);
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});

test('a rejected answer stays open and can be retried without an unhandled rejection', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const onFailure = jest.fn(async () => {
    throw new Error('persistence unavailable');
  });
  const rendered = await render(
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en , hour12: false }}>
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

test('shows the exact copy and full-width actions in primary-then-secondary order', async () => {
  const rendered = await render(
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <AnalyticsConsentScreen onAccept={jest.fn()} onDecline={jest.fn()} />
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>,
  );

  expect(rendered.getByRole('header', { name: 'Help improve kuyara' })).toBeOnTheScreen();
  expect(rendered.getByText(messages.en.analytics.consentBody)).toBeOnTheScreen();
  const buttons = rendered.getAllByRole('button');
  expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual([
    'Help improve',
    'Not now',
  ]);

  const accept = rendered.getByTestId('analytics-consent-accept');
  const decline = rendered.getByTestId('analytics-consent-decline');
  expect(StyleSheet.flatten(accept.props.style)).toMatchObject({
    width: '100%',
    backgroundColor: lightTheme.colors.primaryFill,
  });
  expect(StyleSheet.flatten(decline.props.style)).toMatchObject({
    width: '100%',
    backgroundColor: lightTheme.colors.surfaceInteractive,
  });
});

test('renders the content with its animated entrance', async () => {
  const rendered = await render(
    <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <AnalyticsConsentScreen onAccept={jest.fn()} onDecline={jest.fn()} />
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>,
  );

  expect(StyleSheet.flatten(rendered.getByTestId('analytics-consent-content').props.style))
    .toMatchObject({ gap: 12 });
});
