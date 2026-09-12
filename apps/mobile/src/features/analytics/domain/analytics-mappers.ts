// Domain values are mapped, not passed through (`docs/analytics-taxonomy.md` section 5.0).
// Every map below is a total `Record` over its domain union, so a new domain value is a
// build error here rather than a raw string on an event.
import type { DressStyle } from '@kuyara/contracts';

import type {
  ActiveLocation,
  WeatherConditionCode,
} from '@/features/weather/domain/weather';
import type { RecommendationRefreshTrigger } from '@/features/recommendation/application/recommendation-application-controller';
import type { AiProbeUiState } from '@/features/recommendation/application/ai-probe-state';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type { FailureCategory } from '@/domain/failure-category';

import type {
  AgeBucket,
  AnalyticsEventProperties,
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
  'on-device-ai': 'on_device_ai',
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

type ActiveLocationSource = ActiveLocation['source'];
type LocationChangedMethod =
  AnalyticsEventProperties<'location_changed'>['method'];
type OnboardingLocationMethod =
  AnalyticsEventProperties<'onboarding_completed'>['location_method'];
type AiProbeResult = AnalyticsEventProperties<'ai_probe_triggered'>['result'];
type CompletedAiProbeKind = Exclude<AiProbeUiState['kind'], 'idle' | 'checking'>;

const locationChangedMethods = {
  device: 'device',
  manual: 'manual_selection',
} as const satisfies Record<ActiveLocationSource, LocationChangedMethod>;

const onboardingLocationMethods = {
  device: 'device',
  manual: 'manual',
} as const satisfies Record<ActiveLocationSource, OnboardingLocationMethod>;

const aiProbeResults = {
  ok: 'ok',
  unavailable: 'unavailable',
  'rate-limited': 'rate_limited',
  error: 'error',
} as const satisfies Record<CompletedAiProbeKind, AiProbeResult>;

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

export function locationChangedMethodProperty(
  source: ActiveLocationSource,
): LocationChangedMethod {
  return locationChangedMethods[source];
}

export function onboardingLocationMethodProperty(
  source: ActiveLocationSource | null,
): OnboardingLocationMethod {
  return source === null ? 'skipped' : onboardingLocationMethods[source];
}

export function aiProbeResultProperty(
  kind: CompletedAiProbeKind,
): AiProbeResult {
  return aiProbeResults[kind];
}

// Taxonomy section 3: `age_bucket` is computed at emit time only, never stored. A null,
// malformed, or future birth date reads as `unknown`; `under_18` is a distinct bucket
// because onboarding enforces no minimum birth date, so a computed age below 18 is
// reachable; `65_plus` collects everything from 65 up. Local calendar math, not UTC, so the
// bucket matches what the device's own calendar would say the age is today.
const ageBucketMaxExclusiveAges: readonly (readonly [number, AgeBucket])[] = [
  [18, 'under_18'],
  [25, '18_24'],
  [35, '25_34'],
  [45, '35_44'],
  [55, '45_54'],
  [65, '55_64'],
];

export function ageBucketProperty(
  birthDate: string | null,
  now: Date = new Date(),
): AgeBucket {
  const match = birthDate === null ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return 'unknown';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hadBirthdayThisYear =
    now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  const age = now.getFullYear() - year - (hadBirthdayThisYear ? 0 : 1);
  if (age < 0) return 'unknown';

  return ageBucketMaxExclusiveAges.find(([maxExclusive]) => age < maxExclusive)?.[1] ?? '65_plus';
}

// Taxonomy section 3: a null stored dress style reads as `smart`, matching product logic, so
// no event ever carries null.
export function dressStyleProperty(dressStyle: DressStyle | null): DressStyle {
  return dressStyle ?? 'smart';
}
