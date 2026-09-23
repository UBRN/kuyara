# ADR 0001: Active AI probe and Worker-side rate limiting

Status: Accepted (2026-08-29)

Implementation: Completed and deployed on 2026-08-29.

## Context

At decision time, milestone 4 had two halves:

1. A coarse generation-mode status surface. The recommendation snapshot already
   records `ai-assisted` or `deterministic-fallback` (mobile domain type
   `RecommendationGenerationMode`, persisted in `recommendation_snapshots`,
   migration v5). No user-visible surface existed yet.
2. An active AI probe. The Worker already exposes a non-AI liveness check
   (`GET /v1/health`) and an AI configuration-readiness check
   (`GET /v1/ai/ready`, calls no provider). The third distinct question, "does a
   provider actually answer right now", has no endpoint. An active probe spends
   real provider quota, so `docs/product-decisions.md` requires it to be
   explicitly triggered, bounded, rate-limited, and briefly cached, and a
   successful probe could not be presented as a guarantee that a later full
   recommendation will succeed.

One decision was still open: the public Worker endpoint was unauthenticated and
the remote provider credential had not been configured because no request
throttling protected it. The proposed probe widened that surface with a second
endpoint doing upstream work for anonymous callers. The Worker then had no KV,
Durable Object, rate limiter, or cache layer; every response used
`Cache-Control: no-store`.

The operator chose (2026-08-29) to add rate limiting now, in Milestone 4,
covering both AI endpoints, and to record the decision in this ADR plus the
existing docs.

## Pricing basis (current estimate, do not freeze)

Source: <https://developers.cloudflare.com/workers-ai/platform/pricing/>. The
figures below are the current estimate and are recalculated from that page
during implementation, never treated as fixed.

Provider chain: Cloudflare Workers AI binding (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
then `@cf/mistralai/mistral-small-3.1-24b-instruct`) → three OpenRouter `:free` models →
device-local deterministic generator.

- **Cloudflare Workers AI, Workers Free plan:** 10,000 Neurons/day, shared
  across all models, resets 00:00 UTC. On the Free plan this is a hard stop, not
  billable overage. The head model, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
  is listed at 26,668 Neurons per 1M input tokens and 204,805 Neurons per 1M
  output tokens.
- **One probe call** sends the canned request through the shared model-input
  projection: system rules plus the projected body come to about 1,500
  characters, roughly 400 input tokens at four characters per token (about 540
  if the `response_format` schema is also billed as input). Output is capped by
  `PROBE_MAX_TOKENS` at 256 tokens. At the ceiling that is about 14 Neurons of
  input plus 52 of output, **67 Neurons**, the figure the recommendation
  handler reserves as `PROBE_DAILY_LIMIT` times 67, so the probe alone would
  exhaust the daily pool in about 150 calls; a typical reply of some 200
  characters costs closer to 20. Real `POST /v1/ai/recommend` traffic draws from
  the same pool.
- **OpenRouter `:free` models:** 50 requests/day if under $10 of credits ever
  purchased, 1,000/day after a one-time $10 purchase; 20 requests/minute on
  `:free` variants regardless of credit. `:free` variants are not billed, so the
  real risk on OpenRouter is quota exhaustion and general abuse of an
  unauthenticated endpoint, not runaway spend.
- **Cloudflare Workers rate-limit binding** (GA since 2025-09, no Free-plan
  restriction): `period` must be 10 or 60 seconds, counters are per-colo and
  eventually consistent. Good for burst control, unusable as a daily quota
  ledger.

Conclusion: a burst limiter alone does not stop a determined caller from
draining the daily Neuron pool in minutes. There is a real ceiling a 60-second
window cannot see (pool exhausted -> real users silently drop to the
deterministic fallback), so the probe also needs a small daily counter.

## Decision

### 1. Endpoint: `POST /v1/ai/probe`

A new method-gated branch in `apps/worker/src/router.ts`. `POST` because it is
an explicit, quota-spending action, unlike the idempotent `GET` liveness and
readiness checks. The handler is assembled by injection, matching
`createAiHandler`:

```
createProbeHandler({ providers, rateLimiter, dailyCounter, now, attemptTimeoutMs })
```

All collaborators are injectable so tests pass fakes and assert zero provider
calls on the rejection paths.

Handler order:

1. Method gate: non-`POST` -> `405 method_not_allowed`, `Allow: POST`.
2. Per-IP burst limit (`rateLimiter.limit({ key })`, `key` = `probe:` plus
   `request.headers.get('cf-connecting-ip') ?? 'unknown'`). Denied ->
   `429 rate_limited`, `Retry-After: 60`. No provider call.
3. Cache check: the module-scope body with a 60-second TTL
   measured against `now()`. Fresh -> return the cached body, no provider call,
   no counter increment.
4. `providers.length === 0` -> `{ data: { status: 'unavailable', checkedAt } }`.
   No counter increment: without a provider there is nothing to count.
