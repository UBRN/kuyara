import { act, render } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Text } from 'react-native';
import { useEffect, useState } from 'react';

import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { PerformanceTelemetryContext } from '@/features/analytics/application/use-performance-telemetry';
import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import type { ProductAnalyticsValue } from '@/features/analytics/application/use-product-analytics';
import {
  type AnalyticsConsentControls,
  useAnalyticsConsent,
} from '@/features/analytics/application/use-analytics-consent';
import type { ProductAnalytics } from '@/features/analytics/domain/product-analytics';
import type { PerformanceTelemetry } from '@/features/analytics/domain/performance-telemetry';
import { noopProductAnalytics } from '@/features/analytics/data/noop-product-analytics';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
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

const addEventListener = jest.mocked(AppState.addEventListener);

async function renderConsentBoundary(
  analytics: RecordingProductAnalytics,
  firstUseStore = new InMemoryFirstUseStore(),
  initialConsent: 'undecided' | 'granted' | 'withdrawn' = 'undecided',
  telemetry?: PerformanceTelemetry,
  onUpdate?: (consent: 'undecided' | 'granted' | 'withdrawn') => void,
) {
  let controls!: AnalyticsConsentControls;
  let trackers!: ProductAnalyticsValue;
  function Child() {
    const currentControls = useAnalyticsConsent();
    const currentTrackers = useProductAnalytics();
    useEffect(() => {
      controls = currentControls;
      trackers = currentTrackers;
    }, [currentControls, currentTrackers]);
    return <Text>{currentControls.consent}</Text>;
  }
  function Boundary() {
    const [consent, setConsent] = useState<'undecided' | 'granted' | 'withdrawn'>(initialConsent);
    const application = {
      state: { status: 'ready' as const, profile: { ...profile, analyticsConsent: consent }, isSaving: false },
      updateAnalyticsConsent: async (answer: 'undecided' | 'granted' | 'withdrawn') => {
        onUpdate?.(answer);
        setConsent(answer);
      },
    } as ProfileApplicationValue;
    return (
      <ProfileApplicationContext value={application}>
        <PerformanceTelemetryContext value={telemetry ?? {
          logEvent: () => undefined,
          reportError: () => undefined,
          setDispatching: async () => undefined,
          isApplied: () => true,
        }}>
          <ProductAnalyticsProvider analytics={analytics} firstUseStore={firstUseStore}>
            <Child />
          </ProductAnalyticsProvider>
        </PerformanceTelemetryContext>
      </ProfileApplicationContext>
    );
  }
  addEventListener.mockClear();
  const listeners = new Set<(status: AppStateStatus) => void>();
  addEventListener.mockImplementation((_type, listener) => {
    listeners.add(listener);
    return { remove: () => { listeners.delete(listener); } };
  });
  await render(<Boundary />);
  const background = () => {
    listeners.forEach((listener) => listener('active'));
    listeners.forEach((listener) => listener('background'));
  };
  return { get controls() { return controls; }, get trackers() { return trackers; }, background, firstUseStore };
}

test('a failure from before the consent answer is not replayed after acceptance', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const boundary = await renderConsentBoundary(analytics);
  boundary.trackers.errorEpisodes.failed({ surface: 'today', failureCategory: 'offline' });

  await act(async () => boundary.controls.grant('today_sheet'));
  boundary.background();

  expect(analytics.names()).toEqual(['analytics_consent_granted']);
});

test('granting consent again does not capture or opt in a second time', async () => {
  const analytics = new RecordingProductAnalytics('granted');
  const boundary = await renderConsentBoundary(analytics, new InMemoryFirstUseStore(), 'granted');

  await act(async () => boundary.controls.grant('today_sheet'));

  expect(analytics.names()).toEqual([]);
  expect(analytics.optInCount).toBe(0);
  expect(boundary.controls.consent).toBe('granted');
});

test('retrying a stored grant applies an analytics provider that has not applied it', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const boundary = await renderConsentBoundary(analytics, new InMemoryFirstUseStore(), 'granted');

  await act(async () => boundary.controls.grant('settings_privacy'));

  expect(analytics.optInCount).toBe(1);
  expect(analytics.names()).toEqual(['analytics_consent_granted']);
});

