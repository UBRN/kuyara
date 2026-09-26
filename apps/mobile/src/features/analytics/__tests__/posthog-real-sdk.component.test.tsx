import { render } from '@testing-library/react-native';
import { PostHog } from 'posthog-react-native';

import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { PerformanceTelemetryContext } from '@/features/analytics/application/use-performance-telemetry';
import {
  type AnalyticsConsentControls,
  useAnalyticsConsent,
} from '@/features/analytics/application/use-analytics-consent';
import {
  createPostHogProductAnalytics,
  type SyncStringStorage,
} from '@/features/analytics/data/posthog-product-analytics';
import type { ProductAnalytics } from '@/features/analytics/domain/product-analytics';
import {
  ProfileApplicationContext,
  type ProfileApplicationValue,
} from '@/features/profile/application/profile-context';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

const { gunzipSync } = jest.requireActual('node:zlib') as {
  gunzipSync: (bytes: Uint8Array) => { toString: (encoding: string) => string };
};

function durableStorage(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  let failWrite = false;
  const storage: SyncStringStorage = {
    getItem: (key) => files.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrite && key === '.posthog-rn.json') throw new Error('disk unavailable');
      files.set(key, value);
    },
  };
  return { files, storage, failNextCleanup: () => { failWrite = true; }, restore: () => { failWrite = false; } };
}

function oldProviderState() {
  return JSON.stringify({ version: 'v1', content: {
    opted_out: false,
    distinct_id: 'old-distinct-id',
    device_id: 'old-device-id',
    queue: [{ message: { event: 'old_queued_event', distinct_id: 'old-distinct-id' } }],
  } });
}

function oldLogsState() {
  return JSON.stringify({ version: 'v1', content: {
    logs_queue: [{ message: { event: '$log', distinct_id: 'old-distinct-id' } }],
  } });
}

function observeTransport() {
  const requests: { url: string; body: unknown; encoding: string | undefined }[] = [];
  let failing = false;
  const spy = jest.spyOn(PostHog.prototype, 'fetch').mockImplementation(async (url, options) => {
    requests.push({
      url,
      body: options.body,
      encoding: options.headers?.['Content-Encoding'],
    });
    if (failing) throw new Error('network unavailable');
    return { status: 200, text: async () => '{}', json: async () => ({}) };
  });
  return {
    requests,
    fail: () => { failing = true; },
    succeed: () => { failing = false; },
    client: () => spy.mock.instances.at(-1) as unknown as PostHog,
    restore: () => spy.mockRestore(),
  };
}

function ConsentHarness({ onReady }: Readonly<{ onReady: (controls: AnalyticsConsentControls) => void }>) {
  onReady(useAnalyticsConsent());
  return null;
}

async function requestText(request: { body: unknown; encoding: string | undefined }): Promise<string> {
  const bytes = request.body instanceof Blob
    ? new Uint8Array(await request.body.arrayBuffer())
    : typeof request.body === 'string'
      ? new Uint8Array(await new Blob([request.body]).arrayBuffer())
      : request.body as Uint8Array;
  return request.encoding === 'gzip'
    ? gunzipSync(bytes).toString('utf8')
    : new Blob([bytes as BlobPart]).text();
}

test('real SDK: persisted opt-in and old queue cannot send on withdrawn restart', async () => {
  const durable = durableStorage({
    '.posthog-rn.json': oldProviderState(),
    '.posthog-rn-logs.json': oldLogsState(),
  });
  const transport = observeTransport();
  const optIn = jest.spyOn(PostHog.prototype, 'optIn');
  let sdk: PostHog | null = null;
  try {
    const analytics = createPostHogProductAnalytics({
      apiKey: 'phc_test', host: 'https://eu.i.posthog.com', consent: 'withdrawn',
      storage: durable.storage, readConsent: () => 'withdrawn',
    });
    await analytics.whenReady();
    expect(transport.requests).toHaveLength(0);
    expect(optIn).not.toHaveBeenCalled();
    expect(analytics.getIdentifier()).toBeNull();
    const content = JSON.parse(durable.files.get('.posthog-rn.json') ?? '{}').content;
    expect(content).toEqual({ opted_out: true });
    expect(JSON.parse(durable.files.get('.posthog-rn-logs.json') ?? '{}').content).toEqual({});

    // The installed SDK, with the same durable storage, must hydrate as opted out.
    sdk = new PostHog('phc_test', {
      customStorage: durable.storage, defaultOptIn: false,
      captureAppLifecycleEvents: false, disableRemoteFeatureFlags: true,
      preloadFeatureFlags: false, disableSurveys: true,
    });
    await sdk.ready();
    expect(sdk.optedOut).toBe(true);
    expect(transport.requests).toHaveLength(0);
  } finally {
    await sdk?.shutdown(1000);
    optIn.mockRestore();
    transport.restore();
  }
});

