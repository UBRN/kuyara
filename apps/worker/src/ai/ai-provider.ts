import type { AiRecommendV1Request } from '@kuyara/contracts';

export interface AiProvider {
  readonly model: string;
  generateOutfits(request: AiRecommendV1Request, signal: AbortSignal): Promise<unknown>;
}
