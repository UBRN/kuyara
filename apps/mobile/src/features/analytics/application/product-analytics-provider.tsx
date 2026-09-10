import { AppState, type AppStateStatus } from 'react-native';
import { type PropsWithChildren, useEffect, useMemo, useRef } from 'react';

import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { FirstUseTracker } from '@/features/analytics/application/first-use-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import {
  ProductAnalyticsContext,
  type ProductAnalyticsValue,
} from '@/features/analytics/application/use-product-analytics';
import type {
  CaptureAnalyticsEvent,
  ProductAnalytics,
} from '@/features/analytics/domain/product-analytics';
import type { FirstUseStore } from '@/features/analytics/domain/first-use-store';
import { ExpoFileFirstUseStore } from '@/features/analytics/data/expo-file-first-use-store';
import { noopProductAnalytics } from '@/features/analytics/data/noop-product-analytics';

const now = () => new Date().toISOString();

type ProductAnalyticsProviderProps = PropsWithChildren<{
  analytics?: ProductAnalytics;
  firstUseStore?: FirstUseStore;
}>;

export function ProductAnalyticsProvider({
  children,
  analytics = noopProductAnalytics,
  firstUseStore,
}: ProductAnalyticsProviderProps) {
  const resolvedFirstUseStore = useMemo(
    () => firstUseStore ?? new ExpoFileFirstUseStore(),
    [firstUseStore],
  );
  const trackers = useMemo(() => {
    const capture: CaptureAnalyticsEvent = (name, properties, options) =>
      analytics.capture(name, properties, options);
    return {
      errorEpisodes: new ErrorEpisodeTracker(capture, now),
      firstUses: new FirstUseTracker(resolvedFirstUseStore),
      retries: new RetryCounter(),
    };
  }, [analytics, resolvedFirstUseStore]);

  const value = useMemo<ProductAnalyticsValue>(
    () => ({
      analytics,
      errorEpisodes: trackers.errorEpisodes,
      firstUses: trackers.firstUses,
      retries: trackers.retries,
    }),
    [analytics, trackers],
  );
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const sessionId = useRef<string | null>(null);

  useEffect(() => {
    sessionId.current = value.analytics.getSessionId();
    const subscription = AppState.addEventListener('change', (next) => {
      const wasActive = appState.current === 'active';
      appState.current = next;
      const nextSessionId = value.analytics.getSessionId();
      if (sessionId.current && nextSessionId && sessionId.current !== nextSessionId) {
        value.errorEpisodes.flushAll('session_end');
      }
      sessionId.current = nextSessionId;
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
