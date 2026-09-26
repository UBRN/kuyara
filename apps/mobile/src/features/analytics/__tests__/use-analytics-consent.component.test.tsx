import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { PerformanceTelemetryContext } from '@/features/analytics/application/use-performance-telemetry';
import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import {
  type AnalyticsConsentControls,
  useAnalyticsConsent,
} from '@/features/analytics/application/use-analytics-consent';
import type { ProductAnalytics } from '@/features/analytics/domain/product-analytics';
import { noopProductAnalytics } from '@/features/analytics/data/noop-product-analytics';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import {
  ProfileApplicationContext,
  type ProfileApplicationValue,
} from '@/features/profile/application/profile-context';

function Harness({ onReady }: Readonly<{ onReady: (value: AnalyticsConsentControls) => void }>) {
  const consent = useAnalyticsConsent();
  onReady(consent);
  return <Text>{consent.consent}</Text>;
}

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

test('grant, withdrawal, and decline use the required operation order', async () => {
  const operations: string[] = [];
  const resetErrors = jest.spyOn(ErrorEpisodeTracker.prototype, 'reset')
    .mockImplementation(() => { operations.push('resetErrors'); });
  const resetRetries = jest.spyOn(RetryCounter.prototype, 'reset')
    .mockImplementation(() => { operations.push('resetRetries'); });
  const analytics: ProductAnalytics = {
    ...noopProductAnalytics,
    capture: (name) => { operations.push(`capture:${name}`); },
    flush: async () => { operations.push('flush'); },
    getIdentifier: () => 'analytics-id',
    getSessionId: () => 'session-id',
    isApplied: () => true, whenReady: async () => undefined,
    optIn: async (surface) => { operations.push(`optIn:${surface}`); },
    prepareGrant: async () => { operations.push('prepareGrant'); },
    decline: async () => { operations.push('decline'); },
    withdraw: async () => { operations.push('withdraw'); },
  };
  const application = {
    state: { status: 'ready' as const, profile, isSaving: false },
    updateAnalyticsConsent: async (consent: string): Promise<void> => {
      operations.push(`persist:${consent}`);
    },
  } as ProfileApplicationValue;
  let controls!: AnalyticsConsentControls;

  await render(
    <ProfileApplicationContext value={application}>
      <PerformanceTelemetryContext value={{
        logEvent: () => undefined, reportError: () => undefined,
        setDispatching: (enabled) => { operations.push(`telemetry:${enabled}`); },
        isApplied: () => true,
      }}>
        <ProductAnalyticsProvider
          analytics={analytics}
          firstUseStore={{
            has: async () => false,
            markUsed: async () => undefined,
            clear: async () => { operations.push('clearFirstUses'); },
          }}>
          <Harness onReady={(value) => { controls = value; }} />
        </ProductAnalyticsProvider>
      </PerformanceTelemetryContext>
    </ProfileApplicationContext>,
  );
  await controls.grant('today_sheet');
  await controls.withdraw();
  await controls.decline();

  expect(operations).toEqual([
    'persist:granted',
    'optIn:today_sheet',
    'telemetry:true',
    'telemetry:false',
    'capture:analytics_consent_withdrawn',
    'flush',
    'persist:withdrawn',
    'withdraw',
    'clearFirstUses',
    'resetErrors',
    'resetRetries',
    'telemetry:false',
    'persist:withdrawn',
    'decline',
    'withdraw',
    'clearFirstUses',
    'resetErrors',
    'resetRetries',
  ]);
  expect(controls.getIdentifier()).toBe('analytics-id');
  resetErrors.mockRestore();
  resetRetries.mockRestore();
});

test('a failed grant persistence never opts the provider in', async () => {
  const operations: string[] = [];
  const analytics: ProductAnalytics = {
    ...noopProductAnalytics,
    capture: () => undefined,
    flush: async () => undefined,
    getIdentifier: () => null,
    getSessionId: () => null,
    isApplied: () => true, whenReady: async () => undefined,
    optIn: async () => { operations.push('optIn'); },
    prepareGrant: async () => undefined,
    decline: async () => undefined,
    withdraw: async () => undefined,
  };
  const application = {
    state: { status: 'ready' as const, profile, isSaving: false },
    updateAnalyticsConsent: async (consent: string): Promise<void> => {
      operations.push(`persist:${consent}`);
      throw new Error('persistence unavailable');
    },
  } as ProfileApplicationValue;
  let controls!: AnalyticsConsentControls;

  await render(
    <ProfileApplicationContext value={application}>
      <ProductAnalyticsProvider analytics={analytics}>
        <Harness onReady={(value) => { controls = value; }} />
      </ProductAnalyticsProvider>
    </ProfileApplicationContext>,
  );

  await expect(controls.grant('today_sheet')).rejects.toThrow(
    'persistence unavailable',
  );
  expect(operations).toEqual(['persist:granted']);
});

