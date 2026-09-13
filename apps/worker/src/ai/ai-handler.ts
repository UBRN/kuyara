import {
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

import type { AiProvider } from './ai-provider.ts';
import type { RateLimiter } from './probe-handler.ts';

type Dependencies = Readonly<{
  providers: readonly AiProvider[];
  rateLimiter?: RateLimiter;
  attemptTimeoutMs?: number;
  totalDeadlineMs?: number;
  maxAttempts?: number;
}>;

type ProviderFailureReason =
  | 'timeout'
  | 'provider_error'
  | 'invalid_output'
  | 'unknown_option'
  | 'picks_not_distinct'
  | 'archetype_precondition';

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
} as const;

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
  // Every provider that answers the 2 KB request does so within 5 s (Workers AI 2 to
  // 4.5 s, OpenRouter 0.3 to 1.9 s, measured live); one that does not answer stalls
  // indefinitely. 7 s leaves a stalled first attempt, a full second and a short third
  // inside the 19 s deadline. Never raise this toward the deadline: one stall then eats
  // the whole budget and the fallback chain never runs.
  attemptTimeoutMs = 7_000,
  // The whole request has to finish inside the mobile client's 20 s budget, so no
  // attempt is started or left running past this deadline. It never adds attempts.
  totalDeadlineMs = 19_000,
  // Five attempts cover two Workers AI models plus three OpenRouter models.
  maxAttempts = 5,
}: Dependencies): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    // The total budget covers the whole request, including the rate limiter, the body
    // parse and the shared cache lookup, not only the provider walk.
    const deadline = Date.now() + totalDeadlineMs;
    const url = new URL(request.url);
    if (url.pathname !== aiRecommendV1Path) return errorResponse(404, 'not_found');
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', { Allow: 'POST' });
    }
    if (rateLimiter) {
      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const { success } = await rateLimiter.limit({ key: `recommend:${ip}` });
      if (!success) {
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

    for (const [attemptIndex, provider] of providers.slice(0, maxAttempts).entries()) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      const controller = new AbortController();
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error('AI provider attempt timed out.'));
        }, Math.min(attemptTimeoutMs, remainingMs));
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
          try {
            const cached = response.clone();
            cached.headers.set('Cache-Control', 'public, max-age=2592000');
            await cache.put(cacheRequest, cached);
          } catch {
            // Shared cache failures must not fail a validated response.
          }
        }
        return response;
      } catch {
        logProviderFailure(provider, timedOut ? 'timeout' : 'provider_error');
      } finally {
        clearTimeout(timeoutId!);
      }
    }
    return errorResponse(503, 'ai_unavailable');
  };
}
