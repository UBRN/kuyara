import type { AiRecommendV1Request } from '@kuyara/contracts';

export interface AiProvider {
  generateOutfits(request: AiRecommendV1Request, signal: AbortSignal): Promise<unknown>;
}