5. Daily counter: `dailyCounter.increment('probe:YYYY-MM-DD')` (UTC date from
   `now()`) adds one counted attempt atomically and returns the new count. The
   increment is the gate and runs before the attempt. A count above **30** ->
   `429 rate_limited`, `Retry-After: 60`, no provider call; the 30th attempt of
   the day still runs. A counter that cannot be reached -> `503 ai_unavailable`,
   logged as `ai_daily_counter_unavailable`, no provider call and no cached
   result.
6. Otherwise call **only the first provider** in the chain (Workers AI when
   configured), a single attempt, `attemptTimeoutMs` default **20,000 ms** (the
   probe's own budget; the recommend handler runs each attempt under 7,000 ms
   inside its 36-second deadline), with an `AbortController` + timeout. The request body is a
   fixed minimal valid `AiRecommendV1Request` (1 requirement, 3 options)
   defined in the worker, not derived from user data.
7. Validate the provider output with `aiRecommendV1SuccessSchema.safeParse` and
   require every pick to name one of the canned options. Both hold ->
   `status: 'ok'`. Either fails, the provider throws, or the attempt times out
   -> `status: 'unavailable'`.
8. Store that body in the module cache. A failed, invalid, or timed-out attempt
   has already spent its counted attempt; cache hits, burst rejections, counter
   rejections and the no-provider answer never increment. A failed attempt is
   logged as `ai_probe_attempt_failed` with the model and a closed reason
   (`timeout`, `provider_error`, `quota_exceeded`, `rate_limited`,
   `invalid_output`, `unknown_option`), never with upstream text.
9. Respond `200` with `{ data: { status, checkedAt } }`, carrying `assistant`
   when a provider answered.

`checkedAt` is a UTC ISO 8601 string from `now()`. A successful probe names the
provider and model that answered, the single surface for those identifiers
([ADR 0034](0034-on-device-ai-selection-through-apple-foundation-models.md)
section 5). No upstream status code or error text ever appears in the response.

The daily counter is a Durable Object whose input gate serialises requests, so
the increment-then-compare is atomic and concurrent probes cannot under-count
against the 30/day cap.

### 2. Rate limiting for `POST /v1/ai/recommend`

`aiHandler` gains an optional injected `rateLimiter`. When present, it applies a
per-IP burst limit (`limit: 10, period: 60`) before any provider work; denied ->
`429 rate_limited`. When absent (existing unit tests, local composition without
the binding) the check is skipped so current behavior and tests are unchanged.

### 3. Cloudflare bindings (`apps/worker/wrangler.jsonc`)

```jsonc
"durable_objects": {
  "bindings": [{ "name": "DAILY_COUNTERS", "class_name": "DailyCounter" }]
},
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["DailyCounter"] }],
"ratelimits": [
  { "name": "AI_PROBE_RATE_LIMIT",     "namespace_id": "1001", "simple": { "limit": 3,  "period": 60 } },
  { "name": "AI_RECOMMEND_RATE_LIMIT", "namespace_id": "1002", "simple": { "limit": 10, "period": 60 } }
]
```

The snippet lists the bindings this decision adds; the weather limiter that
shares the `ratelimits` block belongs to
[ADR 0002](0002-real-weather-provider-chain.md). `Env` in
`apps/worker/src/index.ts` gains optional `DAILY_COUNTERS?`,
`AI_PROBE_RATE_LIMIT?`, `AI_RECOMMEND_RATE_LIMIT?`. Composition wires:

- the probe's `rateLimiter` from `AI_PROBE_RATE_LIMIT`,
- the recommend handler's `rateLimiter` from `AI_RECOMMEND_RATE_LIMIT`,
- the probe's `dailyCounter` as the `probe` counter of `DAILY_COUNTERS`
  (`apps/worker/src/daily-counter.ts`): one Durable Object per counter name,
  holding the date keys, incrementing atomically, and dropping older date keys
  on the first increment of a new day.

Rate-limit provisioning is an operational step at deploy time, out of scope for
the code change. `wrangler deploy --dry-run` (the `pnpm check` bundle step) does
not contact the API and must still pass.

### 4. Shared contract (`packages/contracts/src/ai-v1.ts`)

```ts
export const aiProbeV1Path = '/v1/ai/probe' as const;

export const aiProbeV1SuccessSchema = z.object({
  data: z.object({
    status: z.enum(['ok', 'unavailable']),
    checkedAt: z.string().datetime(),
    // Present only when a provider answered.
    assistant: z.object({
      providerId: z.enum(aiProviderIds),
      model: z.string().min(1).max(120),
    }).strict().optional(),
  }).strict(),
}).strict();

export type AiProbeV1Success = z.infer<typeof aiProbeV1SuccessSchema>;
```

`aiV1ErrorCodes` gains `'rate_limited'`. The `429` body is the existing
`aiV1ErrorSchema` shape: `{ error: { code: 'rate_limited' } }`.

