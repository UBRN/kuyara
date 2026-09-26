import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PrivacySettingsScreen } from '@/features/profile/presentation/privacy-settings-screen';
import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { PerformanceTelemetryContext } from '@/features/analytics/application/use-performance-telemetry';
import { noopProductAnalytics } from '@/features/analytics/data/noop-product-analytics';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

async function renderScreen(
  consent: 'undecided' | 'granted' | 'withdrawn',
  overrides: Partial<React.ComponentProps<typeof PrivacySettingsScreen>> = {},
  readiness: Readonly<{
    applied?: boolean;
    cleanupPending?: boolean;
    telemetryApplied?: boolean;
    withdrawalInProgress?: () => boolean;
    whenReady?: () => Promise<void>;
  }> = {},
) {
  const props = {
    consent,
    identifier: consent === 'granted' ? 'identifier-1' : null,
    privacyPolicyUrl: null,
    onGrant: jest.fn(async () => undefined),
    onWithdraw: jest.fn(async () => undefined),
    onOpenPrivacyPolicy: jest.fn(),
    ...overrides,
  };
  const applied = { current: readiness.applied ?? consent === 'granted' };
  const analytics = {
    ...noopProductAnalytics,
    isApplied: () => applied.current,
    isCleanupPending: () => readiness.cleanupPending ?? false,
    isWithdrawalInProgress: () => readiness.withdrawalInProgress?.() ?? false,
    whenReady: readiness.whenReady ?? (() => Promise.resolve()),
  };
  const telemetry = {
    logEvent: () => undefined, reportError: () => undefined,
    setDispatching: () => undefined,
    isApplied: () => readiness.telemetryApplied ?? true,
  };
  const screenProps = {
    ...props,
    onGrant: async () => { await props.onGrant(); applied.current = true; },
    onWithdraw: async () => { await props.onWithdraw(); applied.current = false; },
  };
  const rendered = await render(
    <PerformanceTelemetryContext value={telemetry}>
      <ProductAnalyticsProvider analytics={analytics}>
        <LocalizationContext.Provider value={{ language: 'en', messages: messages.en , hour12: false }}>
          <KuyaraThemeContext.Provider value={lightTheme}>
            <SafeAreaProvider initialMetrics={initialMetrics}>
              <PrivacySettingsScreen {...screenProps} />
            </SafeAreaProvider>
          </KuyaraThemeContext.Provider>
        </LocalizationContext.Provider>
      </ProductAnalyticsProvider>
    </PerformanceTelemetryContext>,
  );
  return { ...props, analytics, telemetry, screenProps, rendered };
}

test('the consent toggle withdraws and the identifier is selectable while enabled', async () => {
  const result = await renderScreen('granted');

  expect(result.rendered.getByTestId('settings-privacy-identifier').props.selectable).toBe(true);
  expect(result.rendered.queryByTestId('settings-privacy-policy-row')).toBeNull();
  await act(async () => {
    fireEvent(
      result.rendered.getByTestId('settings-privacy-toggle-row-toggle'),
      'valueChange',
      false,
    );
  });

  await waitFor(() => expect(result.onWithdraw).toHaveBeenCalledTimes(1));
  expect(result.onGrant).not.toHaveBeenCalled();
});

test('the disabled consent state can grant from Privacy', async () => {
  const result = await renderScreen('withdrawn');

  expect(result.rendered.queryByTestId('settings-privacy-identifier-group')).toBeNull();
  await act(async () => {
    fireEvent(
      result.rendered.getByTestId('settings-privacy-toggle-row-toggle'),
      'valueChange',
      true,
    );
  });

  await waitFor(() => expect(result.onGrant).toHaveBeenCalledTimes(1));
  expect(result.onWithdraw).not.toHaveBeenCalled();
});

test('a failed consent change returns the controlled toggle to the profile value', async () => {
  const onWithdraw = jest.fn(async () => {
    throw new Error('provider unavailable');
  });
  const result = await renderScreen('granted', { onWithdraw });

  await act(async () => {
    fireEvent(
      result.rendered.getByTestId('settings-privacy-toggle-row-toggle'),
      'valueChange',
      false,
    );
  });

  await waitFor(() => expect(onWithdraw).toHaveBeenCalledTimes(1));
  const toggle = result.rendered.getByTestId('settings-privacy-toggle-row-toggle');
  expect(toggle.props.value).toBe(true);
  expect(toggle.props.disabled).toBe(true);
});

