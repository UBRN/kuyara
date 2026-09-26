import type { FailureCategory } from '@/domain/failure-category';
import type { RecommendationPhase } from '@/features/recommendation/application/recommendation-application-controller';
import type { OutfitRecommendationResult } from '@/features/recommendation/application/recommend-outfits';
import type {
  ActiveLocation,
  WeatherConditionCode,
  WeatherSnapshot,
} from '@/features/weather/domain/weather';

export type TodayFreshness = 'fresh' | 'stale';

export type TodaySnapshot = Readonly<{
  weather: WeatherSnapshot;
  activeLocation: ActiveLocation;
  freshness: TodayFreshness;
  recommendation: OutfitRecommendationResult;
  coverageStart?: string;
  coverageEnd?: string;
  paletteBasis?: Readonly<{ temperatureC: number; condition: WeatherConditionCode; localDayKey: string | null }>;
}>;

export type TodayScreenState =
  // `phase` is what the recommendation controller says the wait is doing; absent or null on
  // a wait that is not a recommendation refresh (bootstrap, a pure weather refresh).
  | Readonly<{ kind: 'loading'; phase?: RecommendationPhase | null }>
  | Readonly<{
      kind: 'unavailable';
      reason?: 'no-active-location';
      // Carries the analytics classification, and the one cause the user can act on
      // differently: `offline` states that instead of the generic unavailable line.
      failure?: FailureCategory;
    }>
  | Readonly<{
      kind: 'loaded';
      snapshot: TodaySnapshot;
      isRefreshing: boolean;
      refreshFailed: boolean;
      phase?: RecommendationPhase | null;
      /** Set while a confirmed re-ask is choosing: the window it is choosing for. */
      choosingWindow?: Readonly<{ start: string; end: string }> | null;
    }>;

export function unavailableTodayState(
  failure: FailureCategory | null,
): TodayScreenState {
  return failure ? { kind: 'unavailable', failure } : { kind: 'unavailable' };
}

/** Keep a previous place's saved outfit available without presenting it at the active place. */
export function activeLocationRecommendation(
  snapshot: Readonly<{ locationKey: string; recommendation: OutfitRecommendationResult }> | null,
  activeLocation: ActiveLocation | null,
): OutfitRecommendationResult | null {
  return snapshot !== null && snapshot.locationKey === activeLocation?.locationKey
    ? snapshot.recommendation : null;
}
