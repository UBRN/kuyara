import {
  aiRecommendV1BudgetHeader,
  aiRecommendV1BudgetMillisecondsSchema,
  aiRecommendV1Path,
  aiRecommendV1RequestSchema,
  aiRecommendV1SuccessSchema,
  aiRecommendV2Path,
  aiRecommendV2RequestSchema,
  aiRecommendV2SuccessSchema,
  insightSentenceSchema,
  aiV1ErrorSchema,
  type AiRecommendV1Request,
  type AiRecommendV2Request,
  type AiV1ErrorCode,
} from '@kuyara/contracts';

import { raceWithTimeout } from '../attempt-timeout.ts';
import { dailyCounterKey, type DailyCounterPort } from '../daily-counter.ts';
import { rateLimitedHeaders, readRouteRequest, type RateLimiter } from '../json-request.ts';
import { createErrorResponse, jsonHeaders, refusalResponse } from '../json-response.ts';
import type { ExecutionContext } from '../router.ts';
import { buildCacheRequest, defaultCache, readCachedAnswer, writeCachedAnswer } from './ai-cache.ts';
import { attemptFailureReason, type AiAttemptFailureReason, type AiProvider } from './ai-provider.ts';
import { selectionFailure } from './ai-selection.ts';
import type { MemberAllowance } from './member-allowance.ts';
import { PROBE_DAILY_LIMIT } from './probe-handler.ts';

type Dependencies = Readonly<{
  providers: readonly AiProvider[];
  rateLimiter?: RateLimiter;
  /**
   * Optional in the type so the unit tests can leave it out; the composition in `index.ts`
   * always supplies both, and a missing counter binding takes the route offline there.
   */
  dailyCounter?: DailyCounterPort;
  dailyLimit?: number;
  /**
   * Counts a signed-in member's re-asks (ADR 0041, section 13). Absent when the Supabase
   * settings are missing: every request is then handled as a non-member's.
   */
  memberAllowance?: MemberAllowance;
  now?: () => Date;
  attemptTimeoutMs?: number;
  totalDeadlineMs?: number;
  maxAttempts?: number;
}>;

/**
 * The number of Workers AI attempts per UTC day, sized so that the attempts plus the probe
 * reserve stay inside the Workers Free pool. Figures from
 * https://developers.cloudflare.com/workers-ai/platform/pricing/ (recalculate there when
 * the prompt, the model list or the pricing changes):
 *
 * - Pool: 10,000 Neurons per day, shared across models, resets 00:00 UTC.
 * - Rates: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` 26,668 Neurons per 1M input tokens
 *   and 204,805 per 1M output tokens; `@cf/mistralai/mistral-small-3.1-24b-instruct`
 *   31,876 in and 50,488 out.
 * - Probe reserve: the probe always calls the first provider (llama) with a 2,144-character
 *   prompt, about 536 tokens at four characters per token, and `PROBE_MAX_TOKENS` (256)
 *   of output: 14.3 + 52.4 = 66.7, rounded up to 67 Neurons; `PROBE_DAILY_LIMIT` (30)
 *   calls reserve 2,010.
 * - Input per attempt: the largest prompt `buildMessages` and `buildPickJsonSchema`
 *   produce over the v2 recommendation grid is 17,586 characters (messages plus response
 *   schema, 24 options), rounded to 4,400 tokens at four characters per token. The budget test in
 *   ai-handler.test.mjs measures that prompt and derives the
 *   limit below from it, so the constant and the prompt stay in step.
 * - Output per attempt: `recommendationMaxTokens` in workers-ai-provider.ts caps the reply
 *   at 192 tokens, so a runaway or prose reply cannot cost more than a valid one's ceiling.
 * - Worst attempt: llama at 4,400 in and 192 out is 117.3 + 39.3 = 156.7, rounded up to 157
 *   Neurons; mistral at the same sizes is 140.3 + 9.7 = 150.0, so llama is the worst case
 *   and the limit holds for either model.
 * - Limit: floor((10,000 - 2,010) / 157) = floor(50.9) = 50 attempts.
 *
 * 50 x 157 + 2,010 = 9,860 < 10,000. The token figures are characters over four; the
 * provider's `ai_provider_usage` log carries the binding's own `prompt_tokens` and
 * `completion_tokens` per successful call and is the measured check on that assumption.
 * OpenRouter attempts spend no Neurons and are not counted.
 */
export const WORKERS_AI_DAILY_ATTEMPT_LIMIT = Math.floor(
  (10_000 - PROBE_DAILY_LIMIT * 67) / 157,
);

// The phone transmits its own budget (37 s: its 38 s wait minus transport); this ceiling is
// the configured deadline's, so a wrong or hostile header can never extend the walk.
const maximumAiRequestBudgetMs = 36_000;
// Healthy providers finish within 4.5 s; another 0.5 s covers scheduling overhead.
const minimumUsefulAttemptMs = 5_000;

