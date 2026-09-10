// An in-memory test double for the port: it records what a real adapter would have sent, so
// tests can assert event names, properties, and ordering without a provider.
import {
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsEventName,
  type AnalyticsEventProperties,
} from '@/features/analytics/domain/analytics-events';
import type {
  AnalyticsCaptureOptions,
  AnalyticsConsentSurface,
  ProductAnalytics,
} from '@/features/analytics/domain/product-analytics';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

export type RecordedCapture = Readonly<{
  name: AnalyticsEventName;
  properties: AnalyticsEventProperties<AnalyticsEventName>;
  options?: AnalyticsCaptureOptions;
}>;

export class RecordingProductAnalytics implements ProductAnalytics {
  readonly captures: RecordedCapture[] = [];
  optInCount = 0;
  declineCount = 0;
  withdrawCount = 0;
  flushCount = 0;
  private identityGeneration = 1;
  private sessionGeneration = 1;
  private consented: boolean;

  constructor(consent: AnalyticsConsent = 'granted') {
    this.consented = consent === 'granted';
  }

  capture<Name extends AnalyticsEventName>(
    name: Name,
    properties: AnalyticsEventProperties<Name>,
    options?: AnalyticsCaptureOptions,
  ): void {
    if (!this.consented) return;
    this.captures.push({ name, properties, options });
  }

  optIn(surface: AnalyticsConsentSurface): Promise<void> {
    this.optInCount += 1;
    this.consented = true;
    this.capture('analytics_consent_granted', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      surface,
    });
    return Promise.resolve();
  }

  decline(): Promise<void> {
    this.declineCount += 1;
    return Promise.resolve();
  }

  withdraw(): Promise<void> {
    if (this.consented) {
      this.capture('analytics_consent_withdrawn', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
      });
      this.flushCount += 1;
    }
    this.withdrawCount += 1;
    this.consented = false;
    this.identityGeneration += 1;
    return Promise.resolve();
  }

  flush(): Promise<void> {
    this.flushCount += 1;
    return Promise.resolve();
  }

  // Withdrawal severs the identity (taxonomy 2), so the double regenerates its identifier
  // where the real adapter resets the client and clears its persisted device id.
  getIdentifier(): string | null {
    return this.consented ? `recording-distinct-id-${this.identityGeneration}` : null;
  }

  getSessionId(): string | null {
    return this.consented ? `recording-session-${this.sessionGeneration}` : null;
  }

  startNewSession(): void {
    this.sessionGeneration += 1;
  }

  names(): AnalyticsEventName[] {
    return this.captures.map((capture) => capture.name);
  }
}
