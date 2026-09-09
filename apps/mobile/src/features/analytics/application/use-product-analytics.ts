// The composition boundary features depend on: the port, the two trackers the taxonomy
// specifies, and the consent state ADR 0033 section 3 requires before any capture. No feature
// emits an event yet; the call sites land with the instrumentation.
import { createContext, use } from 'react';

import type { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import type { RetryCounter } from '@/features/analytics/application/retry-counter';
import type { AnalyticsEventProperties } from '@/features/analytics/domain/analytics-events';
import type { ProductAnalytics } from '@/features/analytics/domain/product-analytics';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

// Taxonomy 5.14: the two surfaces the grant can come from, taken from the event catalog so
// the hook and the event can never disagree.
export type AnalyticsConsentSurface =
  AnalyticsEventProperties<'analytics_consent_granted'>['surface'];

export type ProductAnalyticsValue = Readonly<{
  analytics: ProductAnalytics;
  errorEpisodes: ErrorEpisodeTracker;
  retries: RetryCounter;
  // The persisted profile answer, which stays authoritative over the SDK's own opt state.
  consent: AnalyticsConsent;
  // Persists `granted`, opts the provider in, and captures the first event on the identity.
  grantConsent: (surface: AnalyticsConsentSurface) => Promise<void>;
  // Captures the last event, flushes it, severs the identity, then persists `withdrawn`.
  withdrawConsent: () => Promise<void>;
  // A decline is persisted and captured nowhere: taxonomy 5.14 forbids an event for it.
  declineConsent: () => Promise<void>;
  distinctId: () => string | null;
}>;

export const ProductAnalyticsContext =
  createContext<ProductAnalyticsValue | null>(null);

export function useProductAnalytics(): ProductAnalyticsValue {
  const analytics = use(ProductAnalyticsContext);
  if (!analytics) {
    throw new Error(
      'useProductAnalytics must be used within ProductAnalyticsProvider',
    );
  }
  return analytics;
}
