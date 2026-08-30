import {
  aiRecommendV1Path,
  aiRecommendV1RequestSchema,
  aiRecommendV1SuccessSchema,
  aiV1ErrorSchema,
  type AiOption,
  type AiRecommendV1Request,
  type AiV1ErrorCode,
  type OutfitArchetypeId,
} from '@kuyara/contracts';

import type { AiProvider } from './ai-provider.ts';
import type { RateLimiter } from './probe-handler.ts';

type Dependencies = Readonly<{
  providers: readonly AiProvider[];
  rateLimiter?: RateLimiter;
  attemptTimeoutMs?: number;
  maxAttempts?: number;
}>;

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

function garmentType(option: AiOption, slot: AiOption['garments'][number]['slot']) {
  return option.garments.find((garment) => garment.slot === slot)?.garmentTypeId;
}

function hasDifferentBodyCore(left: AiOption, right: AiOption): boolean {
  const leftOnePiece = garmentType(left, 'one_piece');
  const rightOnePiece = garmentType(right, 'one_piece');
  if (Boolean(leftOnePiece) !== Boolean(rightOnePiece)) return true;
  if (leftOnePiece || rightOnePiece) return leftOnePiece !== rightOnePiece;
  return garmentType(left, 'primary_top') !== garmentType(right, 'primary_top')
    || garmentType(left, 'bottom') !== garmentType(right, 'bottom');
}

function isMeaningfullyDifferent(left: AiOption, right: AiOption): boolean {
  if (hasDifferentBodyCore(left, right)) return true;
  const leftPairs = new Set(
    left.garments.map(({ slot, garmentTypeId }) => `${slot}|${garmentTypeId}`),
  );
  const rightPairs = new Set(
    right.garments.map(({ slot, garmentTypeId }) => `${slot}|${garmentTypeId}`),
  );
  const leftOnly = [...leftPairs].filter((pair) => !rightPairs.has(pair)).length;
  const rightOnly = [...rightPairs].filter((pair) => !leftPairs.has(pair)).length;
  return leftOnly >= 2 || rightOnly >= 2;
}

function picksAreMeaningfullyDifferent(options: readonly AiOption[]): boolean {
  for (let left = 0; left < options.length; left += 1) {
    for (let right = left + 1; right < options.length; right += 1) {
      if (!isMeaningfullyDifferent(options[left]!, options[right]!)) return false;
    }
  }
  return true;
}

function meetsArchetypePrecondition(
  archetypeId: OutfitArchetypeId,
  option: AiOption,
): boolean {
  switch (archetypeId) {
    case 'everyday_easy':
      return true;
    case 'smart_casual':
      return option.formality === 'smart' || option.formality === 'formal';
    case 'office_ready':
      return option.formality === 'formal';
    case 'weekend_relaxed':
      return option.formality === 'casual';
    case 'layered_warmth':
      return option.traits.hasMidLayer && option.traits.hasOuterLayer;
    case 'cold_shield':
      return option.traits.outerThermalHigh;
    case 'rain_ready':
      return option.traits.outerWaterProtective;
    case 'snow_day':
      return option.traits.tractionEnhanced;
    case 'wind_guard':
      return option.traits.windResistant;
    case 'light_and_airy':
      return !option.traits.hasOuterLayer && option.traits.breathabilityHigh;
    case 'on_the_move':
      return garmentType(option, 'footwear') === 'sneakers';
    case 'in_between':
      return option.traits.hasMidLayer && !option.traits.hasOuterLayer;
  }
}

function defaultCache(): Cache | undefined {
  return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
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
  const canonical = [
    requirementKey,
    request.clothingPreference,
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
  attemptTimeoutMs = 10_000,
  // Covers Workers AI plus the configured three-model OpenRouter chain.
  maxAttempts = 4,
}: Dependencies): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
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

    for (const provider of providers.slice(0, maxAttempts)) {
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error('AI provider attempt timed out.'));
        }, attemptTimeoutMs);
      });
      try {
        const output = await Promise.race([
          provider.generateOutfits(requestResult.data, controller.signal),
          timeout,
        ]);
        if (controller.signal.aborted) continue;

        const result = aiRecommendV1SuccessSchema.safeParse(output);
        if (!result.success) continue;

        const pickedOptions = result.data.data.picks.map(({ optionId }) =>
          options.get(optionId));
        if (!pickedOptions.every((option): option is AiOption => option !== undefined)) {
          continue;
        }
        if (!picksAreMeaningfullyDifferent(pickedOptions)) continue;
        if (!result.data.data.picks.every(({ archetypeId }, index) =>
          meetsArchetypePrecondition(archetypeId, pickedOptions[index]!))) {
          continue;
        }

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
        // Provider failures are intentionally collapsed after bounded fallback.
      } finally {
        clearTimeout(timeoutId!);
      }
    }
    return errorResponse(503, 'ai_unavailable');
  };
}
