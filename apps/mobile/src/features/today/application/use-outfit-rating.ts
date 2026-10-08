import { useMemo, useState } from 'react';

import { useAnalyticsConsentGranted } from '@/features/analytics/application/use-analytics-consent';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import {
  generationModeProperty,
  outfitRatingReasonProperty,
} from '@/features/analytics/domain/analytics-mappers';
import type {
  OutfitRecommendationResult,
  RecommendedOutfit,
} from '@/features/recommendation/application/recommend-outfits';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { rateOutfit, type OutfitRating, type OutfitRatingTap } from '@/features/today/domain/outfit-rating';

// The choices made in this app process, by dressing day and outfit option id. Nothing is
// stored: leaving detail and coming back shows the choice, a new process asks again.
const ratings = new Map<string, OutfitRating>();

/** Forgets every choice, as a new app process does. */
export function forgetOutfitRatings(): void {
  ratings.clear();
}

export type OutfitRatingControl = Readonly<{
  rating: OutfitRating | null;
  rate: (tap: OutfitRatingTap) => void;
}>;

/**
 * Outfit detail's like and dislike (taxonomy 5.6), for one of the day's three as kuyara picked
 * it, and only while sharing is on: the answer exists to be shared, so with sharing off there is
 * no row. Null hides it: tomorrow's preview, an idea and a composed result have no place among
 * the three, and an outfit the reader changed is no longer kuyara's pick; going back to that
 * pick shows the earlier choice again. Setting or switching a verdict or a reason reports it;
 * clearing one reports nothing.
 */
export function useOutfitRating(input: Readonly<{
  tomorrow: boolean;
  position: 1 | 2 | 3 | null;
  outfit: RecommendedOutfit | null;
  recommendation: OutfitRecommendationResult | null;
  /** A piece is changed, or a composed result is showing. */
  changed: boolean;
}>): OutfitRatingControl | null {
  const { tomorrow, position, outfit, recommendation, changed } = input;
  const granted = useAnalyticsConsentGranted();
  const { analytics } = useProductAnalytics();
  const { dressingDayKey } = useRecommendationApplication();
  const key = dressingDayKey && outfit ? `${dressingDayKey}:${outfit.optionId}` : null;
  const [shown, setShown] = useState(() => ({ key, rating: key ? ratings.get(key) ?? null : null }));
  if (shown.key !== key) setShown({ key, rating: key ? ratings.get(key) ?? null : null });

  // One control per choice, so a parent render that changes nothing hands Outfit detail the
  // same object and it has nothing to keep in step.
  return useMemo(() => {
    if (!granted || tomorrow || changed || !position || !outfit || !key
      || recommendation?.status !== 'recommended') return null;
    const rated = {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      outfit_position: position,
      archetype: outfit.archetypeId,
      generation_mode: generationModeProperty(recommendation.generationMode),
    } as const;
    return {
      rating: shown.rating,
      rate: (tap: OutfitRatingTap) => {
        // The module map is current at once; the render state lags a tap that has not re-rendered.
        const { rating, set } = rateOutfit(ratings.get(key) ?? null, tap);
        if (rating) ratings.set(key, rating);
        else ratings.delete(key);
        setShown({ key, rating });
        if (set?.kind === 'verdict') {
          analytics.capture('outfit_rated', { ...rated, verdict: set.verdict });
        } else if (set) {
          analytics.capture('outfit_rating_reason_given', { ...rated, reason: outfitRatingReasonProperty(set.reason) });
        }
      },
    };
  }, [analytics, changed, granted, key, outfit, position, recommendation, shown.rating, tomorrow]);
}
