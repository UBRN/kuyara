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

export class DevelopmentLoggingProductAnalytics implements ProductAnalytics {
  private consented: boolean;

  constructor(consent: AnalyticsConsent) {
    this.consented = consent === 'granted';
  }

  capture<Name extends AnalyticsEventName>(
    name: Name,
    properties: AnalyticsEventProperties<Name>,
    options?: AnalyticsCaptureOptions,
  ): void {
    if (!this.consented) return;
    // The instant is printed when it differs from the log line's own time, so a Simulator run
    // can show that buffered pre-consent events keep their original timestamps.
    const suffix = options ? ` at ${options.timestamp}` : '';
    console.debug(`analytics ${name} ${JSON.stringify(properties)}${suffix}`);
  }

  async optIn(surface: AnalyticsConsentSurface): Promise<void> {
    this.consented = true;
    this.capture('analytics_consent_granted', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      surface,
    });
  }

  decline(): Promise<void> {
    return Promise.resolve();
  }

  async withdraw(): Promise<void> {
    if (this.consented) {
      this.capture('analytics_consent_withdrawn', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
      });
    }
    this.consented = false;
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  getIdentifier(): null {
    return null;
  }

  getSessionId(): null {
    return null;
  }
}
