// This is the only production module that loads the provider SDK. The narrow client
// surface supports Node tests; component tests also exercise the installed SDK.
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
> & Readonly<{
  ready: () => Promise<void>;
  persistAndVerifyCleanup: () => Promise<void>;
  blockTransport?: () => void;
  retire?: () => Promise<void>;
}>;

export type PostHogProductAnalyticsOptions = Readonly<{
  apiKey: string;
  host: string;
  consent: AnalyticsConsent;
  storage?: SyncStringStorage;
  readConsent?: () => AnalyticsConsent;
  disableTelemetryOnStartup?: () => void;
}>;

export type SyncStringStorage = Readonly<{
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}>;

const sdkStorageKey = '.posthog-rn.json';
const sdkLogsStorageKey = '.posthog-rn-logs.json';
export const cleanupPendingKey = '.kuyara-analytics-cleanup-pending';

export function createFileStorage(): SyncStringStorage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  return {
    getItem: (key) => {
      const file = new File(Paths.document, key);
      return file.exists ? file.textSync() : null;
    },
    setItem: (key, value) => { new File(Paths.document, key).write(value); },
  };
}

export function createMemoryStorage(): SyncStringStorage {
  const contents = new Map<string, string>();
  return {
    getItem: (key) => contents.get(key) ?? null,
    setItem: (key, value) => { contents.set(key, value); },
  };
}

export function forceOptedOutStorage(storage: SyncStringStorage): void {
  // The installed SDK reads this synchronously during construction. Its stored
  // opted_out=false overrides defaultOptIn=false, so replace the whole event store
  // before creating a client. This also severs every queue and identity field.
  storage.setItem(sdkStorageKey, JSON.stringify({
    version: 'v1', content: { opted_out: true },
  }));
  storage.setItem(sdkLogsStorageKey, JSON.stringify({
    version: 'v1', content: {},
  }));
  const persisted: unknown = JSON.parse(storage.getItem(sdkStorageKey) ?? 'null');
  if (!isRecord(persisted) || !isRecord(persisted.content)
    || persisted.content.opted_out !== true
    || Object.keys(persisted.content).length !== 1) {
    throw new Error('PostHog opt-out cleanup could not be verified');
  }
  const logs: unknown = JSON.parse(storage.getItem(sdkLogsStorageKey) ?? 'null');
  if (!isRecord(logs) || !isRecord(logs.content)
    || Object.keys(logs.content).length !== 0) {
    throw new Error('PostHog logs cleanup could not be verified');
  }
}

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
  pause: () => void;
  resume: () => void;
}>;

export function createPostHogBeforeSend(maySend: () => boolean = () => true): PostHogBeforeSendController {
  let exceptionCount = 0;
  const exceptionFingerprints = new Set<string>();
  let disposed = false;
  let paused = false;

  const beforeSend: BeforeSendHook = (event) => {
    if (disposed || paused || !maySend()) return null;
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
    pause: () => { paused = true; },
    resume: () => {
      exceptionCount = 0;
      exceptionFingerprints.clear();
      disposed = false;
      paused = false;
    },
  };
}

