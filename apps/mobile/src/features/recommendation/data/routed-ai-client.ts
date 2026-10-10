import type { AiRecommendV1Request, AiRecommendV2Success } from '@kuyara/contracts';
import type { SupportedLanguage } from '@/domain/preferences';

import type { RecommendationPhase } from '@/features/recommendation/application/recommendation-application-controller';
import type { OutfitRecommendationSuccess } from '@/features/recommendation/application/recommend-outfits';
import { mapWorkerAiRecommendation } from '@/features/recommendation/application/ai-recommendation-mapping';

// The Worker's own deadline is 36 s (5 attempts of 7 s plus 1 s) and 2 s covers HTTP
// transport, so the whole AI wait is at most 38 s: the refresh takes as long as a stylist
// answer needs rather than a clock deciding the answer is standard.
const workerWaitMilliseconds = 38_000;

type WorkerClient = Readonly<{
  recommend(
    request: AiRecommendV1Request,
    options?: Readonly<{ timeoutMilliseconds?: number; locale?: SupportedLanguage; reask?: true }>,
  ): Promise<AiRecommendV2Success['data']>;
}>;

type Dependencies = Readonly<{ worker: WorkerClient }>;

/**
 * The AI chain of ADR 0034 section 1: the Worker AI chain, whose answer passes the
 * validation gate of section 7 here, inside the chain. Every Worker failure, a rejected
 * answer included, rejects with that failure, and the controller's catch composes the
 * deterministic device-local fallback.
 *
 * `onPhase` reports what the wait is doing so Today can say so. It is the chain's own
 * narration, not a state machine: the caller owns what it does with each phase.
 */
export class RoutedAiClient {
  private readonly worker: WorkerClient;

  constructor(dependencies: Dependencies) {
    this.worker = dependencies.worker;
  }

  async recommendRouted(
    request: AiRecommendV1Request,
    options?: Readonly<{
      onPhase?: (phase: RecommendationPhase) => void;
      locale?: SupportedLanguage;
      reask?: true;
    }>,
  ): Promise<OutfitRecommendationSuccess> {
    const onPhase = options?.onPhase;
    onPhase?.('asking-stylist');
    const data = await this.worker.recommend(request, {
      timeoutMilliseconds: workerWaitMilliseconds,
      locale: options?.locale ?? 'en',
      ...(options?.reask ? { reask: true as const } : {}),
    });
    onPhase?.('answer-received');
    return mapWorkerAiRecommendation(request, data, 'ai-assisted', { locale: options?.locale ?? 'en' });
  }
}
