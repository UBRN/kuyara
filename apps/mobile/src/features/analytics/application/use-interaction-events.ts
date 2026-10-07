import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import {
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsEventProperties,
} from '@/features/analytics/domain/analytics-events';
import { locationChangedMethodProperty } from '@/features/analytics/domain/analytics-mappers';
import type { WeatherApplicationState } from '@/features/weather/application/weather-application-controller';

export function useWeatherInteractionEvents() {
  const { analytics, firstUses, retries } = useProductAnalytics();

  return {
    refreshFinished: (
      wasFailing: boolean,
      outcome: AnalyticsEventProperties<'manual_refresh_triggered'>['result'],
    ) => {
      if (wasFailing) {
        analytics.capture('retry_after_failure_triggered', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          surface: 'weather',
          attempt_number: retries.nextAttempt('weather'),
          result: outcome === 'success' ? 'success' : 'failure',
        });
        if (outcome === 'success') retries.reset('weather');
        return;
      }
      analytics.capture('manual_refresh_triggered', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        surface: 'weather',
        result: outcome,
      });
      void firstUses.markFirstUse('manual_refresh').then((firstUse) => {
        if (!firstUse) return;
        analytics.capture('feature_used_first_time', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          feature_name: 'manual_refresh',
        });
      });
    },
    locationSelectionFinished: (
      before: WeatherApplicationState,
      after: WeatherApplicationState,
    ) => {
      const beforeKey = before.status === 'ready' ? before.activeLocation?.locationKey : undefined;
      if (after.status !== 'ready' || !after.activeLocation) return;
      if (after.activeLocation.locationKey === beforeKey) return;
      analytics.capture('location_changed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        method: locationChangedMethodProperty(after.activeLocation.source),
        change_context: 'weather_tab',
      });
    },
    manualLocationSelected: () => {
      void firstUses.markFirstUse('location_override').then((firstUse) => {
        if (!firstUse) return;
        analytics.capture('feature_used_first_time', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          feature_name: 'location_override',
        });
      });
    },
  };
}
