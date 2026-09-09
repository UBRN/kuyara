import { AppState, type AppStateStatus } from 'react-native';
import { type PropsWithChildren, useEffect, useMemo, useRef } from 'react';

import { ErrorEpisodeTracker } from '@/features/analytics/application/error-episode-tracker';
import { RetryCounter } from '@/features/analytics/application/retry-counter';
import {
  ProductAnalyticsContext,
  type AnalyticsConsentSurface,
  type ProductAnalyticsValue,
} from '@/features/analytics/application/use-product-analytics';
import {
  ANALYTICS_SCHEMA_VERSION,
} from '@/features/analytics/domain/analytics-events';
import type {
  CaptureAnalyticsEvent,
  ProductAnalytics,
} from '@/features/analytics/domain/product-analytics';
import { noopProductAnalytics } from '@/features/analytics/data/noop-product-analytics';
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

const now = () => new Date().toISOString();

type ProductAnalyticsProviderProps = PropsWithChildren<{
  analytics?: ProductAnalytics;
  consent: AnalyticsConsent;
  persistConsent: (consent: AnalyticsConsent) => Promise<void>;
}>;

export function ProductAnalyticsProvider({
  children,
  analytics = noopProductAnalytics,
  consent,
  persistConsent,
}: ProductAnalyticsProviderProps) {
  // The trackers buffer across renders, so they survive a consent change; only the value
  // object below is rebuilt when the answer moves.
  const trackers = useMemo(() => {
    const capture: CaptureAnalyticsEvent = (name, properties, options) =>
      analytics.capture(name, properties, options);
    return {
      errorEpisodes: new ErrorEpisodeTracker(capture, now),
      retries: new RetryCounter(),
    };
  }, [analytics]);
  // The profile is authoritative, but the SDK persists its own opt state, so the opt-in is
  // applied once per adapter rather than on every render that reports `granted`.
  const hasOptedIn = useRef(false);

  useEffect(() => {
    if (consent !== 'granted' || hasOptedIn.current) return;
    hasOptedIn.current = true;
    void analytics.optIn();
  }, [analytics, consent]);

  const value = useMemo<ProductAnalyticsValue>(
    () => ({
      analytics,
      errorEpisodes: trackers.errorEpisodes,
      retries: trackers.retries,
      consent,
      grantConsent: async (surface: AnalyticsConsentSurface) => {
        await persistConsent('granted');
        hasOptedIn.current = true;
        await analytics.optIn();
        analytics.capture('analytics_consent_granted', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          surface,
        });
      },
      withdrawConsent: async () => {
        analytics.capture('analytics_consent_withdrawn', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
        });
        await analytics.flush();
        await analytics.withdraw();
        hasOptedIn.current = false;
        await persistConsent('withdrawn');
      },
      declineConsent: () => persistConsent('withdrawn'),
      distinctId: () => analytics.distinctId(),
    }),
    [analytics, consent, persistConsent, trackers],
  );
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