test('real SDK: failed cleanup, restart, and re-grant never transmit old event or identity', async () => {
  const durable = durableStorage({
    '.posthog-rn.json': oldProviderState(),
    '.posthog-rn-logs.json': oldLogsState(),
  });
  const transport = observeTransport();
  let consent: AnalyticsConsent = 'withdrawn';
  const active: ProductAnalytics[] = [];
  try {
    durable.failNextCleanup();
    const failed = createPostHogProductAnalytics({
      apiKey: 'phc_test', host: 'https://eu.i.posthog.com', consent,
      storage: durable.storage, readConsent: () => consent,
    });
    await failed.whenReady();
    expect(failed.isCleanupPending()).toBe(true);
    expect(transport.requests).toHaveLength(0);

    durable.restore();
    const restarted = createPostHogProductAnalytics({
      apiKey: 'phc_test', host: 'https://eu.i.posthog.com', consent,
      storage: durable.storage, readConsent: () => consent,
    });
    active.push(restarted);
    await restarted.whenReady();
    await restarted.prepareGrant();
    expect(transport.requests).toHaveLength(0);
    expect(restarted.isCleanupPending()).toBe(false);
    consent = 'granted';
    await restarted.optIn('settings_privacy');
    restarted.capture('notification_opened', { schema_version: 3, kind: 'weather_alert' });
    await restarted.flush();

    const outgoing = (await Promise.all(transport.requests.map(requestText))).join('\n');
    expect(outgoing).toContain('notification_opened');
    expect(outgoing).not.toContain('old_queued_event');
    expect(outgoing).not.toContain('old-distinct-id');
    expect(outgoing).not.toContain('old-device-id');
    const nextLaunch = createPostHogProductAnalytics({
      apiKey: 'phc_test', host: 'https://eu.i.posthog.com', consent,
      storage: durable.storage, readConsent: () => consent,
    });
    active.push(nextLaunch);
    await nextLaunch.whenReady();
    expect(nextLaunch.isApplied()).toBe(true);
  } finally {
    consent = 'withdrawn';
    await Promise.allSettled(active.map((analytics) => analytics.withdraw()));
    transport.restore();
  }
});

test('real SDK: withdrawal event flushes once while granted, then stored withdrawal blocks transport', async () => {
  const durable = durableStorage();
  const transport = observeTransport();
  let consent: AnalyticsConsent = 'granted';
  try {
    const analytics = createPostHogProductAnalytics({
      apiKey: 'phc_test', host: 'https://eu.i.posthog.com', consent,
      storage: durable.storage, readConsent: () => consent,
    });
    await analytics.whenReady();
    analytics.capture('notification_opened', { schema_version: 3, kind: 'weather_alert' });
    analytics.capture('analytics_consent_withdrawn', { schema_version: 3 });
    await analytics.flush();
    const beforeWithdrawal = (await Promise.all(transport.requests.map(requestText))).join('\n');
    expect(beforeWithdrawal.match(/analytics_consent_withdrawn/g)).toHaveLength(1);
    const requestsBeforeWithdrawal = transport.requests.length;
    consent = 'withdrawn';
    analytics.markCleanupPending();
    await analytics.withdraw();
    analytics.capture('notification_opened', { schema_version: 3, kind: 'weather_alert' });
    await analytics.flush();

    expect(transport.requests).toHaveLength(requestsBeforeWithdrawal);
    expect(JSON.parse(durable.files.get('.posthog-rn.json') ?? '{}').content)
      .toEqual({ opted_out: true });
  } finally {
    transport.restore();
  }
});

