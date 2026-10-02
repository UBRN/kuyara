import type { OutfitRequirementEvaluation } from '@/features/recommendation/domain/outfit-composition';
import type { ClothingRequirementReasonCode } from '@/features/recommendation/domain/weather-to-clothing-requirements';

/**
 * The weather a requirement answers, in the order outfit detail's "Why this outfit" reads
 * them: what falls from the sky first, then temperature, then wind.
 */
export const weatherCauses = Object.freeze(['rain', 'snow', 'cold', 'heat', 'wind', 'swing'] as const);
export type WeatherCause = (typeof weatherCauses)[number];

const causeByReason: Readonly<Record<ClothingRequirementReasonCode, WeatherCause | null>> = Object.freeze({
  temperature_low: 'cold',
  apparent_temperature_low: 'cold',
  temperature_high: 'heat',
  apparent_temperature_high: 'heat',
  daily_range_wide: 'swing',
  // A stored reason no current derivation produces; it names no weather of its own.
  daily_extrema_fallback: null,
  wind_elevated: 'wind',
  wind_strong: 'wind',
  precipitation_possible: 'rain',
  precipitation_likely: 'rain',
  condition_drizzle: 'rain',
  condition_rain: 'rain',
  condition_heavy_rain: 'rain',
  condition_thunderstorm: 'rain',
  condition_sleet: 'snow',
  condition_snow: 'snow',
});

/** A link names at most this many pieces: the outermost, which the weather added. */
export const maximumPiecesPerCause = 2;

export type WeatherCauseLink = Readonly<{
  cause: WeatherCause;
  /** The outermost pieces that answer this weather, outermost first. */
  candidateKeys: readonly string[];
}>;

/**
 * Which pieces each kind of weather put in the outfit, read from the deterministic
 * requirement evaluations that composed it, never from AI output. Only a met requirement
 * links weather to a piece: a trade-off is a shortfall, not a cause. Weather that no piece
 * answers, and a requirement without a weather reason, link nothing, so mild weather
 * returns an empty list. `outermostFirst` orders the outfit's candidate keys from its outer
 * layer inwards; a requirement such as warmth is answered by every warm layer, and the
 * link keeps the outermost two, the pieces the weather put on top.
 */
export function weatherCauseLinks(
  evaluations: readonly OutfitRequirementEvaluation[],
  outermostFirst: readonly string[],
): readonly WeatherCauseLink[] {
  const keysByCause = new Map<WeatherCause, string[]>();
  for (const evaluation of evaluations) {
    if (evaluation.status !== 'met' || evaluation.suppliedByCandidateKeys.length === 0) continue;
    const causes = new Set(evaluation.reasonCodes.flatMap((code) => causeByReason[code] ?? []));
    for (const cause of causes) {
      const keys = keysByCause.get(cause) ?? [];
      for (const key of evaluation.suppliedByCandidateKeys) if (!keys.includes(key)) keys.push(key);
      keysByCause.set(cause, keys);
    }
  }
  return Object.freeze(weatherCauses.flatMap((cause) => {
    const keys = keysByCause.get(cause);
    const candidateKeys = keys ? outermostFirst.filter((key) => keys.includes(key)).slice(0, maximumPiecesPerCause) : [];
    return candidateKeys.length > 0 ? [Object.freeze({ cause, candidateKeys: Object.freeze(candidateKeys) })] : [];
  }));
}
