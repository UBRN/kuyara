import {
  aiModelInputFromRequest,
  aiRecommendV1SuccessSchema,
  aiRecommendV2Path,
  aiRecommendV2SuccessSchema,
  archetypeDayFromRequirements,
  type AiOption,
  type AiRecommendV1Request,
  type AiRecommendV1Success,
  type AiRecommendV2Request,
  type AiRecommendV2Success,
} from '@kuyara/contracts';

import type { ExecutionContext } from '../router.ts';
import { selectionFailure } from './ai-selection.ts';
import { completeInsightSentenceSchema } from './insight-sentence.ts';

export function defaultCache(): Cache | undefined {
  return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
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
// One prompt version per route, because only v2 carries the sentence instruction. Bump a
// route's version whenever its prompt text, provider schema order or model-visible input
// changes. The insight sentence check needs no bump: a cached sentence that fails the
// current check is dropped on read.
const AI_PROMPT_VERSIONS = { v1: 2, v2: 3 } as const;

/**
 * The shared-cache key of a request. Its bytes are a contract with the entries already
 * stored (the handler test pins them): change them only with a version bump above.
 */
export async function buildCacheRequest(
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
    `prompt:${route === aiRecommendV2Path ? AI_PROMPT_VERSIONS.v2 : AI_PROMPT_VERSIONS.v1}`,
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

/**
 * The cached answer for `cacheRequest`, or `undefined` for a miss. An entry that no longer
 * parses or that the selection gate rejects is a miss, logged with its reason, so an answer
 * an older gate wrote is regenerated instead of handed to a client that would reject it.
 */
export async function readCachedAnswer(
  cache: Cache,
  cacheRequest: Request,
  route: string,
  request: AiRecommendV1Request | AiRecommendV2Request,
  options: ReadonlyMap<string, AiOption>,
): Promise<AiRecommendV1Success | AiRecommendV2Success | undefined> {
  const cached = await cache.match(cacheRequest);
  if (!cached) return undefined;
  const payload: unknown = await cached.json();
  const parsed = route === aiRecommendV2Path
    ? aiRecommendV2SuccessSchema.safeParse(payload)
    : aiRecommendV1SuccessSchema.safeParse(payload);
  if (!parsed.success) {
    console.warn({ event: 'ai_cache_entry_rejected', route, reason: 'invalid_output' });
    return undefined;
  }
  const reason = selectionFailure(parsed.data.data.picks, request, options);
  if (reason) {
    console.warn({ event: 'ai_cache_entry_rejected', route, reason });
    return undefined;
  }
  return withoutIncompleteSentence(parsed.data);
}

/**
 * An entry written under an older sentence check keeps its picks and loses only a sentence
 * the current check refuses, as a fresh answer would (ADR 0039).
 */
function withoutIncompleteSentence(
  answer: AiRecommendV1Success | AiRecommendV2Success,
): AiRecommendV1Success | AiRecommendV2Success {
  if (!('insightSentence' in answer.data)
    || completeInsightSentenceSchema.safeParse(answer.data.insightSentence).success) {
    return answer;
  }
  const { insightSentence: _refused, ...data } = answer.data;
  return { data };
}

/**
 * The write outlives the response instead of delaying it. Shared cache failures, whether the
 * write rejects or the runtime refuses it, must never fail a validated response.
 */
export function writeCachedAnswer(
  cache: Cache,
  cacheRequest: Request,
  response: Response,
  ctx: ExecutionContext,
): void {
  try {
    const cached = response.clone();
    cached.headers.set('Cache-Control', 'public, max-age=2592000');
    ctx.waitUntil(cache.put(cacheRequest, cached).catch(() => {
      // Best effort: a failed shared-cache write only costs a later cache miss.
    }));
  } catch {
    // Best effort as above.
  }
}
