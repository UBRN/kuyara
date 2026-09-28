import type { FailureCategory } from '@/domain/failure-category';
import type { ProfileApplicationState } from '@/features/profile/application/profile-application-controller';
import type { RecommendationApplicationState } from '@/features/recommendation/application/recommendation-application-controller';
import { activeLocationRecommendation, unavailableTodayState, type TodayScreenState } from '@/features/today/model';
import type { WeatherApplicationState } from '@/features/weather/application/weather-application-controller';
import { activeLocationSnapshot, weatherFreshness } from '@/features/weather/domain/weather';

type TodayStateInput = Readonly<{
  weather: WeatherApplicationState;
  recommendation: RecommendationApplicationState;
  profile: ProfileApplicationState;
  dressingDayChoiceFailed?: boolean;
  surface: 'today' | 'detail';
  isPullRefreshing?: boolean;
  choosingWindow?: Readonly<{ start: string; end: string }> | null;
}>;

export function classifyTodayState(input: TodayStateInput): Readonly<{
  state: TodayScreenState;
  todayFailure: FailureCategory | null | undefined;
  recommendationFailure: FailureCategory | null | undefined;
}> {
  const { weather, recommendation, profile } = input;
  const activeLocation = weather.status === 'ready' ? weather.activeLocation : null;
  const placeSnapshot = weather.status === 'ready'
    ? activeLocationSnapshot(weather.snapshot, activeLocation) : null;
  const outfit = recommendation.status === 'ready'
    ? activeLocationRecommendation(recommendation.snapshot, activeLocation) : null;
  const waitingForOutfit = recommendation.status === 'ready' && outfit === null &&
    (input.surface === 'detail'
      ? recommendation.isRefreshing ||
        (recommendation.snapshot !== null && recommendation.lastFailure === null &&
          !input.dressingDayChoiceFailed)
      : recommendation.lastFailure === null && !input.dressingDayChoiceFailed &&
        profile.status === 'ready' && profile.profile.clothingPreference !== null);

  if (weather.status === 'loading' || recommendation.status === 'loading' ||
      // No snapshot for the active place and no failure yet: either another place's weather is
      // retained, or the very first fetch is still on its way. Neither is "unavailable".
      (weather.status === 'ready' && activeLocation !== null &&
        placeSnapshot === null && weather.refreshFailure === null &&
        (weather.snapshot !== null || weather.isRefreshing || weather.isSelectingLocation))) {
    return { state: { kind: 'loading' }, todayFailure: undefined, recommendationFailure: undefined };
  }
  if (weather.status !== 'ready' || placeSnapshot === null || activeLocation === null ||
      (input.surface === 'today' && weather.freshness === null)) {
    return {
      state: unavailableTodayState(weather.status === 'ready' ? weather.refreshFailure : null),
      todayFailure: weather.status === 'ready' ? weather.refreshFailure ?? 'unknown' : 'unknown',
      recommendationFailure: null,
    };
  }
  if (recommendation.status !== 'ready') {
    return { state: { kind: 'loading' }, todayFailure: undefined, recommendationFailure: undefined };
  }
  if (waitingForOutfit) {
    return {
      state: { kind: 'loading', phase: recommendation.phase },
      todayFailure: undefined,
      recommendationFailure: undefined,
    };
  }
  if (outfit === null) {
    return {
      state: unavailableTodayState(recommendation.lastFailure),
      todayFailure: null,
      recommendationFailure: recommendation.lastFailure ?? 'unknown',
    };
  }
  return {
    state: {
      kind: 'loaded',
      snapshot: {
        weather: placeSnapshot,
        activeLocation,
        freshness: input.surface === 'detail'
          ? weatherFreshness(placeSnapshot.fetchedAt, new Date().toISOString()) === 'fresh'
            ? 'fresh' : 'stale'
          : weather.freshness === 'fresh' ? 'fresh' : 'stale',
        recommendation: outfit,
        coverageStart: recommendation.snapshot?.coverageStart,
        coverageEnd: recommendation.snapshot?.coverageEnd,
        paletteBasis: recommendation.snapshot?.paletteWeather
          ? { ...recommendation.snapshot.paletteWeather,
              localDayKey: recommendation.snapshot.localDayKey }
          : undefined,
      },
      isRefreshing: Boolean(input.isPullRefreshing) || weather.isRefreshing || recommendation.isRefreshing,
      refreshFailed: weather.refreshFailure !== null || recommendation.lastFailure !== null,
      ...(input.surface === 'today'
        ? { phase: recommendation.phase, choosingWindow: input.choosingWindow }
        : {}),
    },
    todayFailure: weather.refreshFailure,
    recommendationFailure: recommendation.lastFailure,
  };
}

export function mayOfferDayQuestion(
  weather: WeatherApplicationState,
  state: TodayScreenState,
): boolean {
  return weather.status === 'ready' && weather.activeLocation !== null &&
    state.kind !== 'unavailable' &&
    (weather.refreshFailure === null ||
      activeLocationSnapshot(weather.snapshot, weather.activeLocation) !== null);
}
