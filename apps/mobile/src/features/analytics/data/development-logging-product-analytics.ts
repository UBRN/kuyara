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
    _options?: AnalyticsCaptureOptions,
  ): void {
    if (!this.consented) return;
    console.debug(`analytics ${name} ${JSON.stringify(properties)}`);
  }

  async optIn(surface: AnalyticsConsentSurface): Promise<void> {
    this.consented = true;
    this.capture('analytics_consent_granted', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      surface,
    });
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
}
