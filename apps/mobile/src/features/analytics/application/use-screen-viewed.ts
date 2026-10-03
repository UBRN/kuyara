import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import {
  ANALYTICS_SCHEMA_VERSION,
  type ScreenName,
} from '@/features/analytics/domain/analytics-events';

// `enabled` is false for a screen that records no view of its own, such as tomorrow's preview.
export function useScreenViewed(screenName: ScreenName, enabled = true): void {
  const { analytics } = useProductAnalytics();

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      analytics.capture('screen_viewed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        screen_name: screenName,
      });
    }, [analytics, enabled, screenName]),
  );
}
