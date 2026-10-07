import { useEffect, useRef } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import {
  ageBucketProperty,
  dressStyleProperty,
  generationModeProperty,
} from '@/features/analytics/domain/analytics-mappers';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import type {
  OutfitRecommendationResult,
  RecommendedOutfit,
} from '@/features/recommendation/application/recommend-outfits';

/**
 * Taxonomy's `outfit_detail_opened`, once per suggestion opening. Recomputed recommendation or
 * profile values update the pending payload but cannot emit the same suggestion a second time
 * while detail stays focused. Tomorrow's preview reports its own opening instead
 * (`useTomorrowPreviewOpenedReport`), never this event.
 */
export function useOutfitDetailOpenedReport(input: Readonly<{
  focused: boolean;
  tomorrow: boolean;
  suggestionId: string | undefined;
  position: 1 | 2 | 3 | null;
  outfit: RecommendedOutfit | null;
  recommendation: OutfitRecommendationResult | null;
}>): void {
  const { focused, tomorrow, suggestionId, position, outfit, recommendation } = input;
  const { dressingDayChoiceReady, resolvedDressStyle } = useRecommendationApplication();
  const { state: profileState } = useProfileApplication();
  const { analytics } = useProductAnalytics();
  const openedSuggestionId = useRef<string | null>(null);
  const dressStyle = dressStyleProperty(resolvedDressStyle);
  const ageBucket = ageBucketProperty(profileState.status === 'ready' ? profileState.profile.birthDate : null);
  useEffect(() => {
    if (!focused) {
      openedSuggestionId.current = null;
      return;
    }
    if (
      tomorrow || !suggestionId || !position || !outfit || dressingDayChoiceReady === false ||
      recommendation?.status !== 'recommended' ||
      openedSuggestionId.current === suggestionId
    ) return;
    openedSuggestionId.current = suggestionId;
    analytics.capture('outfit_detail_opened', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      outfit_position: position,
      archetype: outfit.archetypeId,
      generation_mode: generationModeProperty(recommendation.generationMode),
      dress_style: dressStyle,
      age_bucket: ageBucket,
    });
  }, [ageBucket, analytics, dressStyle, dressingDayChoiceReady, focused, outfit, position,
    recommendation, suggestionId, tomorrow]);
}
