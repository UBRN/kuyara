import { useEffect, useRef } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { generationModeProperty } from '@/features/analytics/domain/analytics-mappers';
import type {
  OutfitRecommendationResult,
  RecommendedOutfit,
} from '@/features/recommendation/application/recommend-outfits';

/**
 * Taxonomy 5.6's `tomorrow_preview_opened`: the evening strip on Today opened tomorrow's
 * previewed outfit, once per focus of that detail. A preview that has nothing to show opens
 * nothing to report.
 */
export function useTomorrowPreviewOpenedReport(input: Readonly<{
  focused: boolean;
  tomorrow: boolean;
  outfit: RecommendedOutfit | null;
  recommendation: OutfitRecommendationResult | null;
}>): void {
  const { focused, tomorrow, outfit, recommendation } = input;
  const { analytics } = useProductAnalytics();
  const reported = useRef(false);
  const generationMode = recommendation?.status === 'recommended'
    ? generationModeProperty(recommendation.generationMode) : null;
  useEffect(() => {
    if (!focused) {
      reported.current = false;
      return;
    }
    if (!tomorrow || !outfit || reported.current) return;
    reported.current = true;
    analytics.capture('tomorrow_preview_opened', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      ...(generationMode ? { generation_mode: generationMode } : {}),
    });
  }, [analytics, focused, generationMode, outfit, tomorrow]);
}
