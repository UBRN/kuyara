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
  aiModelInputFromRequest,
  archetypeDayFromRequirements,
  meetsArchetypePrecondition,
  picksAreMeaningfullyDifferent,
  type AiOption,
  type AiRecommendV1Request,
  type AiRecommendV2Request,
  type AiV1ErrorCode,
  type OutfitArchetypeId,
} from '@kuyara/contracts';

import { raceWithTimeout } from '../attempt-timeout.ts';
import { dailyCounterKey, type DailyCounterPort } from '../daily-counter.ts';
import {
  checkRateLimit, isJsonRequest, rateLimitedHeaders, readJsonBody, type RateLimiter,
} from '../json-request.ts';
import { createErrorResponse, jsonHeaders } from '../json-response.ts';
import type { ExecutionContext } from '../router.ts';
import { attemptFailureReason, type AiProvider } from './ai-provider.ts';
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

type ProviderFailureReason =
  | 'timeout'
  | 'provider_error'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'invalid_output'
  | 'unknown_option'
  | 'picks_not_distinct'
  | 'archetype_precondition';

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

function defaultCache(): Cache | undefined {
  return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
}

function logProviderFailure(provider: AiProvider, reason: ProviderFailureReason): void {
  console.warn({ event: 'ai_provider_attempt_failed', model: provider.model, reason });
}

/**
 * The version of the selection gate whose answers may be served from the shared cache.
 * Bump it whenever `meetsArchetypePrecondition`, the archetype projection sent to the
 * model, or the day derivation changes, so every entry an older gate wrote misses and is
 * regenerated instead of being handed to a client whose own gate would reject it. The
 * thirty day TTL makes this the only way those entries retire. Version 3 also withholds
 * `cold_shield` and `wind_guard` when the day's requirements do not call for them.
 */
const AI_GATE_VERSION = 3;
// Bump whenever prompt text, provider schema order, or model-visible input changes.
const AI_PROMPT_VERSION = 2;

function validSelection(
  picks: readonly { optionId: string; archetypeId: OutfitArchetypeId }[],
  request: AiRecommendV1Request | AiRecommendV2Request,
  options: Map<string, AiOption>,
): boolean {
  const picked = picks.map(({ optionId }) => options.get(optionId));
  if (!picked.every((option): option is AiOption => option !== undefined)) return false;
  if (!picksAreMeaningfullyDifferent(picked)) return false;
  return picks.every(({ archetypeId }, index) => meetsArchetypePrecondition(
    archetypeId,
    picked[index]!, request.dayKind,
    archetypeDayFromRequirements(request.requirements),
  ));
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

async function buildCacheRequest(
  request: AiRecommendV1Request | AiRecommendV2Request,
  route: string,
): Promise<Request> {
  const requirementKey = request.requirements
    .map((requirement) => [
      requirement.kind,
      requirement.priority,
      requirement.minimum,
      'target' in requirement ? requirement.target : '',
    ].join('|'))
    .sort()
    .join(',');
  const optionKey = JSON.stringify(aiModelInputFromRequest(request).options
    .slice().sort((left, right) => left.optionId.localeCompare(right.optionId)));
  // The gate reads the day from the reason codes, which the requirement projection above
  // drops, so the key carries the same day facts derived through the same function: two
  // days that the gate judges differently can never share one entry.
  const day = archetypeDayFromRequirements(request.requirements);
  const canonical = [
    requirementKey,
    optionKey,
    request.clothingPreference,
    request.dressStyle ?? 'smart',
    request.catalogVersion,
    request.dayVariant,
    request.dayKind ?? 'unknown',
    `frozen:${day.frozen}`,
    `wet:${day.wet}`,
    `cold:${day.cold}`,
    `windy:${day.windy}`,
    `gate:${AI_GATE_VERSION}`,
    `prompt:${AI_PROMPT_VERSION}`,
    // The route and v2-only fields keep the two response versions separate.
    ...(route === aiRecommendV2Path && 'locale' in request
      ? [route, request.locale,
          'styleAesthetics' in request ? request.styleAesthetics?.join(',') ?? 'none' : 'none']
      : []),
  ].join('\n');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  );
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return new Request(`https://kuyara.internal${route}/${hash}`);
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
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', { Allow: 'POST' });
    }
    const limit = await checkRateLimit(rateLimiter, request, {
      keyPrefix: 'recommend',
      route: url.pathname,
      limiter: 'ai_recommend_burst',
    });
    // A failing binding answers in the route's own closed code.
    if (limit === 'unavailable') return errorResponse(503, 'ai_unavailable');
    if (limit === 'limited') {
      console.warn({ event: 'rate_limited', route: url.pathname, limiter: 'ai_recommend_burst' });
      return errorResponse(429, 'rate_limited', rateLimitedHeaders);
    }
    if (!isJsonRequest(request)) return errorResponse(400, 'invalid_request');

    const body = await readJsonBody(request.body, aiRecommendRequestMaxBytes);
    const requestResult = isV2
      ? aiRecommendV2RequestSchema.safeParse(body)
      : aiRecommendV1RequestSchema.safeParse(body);
    if (!requestResult.success) return errorResponse(400, 'invalid_request');
    const { reask, aiRequest } = splitReask(requestResult.data);
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
        const cached = await cache.match(cacheRequest);
        if (cached) {
          const payload: unknown = await cached.json();
          const parsed = isV2
            ? aiRecommendV2SuccessSchema.safeParse(payload)
            : aiRecommendV1SuccessSchema.safeParse(payload);
          if (parsed.success && validSelection(parsed.data.data.picks, aiRequest, options)) {
            console.info({ event: 'ai_cache_hit', route: url.pathname });
            return Response.json(parsed.data, { status: 200, headers: jsonHeaders });
          }
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
    for (const [attemptIndex, provider] of providers.slice(0, maxAttempts).entries()) {
      if (provider.id === 'workers-ai') {
        if (workersAiPoolSpent) continue;
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
      const remainingMs = deadline - now().getTime();
      const attemptWindowMs = Math.min(attemptTimeoutMs, remainingMs);
      if (attemptWindowMs < Math.min(attemptTimeoutMs, minimumUsefulAttemptMs)) break;
      const controller = new AbortController();
      try {
        const output = await raceWithTimeout(
          controller,
          () => provider.generateOutfits(aiRequest, controller.signal),
          attemptWindowMs,
        );
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

        const pickedOptions = result.data.data.picks.map(({ optionId }) => options.get(optionId));
        if (!pickedOptions.every((option): option is AiOption => option !== undefined)) {
          logProviderFailure(provider, 'unknown_option');
          continue;
        }
        if (!picksAreMeaningfullyDifferent(pickedOptions)) {
          logProviderFailure(provider, 'picks_not_distinct');
          continue;
        }
        if (!validSelection(result.data.data.picks, aiRequest, options)) {
          logProviderFailure(provider, 'archetype_precondition');
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
        if (cache && cacheRequest) {
          // The write outlives the response instead of delaying it. Shared cache failures
          // must not fail a validated response, so the promise handed over never rejects.
          const cached = response.clone();
          cached.headers.set('Cache-Control', 'public, max-age=2592000');
          ctx.waitUntil(cache.put(cacheRequest, cached).catch(() => {
            // Best effort: a failed shared-cache write only costs a later cache miss.
          }));
        }
        return response;
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
      }
    }
    return errorResponse(503, 'ai_unavailable');
  };
}