function requestBudgetMs(request: Request, configuredDeadlineMs: number): number {
  const parsed = aiRecommendV1BudgetMillisecondsSchema.safeParse(
    request.headers.get(aiRecommendV1BudgetHeader) ?? undefined,
  );
  if (!parsed.success || parsed.data === undefined) {
    return Math.min(configuredDeadlineMs, maximumAiRequestBudgetMs);
  }
  return Math.min(
    configuredDeadlineMs,
    maximumAiRequestBudgetMs,
    Math.max(minimumUsefulAttemptMs, parsed.data),
  );
}

const errorResponse = createErrorResponse<AiV1ErrorCode>(aiV1ErrorSchema);

/**
 * Both recommend routes share this limit: at least 1.5 times the largest compact body a client
 * sends on either version (the handler test measures it). A larger body is invalid_request,
 * refused before it is read in full.
 */
export const aiRecommendRequestMaxBytes = 65_536;

function logProviderFailure(provider: AiProvider, reason: AiAttemptFailureReason): void {
  console.warn({ event: 'ai_provider_attempt_failed', model: provider.model, reason });
}

/**
 * The re-ask flag only switches the shared cache off. It is split off once, right after the
 * parse, so the cache key, the selection gate and every provider see the request without it
 * and the model input never carries it.
 */
function splitReask(
  request: AiRecommendV1Request | AiRecommendV2Request,
): Readonly<{ reask: boolean; aiRequest: AiRecommendV1Request | AiRecommendV2Request }> {
  if (!('reask' in request)) return { reask: false, aiRequest: request };
  const { reask, ...aiRequest } = request;
  return { reask: reask === true, aiRequest };
}