test('re-consent clears tracker state accumulated while withdrawn before opting in', async () => {
  const operations: string[] = [];
  const resetErrors = jest.spyOn(ErrorEpisodeTracker.prototype, 'reset')
    .mockImplementation(() => { operations.push('resetErrors'); });
  const resetRetries = jest.spyOn(RetryCounter.prototype, 'reset')
    .mockImplementation(() => { operations.push('resetRetries'); });
  const analytics: ProductAnalytics = {
    ...noopProductAnalytics,
    capture: () => undefined,
    flush: async () => undefined,
    getIdentifier: () => null,
    getSessionId: () => null,
    isApplied: () => true, whenReady: async () => undefined,
    optIn: async (surface) => { operations.push(`optIn:${surface}`); },
    prepareGrant: async () => { operations.push('prepareGrant'); },
    decline: async () => undefined,
    withdraw: async () => undefined,
  };
  const application = {
    state: {
      status: 'ready' as const,
      profile: { ...profile, analyticsConsent: 'withdrawn' as const },
      isSaving: false,
    },
    updateAnalyticsConsent: async (consent: string): Promise<void> => {
      operations.push(`persist:${consent}`);
    },
  } as ProfileApplicationValue;
  let controls!: AnalyticsConsentControls;

  await render(
    <ProfileApplicationContext value={application}>
      <ProductAnalyticsProvider
        analytics={analytics}
        firstUseStore={{
          has: async () => false,
          markUsed: async () => undefined,
          clear: async () => { operations.push('clearFirstUses'); },
        }}>
        <Harness onReady={(value) => { controls = value; }} />
      </ProductAnalyticsProvider>
    </ProfileApplicationContext>,
  );
  await controls.grant('settings_privacy');

  expect(operations).toEqual([
    'prepareGrant',
    'resetErrors',
    'resetRetries',
    'clearFirstUses',
    'persist:granted',
    'optIn:settings_privacy',
  ]);
  resetErrors.mockRestore();
  resetRetries.mockRestore();
});

test('failed device-only first-use clear cannot resume sharing and blocks a later grant', async () => {
  const operations: string[] = [];
  let pending = false;
  const analytics: ProductAnalytics = {
    ...noopProductAnalytics,
    markCleanupPending: () => { pending = true; },
    clearCleanupPending: () => { pending = false; },
    isCleanupPending: () => pending,
    prepareGrant: async () => { operations.push('prepareGrant'); },
    withdraw: async () => { operations.push('withdraw'); },
    optIn: async () => { operations.push('optIn'); },
  };
  const application = {
    state: { status: 'ready' as const,
      profile: { ...profile, analyticsConsent: 'withdrawn' as const }, isSaving: false },
    updateAnalyticsConsent: async (consent: string) => { operations.push(`persist:${consent}`); },
  } as ProfileApplicationValue;
  let controls!: AnalyticsConsentControls;
  await render(
    <ProfileApplicationContext value={application}>
      <ProductAnalyticsProvider analytics={analytics} firstUseStore={{
        has: async () => false,
        markUsed: async () => undefined,
        clear: async () => { throw new Error('local tracker unavailable'); },
      }}>
        <Harness onReady={(value) => { controls = value; }} />
      </ProductAnalyticsProvider>
    </ProfileApplicationContext>,
  );

  await expect(controls.withdraw()).resolves.toBeUndefined();
  expect(pending).toBe(false);
  await expect(controls.grant('settings_privacy')).rejects.toThrow('local tracker unavailable');
  expect(operations).toEqual(['persist:withdrawn', 'withdraw', 'prepareGrant']);
});

test('a provider cleanup failure keeps the stored withdrawal and reports the failure', async () => {
  const operations: string[] = [];
  let pending = false;
  const analytics: ProductAnalytics = {
    ...noopProductAnalytics,
    markCleanupPending: () => { pending = true; operations.push('pending'); },
    clearCleanupPending: () => { pending = false; operations.push('clearPending'); },
    isCleanupPending: () => pending,
    capture: () => undefined,
    flush: async () => undefined,
    getIdentifier: () => null,
    getSessionId: () => null,
    isApplied: () => true, whenReady: async () => undefined,
    optIn: async () => undefined,
    prepareGrant: async () => undefined,
    decline: async () => undefined,
    withdraw: async () => {
      operations.push('withdraw');
      throw new Error('provider unavailable');
    },
  };
  const application = {
    state: {
      status: 'ready' as const,
      profile: { ...profile, analyticsConsent: 'granted' as const },
      isSaving: false,
    },
    updateAnalyticsConsent: async (consent: string): Promise<void> => {
      operations.push(`persist:${consent}`);
    },
  } as ProfileApplicationValue;
  let controls!: AnalyticsConsentControls;

  await render(
    <ProfileApplicationContext value={application}>
      <ProductAnalyticsProvider
        analytics={analytics}
        firstUseStore={{
          has: async () => false,
          markUsed: async () => undefined,
          clear: async () => { operations.push('clearFirstUses'); },
        }}>
        <Harness onReady={(value) => { controls = value; }} />
      </ProductAnalyticsProvider>
    </ProfileApplicationContext>,
  );

  await expect(controls.withdraw()).rejects.toThrow('provider unavailable');
  expect(operations).toEqual(['persist:withdrawn', 'pending', 'withdraw', 'clearFirstUses']);
  expect(analytics.isCleanupPending()).toBe(true);
});

