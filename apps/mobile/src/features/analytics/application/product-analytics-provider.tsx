import { AppState, type AppStateStatus } from 'react-native';
import { type PropsWithChildren, useEffect, useMemo, useRef } from 'react';

import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import {
  ProductAnalyticsContext,
  type ProductAnalyticsValue,
} from '@/features/analytics/application/use-product-analytics';
import type {
  CaptureAnalyticsEvent,
  ProductAnalytics,
} from '@/features/analytics/domain/product-analytics';
import { noopProductAnalytics } from '@/features/analytics/data/noop-product-analytics';

const now = () => new Date().toISOString();

export function ProductAnalyticsProvider({
  children,
  analytics = noopProductAnalytics,
}: PropsWithChildren<{ analytics?: ProductAnalytics }>) {
  const value = useMemo<ProductAnalyticsValue>(() => {
    const capture: CaptureAnalyticsEvent = (name, properties, options) =>
      analytics.capture(name, properties, options);
    return {
      analytics,
      errorEpisodes: new ErrorEpisodeTracker(capture, now),
      retries: new RetryCounter(),
    };
  }, [analytics]);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const wasActive = appState.current === 'active';
      appState.current = next;
      // Taxonomy 5.10: the buffered failures are emitted before the lifecycle event the
      // provider itself sends on backgrounding, and only then is the batch flushed.
      if (!wasActive || next !== 'background') return;
      value.errorEpisodes.flushAll('background');
      void value.analytics.flush();
    });
    return () => subscription.remove();
  }, [value]);

  return <ProductAnalyticsContext value={value}>{children}</ProductAnalyticsContext>;
}
