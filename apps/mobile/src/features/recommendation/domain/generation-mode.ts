// ADR 0034 section 3: the coarse locus of the AI selection step, never a provider, a model
// or a version. `on-device-ai` is Apple Foundation Models on the user's phone, `ai-assisted`
// is the Worker AI chain, `deterministic-fallback` is the device-local composition.
export const recommendationGenerationModes = [
  'on-device-ai',
  'ai-assisted',
  'deterministic-fallback',
] as const;

export type RecommendationGenerationMode =
  (typeof recommendationGenerationModes)[number];

export function isRecommendationGenerationMode(
  value: string,
): value is RecommendationGenerationMode {
  return (recommendationGenerationModes as readonly string[]).includes(value);
}

// The two modes an AI tier can produce. The deterministic fallback is not one of them.
export type AiGenerationMode = Exclude<
  RecommendationGenerationMode,
  'deterministic-fallback'
>;
