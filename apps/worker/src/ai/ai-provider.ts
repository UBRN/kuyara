import type { AiProviderId, AiRecommendV1Request } from '@kuyara/contracts';

export interface AiProvider {
  /** Controlled, non-secret identifier reported by the probe (ADR 0034 section 5). */
  readonly id: AiProviderId;
  readonly model: string;
  generateOutfits(request: AiRecommendV1Request, signal: AbortSignal): Promise<unknown>;
}
