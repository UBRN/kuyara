import {
  aiRecommendV1SuccessSchema,
  aiV1ErrorSchema,
  type AiRecommendV1Request,
  type AiV1ErrorCode,
} from '@kuyara/contracts';

import type { AiProvider } from './ai-provider.ts';

export const PROBE_CACHE_TTL_MS = 60_000;
export const PROBE_DAILY_LIMIT = 30;
export const PROBE_ATTEMPT_TIMEOUT_MS = 20_000;
export const PROBE_COUNTER_TTL_SECONDS = 172_800;

export interface RateLimiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export interface ProbeDailyCounter {
  get(dateKey: string): Promise<number>;
  increment(dateKey: string): Promise<void>;
}

type Dependencies = Readonly<{
  providers: readonly AiProvider[];
  rateLimiter: RateLimiter;
  dailyCounter: ProbeDailyCounter;
  now?: () => Date;
  attemptTimeoutMs?: number;
}>;

const PROBE_REQUEST = {
  clothingPreference: 'mens',
  requirements: [
    {
      kind: 'thermal',
      minimum: 'light',
      priority: 'mandatory',
      reasonCodes: ['temperature_low'],
    },
  ],
  candidates: [
    {
      candidateKey: 'probe-top',
      source: 'catalog',
      garmentTypeId: 't_shirt',
      colorFamily: null,
      properties: {
        category: 'top',
        bodyRegion: 'upper_body',
        supportedLayerRoles: ['base'],
        thermalLevel: 'light',
        waterProtection: null,
        windProtection: null,
        breathability: 'moderate',
        armCoverage: 'partial',
        legCoverage: null,
        tractionSuitability: null,
      },
    },
    {
      candidateKey: 'probe-bottom',
      source: 'catalog',
      garmentTypeId: 'trousers',
      colorFamily: null,
      properties: {
        category: 'bottom',
        bodyRegion: 'lower_body',
        supportedLayerRoles: ['standalone'],
        thermalLevel: 'light',
        waterProtection: null,
        windProtection: null,
        breathability: null,
        armCoverage: null,
        legCoverage: 'full',
        tractionSuitability: null,
      },
    },
    {
      candidateKey: 'probe-shoes',
      source: 'catalog',
      garmentTypeId: 'sneakers',
      colorFamily: null,
      properties: {
        category: 'footwear',
        bodyRegion: 'feet',
        supportedLayerRoles: ['standalone'],
        thermalLevel: null,
        waterProtection: null,
        windProtection: null,
        breathability: null,
        armCoverage: null,
        legCoverage: null,
        tractionSuitability: 'everyday',
      },
    },
  ],
} satisfies AiRecommendV1Request;

const probeCandidates = new Map<string, AiRecommendV1Request['candidates'][number]>(
  PROBE_REQUEST.candidates.map((candidate) => [candidate.candidateKey, candidate]),
);

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

export function createProbeHandler({
  providers,
  rateLimiter,
  dailyCounter,
  now = () => new Date(),
  attemptTimeoutMs = PROBE_ATTEMPT_TIMEOUT_MS,
}: Dependencies): (request: Request) => Promise<Response> {
  let cached: { status: 'ok' | 'unavailable'; checkedAt: string } | null = null;
  let cachedExpiresAt = 0;

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', { Allow: 'POST' });
    }

    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await rateLimiter.limit({ key: `probe:${ip}` });
    if (!success) {
      return errorResponse(429, 'rate_limited', { 'Retry-After': '60' });
    }

    if (cached && now().getTime() < cachedExpiresAt) {
      return Response.json({ data: cached }, { status: 200, headers: jsonHeaders });
    }

    const dateKey = `probe:${now().toISOString().slice(0, 10)}`;
    const count = await dailyCounter.get(dateKey);
    if (count >= PROBE_DAILY_LIMIT) {
      return errorResponse(429, 'rate_limited', { 'Retry-After': '60' });
    }

    let status: 'ok' | 'unavailable' = 'unavailable';
    const attempted = providers.length > 0;
    if (attempted) {
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
          providers[0]!.generateOutfits(PROBE_REQUEST, controller.signal),
          timeout,
        ]);
        const result = aiRecommendV1SuccessSchema.safeParse(output);
        if (
          !controller.signal.aborted &&
          result.success &&
          result.data.data.outfits.every((outfit) =>
            outfit.every(({ candidateKey, layerRole }) => {
              const candidate = probeCandidates.get(candidateKey);
              return candidate !== undefined && (
                layerRole === null || candidate.properties.supportedLayerRoles.includes(layerRole)
              );
            }))
        ) {
          status = 'ok';
        }
      } catch {
        // Provider failures are intentionally collapsed into unavailable.
      } finally {
        clearTimeout(timeoutId!);
      }
    }

    const checkedAt = now().toISOString();
    cached = { status, checkedAt };
    cachedExpiresAt = now().getTime() + PROBE_CACHE_TTL_MS;
    if (attempted) await dailyCounter.increment(dateKey);

    return Response.json({ data: cached }, { status: 200, headers: jsonHeaders });
  };
}
