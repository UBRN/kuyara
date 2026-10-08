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
import type { AccountDeletionCode } from '@/features/account/application/account-delete';
import type { AccountProviderError } from '@/features/account/application/account-session';
import type { AccountSyncFailureCode } from '@/features/account/application/account-sync';
import type { AccountSyncTrigger } from '@/features/account/application/account-analytics';
import type { DressingDayChoiceSource } from '@/features/recommendation/domain/dressing-day-choice';
import type { WornOutfit } from '@/features/recommendation/domain/outfit-history';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-slots';

import type {
  AccountDeletionFailureProperty,
  AccountSignInFailureProperty,
  AccountSyncFailureProperty,
  AccountSyncTriggerProperty,
  AgeBucket,
  AnalyticsEventProperties,
  ConditionCategory,
  CountBucket,
  DayStyleChoiceSourceProperty,
  FailureCategoryProperty,
  GenerationModeProperty,
  OutfitSlotProperty,
  TriggerReasonProperty,
  WornSourceProperty,
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
  'active-location-changed': 'location_changed',
  'clothing-preference-changed': 'clothing_preference_changed',
  'dress-style-changed': 'dress_style_changed',
  'local-day-changed': 'new_calendar_day',
  explicit: 'explicit_request',
  regenerate: 'regenerate',
} as const satisfies Record<RecommendationRefreshTrigger, TriggerReasonProperty>;

const outfitSlotProperties = {
  primary_top: 'primary_top',
  bottom: 'bottom',
  one_piece: 'one_piece',
  mid_layer: 'mid_layer',
  outer_layer: 'outer_layer',
  footwear: 'footwear',
  head: 'head',
  neck: 'neck',
  hands: 'hands',
  handheld: 'handheld',
} as const satisfies Record<OutfitSlot, OutfitSlotProperty>;

const wornSourceProperties = {
  recommended: 'recommended',
  manual: 'edited',
} as const satisfies Record<WornOutfit['source'], WornSourceProperty>;

const dayStyleChoiceSourceProperties = {
  morning: 'morning',
  chip: 'chip',
  plan: 'plan',
  random: 'random',
} as const satisfies Record<DressingDayChoiceSource, DayStyleChoiceSourceProperty>;

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
type AiProbeResult = AnalyticsEventProperties<'ai_probe_triggered'>['result'];
type CompletedAiProbeKind = Exclude<AiProbeUiState['kind'], 'idle' | 'checking'>;

const locationChangedMethods = {
  device: 'device',
  manual: 'manual_selection',
} as const satisfies Record<ActiveLocationSource, LocationChangedMethod>;

const aiProbeResults = {
  ok: 'ok',
  unavailable: 'unavailable',
  'rate-limited': 'rate_limited',
  error: 'error',
} as const satisfies Record<CompletedAiProbeKind, AiProbeResult>;

// Taxonomy 5.12. A cancel is reported by a null session and is a result of its own; the code
// is never thrown on the sign-in path, so a stray one reads as `failed`.
const accountSignInFailureProperties = {
  cancelled: 'failed',
  unavailable: 'unavailable',
  identityTaken: 'failed',
  failed: 'failed',
} as const satisfies Record<AccountProviderError['code'], AccountSignInFailureProperty>;

const accountSyncFailureProperties = {
  request: 'request',
  response: 'response',
  other: 'other',
} as const satisfies Record<AccountSyncFailureCode, AccountSyncFailureProperty>;

const accountSyncTriggerProperties = {
  signIn: 'sign_in',
  consentAnswered: 'consent_answered',
  foreground: 'foreground',
  localWrite: 'local_write',
  reconnected: 'reconnected',
  manual: 'manual',
  signOut: 'sign_out',
} as const satisfies Record<AccountSyncTrigger, AccountSyncTriggerProperty>;

const accountDeletionFailureProperties = {
  invalid_request: 'invalid_request',
  not_found: 'not_found',
  method_not_allowed: 'method_not_allowed',
  unauthorized: 'unauthorized',
  rate_limited: 'rate_limited',
  unavailable: 'unavailable',
  internal_error: 'internal_error',
  unknown: 'unknown',
} as const satisfies Record<AccountDeletionCode, AccountDeletionFailureProperty>;

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

export function outfitSlotProperty(slot: OutfitSlot): OutfitSlotProperty {
  return outfitSlotProperties[slot];
}

// Taxonomy 5.6: a composed result is the reader's own outfit from the start, so it wins over
// the stored source; otherwise a record the reader changed is `edited`.
export function wornSourceProperty(
  source: WornOutfit['source'],
  composed: boolean,
): WornSourceProperty {
  return composed ? 'composed' : wornSourceProperties[source];
}

export function dayStyleChoiceSourceProperty(
  source: DressingDayChoiceSource,
): DayStyleChoiceSourceProperty {
  return dayStyleChoiceSourceProperties[source];
}

// Taxonomy 5.6: an attempt that built at least one outfit is `composed`; every other
// settled attempt, an empty result included, is `no_match`.
export function composeResultProperty(
  optionCount: number,
): AnalyticsEventProperties<'outfit_composed'>['result'] {
  return optionCount > 0 ? 'composed' : 'no_match';
}

export function accountSignInFailureProperty(
  code: AccountProviderError['code'],
): AccountSignInFailureProperty {
  return accountSignInFailureProperties[code];
}

export function accountSyncFailureProperty(
  code: AccountSyncFailureCode,
): AccountSyncFailureProperty {
  return accountSyncFailureProperties[code];
}

export function accountSyncTriggerProperty(
  trigger: AccountSyncTrigger,
): AccountSyncTriggerProperty {
  return accountSyncTriggerProperties[trigger];
}

export function accountDeletionFailureProperty(
  code: AccountDeletionCode,
): AccountDeletionFailureProperty {
  return accountDeletionFailureProperties[code];
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
