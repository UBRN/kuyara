// The two Observe events this app defines, and the only place their attribute keys and
// values are decided. Every value is a closed enum or an integer; nothing here is free text,
// a provider name, a model identity, a prompt, a coordinate, a place name, a wardrobe value
// or an identifier (ADR 0034's red line and the taxonomy's exclusion checklist).
import type { FailureCategory } from '@/domain/failure-category';
import type { TelemetryAttributes } from '@/features/analytics/domain/performance-telemetry';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';

// The closed value vocabularies. `not_attempted` is the honest answer while the
// one-per-mount availability read has not resolved yet; it is not a fourth unavailability
// reason.
type TelemetryGenerationMode = 'on_device_ai' | 'ai_assisted' | 'deterministic_fallback';
type TelemetryTier = 'on_device' | 'worker' | 'deterministic';
type TelemetryOnDeviceAvailability =
  | 'available'
  | 'device_not_eligible'
  | 'apple_intelligence_not_enabled'
  | 'model_not_ready'
  | 'unsupported_os'
  | 'unknown'
  | 'not_attempted';
type TelemetryFailureKind = 'offline' | 'unavailable' | 'rate_limited' | 'unknown';

// `recommendation.generated` carries exactly these keys. `generation_mode` and
// `failure_kind` are absent rather than null when they do not apply, because Observe types
// attribute values as primitives.
export const recommendationGeneratedAttributeKeys = [
  'duration_ms',
  'failure_kind',
  'generation_mode',
  'on_device_availability',
  'option_count',
  'outcome',
  'tier_attempted',
] as const;

export const weatherRefreshedAttributeKeys = [
  'duration_ms',
  'outcome',
  'source',
] as const;

const generationModeAttributes: Record<
  RecommendationGenerationMode,
  { mode: TelemetryGenerationMode; tier: TelemetryTier }
> = {
  'on-device-ai': { mode: 'on_device_ai', tier: 'on_device' },
  'ai-assisted': { mode: 'ai_assisted', tier: 'worker' },
  'deterministic-fallback': { mode: 'deterministic_fallback', tier: 'deterministic' },
};

export function telemetryFailureKind(failure: FailureCategory): TelemetryFailureKind {
  return failure === 'rate-limited' ? 'rate_limited' : failure;
}

function availabilityAttribute(
  availability: OnDeviceAiAvailability | null,
): TelemetryOnDeviceAvailability {
  if (!availability) return 'not_attempted';
  if (availability.status === 'available') return 'available';
  return availability.reason ?? 'unknown';
}

function durationAttribute(durationMs: number): number {
  return Number.isFinite(durationMs) ? Math.max(Math.round(durationMs), 0) : 0;
}

export type RecommendationGeneratedInput = Readonly<{
  // The mode of the snapshot that was saved, or null when the attempt produced none.
  generationMode: RecommendationGenerationMode | null;
  onDeviceAvailability: OnDeviceAiAvailability | null;
  durationMs: number;
  optionCount: number;
  // The failure of a tier that did not deliver, even when a later tier did.
  failure: FailureCategory | null;
}>;

/**
 * `tier_attempted` is the deepest tier the chain reached, which is the tier that produced
 * the result. An attempt that ends with nothing reached the deterministic composition and
 * is reported as `deterministic` with `option_count` 0.
 */
export function recommendationGeneratedAttributes(
  input: RecommendationGeneratedInput,
): TelemetryAttributes {
  const resolved = input.generationMode
    ? generationModeAttributes[input.generationMode]
    : null;
  return {
    ...(resolved ? { generation_mode: resolved.mode } : {}),
    tier_attempted: resolved?.tier ?? 'deterministic',
    on_device_availability: availabilityAttribute(input.onDeviceAvailability),
    duration_ms: durationAttribute(input.durationMs),
    outcome:
      resolved && resolved.tier !== 'deterministic' ? 'success' : 'fallback',
    option_count: Math.max(Math.trunc(input.optionCount), 0),
    ...(input.failure ? { failure_kind: telemetryFailureKind(input.failure) } : {}),
  };
}

export type WeatherRefreshedInput = Readonly<{
  durationMs: number;
  outcome: 'success' | 'failure';
  // The provider-neutral attribution identifier already carried by the domain snapshot. It
  // is a closed, non-secret enum, never a credential, an endpoint or a raw provider value.
  source: string | null;
}>;

export function weatherRefreshedAttributes(
  input: WeatherRefreshedInput,
): TelemetryAttributes {
  return {
    duration_ms: durationAttribute(input.durationMs),
    outcome: input.outcome,
    ...(input.source ? { source: input.source } : {}),
  };
}
