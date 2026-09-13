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
type EventProperties = NonNullable<NonNullable<BeforeSendEvent>['properties']>;
type JsonRecord = Record<string, EventProperties[string]>;

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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickProperties(record: JsonRecord, keys: readonly string[]): JsonRecord {
  return Object.fromEntries(
    keys.flatMap((key) => Object.hasOwn(record, key) ? [[key, record[key]]] : []),
  );
}

function sanitizeMechanism(value: unknown): JsonRecord | undefined {
  if (!isRecord(value)) return undefined;

  const mechanism: JsonRecord = {};
  if (typeof value.handled === 'boolean') mechanism.handled = value.handled;
  if (typeof value.type === 'string') mechanism.type = value.type;
  if (typeof value.synthetic === 'boolean') mechanism.synthetic = value.synthetic;
  return mechanism;
}

function sanitizeExceptionList(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((exception) => {
    const sanitized = pickProperties(exception, ['type', 'value']);
    const mechanism = sanitizeMechanism(exception.mechanism);
    if (mechanism) sanitized.mechanism = mechanism;
    const stacktrace = exception.stacktrace;
    if (!isRecord(stacktrace) || !Array.isArray(stacktrace.frames)) return sanitized;

    return {
      ...sanitized,
      stacktrace: {
        frames: stacktrace.frames.filter(isRecord).map((frame) =>
          pickProperties(frame, [
            'platform',
            'filename',
            'function',
            'module',
            'lineno',
            'colno',
            'in_app',
            'chunk_id',
          ])),
      },
    };
  });
}

function sanitizePostHogException(event: BeforeSendEvent): BeforeSendEvent {
  const sanitized = sanitizePostHogEvent(event);
  if (!sanitized?.properties) return sanitized;

  const properties = Object.fromEntries(
    Object.entries(sanitized.properties).filter(([key]) => !key.startsWith('$exception')),
  );
  if (Object.hasOwn(sanitized.properties, '$exception_level')) {
    properties.$exception_level = sanitized.properties.$exception_level;
  }
  if (Object.hasOwn(sanitized.properties, '$exception_list')) {
    properties.$exception_list = sanitizeExceptionList(
      sanitized.properties.$exception_list,
    );
  }

  return { ...sanitized, properties };
}

function exceptionFingerprint(event: BeforeSendEvent): string {
  const exceptionList = event?.properties?.$exception_list;
  const exception = Array.isArray(exceptionList) && isRecord(exceptionList[0])
    ? exceptionList[0]
    : undefined;
  const stacktrace = exception && isRecord(exception.stacktrace)
    ? exception.stacktrace
    : undefined;
  const frames = (stacktrace && Array.isArray(stacktrace.frames)
    ? stacktrace.frames
    : []).filter(isRecord);
  // @posthog/core's parsers/index.ts:203 runs `localStack.reverse()`, so frames are oldest
  // first. Walk backward for the topmost in-app frame, falling back to the final frame.
  let frame = frames.at(-1);
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    if (frames[index].in_app === true) {
      frame = frames[index];
      break;
    }
  }

  return JSON.stringify([
    exception?.type ?? null,
    frame?.filename ?? null,
    frame?.function ?? null,
    frame?.lineno ?? null,
  ]);
}

type PostHogBeforeSendController = Readonly<{
  beforeSend: BeforeSendHook;
  dispose: () => void;
}>;

export function createPostHogBeforeSend(): PostHogBeforeSendController {
  let exceptionCount = 0;
  const exceptionFingerprints = new Set<string>();
  let disposed = false;

  const beforeSend: BeforeSendHook = (event) => {
    if (disposed) return null;
    if (event?.event !== '$exception') return sanitizePostHogEvent(event);

    const sanitized = sanitizePostHogException(event);
    const fingerprint = exceptionFingerprint(sanitized);
    if (exceptionFingerprints.has(fingerprint)) return null;
    if (exceptionCount >= 5) return null;

    exceptionFingerprints.add(fingerprint);
    exceptionCount += 1;
    return sanitized;
  };

  return {
    beforeSend,
    dispose: () => {
      disposed = true;
    },
  };
}

