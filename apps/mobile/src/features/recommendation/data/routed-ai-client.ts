import type {
  AiRecommendV1Request,
  AiRecommendV1Success,
} from '@kuyara/contracts';

import type { RecommendationPhase } from '@/features/recommendation/application/recommendation-application-controller';
import type { OutfitRecommendationSuccess } from '@/features/recommendation/application/recommend-outfits';
import type { AiGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';
import type { OnDeviceAiClient } from '@/features/recommendation/data/on-device-ai-client';
import { mapWorkerAiRecommendation } from '@/features/recommendation/data/worker-ai-recommendation-mapper';

// The Worker tier always gets its whole wait, whatever the on-device tier spent first: the
// Worker's own deadline is 36 s (5 attempts of 7 s plus 1 s) and 2 s covers HTTP transport.
// With the on-device tier's 6 s (`onDeviceAiBudgetMilliseconds`, ADR 0034) ahead of it the
// whole chain waits at most 44 s, which is the refresh taking as long as a stylist answer
// needs rather than a clock deciding the answer is standard.
const workerWaitMilliseconds = 38_000;

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
}>;

/**
 * The ordered AI chain of ADR 0034 section 1. The on-device tier is tried only when the
 * device reports it as available, so an ineligible device, Android and a model that is not
 * ready cost no time at all. Every on-device failure, including a timed-out attempt and a
 * reply the shared validation gate rejects, falls to the Worker, which always gets its own
 * whole wait. The deterministic device-local fallback keeps its place behind both, reached
 * by the controller's existing catch.
 *
 * `onPhase` reports which tier the wait is in so Today can say so. It is the chain's own
 * narration, not a state machine: the caller owns what it does with each phase.
 */
export class RoutedAiClient {
  private readonly onDevice: Dependencies['onDevice'];
  private readonly worker: WorkerClient;
  private readonly validate: AiRecommendationValidator;

  constructor(dependencies: Dependencies) {
    this.onDevice = dependencies.onDevice;
    this.worker = dependencies.worker;
    this.validate = dependencies.validate ?? mapWorkerAiRecommendation;
  }

  getAvailability(): Promise<OnDeviceAiAvailability> {
    return this.onDevice.getAvailability();
  }

  async recommendRouted(
    request: AiRecommendV1Request,
    options?: Readonly<{ onPhase?: (phase: RecommendationPhase) => void }>,
  ): Promise<OutfitRecommendationSuccess> {
    const onPhase = options?.onPhase;
    try {
      // Reported even where the module is null: that rejection is immediate, so the next
      // phase follows in the same tick and nothing lingers on a tier that was never tried.
      onPhase?.('checking-on-device');
      const data = await this.onDevice.recommend(request);
      onPhase?.('answer-received');
      // The gate runs here rather than after the chain: an archetype precondition the
      // on-device reply misses is an on-device failure, not a chain failure.
      return this.validate(request, data, 'on-device-ai');
    } catch {
      // Every on-device outcome except a validated result is the Worker's turn. The error
      // is not classified further here: the user-visible failure category is the Worker's.
    }
    onPhase?.('asking-stylist');
    const data = await this.worker.recommend(request, {
      timeoutMilliseconds: workerWaitMilliseconds,
    });
    onPhase?.('answer-received');
    return this.validate(request, data, 'ai-assisted');
  }
}
