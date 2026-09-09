// The composition point that turns configuration into an adapter. When the PostHog project is
// not configured the app runs on the no-op port implementation, so a missing key can never
// send anything: the same fail-closed default as `defaultOptIn: false` (ADR 0033 section 3).
import { resolveProductAnalyticsConfiguration } from '@/config/product-analytics-config';
import { noopProductAnalytics } from '@/features/analytics/data/noop-product-analytics';
import { PostHogProductAnalytics } from '@/features/analytics/data/posthog-product-analytics';
import type { ProductAnalytics } from '@/features/analytics/domain/product-analytics';

export function createProductAnalytics(isDevelopment: boolean): ProductAnalytics {
  const configuration = resolveProductAnalyticsConfiguration({
    apiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    privacyPolicyUrl: process.env.EXPO_PUBLIC_KUYARA_PRIVACY_POLICY_URL,
    isDevelopment,
  });
  if (configuration.kind !== 'enabled') return noopProductAnalytics;
  return new PostHogProductAnalytics({
    apiKey: configuration.apiKey,
    host: configuration.host,
  });
}