test('a failed withdrawal write keeps capture closed and retry only writes and cleans up', async () => {
  const operations: string[] = [];
  const analytics = new RecordingProductAnalytics('granted');
  let failWrite = true;
  const application = {
    state: {
      status: 'ready' as const,
      profile: { ...profile, analyticsConsent: 'granted' as const },
      isSaving: false,
    },
    updateAnalyticsConsent: async (consent: string): Promise<void> => {
      operations.push(`persist:${consent}`);
      if (failWrite) throw new Error('persistence unavailable');
    },
  } as ProfileApplicationValue;
  let controls!: AnalyticsConsentControls;

  await render(
    <ProfileApplicationContext value={application}>
      <PerformanceTelemetryContext value={{
        logEvent: () => undefined, reportError: () => undefined,
        setDispatching: (enabled) => { operations.push(`telemetry:${enabled}`); },
        isApplied: () => true,
      }}>
        <ProductAnalyticsProvider analytics={analytics}>
          <Harness onReady={(value) => { controls = value; }} />
        </ProductAnalyticsProvider>
      </PerformanceTelemetryContext>
    </ProfileApplicationContext>,
  );

  await expect(controls.withdraw()).rejects.toThrow('persistence unavailable');
  expect(operations).toEqual(['telemetry:false', 'persist:withdrawn']);
  expect(controls.consent).toBe('granted');
  expect(analytics.names()).toEqual(['analytics_consent_withdrawn']);
  expect(analytics.flushCount).toBe(1);
  expect(analytics.isWithdrawalInProgress()).toBe(true);

  analytics.capture('notification_opened', { schema_version: 3, kind: 'weather_alert' });
  expect(analytics.names()).toEqual(['analytics_consent_withdrawn']);
  await expect(controls.grant('settings_privacy')).rejects.toThrow('pending analytics withdrawal');
  expect(operations).toEqual(['telemetry:false', 'persist:withdrawn']);

  failWrite = false;
  await expect(controls.withdraw()).resolves.toBeUndefined();
  expect(operations).toEqual(['telemetry:false', 'persist:withdrawn', 'persist:withdrawn']);
  expect(analytics.names()).toEqual(['analytics_consent_withdrawn']);
  expect(analytics.flushCount).toBe(1);
  expect(analytics.withdrawCount).toBe(1);
});

test('failed native telemetry disable emits nothing and a successful retry emits one withdrawal event', async () => {
  const operations: string[] = [];
  let failDisable = true;
  const analytics: ProductAnalytics = {
    ...noopProductAnalytics,
    capture: (name) => { operations.push(`capture:${name}`); },
    flush: async () => { operations.push('flush'); },
    getIdentifier: () => null, getSessionId: () => null,
    isApplied: () => true, whenReady: async () => undefined,
    optIn: async () => undefined, prepareGrant: async () => undefined,
    decline: async () => undefined,
    withdraw: async () => { operations.push('withdraw'); },
  };
  const application = {
    state: { status: 'ready' as const, profile: { ...profile, analyticsConsent: 'granted' as const }, isSaving: false },
    updateAnalyticsConsent: async (consent: string) => { operations.push(`persist:${consent}`); },
  } as ProfileApplicationValue;
  let controls!: AnalyticsConsentControls;
  await render(
    <ProfileApplicationContext value={application}>
      <PerformanceTelemetryContext value={{
        logEvent: () => undefined, reportError: () => undefined,
        setDispatching: () => {
          operations.push('disable');
          if (failDisable) throw new Error('native configure failed');
        },
        isApplied: () => true,
      }}>
        <ProductAnalyticsProvider analytics={analytics}>
          <Harness onReady={(value) => { controls = value; }} />
        </ProductAnalyticsProvider>
      </PerformanceTelemetryContext>
    </ProfileApplicationContext>,
  );
  await expect(controls.withdraw()).rejects.toThrow('native configure failed');
  expect(operations).toEqual(['disable']);
  expect(controls.consent).toBe('granted');

  failDisable = false;
  await expect(controls.withdraw()).resolves.toBeUndefined();
  expect(operations).toEqual([
    'disable', 'disable', 'capture:analytics_consent_withdrawn',
    'flush', 'persist:withdrawn', 'withdraw',
  ]);
});

