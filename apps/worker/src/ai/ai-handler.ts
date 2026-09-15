import {
  aiRecommendV1BudgetHeader,
  aiRecommendV1BudgetMillisecondsSchema,
  aiRecommendV1Path,
  aiRecommendV1RequestSchema,
  aiRecommendV1SuccessSchema,
  aiV1ErrorSchema,
  meetsArchetypePrecondition,
  picksAreMeaningfullyDifferent,
  type AiOption,
  type AiRecommendV1Request,
  type AiV1ErrorCode,
} from '@kuyara/contracts';

import type { ExecutionContext } from '../router.ts';
import { AiProviderError, type AiProvider } from './ai-provider.ts';
import { PROBE_DAILY_LIMIT, type RateLimiter } from './probe-handler.ts';

/** Adds one counted attempt under `dateKey` atomically and returns the new count. */
export interface AiDailyCounter {
  increment(dateKey: string): Promise<number>;
}

type Dependencies = Readonly<{
  providers: readonly AiProvider[];
  rateLimiter?: RateLimiter;
  /**
   * Optional in the type so the unit tests can leave it out; the composition in `index.ts`
   * always supplies both, and a missing counter binding takes the route offline there.
   */
  dailyCounter?: AiDailyCounter;
  dailyLimit?: number;
  now?: () => Date;
  attemptTimeoutMs?: number;
  totalDeadlineMs?: number;
  maxAttempts?: number;
}>;

/**
 * The number of Workers AI attempts per UTC day, derived from the ADR 0001 figures (Workers
 * Free: 10,000 Neurons per day; 26,668 Neurons per 1M input tokens and 204,805 per 1M
 * output tokens; tokens approximated as characters / 4):
 *
 * - Pool left for recommendations: 10,000 minus the probe's reserve of
 *   `PROBE_DAILY_LIMIT` (30) calls at ~135 Neurons each = 10,000 - 4,050 = 5,950.
 * - Input per attempt: the largest prompt `buildMessages` and `buildPickJsonSchema`
 *   produce over the 42-cell recommendation grid is 11,583 characters (10,374 of messages,
 *   1,209 of response schema) for 24 options; rounded up to 12,000 characters = 3,000
 *   tokens = 3,000 x 26,668 / 1,000,000 = 80.0 Neurons.
 * - Output per attempt: the largest schema-shaped reply (three picks with the longest
 *   option id and the longest archetype id) is 354 characters pretty-printed = 89 tokens;
 *   rounded up to 128 tokens = 128 x 204,805 / 1,000,000 = 26.2 Neurons.
 * - Per attempt: 80.0 + 26.2 = 106.2, rounded up to 107 Neurons.
 * - Limit: floor(5,950 / 107) = floor(55.6) = 55 attempts.
 *
 * 55 attempts x 107 Neurons = 5,885, which with the probe reserve stays under the 10,000
 * pool. Two caveats: the output estimate assumes a schema-shaped reply, while
 * `recommendationMaxTokens` in workers-ai-provider.ts allows 2,048 output tokens, so a
 * non-conforming reply can cost up to ~419 Neurons; and the ADR 0001 rates are the first
 * model's, the second model (mistral-small-3.1-24b) has a higher input rate, so the limit
 * is conservative only for the first model. Recalculate when the prompt, the model list or
 * the pricing changes. OpenRouter attempts spend no Neurons and are not counted.
 */
export const WORKERS_AI_DAILY_ATTEMPT_LIMIT = Math.floor(
  (10_000 - PROBE_DAILY_LIMIT * 135) / 107,
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

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
} as const;

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

