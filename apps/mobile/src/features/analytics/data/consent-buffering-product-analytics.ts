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

const bufferCapacity = 50;

type BufferedCapture = Readonly<{
  name: AnalyticsEventName;
  properties: AnalyticsEventProperties<AnalyticsEventName>;
  options: AnalyticsCaptureOptions;
}>;

export class ConsentBufferingProductAnalytics implements ProductAnalytics {
  private readonly buffer: BufferedCapture[] = [];
  private consent: AnalyticsConsent;
  private readonly inner: ProductAnalytics;
  private readonly now: () => string;

  constructor(
    inner: ProductAnalytics,
    consent: AnalyticsConsent,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.inner = inner;
    this.consent = consent;
    this.now = now;
  }

  capture<Name extends AnalyticsEventName>(
    name: Name,
    properties: AnalyticsEventProperties<Name>,
    options?: AnalyticsCaptureOptions,
  ): void {
    if (this.consent === 'granted') {
      this.inner.capture(name, properties, options);
      return;
    }
    if (this.consent === 'withdrawn') return;

    this.buffer.push({
      name,
      properties,
      options: options ?? { timestamp: this.now() },
    });
    if (this.buffer.length > bufferCapacity) this.buffer.shift();
  }

  async optIn(surface: AnalyticsConsentSurface): Promise<void> {
    await this.inner.optIn(surface);
    this.consent = 'granted';
    const buffered = this.buffer.splice(0);
    buffered.forEach(({ name, properties, options }) => {
      this.inner.capture(name, properties, options);
    });
  }

  decline(): Promise<void> {
    this.buffer.splice(0);
    this.consent = 'withdrawn';
    return Promise.resolve();
  }

  async withdraw(): Promise<void> {
    this.buffer.splice(0);
    this.consent = 'withdrawn';
    await this.inner.withdraw();
  }

  flush(): Promise<void> {
    return this.inner.flush();
  }

  getIdentifier(): string | null {
    return this.inner.getIdentifier();
  }

  getSessionId(): string | null {
    return this.inner.getSessionId();
  }
}
