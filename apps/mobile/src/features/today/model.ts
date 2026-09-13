import type { FailureCategory } from '@/domain/failure-category';
import type { RecommendationPhase } from '@/features/recommendation/application/recommendation-application-controller';
import type { OutfitRecommendationResult } from '@/features/recommendation/application/recommend-outfits';
import type {
  ActiveLocation,
  WeatherSnapshot,
} from '@/features/weather/domain/weather';

export type TodayFreshness = 'fresh' | 'stale';

export type TodaySnapshot = Readonly<{
  weather: WeatherSnapshot;
  activeLocation: ActiveLocation;
  freshness: TodayFreshness;
  recommendation: OutfitRecommendationResult;
}>;

export type TodayScreenState =
  // `phase` is what the recommendation controller says the wait is doing; absent or null on
  // a wait that is not a recommendation refresh (bootstrap, a pure weather refresh).
  | Readonly<{ kind: 'loading'; phase?: RecommendationPhase | null }>
  | Readonly<{
      kind: 'unavailable';
      reason?: 'no-active-location';
      // Carried for the analytics classification only; the Today surface never renders it.
      failure?: FailureCategory;
    }>
  | Readonly<{
      kind: 'loaded';
      snapshot: TodaySnapshot;
      isRefreshing: boolean;
      refreshFailed: boolean;
      phase?: RecommendationPhase | null;
    }>;

export function unavailableTodayState(
  failure: FailureCategory | null,
): TodayScreenState {
  return failure ? { kind: 'unavailable', failure } : { kind: 'unavailable' };
}
