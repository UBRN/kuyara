import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import {
  ANALYTICS_SCHEMA_VERSION,
  type ScreenName,
} from '@/features/analytics/domain/analytics-events';

export function useScreenViewed(screenName: ScreenName): void {
  const { analytics } = useProductAnalytics();

  useFocusEffect(
    useCallback(() => {
      analytics.capture('screen_viewed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        screen_name: screenName,
      });
    }, [analytics, screenName]),
  );
}
