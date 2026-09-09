// Domain values are mapped, not passed through (`docs/analytics-taxonomy.md` section 5.0).
// Every map below is a total `Record` over its domain union, so a new domain value is a
// build error here rather than a raw string on an event.
import type { WeatherConditionCode } from '@/features/weather/domain/weather';
import type { RecommendationRefreshTrigger } from '@/features/recommendation/application/recommendation-application-controller';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type { FailureCategory } from '@/domain/failure-category';

import type {
  ConditionCategory,
  CountBucket,
  FailureCategoryProperty,
  GenerationModeProperty,
  TriggerReasonProperty,
} from '@/features/analytics/domain/analytics-events';

const failureCategoryProperties = {
  offline: 'offline',
  unavailable: 'unavailable',
  'rate-limited': 'rate_limited',
  unknown: 'unknown',
} as const satisfies Record<FailureCategory, FailureCategoryProperty>;

const generationModeProperties = {
  'ai-assisted': 'ai_assisted',
  'deterministic-fallback': 'deterministic_fallback',
} as const satisfies Record<RecommendationGenerationMode, GenerationModeProperty>;

const triggerReasonProperties = {
  'first-recommendation': 'first_recommendation',
  'stale-weather-refreshed': 'stale_weather_refresh',
  'active-location-changed': 'location_changed',
  'clothing-preference-changed': 'clothing_preference_changed',
  'dress-style-changed': 'dress_style_changed',
  'local-day-changed': 'new_calendar_day',
  explicit: 'explicit_request',
} as const satisfies Record<RecommendationRefreshTrigger, TriggerReasonProperty>;

// Taxonomy 5.4: the bucketing of the provider-neutral condition vocabulary, never a raw
// provider condition string.
const conditionCategories = {
  clear: 'clear',
  mostly_clear: 'clear',
  partly_cloudy: 'cloudy',
  cloudy: 'cloudy',
  fog: 'fog',
  drizzle: 'precipitation',
  rain: 'precipitation',
  heavy_rain: 'precipitation',
  sleet: 'snow',
  snow: 'snow',
  thunderstorm: 'storm',
} as const satisfies Record<WeatherConditionCode, ConditionCategory>;

export function failureCategoryProperty(
  category: FailureCategory,
): FailureCategoryProperty {
  return failureCategoryProperties[category];
}

export function generationModeProperty(
  mode: RecommendationGenerationMode,
): GenerationModeProperty {
  return generationModeProperties[mode];
}

export function triggerReasonProperty(
  trigger: RecommendationRefreshTrigger,
): TriggerReasonProperty {
  return triggerReasonProperties[trigger];
}

export function conditionCategory(code: WeatherConditionCode): ConditionCategory {
  return conditionCategories[code];
}

// Taxonomy 5.7 and 5.10: one through four, five and above collapsed to `5+`.
export function countBucket(count: number): CountBucket {
  return count >= 5 ? '5+' : (count as 1 | 2 | 3 | 4);
}
