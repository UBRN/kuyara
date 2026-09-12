import type {
  AiRecommendV1Request,
  AiRecommendV1Success,
} from '@kuyara/contracts';

import type { OutfitRecommendationSuccess } from '@/features/recommendation/application/recommend-outfits';
import type { AiGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';
import type { OnDeviceAiClient } from '@/features/recommendation/data/on-device-ai-client';
import { mapWorkerAiRecommendation } from '@/features/recommendation/data/worker-ai-recommendation-mapper';

// ADR 0034 section 2: one user-visible budget of 20 s. On-device spends at most 6 s of it
// and the Worker gets the remainder, never less than 14 s, which is above the Worker
// chain's measured range.
const recommendationBudgetMilliseconds = 20000;
const minimumWorkerBudgetMilliseconds = 14000;

// ADR 0034 section 7: one validation gate for both tiers. It runs inside the chain, so an
// answer it rejects is that tier's failure and the next tier gets its turn.
export type AiRecommendationValidator = (
  request: AiRecommendV1Request,
  data: AiRecommendV1Success['data'],
  generationMode: AiGenerationMode,
) => OutfitRecommendationSuccess;

type WorkerClient = Readonly<{
  recommend(
    request: AiRecommendV1Request,
    options?: Readonly<{ timeoutMilliseconds?: number }>,
  ): Promise<AiRecommendV1Success['data']>;
}>;

type Dependencies = Readonly<{
  onDevice: Pick<OnDeviceAiClient, 'getAvailability' | 'recommend'>;
  worker: WorkerClient;
  validate?: AiRecommendationValidator;
  now?: () => number;
}>;

/**
 * The ordered AI chain of ADR 0034 section 1. The on-device tier is tried only when the
 * device reports it as available, so an ineligible device, Android and a model that is not
 * ready cost no time at all. Every on-device failure, including a timed-out attempt and a
 * reply the shared validation gate rejects, falls to the Worker with whatever is left of
 * the budget. The deterministic device-local fallback keeps its place behind both, reached
 * by the controller's existing catch.
 */
export class RoutedAiClient {
  private readonly onDevice: Dependencies['onDevice'];
  private readonly worker: WorkerClient;
  private readonly validate: AiRecommendationValidator;
  private readonly now: () => number;

  constructor(dependencies: Dependencies) {
    this.onDevice = dependencies.onDevice;
    this.worker = dependencies.worker;
    this.validate = dependencies.validate ?? mapWorkerAiRecommendation;
    this.now = dependencies.now ?? (() => Date.now());
  }

  getAvailability(): Promise<OnDeviceAiAvailability> {
    return this.onDevice.getAvailability();
  }

  async recommendRouted(
    request: AiRecommendV1Request,
  ): Promise<OutfitRecommendationSuccess> {
    const startedAt = this.now();
    try {
      const data = await this.onDevice.recommend(request);
      // The gate runs here rather than after the chain: an archetype precondition the
      // on-device reply misses is an on-device failure, not a chain failure.
      return this.validate(request, data, 'on-device-ai');
    } catch {
      // Every on-device outcome except a validated result is the Worker's turn. The error
      // is not classified further here: the user-visible failure category is the Worker's.
    }
    const elapsed = Math.max(this.now() - startedAt, 0);
    const data = await this.worker.recommend(request, {
      timeoutMilliseconds: Math.max(
        recommendationBudgetMilliseconds - elapsed,
        minimumWorkerBudgetMilliseconds,
      ),
    });
    return this.validate(request, data, 'ai-assisted');
  }
}
