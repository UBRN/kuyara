import type {
  AiRecommendV1Request,
  AiRecommendV1Success,
} from '@kuyara/contracts';

import type { AiGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';
import type { OnDeviceAiClient } from '@/features/recommendation/data/on-device-ai-client';

// ADR 0034 section 2: one user-visible budget of 20 s. On-device spends at most 6 s of it
// and the Worker gets the remainder, never less than 14 s, which is above the Worker
// chain's measured range.
const recommendationBudgetMilliseconds = 20000;
const minimumWorkerBudgetMilliseconds = 14000;

// The tier that produced the answer, named as the mode the snapshot stores.
export type RoutedAiRecommendation = Readonly<{
  data: AiRecommendV1Success['data'];
  generationMode: AiGenerationMode;
}>;

type WorkerClient = Readonly<{
  recommend(
    request: AiRecommendV1Request,
    options?: Readonly<{ timeoutMilliseconds?: number }>,
  ): Promise<AiRecommendV1Success['data']>;
}>;

type Dependencies = Readonly<{
  onDevice: Pick<OnDeviceAiClient, 'getAvailability' | 'recommend'>;
  worker: WorkerClient;
  now?: () => number;
}>;

/**
 * The ordered AI chain of ADR 0034 section 1. The on-device tier is tried only when the
 * device reports it as available, so an ineligible device, Android and a model that is not
 * ready cost no time at all. Every on-device failure, including a timed-out attempt, falls
 * to the Worker with whatever is left of the budget. The deterministic device-local
 * fallback keeps its place behind both, reached by the controller's existing catch.
 */
export class RoutedAiClient {
  private readonly onDevice: Dependencies['onDevice'];
  private readonly worker: WorkerClient;
  private readonly now: () => number;

  constructor(dependencies: Dependencies) {
    this.onDevice = dependencies.onDevice;
    this.worker = dependencies.worker;
    this.now = dependencies.now ?? (() => Date.now());
  }

  getAvailability(): Promise<OnDeviceAiAvailability> {
    return this.onDevice.getAvailability();
  }

  async recommendRouted(
    request: AiRecommendV1Request,
  ): Promise<RoutedAiRecommendation> {
    const startedAt = this.now();
    try {
      return { data: await this.onDevice.recommend(request), generationMode: 'on-device-ai' };
    } catch {
      // Every on-device outcome except a result is the Worker's turn. The error is not
      // classified further here: the user-visible failure category is the Worker's.
    }
    const elapsed = Math.max(this.now() - startedAt, 0);
    const data = await this.worker.recommend(request, {
      timeoutMilliseconds: Math.max(
        recommendationBudgetMilliseconds - elapsed,
        minimumWorkerBudgetMilliseconds,
      ),
    });
    return { data, generationMode: 'ai-assisted' };
  }
}