test('a native disable failure keeps the stored switch on with failure and retry', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const onWithdraw = jest.fn(async (): Promise<void> => {
    throw new Error('native configure failed');
  });
  const result = await renderScreen('granted', { onWithdraw });

  await act(async () => {
    fireEvent(
      result.rendered.getByTestId('settings-privacy-toggle-row-toggle'),
      'valueChange',
      false,
    );
  });

  const group = result.rendered.getByTestId('settings-privacy-consent-group');
  expect(within(group).getByText(messages.en.analytics.withdrawFailed)).toBeOnTheScreen();
  expect(within(group).queryByText(messages.en.analytics.toggleFooter)).toBeNull();
  expect(result.rendered.getByTestId('settings-privacy-toggle-row-toggle').props.value).toBe(true);
  expect(result.rendered.getByTestId('settings-privacy-toggle-row-toggle').props.disabled).toBe(true);
  expect(result.rendered.queryByTestId('settings-privacy-retry-grant-row')).toBeNull();
  onWithdraw.mockImplementationOnce(async () => undefined);
  await act(async () => {
    fireEvent.press(result.rendered.getByTestId('settings-privacy-retry-withdraw-row'));
  });
  expect(onWithdraw).toHaveBeenCalledTimes(2);
  expect(announce).toHaveBeenCalledWith(messages.en.analytics.withdrawFailed);
  announce.mockRestore();
});

test('a failed withdrawal write keeps the switch on and shows failure with retry', async () => {
  let withdrawalInProgress = false;
  const onWithdraw = jest.fn()
    .mockImplementationOnce(async () => {
      withdrawalInProgress = true;
      throw new Error('persistence unavailable');
    })
    .mockResolvedValueOnce(undefined);
  const result = await renderScreen('granted', { onWithdraw }, {
    withdrawalInProgress: () => withdrawalInProgress,
    telemetryApplied: false,
  });

  await act(async () => {
    fireEvent(
      result.rendered.getByTestId('settings-privacy-toggle-row-toggle'),
      'valueChange',
      false,
    );
  });

  expect(result.rendered.getByText(messages.en.analytics.withdrawFailed)).toBeOnTheScreen();
  expect(result.rendered.getByTestId('settings-privacy-toggle-row-toggle').props.value).toBe(true);
  await result.rendered.rerender(
    <PerformanceTelemetryContext value={result.telemetry}>
      <ProductAnalyticsProvider analytics={result.analytics}>
        <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
          <KuyaraThemeContext.Provider value={lightTheme}>
            <SafeAreaProvider initialMetrics={initialMetrics}>
              <PrivacySettingsScreen {...result.screenProps} key="remounted-after-write-failure" />
            </SafeAreaProvider>
          </KuyaraThemeContext.Provider>
        </LocalizationContext.Provider>
      </ProductAnalyticsProvider>
    </PerformanceTelemetryContext>,
  );
  expect(result.rendered.getByText(messages.en.analytics.withdrawFailed)).toBeOnTheScreen();
  expect(result.rendered.getByTestId('settings-privacy-toggle-row-toggle').props.value).toBe(true);
  expect(result.rendered.queryByTestId('settings-privacy-retry-grant-row')).toBeNull();
  expect(result.rendered.getByTestId('settings-privacy-retry-withdraw-row')).toBeOnTheScreen();
  await act(async () => {
    fireEvent.press(result.rendered.getByTestId('settings-privacy-retry-withdraw-row'));
  });
  expect(onWithdraw).toHaveBeenCalledTimes(2);
});

test('a withdrawal stored but not fully applied shows the stored off state and says so', async () => {
  const onWithdraw = jest.fn(async () => {
    throw new Error('provider unavailable');
  });
  const result = await renderScreen('granted', { onWithdraw }, { cleanupPending: true });

  await act(async () => {
    fireEvent(
      result.rendered.getByTestId('settings-privacy-toggle-row-toggle'),
      'valueChange',
      false,
    );
  });
  // The profile provider re-renders the route with the answer that was stored.
  await result.rendered.rerender(
    <PerformanceTelemetryContext value={result.telemetry}>
      <ProductAnalyticsProvider analytics={result.analytics}>
      <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <PrivacySettingsScreen {...result.screenProps} consent="withdrawn" identifier={null} />
          </SafeAreaProvider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
      </ProductAnalyticsProvider>
    </PerformanceTelemetryContext>,
  );

  expect(result.rendered.getByText(messages.en.analytics.withdrawIncomplete)).toBeOnTheScreen();
  expect(result.rendered.queryByText(messages.en.analytics.withdrawFailed)).toBeNull();
  expect(result.rendered.getByTestId('settings-privacy-toggle-row-toggle').props.value).toBe(false);
});

test('stored grant keeps the switch on while active PostHog and unapplied telemetry show incomplete setup', async () => {
  const result = await renderScreen('granted', {}, {
    applied: true,
    telemetryApplied: false,
  });
  await waitFor(() => expect(result.rendered.getByText(messages.en.analytics.grantIncomplete)).toBeOnTheScreen());
  expect(result.rendered.getByTestId('settings-privacy-toggle-row-toggle').props.value).toBe(true);
  expect(result.rendered.getByTestId('settings-privacy-retry-grant-row')).toBeOnTheScreen();
});

