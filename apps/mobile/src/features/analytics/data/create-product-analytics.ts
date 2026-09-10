// The composition point that turns configuration into an adapter. When the PostHog project is
// not configured the app runs on the no-op port implementation, so a missing key can never
// send anything: the same fail-closed default as constructing no client before consent (ADR 0033 section 3).
import { resolveProductAnalyticsConfiguration } from '@/config/product-analytics-config';
import { noopProductAnalytics } from '@/features/analytics/data/noop-product-analytics';
import { createPostHogProductAnalytics } from '@/features/analytics/data/posthog-product-analytics';
import type { ProductAnalytics } from '@/features/analytics/domain/product-analytics';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

export function createProductAnalytics(
  isDevelopment: boolean,
  consent: AnalyticsConsent,
): ProductAnalytics {
  const configuration = resolveProductAnalyticsConfiguration({
    apiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    isDevelopment,
  });
  if (configuration.kind !== 'enabled') return noopProductAnalytics;
  return createPostHogProductAnalytics({
    apiKey: configuration.apiKey,
    host: configuration.host,
    consent,
  });
}
