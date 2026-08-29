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

## Pricing basis (recalculated 2026-08, do not freeze)

Provider chain: Cloudflare Workers AI binding (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
→ three OpenRouter `:free` models → device-local deterministic generator.

- **Cloudflare Workers AI, Workers Free plan:** 10,000 Neurons/day, shared
  across all models, resets 00:00 UTC. On the Free plan this is a hard stop, not
  billable overage. The model in use costs roughly 26,668 Neurons per 1M input
  tokens and 204,805 Neurons per 1M output tokens.
- **One probe call** against that model with a small canned request (~500 input
  tokens, ~600 output tokens) is roughly **135 Neurons**. So the probe alone
  would exhaust the daily pool in ~74 calls, and real `POST /v1/ai/recommend`
  traffic draws from the same pool.
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
2. Per-IP burst limit (`rateLimiter.limit({ key })`, `key` =
   `request.headers.get('cf-connecting-ip') ?? 'unknown'`). Denied ->
   `429 rate_limited`, `Retry-After: 60`. No provider call.
3. Cache check: module-scope `{ status, checkedAt }` with a 60-second TTL
   measured against `now()`. Fresh -> return the cached body, no provider call,
   no counter increment.
4. Daily counter: `dailyCounter` holds the count for key `probe:YYYY-MM-DD` (UTC
   date from `now()`). At or above **30** -> `429 rate_limited`,
   `Retry-After: 60`. No provider call.
5. `providers.length === 0` -> `{ data: { status: 'unavailable', checkedAt } }`.
6. Otherwise call **only the first provider** in the chain (Workers AI when
   configured), a single attempt, `attemptTimeoutMs` default **20,000 ms** (same
   as the recommend handler, whose working provider was previously aborted at a
   10s boundary), with an `AbortController` + timeout. The request body is a
   fixed minimal valid `AiRecommendV1Request` (1 requirement, 2 candidates)
   defined in the worker, not derived from user data.
7. Validate the provider output with `aiRecommendV1SuccessSchema.safeParse`.
   Parse succeeds -> `status: 'ok'`. Parse fails, provider throws, or the
   attempt times out -> `status: 'unavailable'`.
8. Store `{ status, checkedAt }` in the module cache. Increment the daily
   counter via `dailyCounter.increment(...)` with a 48-hour TTL. Cache hits and
   rate-limit rejections never increment.
9. Respond `200` with `{ data: { status, checkedAt } }`.

`checkedAt` is a UTC ISO 8601 string from `now()`. No provider name, model
identifier, upstream status code, or error text ever appears in the response.

`ponytail:` the daily counter does a KV get-then-put, so concurrent probes can
under-count against the 30/day cap. Acceptable for a soft abuse guard. Upgrade
path: a Durable Object counter if abuse is observed.

### 2. Rate limiting for `POST /v1/ai/recommend`

`aiHandler` gains an optional injected `rateLimiter`. When present, it applies a
per-IP burst limit (`limit: 10, period: 60`) before any provider work; denied ->
`429 rate_limited`. When absent (existing unit tests, local composition without
the binding) the check is skipped so current behavior and tests are unchanged.

### 3. Cloudflare bindings (`apps/worker/wrangler.jsonc`)

```jsonc
"kv_namespaces": [
  { "binding": "PROBE_COUNTER", "id": "<placeholder-until-provisioned>" }
],
"ratelimits": [
  { "name": "AI_PROBE_RATE_LIMIT",     "namespace_id": "1001", "simple": { "limit": 3,  "period": 60 } },
  { "name": "AI_RECOMMEND_RATE_LIMIT", "namespace_id": "1002", "simple": { "limit": 10, "period": 60 } }
]
```

`Env` in `apps/worker/src/index.ts` gains optional `PROBE_COUNTER?`,
`AI_PROBE_RATE_LIMIT?`, `AI_RECOMMEND_RATE_LIMIT?`. Composition in `fetch` wires:

- the probe's `rateLimiter` from `AI_PROBE_RATE_LIMIT`,
- the recommend handler's `rateLimiter` from `AI_RECOMMEND_RATE_LIMIT`,
- the probe's `dailyCounter` as a thin adapter over `PROBE_COUNTER` (`get` parses
  the stored integer, `increment` writes `count + 1` with `expirationTtl:
  172800`).

The real KV namespace id and rate-limit provisioning are an operational step at
deploy time, out of scope for the code change. `wrangler deploy --dry-run` (the
`pnpm check` bundle step) does not contact the API and must still pass; if the
placeholder id breaks the dry run, the lane reports it rather than guessing.

### 4. Shared contract (`packages/contracts/src/ai-v1.ts`)

```ts
export const aiProbeV1Path = '/v1/ai/probe' as const;

export const aiProbeV1SuccessSchema = z.object({
  data: z.object({
    status: z.enum(['ok', 'unavailable']),
    checkedAt: z.string().datetime(),
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

- Motion respects reduced motion: when `theme.isReduceMotionEnabled` (equivalently
  `theme.motion` durations are zero) the indicator renders static with no
  perceptible animation, matching `weather-glyph.tsx`.
- The overlay is a screen-reader stop with a label; focus returns to the
  "Check AI status" button when it dismisses.
- No new dependency, no new theme token, no new shared primitive.

## Consequences

- Provider work is bounded by per-IP burst controls and the probe's daily cap.
  OpenRouter configuration remains free-model-only.
- The probe costs roughly one recommendation's worth of quota per uncached call.
  At 30/day that is about 4,000 Neurons, under half the daily pool, leaving room
  for real traffic. `ponytail:` a probe-specific lower `max_tokens` on the
  adapter would cut this; deferred.
- Rate-limit counters are per-colo and eventually consistent, so the effective
  global ceiling is somewhat higher than the configured numbers. This is
  acceptable for an abuse guard; it is not an accounting system.
- A new animated component enters the app, so Milestone 4 verification adds a
  focused reduced-motion and VoiceOver check on that component and the Settings
  probe flow.

## Alternatives considered

- **Ship the probe inert on remote, defer rate limiting to its own Goal.**
  Rejected: builds the endpoint twice and leaves the milestone half-done while
  still not letting the key go remote.
- **Burst limiter only, no daily counter.** Rejected: a sustained caller at the
  per-minute ceiling drains the Neuron pool in minutes; the 60s window cannot
  see a daily budget.
- **Durable Object counter instead of KV.** Rejected for now: heavier to operate
  for a soft guard. It is the named upgrade path if abuse appears.
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
- Probe-specific `max_tokens` tuning on the provider adapters.
- Any change to the recommendation refresh/coalescing logic.