test('a failed grant says sharing is still off, and the next change clears the message', async () => {
  const onGrant = jest.fn(async (): Promise<void> => {
    throw new Error('persistence unavailable');
  });
  const result = await renderScreen('withdrawn', { onGrant });
  const toggle = () => result.rendered.getByTestId('settings-privacy-toggle-row-toggle');

  await act(async () => {
    fireEvent(toggle(), 'valueChange', true);
  });
  expect(result.rendered.getByText(messages.en.analytics.grantFailed)).toBeOnTheScreen();
  expect(toggle().props.value).toBe(false);

  onGrant.mockImplementationOnce(async () => undefined);
  await act(async () => {
    fireEvent(toggle(), 'valueChange', true);
  });
  expect(result.rendered.queryByText(messages.en.analytics.grantFailed)).toBeNull();
  expect(result.rendered.getByText(messages.en.analytics.toggleFooter)).toBeOnTheScreen();
});

test('a saved grant with failed opt-in stays visibly incomplete and offers retry', async () => {
  let shouldFail = true;
  const onGrant = jest.fn(async (): Promise<void> => {
    if (shouldFail) throw new Error('provider opt-in failed');
  });
  const result = await renderScreen('withdrawn', { onGrant });
  await act(async () => {
    fireEvent(result.rendered.getByTestId('settings-privacy-toggle-row-toggle'), 'valueChange', true);
  });
  await result.rendered.rerender(
    <PerformanceTelemetryContext value={result.telemetry}>
      <ProductAnalyticsProvider analytics={result.analytics}>
      <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <PrivacySettingsScreen {...result.screenProps} consent="granted" identifier={null} key="remounted-after-failure" />
          </SafeAreaProvider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
      </ProductAnalyticsProvider>
    </PerformanceTelemetryContext>,
  );
  expect(result.rendered.getByText(messages.en.analytics.grantIncomplete)).toBeOnTheScreen();
  expect(result.rendered.getByTestId('settings-privacy-toggle-row-toggle').props.value).toBe(true);
  shouldFail = false;
  await act(async () => {
    fireEvent.press(result.rendered.getByTestId('settings-privacy-retry-grant-row'));
  });
  expect(onGrant).toHaveBeenCalledTimes(2);
  expect(result.analytics.isApplied()).toBe(true);
  await waitFor(() => expect(result.rendered.queryByTestId('settings-privacy-retry-grant-row')).toBeNull());
});

test('a pending startup reconciliation does not announce grant failure before it settles', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  announce.mockClear();
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  const result = await renderScreen('granted', {}, {
    applied: false,
    whenReady: () => ready,
  });
  expect(result.rendered.queryByText(messages.en.analytics.grantIncomplete)).toBeNull();
  expect(announce).not.toHaveBeenCalledWith(messages.en.analytics.grantIncomplete);
  await act(async () => { release(); });
  expect(result.rendered.getByText(messages.en.analytics.grantIncomplete)).toBeOnTheScreen();
  announce.mockRestore();
});

test('a grant being saved does not show failure before provider opt-in settles', async () => {
  let finish!: () => void;
  const onGrant = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  const result = await renderScreen('withdrawn', { onGrant });
  await act(async () => {
    fireEvent(result.rendered.getByTestId('settings-privacy-toggle-row-toggle'), 'valueChange', true);
  });
  await result.rendered.rerender(
    <PerformanceTelemetryContext value={result.telemetry}>
      <ProductAnalyticsProvider analytics={result.analytics}>
      <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <PrivacySettingsScreen {...result.screenProps} consent="granted" identifier={null} />
          </SafeAreaProvider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
      </ProductAnalyticsProvider>
    </PerformanceTelemetryContext>,
  );
  expect(result.rendered.queryByText(messages.en.analytics.grantIncomplete)).toBeNull();
  expect(result.rendered.queryByTestId('settings-privacy-retry-grant-row')).toBeNull();
  await act(async () => { finish(); });
  expect(result.rendered.getByTestId('settings-privacy-toggle-row-toggle').props.value).toBe(true);
});

test('the policy row renders only for a real URL and opens it', async () => {
  const onOpenPrivacyPolicy = jest.fn();
  const result = await renderScreen('withdrawn', {
    privacyPolicyUrl: 'https://example.com/privacy',
    onOpenPrivacyPolicy,
  });

  fireEvent.press(result.rendered.getByTestId('settings-privacy-policy-row'));
  expect(onOpenPrivacyPolicy).toHaveBeenCalledTimes(1);
});