// The client only exists after consent: the adapter constructs it on a granted profile or
// inside `optIn()`, never before, which is how "nothing before consent" is enforced. At that
// point it initialises opted in, because the SDK captures and marks its one-time
// "Application Installed" lifecycle event during initialisation, and an opted-out
// construction would drop that install signal for good.
export const resolvePostHogProviderOptions = (
  host: string,
  beforeSend = createPostHogBeforeSend().beforeSend,
): PostHogOptions => ({
  host,
  defaultOptIn: true,
  personProfiles: 'identified_only',
  disableGeoip: true,
  captureAppLifecycleEvents: true,
  before_send: beforeSend,
  preloadFeatureFlags: false,
  disableRemoteFeatureFlags: true,
  disableSurveys: true,
  enableSessionReplay: false,
  setDefaultPersonProperties: false,
  capturePushNotificationSubscriptions: false,
  capturePushNotificationOpened: false,
  errorTracking: {
    autocapture: {
      uncaughtExceptions: true,
      unhandledRejections: true,
    },
    exceptionSteps: { enabled: false },
  },
});

function createSdkClient(
  apiKey: string,
  host: string,
  beforeSend: BeforeSendHook,
): PostHogClient {
  // Keep the native SDK out of Node adapter tests, which always inject a fake client.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PostHog: PostHogClientConstructor } = require('posthog-react-native') as typeof import('posthog-react-native');
  return new PostHogClientConstructor(
    apiKey,
    resolvePostHogProviderOptions(host, beforeSend),
  );
}

type CreatePostHogClient = (beforeSend: BeforeSendHook) => PostHogClient;

class PostHogProductAnalytics implements ProductAnalytics {
  private client: PostHogClient | null = null;
  private consented: boolean;
  private readonly reconciliation: Promise<void>;
  private readonly createClient: CreatePostHogClient;
  private disposeBeforeSend: (() => void) | null = null;

  constructor(createClient: CreatePostHogClient, consent: AnalyticsConsent) {
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
    // `$exception` is outside AnalyticsEventName, so ProductAnalytics cannot receive or buffer
    // one; only the consent-gated SDK autocapture path can produce one.
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
    this.disposeBeforeSend?.();
    this.disposeBeforeSend = null;
    await attempt(() => client.optOut());
    // Core 1.52.0 flushes its persisted queue without consulting optedOut, so this still
    // sends the queued withdrawal while optOut blocks lifecycle capture during the flush.
    await attempt(() => client.flush());
    // `reset()` deliberately keeps the persisted queues, so a flush that failed offline would
    // otherwise deliver pre-withdrawal events later under the identity being severed.
    await attempt(() =>
      client.setPersistedProperty('queue' as PostHogPersistedProperty, null));
    // `reset()` nulls `opted_out` too, and `defaultOptIn: true` reads a null as opted in, so
    // the permanent app-state listener would capture lifecycle events under the fresh device
    // id until the app exits. Keeping the property holds the opt-out through the reset.
    await attempt(() => client.reset(['opted_out'] as PostHogPersistedProperty[]));
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
    if (!this.client) {
      const controller = createPostHogBeforeSend();
      try {
        this.client = this.createClient(controller.beforeSend);
        this.disposeBeforeSend = controller.dispose;
      } catch (error) {
        controller.dispose();
        throw error;
      }
    }
    return this.client;
  }
}

export function createPostHogProductAnalytics(
  options: PostHogProductAnalyticsOptions,
  createClient: CreatePostHogClient = (beforeSend) =>
    createSdkClient(options.apiKey, options.host, beforeSend),
): ProductAnalytics {
  return new PostHogProductAnalytics(createClient, options.consent);
}
