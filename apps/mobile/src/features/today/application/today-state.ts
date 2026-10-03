import type { FailureCategory } from '@/domain/failure-category';
import type { ProfileApplicationState } from '@/features/profile/application/profile-application-controller';
import type { RecommendationApplicationState } from '@/features/recommendation/application/recommendation-application-controller';
import type { RecommendationSnapshot } from '@/features/recommendation/data/recommendation-repository';
import {
  activeLocationRecommendation,
  todayFreshness,
  unavailableTodayState,
  type TodayScreenState,
  type TodaySnapshot,
} from '@/features/today/model';
import type { WeatherApplicationState } from '@/features/weather/application/weather-application-controller';
import { activeLocationSnapshot, weatherFreshness } from '@/features/weather/domain/weather';

type TodayStateShared = Readonly<{
  weather: WeatherApplicationState;
  recommendation: RecommendationApplicationState;
  profile: ProfileApplicationState;
  dressingDayChoiceFailed?: boolean;
}>;

// Today reads the freshness the weather controller already computed and takes no instant, so
// its route hands in nothing that changes on every render. The detail surface measures
// freshness itself and needs the instant, an ISO timestamp.
type TodayStateInput = TodayStateShared & (
  | Readonly<{
    surface: 'today';
    isPullRefreshing?: boolean;
    choosingWindow?: Readonly<{ start: string; end: string }> | null;
  }>
  | Readonly<{ surface: 'detail'; now: string }>
);

/** The weather the stored outfit's palette was chosen for, with the day it belongs to; none for a result stored without one. */
export function paletteBasisOf(
  snapshot: Pick<RecommendationSnapshot, 'paletteWeather' | 'localDayKey'> | null | undefined,
): TodaySnapshot['paletteBasis'] {
  return snapshot?.paletteWeather
    ? { ...snapshot.paletteWeather, localDayKey: snapshot.localDayKey }
    : undefined;
}

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
        freshness: todayFreshness(input.surface === 'detail'
          ? weatherFreshness(placeSnapshot.fetchedAt, input.now)
          : weather.freshness),
        recommendation: outfit,
        coverageStart: recommendation.snapshot?.coverageStart,
        coverageEnd: recommendation.snapshot?.coverageEnd,
        paletteBasis: paletteBasisOf(recommendation.snapshot),
      },
      isRefreshing: (input.surface === 'today' && Boolean(input.isPullRefreshing)) || weather.isRefreshing || recommendation.isRefreshing,
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
