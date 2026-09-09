// An in-memory test double for the port: it records what a real adapter would have sent, so
// tests can assert event names, properties, and ordering without a provider.
import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
} from '@/features/analytics/domain/analytics-events';
import type {
  AnalyticsCaptureOptions,
  ProductAnalytics,
} from '@/features/analytics/domain/product-analytics';

export type RecordedCapture = Readonly<{
  name: AnalyticsEventName;
  properties: AnalyticsEventProperties<AnalyticsEventName>;
  options?: AnalyticsCaptureOptions;
}>;

export class RecordingProductAnalytics implements ProductAnalytics {
  readonly captures: RecordedCapture[] = [];
  optInCount = 0;
  withdrawCount = 0;
  flushCount = 0;
  private identityGeneration = 1;

  capture<Name extends AnalyticsEventName>(
    name: Name,
    properties: AnalyticsEventProperties<Name>,
    options?: AnalyticsCaptureOptions,
  ): void {
    this.captures.push({ name, properties, options });
  }

  optIn(): Promise<void> {
    this.optInCount += 1;
    return Promise.resolve();
  }

  withdraw(): Promise<void> {
    this.withdrawCount += 1;
    this.identityGeneration += 1;
    return Promise.resolve();
  }

  flush(): Promise<void> {
    this.flushCount += 1;
    return Promise.resolve();
  }

  // Withdrawal severs the identity (taxonomy 2), so the double regenerates its identifier
  // exactly where a real adapter's `reset([])` would drop the persisted device id.
  distinctId(): string {
    return `recording-distinct-id-${this.identityGeneration}`;
  }

  names(): AnalyticsEventName[] {
    return this.captures.map((capture) => capture.name);
  }
}
