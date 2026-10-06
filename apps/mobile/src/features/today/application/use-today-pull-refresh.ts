import { useState } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { manualRefreshOutcome, todayRetrySucceeded } from '@/features/today/application/today-surface';
import type { TodayScreenState } from '@/features/today/model';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';

/**
 * Today's pull gesture. It refreshes the weather, then the recommendation, and doubles as the
 * retry action when a failure is already shown (taxonomy 5.7: there is no separate retry
 * control).
 */
export function useTodayPullRefresh() {
  const weatherApplication = useWeatherApplication();
  const { getSnapshot: getRecommendationSnapshot, dressingDayChoiceFailed, reevaluateLocalDay, refreshAfterPull } =
    useRecommendationApplication();
  const { analytics, firstUses, retries } = useProductAnalytics();
  const [refreshing, setRefreshing] = useState(false);

  /** `shown` is the Today state on screen when the pull started. */
  const refresh = async (shown: TodayScreenState) => {
    if (refreshing) return;
    const wasFailing = shown.kind === 'unavailable' || (shown.kind === 'loaded' && shown.refreshFailed);
    setRefreshing(true);
    // A failed day-choice read leaves no generation input, so a retry that skipped it would do
    // nothing visible; the re-read lets the provider's input effect continue into generation.
    if (dressingDayChoiceFailed) reevaluateLocalDay();
    await (async () => {
      await weatherApplication.refresh();
      await refreshAfterPull();

      const after = weatherApplication.getSnapshot?.() ?? weatherApplication.state;
      const recommendationAfter = getRecommendationSnapshot();
      if (wasFailing) {
        const retrySucceeded = todayRetrySucceeded(after, recommendationAfter);
        analytics.capture('retry_after_failure_triggered', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          surface: 'today',
          attempt_number: retries.nextAttempt('today'),
          result: retrySucceeded ? 'success' : 'failure',
        });
        if (retrySucceeded) retries.reset('today');
        return;
      }
      analytics.capture('manual_refresh_triggered', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        surface: 'today',
        result: manualRefreshOutcome(after),
      });
      void firstUses.markFirstUse('manual_refresh').then((firstUse) => {
        if (!firstUse) return;
        analytics.capture('feature_used_first_time', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          feature_name: 'manual_refresh',
        });
      });
    })().finally(() => setRefreshing(false));
  };

  return { refreshing, refresh };
}
