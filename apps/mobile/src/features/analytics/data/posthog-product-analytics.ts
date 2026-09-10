// This is the only production module that loads the provider SDK. Tests inject the small
// client surface below, so the Node test runner never has to evaluate React Native code.
import type {
  PostHog,
  PostHogOptions,
  PostHogPersistedProperty,
} from 'posthog-react-native';

import {
  ANALYTICS_SCHEMA_VERSION,
  analyticsEventPropertyKeys,
} from '@/features/analytics/domain/analytics-events';
import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
} from '@/features/analytics/domain/analytics-events';
import type {
  AnalyticsCaptureOptions,
  AnalyticsConsentSurface,
  ProductAnalytics,
} from '@/features/analytics/domain/product-analytics';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

type ProviderEventProperties = NonNullable<Parameters<PostHog['capture']>[1]>;
type BeforeSendHook = Exclude<
  NonNullable<PostHogOptions['before_send']>,
  readonly unknown[]
>;
type BeforeSendEvent = Parameters<BeforeSendHook>[0];

export type PostHogClient = Pick<
  PostHog,
  | 'capture'
  | 'flush'
  | 'getDistinctId'
  | 'getSessionId'
  | 'optIn'
  | 'optOut'
  | 'reset'
  | 'setPersistedProperty'
>;

export type PostHogProductAnalyticsOptions = Readonly<{
  apiKey: string;
  host: string;
  consent: AnalyticsConsent;
}>;

const allowedCustomPropertyKeys = new Set<string>(
  Object.values(analyticsEventPropertyKeys).flat(),
);
const blockedSystemPropertyKeys = new Set([
  '$ip',
  '$screen_name',
  '$current_url',
  '$referrer',
]);

export function sanitizePostHogEvent(event: BeforeSendEvent): BeforeSendEvent {
  if (!event?.properties) return event;

  const properties = Object.fromEntries(
    Object.entries(event.properties).filter(([key]) => {
      if (allowedCustomPropertyKeys.has(key)) return true;
      if (!key.startsWith('$')) return false;
      if (blockedSystemPropertyKeys.has(key)) return false;
      // This control property prevents server-side location enrichment. Other `$geoip*`
      // properties are data and remain outside the allowlist.
      if (key === '$geoip_disable') return true;
      return !key.startsWith('$geoip');
    }),
  );

  return { ...event, properties };
}

// The client only exists after consent: the adapter constructs it on a granted profile or
// inside `optIn()`, never before, which is how "nothing before consent" is enforced. At that
// point it initialises opted in, because the SDK captures and marks its one-time
// "Application Installed" lifecycle event during initialisation, and an opted-out
// construction would drop that install signal for good.
const providerOptions = (host: string): PostHogOptions => ({
  host,
  defaultOptIn: true,
  personProfiles: 'identified_only',
  disableGeoip: true,
  captureAppLifecycleEvents: true,
  before_send: sanitizePostHogEvent,
  preloadFeatureFlags: false,
  disableRemoteFeatureFlags: true,
  disableSurveys: true,
  enableSessionReplay: false,
  setDefaultPersonProperties: false,
  capturePushNotificationSubscriptions: false,
  capturePushNotificationOpened: false,
  errorTracking: {
    autocapture: false,
    exceptionSteps: { enabled: false },
  },
});

function createSdkClient(apiKey: string, host: string): PostHogClient {
  // Keep the native SDK out of Node adapter tests, which always inject a fake client.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PostHog: PostHogClientConstructor } = require('posthog-react-native') as typeof import('posthog-react-native');
  return new PostHogClientConstructor(apiKey, providerOptions(host));
}

class PostHogProductAnalytics implements ProductAnalytics {
  private client: PostHogClient | null = null;
  private consented: boolean;
  private readonly reconciliation: Promise<void>;
  private readonly createClient: () => PostHogClient;

  constructor(createClient: () => PostHogClient, consent: AnalyticsConsent) {
    this.createClient = createClient;
    this.consented = consent === 'granted';
    if (!this.consented) {
      this.reconciliation = Promise.resolve();
      return;
    }

    const reconciliation = this.getOrCreateClient().optIn();
    // The persisted profile remains authoritative. A provider persistence failure must not
    // crash app startup, and the local gate still prevents capture when consent is absent.
    this.reconciliation = reconciliation.catch(() => undefined);
  }

  capture<Name extends AnalyticsEventName>(
    name: Name,
    properties: AnalyticsEventProperties<Name>,
    options?: AnalyticsCaptureOptions,
  ): void {
    if (!this.consented) return;
    this.captureProviderEvent(name, properties, options);
  }

  async optIn(surface: AnalyticsConsentSurface): Promise<void> {
    await this.reconciliation;
    const client = this.getOrCreateClient();
    await client.optIn();
    this.consented = true;
    this.captureProviderEvent('analytics_consent_granted', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      surface,
    });
  }

  decline(): Promise<void> {
    return Promise.resolve();
  }

  async withdraw(): Promise<void> {
    await this.reconciliation;
    const client = this.client;
    if (!client) {
      this.consented = false;
      return;
    }

    let failure: unknown;
    const attempt = async (operation: () => void | Promise<void>) => {
      try {
        await operation();
      } catch (error) {
        failure ??= error;
      }
    };

    await attempt(() => this.captureProviderEvent('analytics_consent_withdrawn', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
    }));
    this.consented = false;
    await attempt(() => client.optOut());
    // Core 1.52.0 flushes its persisted queue without consulting optedOut, so this still
    // sends the queued withdrawal while optOut blocks lifecycle capture during the flush.
    await attempt(() => client.flush());
    await attempt(() => client.reset());
    await attempt(() =>
      client.setPersistedProperty(
        'device_id' as PostHogPersistedProperty,
        null,
      ));
    this.client = null;

    if (failure) throw failure;
  }

  flush(): Promise<void> {
    return this.client?.flush() ?? Promise.resolve();
  }

  getIdentifier(): string | null {
    return this.consented ? this.client?.getDistinctId() || null : null;
  }

  getSessionId(): string | null {
    return this.consented ? this.client?.getSessionId() || null : null;
  }

  private captureProviderEvent<Name extends AnalyticsEventName>(
    name: Name,
    properties: AnalyticsEventProperties<Name>,
    options?: AnalyticsCaptureOptions,
  ): void {
    const client = this.client;
    if (!client) return;
    const payload = { ...properties } as unknown as ProviderEventProperties;
    client.capture(
      name,
      payload,
      options ? { timestamp: new Date(options.timestamp) } : undefined,
    );
  }

  private getOrCreateClient(): PostHogClient {
    if (!this.client) this.client = this.createClient();
    return this.client;
  }
}

export function createPostHogProductAnalytics(
  options: PostHogProductAnalyticsOptions,
  createClient: () => PostHogClient = () => createSdkClient(options.apiKey, options.host),
): ProductAnalytics {
  return new PostHogProductAnalytics(createClient, options.consent);
}
