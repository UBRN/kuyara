// The default adapter until the PostHog integration lands. It satisfies the port and does
// nothing, so mounting the provider never captures, stores, or sends anything.
import type { ProductAnalytics } from '@/features/analytics/domain/product-analytics';

export const noopProductAnalytics: ProductAnalytics = {
  capture: () => undefined,
  optIn: () => Promise.resolve(),
  withdraw: () => Promise.resolve(),
  flush: () => Promise.resolve(),
  distinctId: () => null,
};
