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
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'loaded'; snapshot: TodaySnapshot }>;