export function createAiHandler({
  providers,
  rateLimiter,
  dailyCounter,
  dailyLimit,
  memberAllowance,
  now = () => new Date(),
  // Workers AI answered within 2 to 4.5 s when measured live; a provider that does not
  // answer stalls indefinitely, so 7 s cuts it off and hands the turn to the next provider.
  // Never raise this toward the total deadline: one stall then eats the whole budget and the
  // fallback chain never runs.
  attemptTimeoutMs = 7_000,
  // 36 s = 5 × 7 s plus one second for the rate limiter, the body parse and the cache
  // lookup, so the refresh takes as long as it needs and the deterministic fallback only
  // follows the last provider's failure. The mobile client waits 38 s (this deadline plus
  // transport) and sends 37 s in the header; with up to 8 s of on-device selection ahead of
  // it, the whole user-visible wait is at most 46 s.
  totalDeadlineMs = 36_000,
  // Five attempts bound the walk: the two Workers AI models plus room for up to three
  // measured OpenRouter models (none is configured today).
  maxAttempts = 5,
}: Dependencies): (request: Request, ctx: ExecutionContext) => Promise<Response> {
  return async (request: Request, ctx: ExecutionContext): Promise<Response> => {
    // The total budget covers the whole request, including the rate limiter, the body
    // parse and the shared cache lookup, not only the provider walk.
    const deadline = now().getTime() + requestBudgetMs(request, totalDeadlineMs);
    const url = new URL(request.url);
    const isV2 = url.pathname === aiRecommendV2Path;
    if (!isV2 && url.pathname !== aiRecommendV1Path) return errorResponse(404, 'not_found');
    const outcome = await readRouteRequest(request, {
      limiter: rateLimiter,
      scope: { keyPrefix: 'recommend', route: url.pathname, limiter: 'ai_recommend_burst' },
      schema: isV2 ? aiRecommendV2RequestSchema : aiRecommendV1RequestSchema,
      maxBytes: aiRecommendRequestMaxBytes,
    });
    if (outcome.kind !== 'ok') return refusalResponse(errorResponse, outcome.kind, 'ai_unavailable');
    const { reask, aiRequest } = splitReask(outcome.data);
    // Only a re-ask can be a member request. It is counted before the cache and the provider
    // walk, so a refused one spends nothing; the Workers AI total below still applies to
    // members. The same closed answer as the burst limiter: installed binaries handle it.
    if (reask && memberAllowance && await memberAllowance(request, now()) === 'exhausted') {
      console.warn({ event: 'ai_member_allowance_exhausted', route: url.pathname });
      return errorResponse(429, 'rate_limited', rateLimitedHeaders);
    }

    const options = new Map(
      aiRequest.options.map((option) => [option.optionId, option]),
    );
    // A confirmed re-ask asks for a different trio than the one the cache holds for this
    // request, so it neither reads nor writes the shared cache. The burst limiter above and
    // the daily counter below count it exactly like a first generation.
    const cache = reask ? undefined : defaultCache();
    let cacheRequest: Request | undefined;
    if (cache) {
      try {
        cacheRequest = await buildCacheRequest(aiRequest, url.pathname);
        const cached = await readCachedAnswer(cache, cacheRequest, url.pathname, aiRequest, options);
        if (cached) {
          console.info({ event: 'ai_cache_hit', route: url.pathname });
          return Response.json(cached, { status: 200, headers: jsonHeaders });
        }
      } catch {
        // Shared cache failures fall through to normal generation.
      }
    }

    // The daily budget gates Workers AI attempts, not the route: every Workers AI provider
    // is reached only through a counted, awaited increment, OpenRouter attempts are never
    // counted, and a cache hit above never reaches this walk. An increment that answers
    // over the limit marks the pool spent for this request, so the remaining Workers AI
    // providers are skipped without another increment; a counter failure skips only that
    // provider, and the next Workers AI provider retries the counter once. Each skip is
    // logged once per request, and a skipped provider consumes none of the deadline.
    let workersAiPoolSpent = false;
    let counterLogged = false;
    // The time one more attempt may take, or `undefined` once less than a useful attempt
    // is left (the walk then ends).
    const nextAttemptWindowMs = (): number | undefined => {
      const windowMs = Math.min(attemptTimeoutMs, deadline - now().getTime());
      return windowMs < Math.min(attemptTimeoutMs, minimumUsefulAttemptMs) ? undefined : windowMs;
    };
    for (const [attemptIndex, provider] of providers.slice(0, maxAttempts).entries()) {
      if (provider.id === 'workers-ai') {
        if (workersAiPoolSpent) continue;
        // An attempt is counted only when there is time left to make it.
        if (nextAttemptWindowMs() === undefined) break;
        if (dailyCounter && dailyLimit !== undefined) {
          const dateKey = dailyCounterKey('ai:workers-ai', now());
          let count: number;
          try {
            count = await dailyCounter.increment(dateKey);
          } catch {
            if (!counterLogged) {
              console.warn({ event: 'ai_daily_counter_unavailable', route: url.pathname });
              counterLogged = true;
            }
            continue;
          }
          if (count > dailyLimit) {
            console.warn({
              event: 'ai_daily_budget_exhausted',
              route: url.pathname,
              count,
              limit: dailyLimit,
            });
            workersAiPoolSpent = true;
            continue;
          }
        }
      }
      const attemptWindowMs = nextAttemptWindowMs();
      if (attemptWindowMs === undefined) break;
      const controller = new AbortController();
      let output: unknown;
      try {
        output = await raceWithTimeout(
          controller,
          () => provider.generateOutfits(aiRequest, controller.signal),
          attemptWindowMs,
        );
      } catch (error) {
        const reason = attemptFailureReason(error, controller.signal);
        logProviderFailure(provider, reason);
        // Every Workers AI model draws on the one account-level Neuron pool, so once it is
        // spent the remaining Workers AI attempts can only fail the same way and are
        // skipped; the walk goes on with OpenRouter. An OpenRouter quota refusal is per
        // model and still advances as before.
        if (reason === 'quota_exceeded' && provider.id === 'workers-ai' && !workersAiPoolSpent) {
          console.warn({ event: 'ai_workers_ai_quota_exhausted', model: provider.model });
          workersAiPoolSpent = true;
        }
        continue;
      }
      if (controller.signal.aborted) {
        logProviderFailure(provider, 'timeout');
        continue;
      }

      // The optional prose never participates in the pick gate. A malformed sentence
      // is dropped alone after the same v1 pick validation and deterministic checks.
      const result = aiRecommendV1SuccessSchema.safeParse(output);
      if (!result.success) {
        logProviderFailure(provider, 'invalid_output');
        continue;
      }

      const rejection = selectionFailure(result.data.data.picks, aiRequest, options);
      if (rejection) {
        logProviderFailure(provider, rejection);
        continue;
      }

      console.info({
        event: 'ai_provider_attempt_succeeded',
        model: provider.model,
        attempt: attemptIndex + 1,
      });
      const rawSentence = isV2 && output && typeof output === 'object'
        && 'data' in output && output.data && typeof output.data === 'object'
        && 'insightSentence' in output.data
        ? output.data.insightSentence : undefined;
      // Parsed as the model wrote it: invalid prose is dropped, never repaired (ADR 0039).
      const sentence = typeof rawSentence === 'string' ? rawSentence : undefined;
      const acceptedSentence = insightSentenceSchema.safeParse(sentence);
      const responseBody = isV2
        ? aiRecommendV2SuccessSchema.parse({ data: {
            picks: result.data.data.picks,
            ...(acceptedSentence.success ? { insightSentence: acceptedSentence.data } : {}),
          } })
        : result.data;
      if (isV2) {
        const outcome = sentence === undefined ? 'absent'
          : acceptedSentence.success ? 'accepted' : 'invalid';
        console.info({
          event: 'ai_insight_sentence',
          outcome,
          provider: provider.id,
          model: provider.model,
        });
      }
      const response = Response.json(responseBody, { status: 200, headers: jsonHeaders });
      if (cache && cacheRequest) writeCachedAnswer(cache, cacheRequest, response, ctx);
      return response;
    }
    return errorResponse(503, 'ai_unavailable');
  };
}