test('failed final-event capture and flush still disable and persist withdrawal before provider cleanup', async () => {
  const operations: string[] = [];
  const analytics: ProductAnalytics = {
    ...noopProductAnalytics,
    capture: (name) => {
      operations.push(`capture:${name}`);
      throw new Error('capture failed');
    },
    flush: async () => { operations.push('flush'); throw new Error('flush failed'); },
    withdraw: async () => { operations.push('withdraw'); },
  };
  const application = {
    state: { status: 'ready' as const,
      profile: { ...profile, analyticsConsent: 'granted' as const }, isSaving: false },
    updateAnalyticsConsent: async (consent: string) => { operations.push(`persist:${consent}`); },
  } as ProfileApplicationValue;
  let controls!: AnalyticsConsentControls;
  await render(
    <ProfileApplicationContext value={application}>
      <PerformanceTelemetryContext value={{
        logEvent: () => undefined, reportError: () => undefined,
        setDispatching: (enabled) => { operations.push(`telemetry:${enabled}`); },
        isApplied: () => true,
      }}>
        <ProductAnalyticsProvider analytics={analytics}>
          <Harness onReady={(value) => { controls = value; }} />
        </ProductAnalyticsProvider>
      </PerformanceTelemetryContext>
    </ProfileApplicationContext>,
  );

  await expect(controls.withdraw()).resolves.toBeUndefined();
  expect(operations).toEqual([
    'telemetry:false', 'capture:analytics_consent_withdrawn', 'flush',
    'persist:withdrawn', 'withdraw',
  ]);
});

test('failed provider opt-in rolls back a saved grant and leaves a retry path', async () => {
  const operations: string[] = [];
  const analytics: ProductAnalytics = {
    ...noopProductAnalytics,
    capture: () => undefined, flush: async () => undefined,
    getIdentifier: () => null, getSessionId: () => null,
    isApplied: () => true, whenReady: async () => undefined,
    prepareGrant: async () => { operations.push('prepareGrant'); },
    optIn: async () => { operations.push('optIn'); throw new Error('opt-in failed'); },
    decline: async () => undefined,
    withdraw: async () => { operations.push('withdraw'); },
  };
  const application = {
    state: { status: 'ready' as const, profile: { ...profile, analyticsConsent: 'withdrawn' as const }, isSaving: false },
    updateAnalyticsConsent: async (consent: string) => { operations.push(`persist:${consent}`); },
  } as ProfileApplicationValue;
  let controls!: AnalyticsConsentControls;
  await render(
    <ProfileApplicationContext value={application}>
      <PerformanceTelemetryContext value={{
        logEvent: () => undefined, reportError: () => undefined,
        setDispatching: (enabled) => { operations.push(`telemetry:${enabled}`); },
        isApplied: () => true,
      }}>
        <ProductAnalyticsProvider analytics={analytics}>
          <Harness onReady={(value) => { controls = value; }} />
        </ProductAnalyticsProvider>
      </PerformanceTelemetryContext>
    </ProfileApplicationContext>,
  );
  await expect(controls.grant('settings_privacy')).rejects.toThrow('opt-in failed');
  expect(operations).toEqual([
    'prepareGrant', 'persist:granted', 'optIn',
    'telemetry:false', 'persist:withdrawn', 'withdraw',
  ]);
});

test('failed old queue cleanup prevents re-grant persistence and provider opt-in', async () => {
  const operations: string[] = [];
  const analytics: ProductAnalytics = {
    ...noopProductAnalytics,
    capture: () => undefined, flush: async () => undefined,
    getIdentifier: () => null, getSessionId: () => null,
    isApplied: () => true, whenReady: async () => undefined,
    prepareGrant: async () => { operations.push('prepareGrant'); throw new Error('old queue remains'); },
    optIn: async () => { operations.push('optIn'); },
    decline: async () => undefined, withdraw: async () => undefined,
  };
  const application = {
    state: { status: 'ready' as const, profile: { ...profile, analyticsConsent: 'withdrawn' as const }, isSaving: false },
    updateAnalyticsConsent: async (consent: string) => { operations.push(`persist:${consent}`); },
  } as ProfileApplicationValue;
  let controls!: AnalyticsConsentControls;
  await render(
    <ProfileApplicationContext value={application}>
      <ProductAnalyticsProvider analytics={analytics}>
        <Harness onReady={(value) => { controls = value; }} />
      </ProductAnalyticsProvider>
    </ProfileApplicationContext>,
  );
  await expect(controls.grant('settings_privacy')).rejects.toThrow('old queue remains');
  expect(operations).toEqual(['prepareGrant']);
});
