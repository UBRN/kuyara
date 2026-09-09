// The only module in the repository that imports the PostHog SDK. Domain, application, and
// presentation code depend on the `ProductAnalytics` port instead; a greppable check in
// `posthog-boundary.test.mjs` keeps it that way.
//
// Constraints this adapter enforces, all from ADR 0033:
// - `defaultOptIn: false`, so a bug in the consent surface fails closed (section 3).
// - `personProfiles: 'identified_only'` with no `identify`, `alias`, `group` or
//   `setPersonProperties` caller, so every event stays anonymous (section 5).
// - `disableGeoip: true`, so no coarse-location property is derived from the request IP
//   (section 5). The PostHog project also discards IPs; this is the client-side half.
// - Withdrawal opts out and then resets *everything* the SDK persists for the identity,
//   the device id included, so a later re-consent cannot be joined to the old one
//   (section 4).
import { PostHog } from 'posthog-react-native';

import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
} from '@/features/analytics/domain/analytics-events';
import type {
  AnalyticsCaptureOptions,
  ProductAnalytics,
} from '@/features/analytics/domain/product-analytics';

type PostHogEventProperties = NonNullable<Parameters<PostHog['capture']>[1]>;

export type PostHogProductAnalyticsOptions = Readonly<{
  apiKey: string;
  host: string;
}>;

export class PostHogProductAnalytics implements ProductAnalytics {
  private readonly options: PostHogProductAnalyticsOptions;
  private client: PostHog | null = null;

  constructor(options: PostHogProductAnalyticsOptions) {
    this.options = options;
  }

  // Lazy: nothing is constructed, stored, or scheduled until the first call, so a tree that
  // only mounts the provider stays inert.
  private resolveClient(): PostHog {
    this.client ??= new PostHog(this.options.apiKey, {
      host: this.options.host,
      defaultOptIn: false,
      personProfiles: 'identified_only',
      disableGeoip: true,
      captureAppLifecycleEvents: true,
      persistence: 'file',
    });
    return this.client;
  }

  capture<Name extends AnalyticsEventName>(
    name: Name,
    properties: AnalyticsEventProperties<Name>,
    options?: AnalyticsCaptureOptions,
  ): void {
    // The catalog's payloads are closed, readonly, JSON-shaped objects; the SDK's parameter is
    // a mutable string-indexed record, which a readonly array property cannot satisfy
    // structurally. The cast changes the type only: the values are forwarded unchanged.
    const payload = { ...properties } as unknown as PostHogEventProperties;
    this.resolveClient().capture(
      name,
      payload,
      options ? { timestamp: new Date(options.timestamp) } : undefined,
    );
  }

  optIn(): Promise<void> {
    return this.resolveClient().optIn();
  }

  async withdraw(): Promise<void> {
    const client = this.resolveClient();
    await client.optOut();
    // An empty keep-list is what makes the severance real: `reset()` with no argument keeps
    // the persisted device id, which was seeded from the first anonymous id.
    client.reset([]);
  }

  flush(): Promise<void> {
    return this.resolveClient().flush();
  }

  distinctId(): string | null {
    return this.resolveClient().getDistinctId() || null;
  }
}
