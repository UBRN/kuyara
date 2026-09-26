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
  private withdrawing = false;
  private cleanupPending = false;

  constructor(consent: AnalyticsConsent) {
    this.consented = consent === 'granted';
  }

  capture<Name extends AnalyticsEventName>(
    name: Name,
    properties: AnalyticsEventProperties<Name>,
    options?: AnalyticsCaptureOptions,
  ): void {
    if (!this.consented || this.withdrawing) return;
    const suffix = options ? ` at ${options.timestamp}` : '';
    console.debug(`analytics ${name} ${JSON.stringify(properties)}${suffix}`);
    if (name === 'analytics_consent_withdrawn') this.withdrawing = true;
  }

  async optIn(surface: AnalyticsConsentSurface): Promise<void> {
    this.consented = true;
    this.withdrawing = false;
    this.capture('analytics_consent_granted', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      surface,
    });
  }

  prepareGrant(): Promise<void> {
    return Promise.resolve();
  }

  markCleanupPending(): void { this.cleanupPending = true; }
  clearCleanupPending(): void { this.cleanupPending = false; }
  isCleanupPending(): boolean { return this.cleanupPending; }

  decline(): Promise<void> {
    return Promise.resolve();
  }

  async withdraw(): Promise<void> {
    this.consented = false;
    this.withdrawing = true;
  }

  isWithdrawalInProgress(): boolean { return this.withdrawing; }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  getIdentifier(): null {
    return null;
  }

  getSessionId(): null {
    return null;
  }

  isApplied(): boolean {
    return this.consented;
  }

  whenReady(): Promise<void> {
    return Promise.resolve();
  }
}
