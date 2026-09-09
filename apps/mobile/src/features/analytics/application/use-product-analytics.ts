// The composition boundary features will depend on: the port plus the two trackers the
// taxonomy specifies. No feature calls it yet; the call sites land with the instrumentation.
import { createContext, use } from 'react';

import type { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import type { RetryCounter } from '@/features/analytics/application/retry-counter';
import type { ProductAnalytics } from '@/features/analytics/domain/product-analytics';

export type ProductAnalyticsValue = Readonly<{
  analytics: ProductAnalytics;
  errorEpisodes: ErrorEpisodeTracker;
  retries: RetryCounter;
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
