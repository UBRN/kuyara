import type { AiRecommendV1Request, AiRecommendV2Request } from '@kuyara/contracts';

import { dailyCounterKey, type DailyCounterPort } from '../daily-counter.ts';
import { AiProviderError, type AiProvider } from './ai-provider.ts';

/**
 * A paid provider behind a daily attempt cap, the AI counterpart of
 * `createDailyCappedWeatherProvider`. The increment is the gate and comes first: the count it
 * returns decides whether the wrapped provider is called at all, and an attempt that then
 * fails has still been counted, because the upstream bills attempts. The handler calls a
 * provider only once it has time for the attempt, so a walk out of time counts nothing, and a
 * request the price does not cover (`admits` false) is refused before it is counted.
 */
export function createDailyCappedAiProvider(dependencies: Readonly<{
  provider: AiProvider;
  counter: DailyCounterPort;
  counterName: string;
  dailyLimit: number;
  admits: (request: AiRecommendV1Request | AiRecommendV2Request) => boolean;
  now?: () => Date;
}>): AiProvider {
  const { provider, counter, counterName, dailyLimit } = dependencies;
  return {
    id: provider.id,
    model: provider.model,
    async generateOutfits(request, signal, options) {
      if (!dependencies.admits(request)) throw new Error('Request outside the priced size.');
      // A counter failure throws before the call, so the walk advances instead of reaching the
      // paid provider uncounted.
      const count = await counter.increment(
        dailyCounterKey(counterName, dependencies.now?.() ?? new Date()),
      );
      if (count > dailyLimit) throw new AiProviderError('quota_exceeded');
      return provider.generateOutfits(request, signal, options);
    },
  };
}