test.each([
  { name: 'a telemetry-only retry applies Observe without touching PostHog or consent', fails: false },
  { name: 'a failed telemetry-only retry leaves PostHog and consent granted', fails: true },
])('$name', async ({ fails }) => {
  const analytics = new RecordingProductAnalytics('granted');
  const firstUseStore = new InMemoryFirstUseStore(['closet']);
  const clearFirstUses = jest.spyOn(firstUseStore, 'clear');
  const updateConsent = jest.fn();
  const dispatch = jest.fn(async () => {
    if (fails) throw new Error('Observe dispatch failed');
  });
  const boundary = await renderConsentBoundary(analytics, firstUseStore, 'granted', {
    logEvent: () => undefined,
    reportError: () => undefined,
    setDispatching: dispatch,
    isApplied: () => false,
  }, updateConsent);
  const prepareGrant = jest.spyOn(analytics, 'prepareGrant');
  const optIn = jest.spyOn(analytics, 'optIn');
  const capture = jest.spyOn(analytics, 'capture');
  const resetErrors = jest.spyOn(boundary.trackers.errorEpisodes, 'reset');
  const resetRetries = jest.spyOn(boundary.trackers.retries, 'reset');
  const identifier = boundary.controls.getIdentifier();
  expect(boundary.trackers.retries.nextAttempt('today')).toBe(1);

  if (fails) {
    await act(async () => {
      await expect(boundary.controls.grant('settings_privacy')).rejects.toThrow('Observe dispatch failed');
    });
  } else {
    await act(async () => boundary.controls.grant('settings_privacy'));
  }

  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(dispatch).toHaveBeenCalledWith(true);
  expect(prepareGrant).not.toHaveBeenCalled();
  expect(optIn).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  expect(analytics.withdrawCount).toBe(0);
  expect(resetErrors).not.toHaveBeenCalled();
  expect(resetRetries).not.toHaveBeenCalled();
  expect(clearFirstUses).not.toHaveBeenCalled();
  expect(updateConsent).not.toHaveBeenCalled();
  expect(boundary.trackers.retries.nextAttempt('today')).toBe(2);
  expect(await firstUseStore.has('closet')).toBe(true);
  expect(boundary.controls.getIdentifier()).toBe(identifier);
  expect(boundary.controls.consent).toBe('granted');
});

test('a failure after acceptance is captured with its post-acceptance timestamp', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const boundary = await renderConsentBoundary(analytics);
  jest.useFakeTimers().setSystemTime(new Date('2026-09-09T12:00:00.000Z'));
  try {
    boundary.trackers.errorEpisodes.failed({ surface: 'today', failureCategory: 'offline' });
    await act(async () => boundary.controls.grant('today_sheet'));
    jest.setSystemTime(new Date('2026-09-09T12:01:00.000Z'));

    boundary.trackers.errorEpisodes.failed({ surface: 'today', failureCategory: 'offline' });
    boundary.background();

    const shown = analytics.captures.filter((capture) => capture.name === 'error_shown');
    expect(shown).toHaveLength(1);
    expect(shown[0].options!.timestamp).toBe('2026-09-09T12:01:00.000Z');
  } finally {
    jest.useRealTimers();
  }
});

test('first use while unanswered writes nothing and a later use records after acceptance', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const boundary = await renderConsentBoundary(analytics);

  await expect(boundary.trackers.firstUses.markFirstUse('closet')).resolves.toBe(false);
  expect(await boundary.firstUseStore.has('closet')).toBe(false);
  await act(async () => boundary.controls.grant('today_sheet'));
  await expect(boundary.trackers.firstUses.markFirstUse('closet')).resolves.toBe(true);
  expect(await boundary.firstUseStore.has('closet')).toBe(true);
});

test('first acceptance clears a marker saved by an earlier build', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const firstUseStore = new InMemoryFirstUseStore(['closet']);
  const boundary = await renderConsentBoundary(analytics, firstUseStore);

  await act(async () => boundary.controls.grant('today_sheet'));

  await expect(boundary.trackers.firstUses.markFirstUse('closet')).resolves.toBe(true);
});

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
        setDispatching: async (enabled) => { operations.push(`telemetry:${enabled}`); },
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
    'resetErrors',
    'resetRetries',
    'clearFirstUses',
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

test('rejected Observe dispatch rolls back a saved grant and rejects visibly', async () => {
  const operations: string[] = [];
  const analytics = new RecordingProductAnalytics('undecided');
  let controls!: AnalyticsConsentControls;
  const application = {
    state: { status: 'ready' as const, profile, isSaving: false },
    updateAnalyticsConsent: async (consent: string) => { operations.push(`persist:${consent}`); },
  } as ProfileApplicationValue;

  await render(
    <ProfileApplicationContext value={application}>
      <PerformanceTelemetryContext value={{
        logEvent: () => undefined, reportError: () => undefined,
        setDispatching: async (enabled) => {
          operations.push(`telemetry:${enabled}`);
          if (enabled) throw new Error('Observe dispatch failed');
        },
        isApplied: () => false,
      }}>
        <ProductAnalyticsProvider analytics={analytics}>
          <Harness onReady={(value) => { controls = value; }} />
        </ProductAnalyticsProvider>
      </PerformanceTelemetryContext>
    </ProfileApplicationContext>,
  );

  await expect(controls.grant('settings_privacy')).rejects.toThrow('Observe dispatch failed');
  expect(operations).toEqual([
    'persist:granted', 'telemetry:true', 'telemetry:false', 'persist:withdrawn',
  ]);
  expect(analytics.withdrawCount).toBe(1);
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
        setDispatching: async (enabled) => { operations.push(`telemetry:${enabled}`); },
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
        setDispatching: async () => {
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
        setDispatching: async (enabled) => { operations.push(`telemetry:${enabled}`); },
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
        setDispatching: async (enabled) => { operations.push(`telemetry:${enabled}`); },
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
