import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { FailureCategory } from '@/domain/failure-category';
import { useAnalyticsConsentTrigger } from '@/features/analytics/application/analytics-consent-trigger';
import { useFocusedErrorEpisode } from '@/features/analytics/application/use-focused-error-episode';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import {
  ANALYTICS_SCHEMA_VERSION,
} from '@/features/analytics/domain/analytics-events';
import {
  ageBucketProperty,
  dressStyleProperty,
  generationModeProperty,
} from '@/features/analytics/domain/analytics-mappers';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { unavailableTodayState, type TodayScreenState } from '@/features/today/model';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { useLocalization } from '@/localization/use-messages';

export default function TodayRoute() {
  const { language } = useLocalization();
  const router = useRouter();
  const {
    state: recommendationState,
    refresh: refreshRecommendation,
    reevaluateLocalDay,
  } = useRecommendationApplication();
  const weatherApplication = useWeatherApplication();
  const { revalidateFreshness: revalidateWeatherFreshness, state: weatherState } =
    weatherApplication;
  const { state: profileState } = useProfileApplication();
  const { analytics, firstUses, retries } = useProductAnalytics();
  const { markRecommendationShown } = useAnalyticsConsentTrigger();
  useScreenViewed('today');

  const recommendation = recommendationState.status === 'ready'
    ? recommendationState.snapshot?.recommendation ?? null
    : null;

  let state: TodayScreenState;
  let todayFailure: FailureCategory | null | undefined;
  let recommendationFailure: FailureCategory | null | undefined;
  if (weatherState.status === 'loading' || recommendationState.status === 'loading') {
    state = { kind: 'loading' };
    todayFailure = undefined;
    recommendationFailure = undefined;
  } else if (
    weatherState.status === 'error' ||
    weatherState.snapshot === null ||
    weatherState.activeLocation === null ||
    weatherState.freshness === null
  ) {
    // Weather is the reason here, so its category classifies the failure. Nothing
    // renders this; it only carries the cause the analytics taxonomy asks for.
    state = unavailableTodayState(
      weatherState.status === 'ready' ? weatherState.refreshFailure : null,
    );
    todayFailure = weatherState.status === 'ready'
      ? weatherState.refreshFailure ?? 'unknown'
      : 'unknown';
    recommendationFailure = null;
  } else if (recommendation === null) {
    state = unavailableTodayState(recommendationState.lastFailure);
    todayFailure = null;
    recommendationFailure = recommendationState.lastFailure ?? 'unknown';
  } else {
    state = {
      kind: 'loaded',
      snapshot: {
        weather: weatherState.snapshot,
        activeLocation: weatherState.activeLocation,
        freshness: weatherState.freshness,
        recommendation,
      },
      isRefreshing: weatherState.isRefreshing || recommendationState.isRefreshing,
      refreshFailed:
        weatherState.refreshFailure !== null || recommendationState.lastFailure !== null,
    };
    todayFailure = weatherState.refreshFailure;
    recommendationFailure = recommendationState.lastFailure;
  }

  // Only the focused Today route can show these failures. A weather failure belongs to
  // the composite Today surface; a recommendation failure belongs to its distinct surface.
  useFocusedErrorEpisode('today', todayFailure);
  useFocusedErrorEpisode('recommendation', recommendationFailure);

  // Taxonomy 5.5: `recommendation_viewed`, once per focus appearance while a real
  // three-outfit recommendation is visible (an AI/fallback failure inside a `loaded` state
  // does not count).
  const [isFocused, setIsFocused] = useState(false);
  const isRecommendationShown = state.kind === 'loaded'
    && state.snapshot.recommendation.status === 'recommended';
  useFocusEffect(useCallback(() => {
    reevaluateLocalDay();
    // Today's freshness line ages with the clock, so returning to the tab re-evaluates it
    // and starts the stale refresh the existing coalescing then shares.
    void revalidateWeatherFreshness();
    setIsFocused(true);
    return () => {
      setIsFocused(false);
      retries.reset('today');
    };
  }, [reevaluateLocalDay, retries, revalidateWeatherFreshness]));
  const viewedThisFocusRef = useRef(false);
  useEffect(() => {
    if (!isFocused) {
      viewedThisFocusRef.current = false;
      return;
    }
    if (viewedThisFocusRef.current) return;
    if (state.kind !== 'loaded' || state.snapshot.recommendation.status !== 'recommended') return;
    viewedThisFocusRef.current = true;
    const cacheState = state.isRefreshing
      ? 'refreshing'
      : state.snapshot.freshness === 'stale'
        ? 'stale_shown'
        : 'fresh';
    analytics.capture('recommendation_viewed', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      generation_mode: generationModeProperty(state.snapshot.recommendation.generationMode),
      cache_state: cacheState,
      outfit_count: 3,
      dress_style: dressStyleProperty(
        profileState.status === 'ready' ? profileState.profile.dressStyle : null,
      ),
      age_bucket: ageBucketProperty(
        profileState.status === 'ready' ? profileState.profile.birthDate : null,
      ),
    });
  }, [analytics, isFocused, profileState, state]);

  useEffect(() => {
    if (!isFocused || !isRecommendationShown) return;
    markRecommendationShown();
  }, [isFocused, isRecommendationShown, markRecommendationShown]);

  // Taxonomy 5.7: Today's pull gesture doubles as the retry action when a failure is
  // already shown (there is no separate retry control).
  const handleRefresh = () => {
    const wasFailing = state.kind === 'unavailable' || (state.kind === 'loaded' && state.refreshFailed);
    void weatherApplication.refresh().then(async () => {
      await refreshRecommendation();
      const after = weatherApplication.getSnapshot?.() ?? weatherApplication.state;
      const outcome = after.status !== 'ready'
        ? ('failure_no_snapshot' as const)
        : after.refreshFailure === null
          ? ('success' as const)
          : after.snapshot
            ? ('failure_kept_last_known' as const)
            : ('failure_no_snapshot' as const);
      if (wasFailing) {
        analytics.capture('retry_after_failure_triggered', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          surface: 'today',
          attempt_number: retries.nextAttempt('today'),
          result: outcome === 'success' ? 'success' : 'failure',
        });
        if (outcome === 'success') retries.reset('today');
        return;
      }
      analytics.capture('manual_refresh_triggered', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        surface: 'today',
        result: outcome,
      });
      void firstUses.markFirstUse('manual_refresh').then((firstUse) => {
        if (!firstUse) return;
        analytics.capture('feature_used_first_time', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          feature_name: 'manual_refresh',
        });
      });
    });
  };

  return (
    <TodayScreen
      language={language}
      onOpenOutfitDetail={(id) => router.push({ pathname: '/[id]', params: { id } })}
      onRefresh={handleRefresh}
      state={state}
    />
  );
}
