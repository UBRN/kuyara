import { useEffect, useRef } from 'react';

import { useAnalyticsConsentTrigger } from '@/features/analytics/application/analytics-consent-trigger';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import {
  ageBucketProperty,
  dressStyleProperty,
  generationModeProperty,
} from '@/features/analytics/domain/analytics-mappers';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import type { OutfitCoverage } from '@/features/recommendation/domain/outfit-coverage';
import {
  recommendationCacheState,
  todayOutfitSettled,
  updatingDayType,
} from '@/features/today/application/today-surface';
import type { TodayScreenState } from '@/features/today/model';
import { useWalkthrough } from '@/features/walkthrough/application/walkthrough-context';

/**
 * What the focused Today reports about the outfit on screen: taxonomy 5.5's
 * `recommendation_viewed`, the consent gate's "a recommendation was shown", and to the
 * Phase 8 tour whether the outfit has settled and what else claims the screen (README
 * "When it opens").
 */
export function useTodayReports(state: TodayScreenState, input: Readonly<{
  focused: boolean;
  runwayVisible: boolean;
  pullRefreshing: boolean;
  choosingWindow: OutfitCoverage | null;
  namePromptShown: boolean;
  /** A sheet or the name prompt covers Today. */
  overlayOpen: boolean;
  dayQuestionOpen: boolean;
}>): void {
  const { focused, namePromptShown, overlayOpen, dayQuestionOpen } = input;
  const {
    state: recommendationState,
    morningChoicePending,
    eveningChoicePending,
    dressingDayChoiceReady,
    resolvedDressStyle,
  } = useRecommendationApplication();
  const { state: profileState } = useProfileApplication();
  const { analytics } = useProductAnalytics();
  const { markRecommendationShown } = useAnalyticsConsentTrigger();
  const walkthrough = useWalkthrough();
  const dayQuestionPending = morningChoicePending || eveningChoicePending;

  // Once per focus appearance while a real three-outfit recommendation is visible (an
  // AI/fallback failure inside a `loaded` state does not count).
  const viewedThisFocus = useRef(false);
  useEffect(() => {
    if (!focused) {
      viewedThisFocus.current = false;
      return;
    }
    if (viewedThisFocus.current || dayQuestionPending || dressingDayChoiceReady === false) return;
    if (state.kind !== 'loaded' || state.snapshot.recommendation.status !== 'recommended') return;
    viewedThisFocus.current = true;
    analytics.capture('recommendation_viewed', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      generation_mode: generationModeProperty(state.snapshot.recommendation.generationMode),
      cache_state: recommendationCacheState(state),
      outfit_count: 3,
      dress_style: dressStyleProperty(resolvedDressStyle),
      age_bucket: ageBucketProperty(
        profileState.status === 'ready' ? profileState.profile.birthDate : null,
      ),
    });
  }, [analytics, dayQuestionPending, dressingDayChoiceReady, focused, profileState, resolvedDressStyle, state]);

  const recommendationShown = state.kind === 'loaded' && state.snapshot.recommendation.status === 'recommended';
  useEffect(() => {
    if (!focused || !recommendationShown || namePromptShown || dayQuestionPending ||
        dressingDayChoiceReady === false) return;
    markRecommendationShown();
  }, [dayQuestionPending, dressingDayChoiceReady, focused, markRecommendationShown, namePromptShown,
    recommendationShown]);

  // Read right before the effect that reports it: derived before an earlier hook, it would keep
  // React Compiler from memoizing it.
  const outfitSettled = todayOutfitSettled({
    focused,
    state,
    runwayVisible: input.runwayVisible,
    pullRefreshing: input.pullRefreshing,
    dayQuestionPending,
    dressingDayChoiceReady,
    updatingDayType: updatingDayType(recommendationState, resolvedDressStyle),
    choosingWindow: input.choosingWindow,
  });
  // The day question claims the screen while it is open and while it is still to be asked.
  const dayQuestionClaim = dayQuestionOpen || dayQuestionPending === true;
  const reportToday = walkthrough?.reportToday;
  useEffect(() => {
    reportToday?.({
      settled: outfitSettled,
      overlayOpen,
      dayQuestion: dayQuestionClaim,
      namePrompt: namePromptShown,
    });
  }, [dayQuestionClaim, namePromptShown, outfitSettled, overlayOpen, reportToday]);
}
