// The composition point that turns configuration into an adapter. A missing development key
// selects local event logging for Simulator evidence; production stays on the no-op port, so
// missing configuration can never send anything (ADR 0033 section 3).
import { resolveProductAnalyticsConfiguration } from '@/config/product-analytics-config';
import { DevelopmentLoggingProductAnalytics } from '@/features/analytics/data/development-logging-product-analytics';
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
  if (configuration.kind !== 'enabled') {
    return isDevelopment && !process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim()
      ? new DevelopmentLoggingProductAnalytics(consent)
      : noopProductAnalytics;
  }
  return createPostHogProductAnalytics({
    apiKey: configuration.apiKey,
    host: configuration.host,
    consent,
  });
}
