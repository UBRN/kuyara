import {
  aiRecommendV1Path,
  aiRecommendV1RequestSchema,
  aiRecommendV1SuccessSchema,
  aiV1ErrorSchema,
  type AiV1ErrorCode,
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
    const candidates = new Map(
      requestResult.data.candidates.map((candidate) => [candidate.candidateKey, candidate]),
    );

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
        if (
          result.success &&
          result.data.data.outfits.every((outfit) =>
            outfit.every(({ candidateKey, layerRole }) => {
              const candidate = candidates.get(candidateKey);
              return candidate !== undefined && (
                layerRole === null || candidate.properties.supportedLayerRoles.includes(layerRole)
              );
            }))
        ) {
          return Response.json(result.data, { status: 200, headers: jsonHeaders });
        }
      } catch {
        // Provider failures are intentionally collapsed after bounded fallback.
      } finally {
        clearTimeout(timeoutId!);
      }
    }

    return errorResponse(503, 'ai_unavailable');
  };
}
