import {
  aiProbeV1Path,
  aiProbeV1SuccessSchema,
  aiProbeV2Path,
  aiProbeV2SuccessSchema,
  aiProviderIds,
  aiRecommendV1SuccessSchema,
  aiV1ErrorSchema,
  type AiProbeV2Success,
  type AiRecommendV1Request,
  type AiV1ErrorCode,
} from '@kuyara/contracts';

import { raceWithTimeout } from '../attempt-timeout.ts';
import { dailyCounterKey, type DailyCounterPort } from '../daily-counter.ts';
import { checkRateLimit, rateLimitedHeaders, type RateLimiter } from '../json-request.ts';
import { createErrorResponse, jsonHeaders } from '../json-response.ts';

import {
  attemptFailureReason,
  type AiAttemptFailureReason,
  type AiProvider,
} from './ai-provider.ts';

const PROBE_CACHE_TTL_MS = 60_000;
export const PROBE_DAILY_LIMIT = 30;
const PROBE_ATTEMPT_TIMEOUT_MS = 20_000;
// The probe validates one thing: three `{ optionId, archetypeId }` pairs drawn from the
// three canned options, roughly 200 characters of JSON. 256 tokens is more than twice the
// longest such reply, so the answer the probe checks still fits, while a probe can no
// longer spend a recommendation's worth of the shared pool.
export const PROBE_MAX_TOKENS = 256;

type Dependencies = Readonly<{
  providers: readonly AiProvider[];
  rateLimiter: RateLimiter;
  dailyCounter: DailyCounterPort;
  now?: () => Date;
  attemptTimeoutMs?: number;
}>;

const PROBE_REQUEST = {
  clothingPreference: 'mens',
  catalogVersion: 6,
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
type ProbeFailureReason = Exclude<
  AiAttemptFailureReason,
  'picks_not_distinct' | 'archetype_precondition'
>;

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

const errorResponse = createErrorResponse<AiV1ErrorCode>(aiV1ErrorSchema);

/**
 * What differs between the two probe routes. v1 answers only the provider ids installed
 * binaries parse against a closed enum, so a Worker-internal provider never answers there
 * and the chain's first remaining provider does. v2 names the chain's first provider.
 * Each route builds its own handler, so each keeps its own 60 s result cache, while both
 * count against the one `probe` daily cap.
 */
type Variant = Readonly<{
  path: string;
  schema: { parse(value: unknown): unknown };
  answering(providers: readonly AiProvider[]): AiProvider | undefined;
}>;

const v1Variant: Variant = {
  path: aiProbeV1Path,
  schema: aiProbeV1SuccessSchema,
  answering: (providers) => providers.find(
    ({ id }) => (aiProviderIds as readonly string[]).includes(id),
  ),
};

const v2Variant: Variant = {
  path: aiProbeV2Path,
  schema: aiProbeV2SuccessSchema,
  answering: (providers) => providers[0],
};

export const createProbeHandler = (dependencies: Dependencies): ProbeHandler =>
  createHandler(dependencies, v1Variant);

export const createProbeV2Handler = (dependencies: Dependencies): ProbeHandler =>
  createHandler(dependencies, v2Variant);

type ProbeHandler = (request: Request) => Promise<Response>;

function createHandler({
  providers,
  rateLimiter,
  dailyCounter,
  now = () => new Date(),
  attemptTimeoutMs = PROBE_ATTEMPT_TIMEOUT_MS,
}: Dependencies, { path, schema, answering: selectAnswering }: Variant): ProbeHandler {
  let cached: AiProbeV2Success['data'] | null = null;
  let cachedExpiresAt = 0;

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', { Allow: 'POST' });
    }

    const limit = await checkRateLimit(rateLimiter, request, {
      keyPrefix: 'probe',
      route: path,
      limiter: 'ai_probe_burst',
    });
    // A failing binding answers in the route's own closed code.
    if (limit === 'unavailable') return errorResponse(503, 'ai_unavailable');
    if (limit === 'limited') {
      console.warn({ event: 'rate_limited', route: path, limiter: 'ai_probe_burst' });
      return errorResponse(429, 'rate_limited', rateLimitedHeaders);
    }

    if (cached && now().getTime() < cachedExpiresAt) {
      return Response.json(schema.parse({ data: cached }), { status: 200, headers: jsonHeaders });
    }

    let status: 'ok' | 'unavailable' = 'unavailable';
    const answering = selectAnswering(providers);
    if (answering) {
      // The increment is the gate, and it happens before the attempt: the count it returns
      // decides whether the provider is called at all, so concurrent probes cannot slip
      // past the cap between a read and a write. A failed or timed-out attempt has still
      // spent one counted attempt. Without a provider there is nothing to count. A capped
      // provider counts its own budget too, because the cap wrapper increments before the
      // call (a Haiku probe is one `ai:haiku` attempt as well).
      const dateKey = dailyCounterKey('probe', now());
      let count: number;
      try {
        count = await dailyCounter.increment(dateKey);
      } catch {
        // No counted attempt, no call, and no cached result: nothing was checked.
        console.warn({ event: 'ai_daily_counter_unavailable', route: path });
        return errorResponse(503, 'ai_unavailable');
      }
      if (count > PROBE_DAILY_LIMIT) {
        console.warn({ event: 'rate_limited', route: path, limiter: 'ai_probe_daily' });
        return errorResponse(429, 'rate_limited', rateLimitedHeaders);
      }

      const controller = new AbortController();
      try {
        const output = await raceWithTimeout(
          controller,
          () => answering.generateOutfits(PROBE_REQUEST, controller.signal, {
            maxTokens: PROBE_MAX_TOKENS,
          }),
          attemptTimeoutMs,
        );
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
        logProbeFailure(answering, attemptFailureReason(error, controller.signal));
      }
    }

    const checkedAt = now().toISOString();
    // ADR 0034 section 5: name the provider and model that answered, and only then. Both are
    // controlled non-secret identifiers, so nothing about the failure path changes.
    cached = status === 'ok' && answering
      ? { status, checkedAt, assistant: { providerId: answering.id, model: answering.model } }
      : { status, checkedAt };
    cachedExpiresAt = now().getTime() + PROBE_CACHE_TTL_MS;

    return Response.json(schema.parse({ data: cached }), { status: 200, headers: jsonHeaders });
  };
}