test('real SDK: failed final flush and consent write cannot send on a later background flush', async () => {
  const durable = durableStorage();
  const transport = observeTransport();
  let consent: AnalyticsConsent = 'granted';
  let controls!: AnalyticsConsentControls;
  const analytics = createPostHogProductAnalytics({
    apiKey: 'phc_test', host: 'https://eu.i.posthog.com', consent,
    storage: durable.storage, readConsent: () => consent,
  });
  const updateAnalyticsConsent = jest.fn(async () => {
    throw new Error('persistence unavailable');
  });
  const application = {
    state: { status: 'ready' as const, profile: {
      id: 'profile-id', gender: 'woman', clothingPreference: 'womens',
      dressStyle: 'smart', birthDate: null, languagePreference: 'en',
      themePreference: 'light', onboardingCompleted: true,
      notificationsOptIn: false, analyticsConsent: 'granted',
      createdAt: '2026-09-09T12:00:00.000Z', updatedAt: '2026-09-09T12:00:00.000Z',
    }, isSaving: false },
    updateAnalyticsConsent,
  } as unknown as ProfileApplicationValue;
  try {
    await analytics.whenReady();
    await render(
      <ProfileApplicationContext value={application}>
        <PerformanceTelemetryContext value={{
          logEvent: () => undefined, reportError: () => undefined,
          setDispatching: () => undefined, isApplied: () => true,
        }}>
          <ProductAnalyticsProvider analytics={analytics}>
            <ConsentHarness onReady={(value) => { controls = value; }} />
          </ProductAnalyticsProvider>
        </PerformanceTelemetryContext>
      </ProfileApplicationContext>,
    );
    transport.fail();
    await expect(controls.withdraw()).rejects.toThrow('persistence unavailable');
    expect(updateAnalyticsConsent).toHaveBeenCalledWith('withdrawn');
    expect(analytics.isWithdrawalInProgress()).toBe(true);
    const requestsAfterFinalAttempt = transport.requests.length;
    expect(requestsAfterFinalAttempt).toBeGreaterThan(0);
    const sdk = transport.client();
    const queued = (sdk as unknown as {
      getPersistedProperty: (key: 'queue') => unknown[] | null;
    }).getPersistedProperty('queue');
    expect(queued?.length).toBeGreaterThan(0);

    transport.succeed();
    await sdk.flush().catch(() => undefined);
    expect(transport.requests).toHaveLength(requestsAfterFinalAttempt);
    analytics.capture('notification_opened', { schema_version: 3, kind: 'weather_alert' });
    await analytics.flush();
    expect(transport.requests).toHaveLength(requestsAfterFinalAttempt);
  } finally {
    consent = 'withdrawn';
    try { await analytics.withdraw(); } finally { transport.restore(); }
  }
}, 35_000);

test('withdrawn startup keeps durable cleanup pending when native telemetry disable fails', async () => {
  const durable = durableStorage({ '.posthog-rn.json': oldProviderState() });
  const failed = createPostHogProductAnalytics({
    apiKey: 'phc_test', host: 'https://eu.i.posthog.com', consent: 'withdrawn',
    storage: durable.storage, readConsent: () => 'withdrawn',
    disableTelemetryOnStartup: () => { throw new Error('native configure failed'); },
  });
  await failed.whenReady();
  expect(failed.isCleanupPending()).toBe(true);

  const restarted = createPostHogProductAnalytics({
    apiKey: 'phc_test', host: 'https://eu.i.posthog.com', consent: 'withdrawn',
    storage: durable.storage, readConsent: () => 'withdrawn',
    disableTelemetryOnStartup: () => undefined,
  });
  await restarted.whenReady();
  expect(restarted.isCleanupPending()).toBe(false);
  expect(JSON.parse(durable.files.get('.posthog-rn.json') ?? '{}').content)
    .toEqual({ opted_out: true });
});
