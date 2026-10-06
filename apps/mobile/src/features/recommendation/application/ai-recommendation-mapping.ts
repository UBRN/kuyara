import {
  aiRecommendV1SuccessSchema,
  archetypeDayFromRequirements,
  picksAreMeaningfullyDifferent,
  type AiOption,
  type AiRecommendV1Request,
  type AiRecommendV2Success,
} from '@kuyara/contracts';
import type { SupportedLanguage } from '@/domain/preferences';

import {
  outfitMatchesArchetype,
  recommendedOutfit,
  type OutfitRecommendationSuccess,
} from '@/features/recommendation/application/recommend-outfits';
import {
  domainRequirements,
  toAiOption,
} from '@/features/recommendation/application/recommendation-context';
import { WorkerAiRecommendationMappingError } from '@/features/recommendation/application/recommendation-mapping-error';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  collectValidOutfits,
  type OutfitCandidate,
} from '@/features/recommendation/domain/outfit-composition';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type { AiGenerationMode } from '@/features/recommendation/domain/generation-mode';
import { validateInsightSentence } from '@/features/recommendation/domain/insight-sentence';

function matchesOption(outfit: OutfitCandidate, option: AiOption): boolean {
  return JSON.stringify(toAiOption(outfit)) === JSON.stringify(option);
}

function outfitFromOption(
  requirements: ClothingRequirements,
  option: AiOption,
  clothingPreference: AiRecommendV1Request['clothingPreference'],
): OutfitCandidate {
  const candidates = option.garments.map(({ garmentTypeId }) =>
    evaluateGarmentEligibility(
      requirements,
      projectCatalogEffectiveGarment(garmentTypeId, clothingPreference),
    ));
  const composition = collectValidOutfits(requirements, candidates);
  const outfit = composition.status === 'composed'
    ? composition.outfits.find((candidate) => matchesOption(candidate, option))
    : undefined;
  if (!outfit) {
    throw new WorkerAiRecommendationMappingError();
  }
  return outfit;
}

// ADR 0034 section 7: one validation gate for both AI tiers. The closed candidate set, the
// archetype precondition and the shared distinctness rule are checked here, whichever
// executor produced the picks, and an answer that fails any of them is rejected whole.
export function mapWorkerAiRecommendation(
  request: AiRecommendV1Request,
  data: AiRecommendV2Success['data'],
  generationMode: AiGenerationMode = 'ai-assisted',
  insight?: Readonly<{ locale: SupportedLanguage }>,
): OutfitRecommendationSuccess {
  const validated = aiRecommendV1SuccessSchema.safeParse({ data });
  if (!validated.success) throw new WorkerAiRecommendationMappingError();
  const requirements = domainRequirements(request);
  const day = archetypeDayFromRequirements(requirements.requirements);
  const options = new Map(request.options.map((option) => [option.optionId, option]));
  const picked = validated.data.data.picks.map(({ optionId }) => options.get(optionId));
  if (!picked.every((option): option is AiOption => option !== undefined)) {
    throw new WorkerAiRecommendationMappingError();
  }
  if (!picksAreMeaningfullyDifferent(picked)) {
    throw new WorkerAiRecommendationMappingError();
  }
  const outfits = validated.data.data.picks.map(({ optionId, archetypeId }) => {
    const option = options.get(optionId);
    if (!option) throw new WorkerAiRecommendationMappingError();
    const outfit = outfitFromOption(
      requirements,
      option,
      request.clothingPreference,
    );
    if (!outfitMatchesArchetype(outfit, archetypeId, request.dayKind, day)) {
      throw new WorkerAiRecommendationMappingError();
    }
    return recommendedOutfit(outfit, archetypeId);
  });
  const sentence = generationMode === 'ai-assisted' && insight
    ? validateInsightSentence({
        sentence: data.insightSentence,
        locale: insight.locale,
      })
    : null;
  return Object.freeze({
    status: 'recommended',
    generationMode,
    ...(sentence && insight ? { insightSentence: sentence, insightLocale: insight.locale } : {}),
    requirements,
    outfits: Object.freeze(outfits),
  });
}