// A fresh grant constructs the client after consent is saved. Re-grant may construct
// it earlier, but only after replacing the persisted SDK state with opted_out=true.
// Fresh grants retain the SDK's install event behavior.
export const resolvePostHogProviderOptions = (
  host: string,
  beforeSend = createPostHogBeforeSend().beforeSend,
  defaultOptIn = true,
): PostHogOptions => ({
  host,
  defaultOptIn,
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
  defaultOptIn: boolean,
  storage: SyncStringStorage,
  readConsent: () => AnalyticsConsent,
): PostHogClient {
  // Node adapter tests inject a client; the installed SDK is loaded in the app and in
  // component tests with the React Native test environment.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PostHog: PostHogClientConstructor } = require('posthog-react-native') as typeof import('posthog-react-native');
  let transportBlocked = false;
  let retired = false;
  const clientStorage: SyncStringStorage = {
    getItem: storage.getItem,
    setItem: (key, value) => {
      // A retired SDK can still finish an old timer or AppState callback. It must not
      // restore an old queue after the new client's clean state is written.
      if (!retired) storage.setItem(key, value);
    },
  };
  const client = new PostHogClientConstructor(
    apiKey,
    { ...resolvePostHogProviderOptions(host, beforeSend, defaultOptIn), customStorage: clientStorage },
  );
  // Core may flush a queue even while opted out. Check the persisted answer at the
  // transport boundary too, including flushes already scheduled before withdrawal.
  const sdkFetch = client.fetch.bind(client);
  client.fetch = (url, options) => !transportBlocked && readConsent() === 'granted'
    ? sdkFetch(url, options)
    : Promise.reject(new Error('Analytics consent is not granted'));
  return Object.assign(client, {
    blockTransport: () => { transportBlocked = true; },
    retire: async () => {
      transportBlocked = true;
      retired = true;
      // Stop SDK flush/log timers after the old client is severed. The queue was
      // already cleared, and the transport remains blocked during shutdown.
      await client.shutdown(1000);
    },
    persistAndVerifyCleanup: async () => {
      // The installed SDK exposes this drain at runtime, although its TypeScript surface is
      // protected. It forces the pending 100 ms write before this client opts in again.
      await (client as unknown as { flushStorage: () => Promise<void> }).flushStorage();
      await (client as unknown as {
        _logsStorage: { waitForPersist: () => Promise<void> };
      })._logsStorage.waitForPersist();
      const serialized = storage.getItem(sdkStorageKey);
      if (!serialized) throw new Error('PostHog cleanup was not persisted');
      const parsed: unknown = JSON.parse(serialized);
      if (!isRecord(parsed) || !isRecord(parsed.content)) {
        throw new Error('PostHog cleanup could not be verified');
      }
      // Core can rewrite remote configuration and an empty feature-flag detail after reset.
      // Both are erased by forceOptedOutStorage immediately afterward. Every queue and
      // identity field must already be absent before this client can opt in.
      const remaining = Object.entries(parsed.content).filter(
        ([key, value]) => value !== null
          && key !== 'feature_flag_details' && key !== 'remote_config',
      );
      if (remaining.length !== 1 || remaining[0][0] !== 'opted_out' || remaining[0][1] !== true) {
        throw new Error('PostHog cleanup could not be verified');
      }
      const logs: unknown = JSON.parse(storage.getItem(sdkLogsStorageKey) ?? 'null');
      if (!isRecord(logs) || !isRecord(logs.content)
        || Object.values(logs.content).some((value) => value !== null)) {
        throw new Error('PostHog logs cleanup could not be verified');
      }
    },
  });
}

type CreatePostHogClient = (beforeSend: BeforeSendHook, defaultOptIn: boolean) => PostHogClient;

class PostHogProductAnalytics implements ProductAnalytics {
  private client: PostHogClient | null = null;
  private consented: boolean;
  private withdrawing = false;
  private withdrawalFlush: Promise<void> | null = null;
  private readonly reconciliation: Promise<void>;
  private readonly createClient: CreatePostHogClient;
  private readonly storage: SyncStringStorage;
  private readonly readConsent: () => AnalyticsConsent;
  private beforeSendController: PostHogBeforeSendController | null = null;

  constructor(
    createClient: CreatePostHogClient,
    options: PostHogProductAnalyticsOptions,
    storage: SyncStringStorage,
  ) {
    this.createClient = createClient;
    this.storage = storage;
    this.consented = false;
    this.readConsent = options.readConsent ?? (() => 'granted');
    if (options.consent === 'withdrawn') {
      // A failed prior cleanup is retried at every start without constructing a client.
      this.reconciliation = Promise.resolve().then(() => {
        this.markCleanupPending();
        forceOptedOutStorage(this.storage);
        options.disableTelemetryOnStartup?.();
        this.clearCleanupPending();
      }).catch(() => undefined);
      return;
    }
    if (options.consent !== 'granted' || this.isCleanupPending()) {
      this.reconciliation = Promise.resolve();
      return;
    }

    const client = this.getOrCreateClient();
    const reconciliation = client.ready().then(async () => {
      if (this.readConsent() !== 'granted') return;
      await client.optIn();
      this.consented = this.readConsent() === 'granted';
    });
    // The persisted profile remains authoritative. A provider persistence failure must not
    // crash app startup, and the local gate still prevents capture when consent is absent.
    this.reconciliation = reconciliation.catch(() => {
      this.beforeSendController?.dispose();
    });
  }

  capture<Name extends AnalyticsEventName>(
    name: Name,
    properties: AnalyticsEventProperties<Name>,
    options?: AnalyticsCaptureOptions,
  ): void {
    // `$exception` is outside AnalyticsEventName, so ProductAnalytics cannot receive or buffer
    // one; only the consent-gated SDK autocapture path can produce one.
    if (!this.consented || this.withdrawing || this.readConsent() !== 'granted') return;
    try {
      this.captureProviderEvent(name, properties, options);
    } finally {
      if (name === 'analytics_consent_withdrawn') {
        // The event is queued synchronously. Suppress feature and SDK autocapture
        // until the flush and native consent transition have finished.
        this.withdrawing = true;
        this.beforeSendController?.pause();
      }
    }
  }

  async optIn(surface: AnalyticsConsentSurface): Promise<void> {
    await this.reconciliation;
    if (this.readConsent() !== 'granted') throw new Error('Analytics consent is not granted');
    const client = this.getOrCreateClient();
    await client.ready();
    await client.optIn();
    this.consented = true;
    this.beforeSendController?.resume();
    this.captureProviderEvent('analytics_consent_granted', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      surface,
    });
  }

  async prepareGrant(): Promise<void> {
    await this.reconciliation;
    this.consented = false;
    this.beforeSendController?.dispose();
    this.client?.blockTransport?.();
    // Persist opt-out and remove every old queue and identity field before construction.
    // The SDK gives stored opted_out=false precedence over defaultOptIn=false.
    forceOptedOutStorage(this.storage);
    if (this.client) {
      await this.client.ready();
      await this.cleanClient(this.client);
      await this.client.retire?.();
      this.client = null;
      this.beforeSendController = null;
    }
    const client = this.getOrCreateClient(false);
    await client.ready();
    await this.cleanClient(client);
    this.clearCleanupPending();
    this.withdrawalFlush = null;
    this.withdrawing = false;
  }

  markCleanupPending(): void { this.storage.setItem(cleanupPendingKey, '1'); }
  clearCleanupPending(): void { this.storage.setItem(cleanupPendingKey, '0'); }
  isCleanupPending(): boolean {
    try { return this.storage.getItem(cleanupPendingKey) === '1'; }
    catch { return true; }
  }

  decline(): Promise<void> {
    return Promise.resolve();
  }

  async withdraw(): Promise<void> {
    this.consented = false;
    this.withdrawing = true;
    this.beforeSendController?.dispose();
    this.client?.blockTransport?.();
    await this.reconciliation;
    const client = this.client;
    if (!client) {
      forceOptedOutStorage(this.storage);
      return;
    }
    await client.ready();
    await this.cleanClient(client);
    await client.retire?.();
    this.client = null;
    this.beforeSendController = null;
  }

  isWithdrawalInProgress(): boolean { return this.withdrawing; }

  flush(): Promise<void> {
    if (this.readConsent() !== 'granted' || !this.consented) return Promise.resolve();
    if (this.withdrawing) {
      if (!this.withdrawalFlush) {
        const client = this.client;
        // The final event gets one best-effort attempt. Once it settles, even a
        // failed profile write cannot let a background flush send the old queue.
        this.withdrawalFlush = (client?.flush() ?? Promise.resolve())
          .catch(() => undefined)
          .finally(() => client?.blockTransport?.());
      }
      return this.withdrawalFlush;
    }
    return this.client?.flush() ?? Promise.resolve();
  }

  getIdentifier(): string | null {
    return this.consented && this.readConsent() === 'granted'
      ? this.client?.getDistinctId() || null : null;
  }

  getSessionId(): string | null {
    return this.consented && this.readConsent() === 'granted'
      ? this.client?.getSessionId() || null : null;
  }

  isApplied(): boolean {
    return this.consented;
  }

  whenReady(): Promise<void> {
    return this.reconciliation;
  }

  private async cleanClient(client: PostHogClient): Promise<void> {
    await client.optOut();
    // Core reset intentionally preserves these queues, and its flush ignores opt-out.
    for (const key of ['queue', 'ai_queue', 'ai_capture_queue', 'logs_queue'] as const) {
      client.setPersistedProperty(key as PostHogPersistedProperty, null);
    }
    client.reset(['opted_out'] as PostHogPersistedProperty[]);
    client.setPersistedProperty('device_id' as PostHogPersistedProperty, null);
    await client.persistAndVerifyCleanup();
    forceOptedOutStorage(this.storage);
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

  private getOrCreateClient(defaultOptIn = true): PostHogClient {
    if (!this.client) {
      const controller = createPostHogBeforeSend(() => this.readConsent() === 'granted');
      try {
        this.client = this.createClient(controller.beforeSend, defaultOptIn);
        this.beforeSendController = controller;
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
  createClient?: CreatePostHogClient,
): ProductAnalytics {
  const storage = options.storage ?? (createClient ? createMemoryStorage() : createFileStorage());
  const readConsent = options.readConsent ?? (() => options.consent);
  return new PostHogProductAnalytics(
    createClient ?? ((beforeSend, defaultOptIn) =>
      createSdkClient(options.apiKey, options.host, beforeSend, defaultOptIn, storage, readConsent)),
    options,
    storage,
  );
}