### 5. Mobile: generation-mode indicator

`OutfitRecommendationSuccess.generationMode` is already reachable from the Today
state as `snapshot.recommendation.generationMode` when
`recommendation.status === 'recommended'`. No model change is needed.

- `today-presentation.ts` produces a pill descriptor `{ label, tone }` in the
  loaded presentation: `ai-assisted` -> `tone: 'accent-filled'`,
  `deterministic-fallback` -> `tone: 'bordered'`.
- `today-screen.tsx` renders the existing `Pill` primitive in a row with the
  `recommendedTodayHeading` eyebrow in the primary-suggestion section.
- Labels come from new `TodayMessages` keys. The pill carries a text label, so
  state is never communicated by color alone, satisfying the design-system
  constraint on status UI.
- Settings shows the same information as a read-only line for the last
  recommendation, using new `settings` keys.

### 6. Mobile: active-probe trigger in Settings

- `worker-ai-probe-client.ts` beside `worker-ai-client.ts`: `class
  WorkerAiProbeClient { probe(): Promise<AiProbeV1Success['data']> }`, same
  `resolveWorkerBaseUrl` usage and the same failure-classification discipline.
  Failure kinds: `network`, `service`, `rate-limited`, `invalid-response`.
  Request timeout **25,000 ms** (Worker's 20s attempt plus margin).
- The Settings route owns probe state with `useState` (a one-shot action needs
  no external store or controller). It passes `aiStatus`, `lastGenerationMode`,
  and `onCheckAiStatus` into the pure `SettingsScreen`.
- New Settings section: eyebrow heading, the last-generation-mode line, a
  "Check AI status" button, and a result line announced with
  `accessibilityLiveRegion`. Result copy:
  - `ok` -> "AI responded just now" plus the local `checkedAt` time,
  - `unavailable` -> "AI did not respond right now",
  - `rate-limited` -> "Checked too often, try again shortly",
  - other failures -> a generic "could not check" line.
  Copy never states or implies that a later recommendation will succeed.
- The button is disabled when no Worker base URL is configured.

### 7. Mobile: probe loading animation

While the probe is in flight, Settings shows an inline overlay (a `Surface` over
the AI-status section with a `scrim`), not a new route. It contains a custom
`Animated` looping indicator (pulsing dots) built with the existing
`react-native-reanimated` dependency, following the `weather-glyph.tsx`
precedent, plus a localized "Checking AI status…" line.

- The indicator is an indefinite loop and continues under the OS Reduce Motion
  setting. Its localized label carries the state in words.
- The overlay is a screen-reader stop with a label; focus returns to the
  "Check AI status" button when it dismisses.
- No new dependency, no new theme token, no new shared primitive.

## Consequences

- Provider work is bounded by per-IP burst controls and the probe's daily cap.
  OpenRouter configuration remains free-model-only.
- The probe passes the provider its own `max_tokens` ceiling
  (`PROBE_MAX_TOKENS`), sized for the three `optionId`/`archetypeId` pairs it
  validates and nothing more, so an uncached probe cannot cost a
  recommendation's worth of output. At 30/day and the 256-token ceiling the
  probe's share is at most about 1,950 Neurons, under a fifth of the daily
  pool, leaving room for real traffic.
- Rate-limit counters are per-colo and eventually consistent, so the effective
  global ceiling is somewhat higher than the configured numbers. This is
  acceptable for an abuse guard; it is not an accounting system.
- The animated component and the Settings probe flow follow the automated
  accessibility checks and affected Simulator pass in `AGENTS.md`.

## Alternatives considered

- **Ship the probe inert on remote, defer rate limiting to its own Goal.**
  Rejected: builds the endpoint twice and leaves the milestone half-done while
  still not letting the key go remote.
- **Burst limiter only, no daily counter.** Rejected: a sustained caller at the
  per-minute ceiling drains the Neuron pool in minutes; the 60s window cannot
  see a daily budget.
- **A Workers KV daily counter.** Rejected: KV Free allows 1,000 writes per day
  and one write per second to the same key, and its read-then-write is not
  atomic. Red line: do not move the counter back to KV; the Durable Object is the
  one counter behind every daily cap
  ([ADR 0002](0002-real-weather-provider-chain.md)).
- **A lightweight `ping` method on `AiProvider` instead of a canned full
  request.** Rejected: adds a method to every adapter for marginal savings; a
  small canned `AiRecommendV1Request` reuses the exact success validation.
- **Full-screen modal for the loading state.** Rejected: new route, back/cancel
  navigation state, larger scope for no product gain over an inline overlay.
- **Native `ActivityIndicator` for the loading state.** Rejected by the operator
  in favor of a custom animated indicator.

## Out of scope

- Remote deployment and provisioning were separate operational work and were
  completed later on 2026-08-29.
- Any change to the recommendation refresh/coalescing logic.
