import {
  aiProbeV1Path,
  aiProbeV1SuccessSchema,
  aiRecommendV1SuccessSchema,
  aiV1ErrorSchema,
  type AiProbeV1Success,
  type AiRecommendV1Request,
  type AiV1ErrorCode,
} from '@kuyara/contracts';

import { AiProviderError, type AiProvider } from './ai-provider.ts';

export const PROBE_CACHE_TTL_MS = 60_000;
export const PROBE_DAILY_LIMIT = 30;
export const PROBE_ATTEMPT_TIMEOUT_MS = 20_000;
// The probe validates one thing: three `{ optionId, archetypeId }` pairs drawn from the
// three canned options, roughly 200 characters of JSON. 256 tokens is more than twice the
// longest such reply, so the answer the probe checks still fits, while a probe can no
// longer spend a recommendation's worth of the shared pool.
export const PROBE_MAX_TOKENS = 256;

export interface RateLimiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

/** Adds one counted attempt under `dateKey` atomically and returns the new count. */
export interface ProbeDailyCounter {
  increment(dateKey: string): Promise<number>;
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
  catalogVersion: 4,
  dayVariant: 0,
  requirements: [
    {
      kind: 'thermal',
      minimum: 'light',
      priority: 'mandatory',
      reasonCodes: ['temperature_low'],
    },
  ],
  options: [
    {
      optionId: 'probe-casual',
      formality: 'casual',
      garments: [
        { slot: 'primary_top', layerRole: 'standalone', garmentTypeId: 't_shirt' },
        { slot: 'bottom', layerRole: 'standalone', garmentTypeId: 'trousers' },
        { slot: 'footwear', layerRole: null, garmentTypeId: 'sneakers' },
      ],
      traits: {
        hasMidLayer: false,
        hasOuterLayer: false,
        outerThermalHigh: false,
        outerWaterProtective: false,
        windResistant: false,
        tractionEnhanced: false,
        breathabilityHigh: true,
      },
    },
    {
      optionId: 'probe-smart',
      formality: 'smart',
      garments: [
        { slot: 'primary_top', layerRole: 'standalone', garmentTypeId: 'shirt' },
        { slot: 'bottom', layerRole: 'standalone', garmentTypeId: 'jeans' },
        { slot: 'footwear', layerRole: null, garmentTypeId: 'closed_shoes' },
      ],
      traits: {
        hasMidLayer: false,
        hasOuterLayer: false,
        outerThermalHigh: false,
        outerWaterProtective: false,
        windResistant: false,
        tractionEnhanced: false,
        breathabilityHigh: false,
      },
    },
    {
      optionId: 'probe-formal',
      formality: 'formal',
      garments: [
        { slot: 'one_piece', layerRole: 'standalone', garmentTypeId: 'dress' },
        { slot: 'footwear', layerRole: null, garmentTypeId: 'ankle_boots' },
      ],
      traits: {
        hasMidLayer: false,
        hasOuterLayer: false,
        outerThermalHigh: false,
        outerWaterProtective: false,
        windResistant: false,
        tractionEnhanced: false,
        breathabilityHigh: false,
      },
    },
  ],
} satisfies AiRecommendV1Request;

const probeOptions = new Map<string, AiRecommendV1Request['options'][number]>(
  PROBE_REQUEST.options.map((option) => [option.optionId, option]),
);

/**
 * The probe's subset of the recommend handler's closed failure vocabulary: it validates
 * structure and the canned option set, never distinctness or archetype preconditions.
 */
type ProbeFailureReason =
  | 'timeout'
  | 'provider_error'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'invalid_output'
  | 'unknown_option';

/**
 * The response collapses every failure into `unavailable` by design, so this log is the
 * one place an operator can tell an exhausted chain from a broken one. Same shape as the
 * recommend handler's `ai_provider_attempt_failed`; defined here because `ai-handler.ts`
 * imports this module. Carries the model, a controlled non-secret identifier, and the
 * closed reason only: no upstream text, no prompt, no caller address.
 */
function logProbeFailure(provider: AiProvider, reason: ProbeFailureReason): void {
  console.warn({ event: 'ai_probe_attempt_failed', model: provider.model, reason });
}

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
  let cached: AiProbeV1Success['data'] | null = null;
  let cachedExpiresAt = 0;

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', { Allow: 'POST' });
    }

    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await rateLimiter.limit({ key: `probe:${ip}` });
    if (!success) {
      console.warn({ event: 'rate_limited', route: aiProbeV1Path, limiter: 'ai_probe_burst' });
      return errorResponse(429, 'rate_limited', { 'Retry-After': '60' });
    }

    if (cached && now().getTime() < cachedExpiresAt) {
      return Response.json(aiProbeV1SuccessSchema.parse({ data: cached }), { status: 200, headers: jsonHeaders });
    }

    let status: 'ok' | 'unavailable' = 'unavailable';
    const answering = providers[0];
    if (answering) {
      // The increment is the gate, and it happens before the attempt: the count it returns
      // decides whether the provider is called at all, so concurrent probes cannot slip
      // past the cap between a read and a write. A failed or timed-out attempt has still
      // spent one counted attempt. Without a provider there is nothing to count.
      const dateKey = `probe:${now().toISOString().slice(0, 10)}`;
      let count: number;
      try {
        count = await dailyCounter.increment(dateKey);
      } catch {
        // No counted attempt, no call, and no cached result: nothing was checked.
        console.warn({ event: 'ai_daily_counter_unavailable', route: aiProbeV1Path });
        return errorResponse(503, 'ai_unavailable');
      }
      if (count > PROBE_DAILY_LIMIT) {
        console.warn({ event: 'rate_limited', route: aiProbeV1Path, limiter: 'ai_probe_daily' });
        return errorResponse(429, 'rate_limited', { 'Retry-After': '60' });
      }

      const controller = new AbortController();
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error('AI provider attempt timed out.'));
        }, attemptTimeoutMs);
      });

      try {
        const output = await Promise.race([
          answering.generateOutfits(PROBE_REQUEST, controller.signal, {
            maxTokens: PROBE_MAX_TOKENS,
          }),
          timeout,
        ]);
        const result = aiRecommendV1SuccessSchema.safeParse(output);
        if (controller.signal.aborted) {
          logProbeFailure(answering, 'timeout');
        } else if (!result.success) {
          logProbeFailure(answering, 'invalid_output');
        } else if (
          !result.data.data.picks.every(({ optionId }) => probeOptions.has(optionId))
        ) {
          logProbeFailure(answering, 'unknown_option');
        } else {
          status = 'ok';
        }
      } catch (error) {
        // Provider failures are intentionally collapsed into unavailable in the response;
        // only the log keeps the reason.
        logProbeFailure(
          answering,
          timedOut ? 'timeout'
            : error instanceof AiProviderError ? error.kind
              : 'provider_error',
        );
      } finally {
        clearTimeout(timeoutId!);
      }
    }

    const checkedAt = now().toISOString();
    // ADR 0034 section 5: name the provider and model that answered, and only then. Both are
    // controlled non-secret identifiers, so nothing about the failure path changes.
    cached = status === 'ok' && answering
      ? { status, checkedAt, assistant: { providerId: answering.id, model: answering.model } }
      : { status, checkedAt };
    cachedExpiresAt = now().getTime() + PROBE_CACHE_TTL_MS;

    return Response.json(aiProbeV1SuccessSchema.parse({ data: cached }), { status: 200, headers: jsonHeaders });
  };
}