function errorResponse(
  status: number,
  code: AiV1ErrorCode,
  extraHeaders?: Readonly<Record<string, string>>,
): Response {
  const body = aiV1ErrorSchema.parse({ error: { code } });
  return Response.json(body, {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

function defaultCache(): Cache | undefined {
  return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
}

function logProviderFailure(provider: AiProvider, reason: ProviderFailureReason): void {
  console.warn({ event: 'ai_provider_attempt_failed', model: provider.model, reason });
}

/**
 * A spent provider quota and an upstream 429 both used to read as `provider_error`, so the
 * 2026-09-13 outage had to be proved from Cloudflare's own counters. The reason now names
 * them. Every failure still hands the turn to the next provider; the one addition is that
 * a Workers AI `quota_exceeded` marks the shared Neuron pool spent, so the remaining
 * Workers AI providers are skipped and the walk continues with OpenRouter.
 */
function attemptFailureReason(error: unknown, timedOut: boolean): ProviderFailureReason {
  if (timedOut) return 'timeout';
  if (error instanceof AiProviderError) return error.kind;
  return 'provider_error';
}

async function buildCacheRequest(request: AiRecommendV1Request): Promise<Request> {
  const requirementKey = request.requirements
    .map((requirement) => [
      requirement.kind,
      requirement.priority,
      requirement.minimum,
      'target' in requirement ? requirement.target : '',
    ].join('|'))
    .sort()
    .join(',');
  const optionKey = request.options
    .map(({ optionId }) => optionId)
    .sort()
    .join(',');
  const canonical = [
    requirementKey,
    optionKey,
    request.clothingPreference,
    request.dressStyle ?? 'smart',
    request.catalogVersion,
    request.dayVariant,
  ].join('\n');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  );
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return new Request(`https://kuyara.internal/v1/ai/recommend/${hash}`);
}

export function createAiHandler({
  providers,
  rateLimiter,
  dailyCounter,
  dailyLimit,
  now = () => new Date(),
  // Every provider that answers the 2 KB request does so within 5 s (Workers AI 2 to
  // 4.5 s, OpenRouter 0.3 to 1.9 s, measured live); one that does not answer stalls
  // indefinitely, so 7 s cuts it off and hands the turn to the next provider. Never raise
  // this toward the total deadline: one stall then eats the whole budget and the fallback
  // chain never runs.
  attemptTimeoutMs = 7_000,
  // 36 s = 5 × 7 s plus one second for the rate limiter, the body parse and the cache
  // lookup, so the refresh takes as long as it needs and the deterministic fallback only
  // follows the last provider's failure. The mobile client waits 38 s (this deadline plus
  // transport) and sends 37 s in the header; with up to 8 s of on-device selection ahead of
  // it, the whole user-visible wait is at most 46 s.
  totalDeadlineMs = 36_000,
  // Five attempts cover two Workers AI models plus three OpenRouter models.
  maxAttempts = 5,
}: Dependencies): (request: Request, ctx: ExecutionContext) => Promise<Response> {
  return async (request: Request, ctx: ExecutionContext): Promise<Response> => {
    // The total budget covers the whole request, including the rate limiter, the body
    // parse and the shared cache lookup, not only the provider walk.
    const deadline = Date.now() + requestBudgetMs(request, totalDeadlineMs);
    const url = new URL(request.url);
    if (url.pathname !== aiRecommendV1Path) return errorResponse(404, 'not_found');
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', { Allow: 'POST' });
    }
    if (rateLimiter) {
      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const { success } = await rateLimiter.limit({ key: `recommend:${ip}` });
      if (!success) {
        console.warn({
          event: 'rate_limited',
          route: aiRecommendV1Path,
          limiter: 'ai_recommend_burst',
        });
        return errorResponse(429, 'rate_limited', { 'Retry-After': '60' });
      }
    }
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return errorResponse(400, 'invalid_request');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, 'invalid_request');
    }
    const requestResult = aiRecommendV1RequestSchema.safeParse(body);
    if (!requestResult.success) return errorResponse(400, 'invalid_request');

    const options = new Map(
      requestResult.data.options.map((option) => [option.optionId, option]),
    );
    const cache = defaultCache();
    let cacheRequest: Request | undefined;
    if (cache) {
      try {
        cacheRequest = await buildCacheRequest(requestResult.data);
        const cached = await cache.match(cacheRequest);
        if (cached) {
          return new Response(cached.body, { status: 200, headers: jsonHeaders });
        }
      } catch {
        // Shared cache failures fall through to normal generation.
      }
    }

    // The daily budget gates Workers AI attempts, not the route: every Workers AI provider
    // is reached only through a counted, awaited increment, OpenRouter attempts are never
    // counted, and a cache hit above never reaches this walk. Each skip is logged once per
    // request, and a skipped provider consumes none of the deadline.
    let workersAiPoolSpent = false;
    let budgetLogged = false;
    let counterLogged = false;
    for (const [attemptIndex, provider] of providers.slice(0, maxAttempts).entries()) {
      if (provider.id === 'workers-ai') {
        if (workersAiPoolSpent) continue;
        if (dailyCounter && dailyLimit !== undefined) {
          const dateKey = `ai:workers-ai:${now().toISOString().slice(0, 10)}`;
          let count: number;
          try {
            count = await dailyCounter.increment(dateKey);
          } catch {
            if (!counterLogged) {
              console.warn({ event: 'ai_daily_counter_unavailable', route: aiRecommendV1Path });
              counterLogged = true;
            }
            continue;
          }
          if (count > dailyLimit) {
            if (!budgetLogged) {
              console.warn({
                event: 'ai_daily_budget_exhausted',
                route: aiRecommendV1Path,
                count,
                limit: dailyLimit,
              });
              budgetLogged = true;
            }
            continue;
          }
        }
      }
      const remainingMs = deadline - Date.now();
      const attemptWindowMs = Math.min(attemptTimeoutMs, remainingMs);
      if (attemptWindowMs < Math.min(attemptTimeoutMs, minimumUsefulAttemptMs)) break;
      const controller = new AbortController();
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error('AI provider attempt timed out.'));
        }, attemptWindowMs);
      });
      try {
        const output = await Promise.race([
          provider.generateOutfits(requestResult.data, controller.signal),
          timeout,
        ]);
        if (controller.signal.aborted) {
          logProviderFailure(provider, 'timeout');
          continue;
        }

        const result = aiRecommendV1SuccessSchema.safeParse(output);
        if (!result.success) {
          logProviderFailure(provider, 'invalid_output');
          continue;
        }

        const pickedOptions = result.data.data.picks.map(({ optionId }) =>
          options.get(optionId));
        if (!pickedOptions.every((option): option is AiOption => option !== undefined)) {
          logProviderFailure(provider, 'unknown_option');
          continue;
        }
        if (!picksAreMeaningfullyDifferent(pickedOptions)) {
          logProviderFailure(provider, 'picks_not_distinct');
          continue;
        }
        if (!result.data.data.picks.every(({ archetypeId }, index) =>
          meetsArchetypePrecondition(archetypeId, pickedOptions[index]!))) {
          logProviderFailure(provider, 'archetype_precondition');
          continue;
        }

        console.info({
          event: 'ai_provider_attempt_succeeded',
          model: provider.model,
          attempt: attemptIndex + 1,
        });
        const response = Response.json(result.data, { status: 200, headers: jsonHeaders });
        if (cache && cacheRequest) {
          // The write outlives the response instead of delaying it. Shared cache failures
          // must not fail a validated response, so the promise handed over never rejects.
          const cached = response.clone();
          cached.headers.set('Cache-Control', 'public, max-age=2592000');
          ctx.waitUntil(cache.put(cacheRequest, cached).catch(() => {}));
        }
        return response;
      } catch (error) {
        const reason = attemptFailureReason(error, timedOut);
        logProviderFailure(provider, reason);
        // Every Workers AI model draws on the one account-level Neuron pool, so once it is
        // spent the remaining Workers AI attempts can only fail the same way and are
        // skipped; the walk goes on with OpenRouter. An OpenRouter quota refusal is per
        // model and still advances as before.
        if (reason === 'quota_exceeded' && provider.id === 'workers-ai' && !workersAiPoolSpent) {
          console.warn({ event: 'ai_workers_ai_quota_exhausted', model: provider.model });
          workersAiPoolSpent = true;
        }
      } finally {
        clearTimeout(timeoutId!);
      }
    }
    return errorResponse(503, 'ai_unavailable');
  };
}
