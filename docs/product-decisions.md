# kuyara product decisions

## Confirmed MVP decisions

- kuyara is an open-source weather and outfit recommendation app for iOS and Android.
- The first release is optimized for iOS while shared code remains Android-compatible.
- Turkish and English are supported from the beginning. The device language and system theme are the defaults, with language and theme overrides available in Settings.
- The MVP has no account, cross-device sync, behavioral analytics, or notifications.
- kuyara is free and ad-free, with no subscription and no in-app purchase. Paid provider usage is maintainer-funded and bounded.
- Expo SQLite is the durable source of truth for user-created local data. Remote sync may complement, but must not replace, the local store in a future release.
- Weather providers are accessed only through the Worker behind a provider-neutral contract. Weather constraints are deterministic; AI generates exactly three complete outfits from a closed candidate set and must have a device-local deterministic fallback.
- Wardrobe photos are optional, remain on-device in the MVP, and are not sent to AI.
- “Women's clothing” and “Men's clothing” are mutable clothing preferences, not biological-sex fields.

## Temporary Apple constraint

The current membership pause, its scope, and the 2026-08-13 revocation of the earlier sample-only rule are canonical in the [`AGENTS.md` temporary project constraint](../AGENTS.md#temporary-project-constraint).

## Current scaffold

The current scaffold and workspace layout are canonical in the [`README.md` Stack section](../README.md#stack).

## Implemented primary navigation

- The final main tabs are Today, Weather, Wardrobe, and Settings. Their visible paths are `/`, `/weather`, `/wardrobe`, and `/settings`; Expo Router route groups do not appear in user-visible URLs.
- The root Stack retains the device-local onboarding gate and keeps `/onboarding` outside the tab navigator. An incomplete profile cannot enter the tab group, while a completed profile opens Today by default.
- The current app uses Expo Router's stable JavaScript Tabs. SDK 57 Native Tabs remain alpha and are not used; moving to Native Tabs later requires a separate, deliberate migration decision.
- Each main tab owns a nested Stack boundary. Wardrobe create and edit screens live inside the Wardrobe Stack rather than being pushed from Today.
- Weather now provides foreground location selection and Worker-backed persisted sample weather at `/weather`. Wardrobe provides its first local CRUD experience at `/wardrobe`, `/wardrobe/new`, and `/wardrobe/[id]` without changing the tab or root Stack architecture.

## Implemented deterministic Today integration

The Today mock slice was replaced by the real recommendation flow. The remaining İstanbul fixture is test-only; its former production use, three named intents, and pre-written prose no longer exist.

- Today renders outfits from the persisted recommendation snapshot. The active weather snapshot and persisted clothing preference derive clothing requirements, bundled catalog types and owned Wardrobe items become evaluated candidates, and the Worker AI route returns exactly three outfits when it succeeds. The result records `ai-assisted` in that case and `deterministic-fallback` when the device-local generator is used.
- Outfits have no intent identity. The former Comfortable, Polished, and Rain-ready labels were removed because the deterministic engine produces diversity, not intent, and no domain evidence supports an intent claim. An outfit's heading is now its localized catalog garment names in slot order, the first option carries the Recommended emphasis, and the others are presented as other options.
- Explanations are language-independent codes localized at the presentation boundary: the snapshot's clothing-requirement reason codes lead every outfit's reason list, followed by that outfit's own composition reason codes. They are rendered as a list on the outfit detail screen rather than as a paragraph, because a wide-range day legitimately emits both a low-temperature and a high-temperature reason.
- Today shows only weather fields the real snapshot actually carries. Sunrise time, sunset time, wind direction, and the accessory slot were removed because no data source produces them; wind is reported in metres per second, matching Weather. The rain outlook is derived from the real hourly forecast and renders only when future hourly entries exist.
- The Wardrobe application provider is mounted at the root alongside Weather, because Today depends on Wardrobe contents. Wardrobe state is application-scoped, not tab-scoped.
- Today renders loading while weather or wardrobe is still loading, and the unavailable state when weather failed, no snapshot exists, or no location is active. A Wardrobe refresh failure never blanks Today; it recommends from the catalog alone. The recommendation is recomputed only when the weather snapshot identity, Wardrobe contents, or clothing preference changes.
- Today still has no WeatherKit, account, sync, analytics, or notification behavior. It does use the Worker AI route and persisted recommendation snapshots.
- Today uses the existing semantic theme and adaptive primitives, keeps all important content in a scalable vertical layout, and supplies grouped VoiceOver labels for weather and outfit summaries. Its loaded state uses the shared stretchy-header presentation primitive: only the semantic surface background stretches into the measured top safe area during native negative overscroll, while localized text, controls, semantics, and touch targets remain fixed. The direct gesture-linked response has no spring or timing continuation and remains enabled with Reduce Motion; no information depends on the effect.
- English and Turkish plus light, dark, and system appearances are supported through device defaults and persisted local Settings overrides.
- Shared React Native source remains Android-compatible, but Android build, emulator, and visual refinement are intentionally deferred for this slice.

## Implemented local profile, onboarding, and Settings slice

- Expo SQLite is now the durable source of truth for one device-local profile. Schema migration version 1 is applied from application bootstrap before route content is shown.
- The profile receives one Expo Crypto UUID v4 when it is first created. It starts with no clothing choice, system language, system appearance, and incomplete onboarding; repeated or concurrent initialization returns the same persisted row.
- First launch presents a short, accountless onboarding flow. “Women’s clothing” or “Men’s clothing” is required, while language and appearance default to system and remain reviewable before completion.
- Completing onboarding atomically stores the three preferences and completion state, then the local route gate opens the tab group on Today.
- Settings is a main tab and remains reachable from Today's existing settings action. It persists clothing, language, and appearance changes immediately. The existing localization and semantic theme providers consume the saved preferences, so successful changes update visible UI without an app reload.
- The slice adds no account, authentication, remote profile, synchronization engine, analytics, notifications, location permission, WeatherKit, Worker request, or AI behavior.

## Implemented local-first wardrobe persistence slice

- Expo SQLite schema version 2 adds profile-owned wardrobe items without changing version 1 or replacing the durable local profile store. A future remote sync adapter may complement this schema but will use separate remote records and explicit mapping.
- Each wardrobe item has a client-generated UUID, its existing `localProfileId`, optional user-visible name and color, one small structural category, an optional app-private photo relative path, UTC lifecycle timestamps, and nullable soft-deletion time.
- The stable structural categories are `top`, `bottom`, `one_piece`, `outerwear`, `footwear`, and `accessory`. They describe an item's role in an outfit and are stored independently from localized UI copy.
- Active reads are profile-scoped and exclude soft-deleted rows by default. Update and delete operations cannot act through another profile ID; deletion sets `deletedAt` and `updatedAt` rather than removing the row.
- SQLite stores only a normalized relative photo path. Absolute paths, URIs, backslashes, parent traversal, and empty path values are not persisted; external transmission remains excluded. Photo import, compression, copying, and cleanup were unimplemented in this slice and landed later as the private single-photo lifecycle.
- Version 2 deliberately deferred detailed catalog and recommendation properties and reserved no free-form metadata field for them. Version 3 now adds only the approved canonical type, color family, and limited overrides; season, fabric, formality, runtime layer assignment, brand, purchase data, AI tags, and provider fields remain excluded.
- The original version 2 persistence slice added no presentation or application state. The current Wardrobe UI now consumes the same repository through a feature-local controller/provider; it adds no global state, recommendation engine, WeatherKit, AI, account, authentication, synchronization, outbox, or conflict-resolution behavior.

## Implemented clothing taxonomy and wardrobe schema version 3

- The bundled version 1 garment catalog defines the 30 canonical types, structural categories, weather-relevant default properties, stable localization keys, and deprecation metadata specified in [`clothing-taxonomy.md`](clothing-taxonomy.md). Zod schemas and TypeScript types derive from the same readonly value sources.
- Catalog applicability filters only general catalog suggestions. It is not biological sex and never hides, invalidates, deletes, or excludes a valid item the user already owns or deliberately adds to the Wardrobe.
- `blouse`, `skirt`, and `dress` apply to the `womens` catalog preference. Every other canonical type, including `jumpsuit`, applies to both `womens` and `mens`.
- SQLite migration version 3 preserves every version 2 field and row while adding a nullable canonical type reference, canonical color family, and seven explicit property-override columns. Legacy rows remain unclassified until the user chooses a type; migration never infers one.
- Catalog defaults remain bundled code rather than duplicated SQLite data. A pure effective-garment resolver uses an explicit item override when present and otherwise the current catalog default; legacy, resolved, and invalid-data outcomes remain distinct.
- The Wardrobe form derives type names, color families, supported property controls, option labels, and defaults from this bundled catalog and taxonomy. Changing a type with explicit overrides requires confirmation and resets those overrides so the new type defaults apply.
- The taxonomy and Wardrobe UI add no recommendation algorithm, weather threshold, provider contract, WeatherKit integration, AI, authentication, remote catalog, or sync behavior.

## Implemented first Wardrobe experience

- `/wardrobe` reads active profile-owned items through the repository and renders a virtualized, stable newest-updated-first list. Soft-deleted items remain excluded by the existing persistence contract; the empty state and add action open `/wardrobe/new`.
- New and existing items use an explicit form-values mapper rather than exposing domain lifecycle or SQLite fields. Users can edit the optional name, required canonical type, canonical color family, and only the property overrides supported by the selected type.
- Normal edits omit the legacy `color` and photo path fields, so patch-style repository updates preserve them. Type changes clear explicit property overrides after confirmation while preserving the item name and color family.
- Successful create, update, and confirmed soft delete refresh the repository-backed list before returning. Load, validation, saving, deletion, not-found, retry, and unsaved-change states are localized in English and Turkish.
- The UI adds no photo controls, search, filters, grouping, sorting controls, restore flow, hard deletion, new migration, dependency, or remote behavior.
- The ready Wardrobe list retains its virtualized React Native FlatList through Reanimated's animated FlatList wrapper and adopts the same shared stretchy header. Title and add controls stay fixed and unscaled; refresh errors, empty/list content, and the refresh indicator remain below the measured compact header.

## Implemented foreground location and local weather slice

- Weather supports a stable manual sample catalog for İstanbul, Ankara, and London plus an explicit foreground-only device-location choice. No location prompt occurs during app bootstrap or merely by opening the Weather tab.
- Selecting device location first presents kuyara's localized rationale. Only confirmation may request foreground permission. Approximate permission remains usable and visible; denied/requestable and permanently denied states keep manual selection available, with platform Settings offered only for the permanent case.
- Only normalized hundredth-degree coordinates, IANA time zone, source, and approximate/full accuracy cross the native adapter or reach SQLite. Raw coordinates and native permission diagnostics are neither logged nor persisted.
- SQLite schema version 4 owns one active location per local profile and location-bound weather snapshots with ordered current-local-day hourly entries. Snapshot replacement is atomic and retention is bounded to the active location plus the newest previous location.
- A cached snapshot is fresh through exactly 30 minutes and stale after that boundary. Fresh cache renders without a fetch; stale cache renders immediately and refreshes in the background. Manual refresh is always available, and refresh failure preserves and labels the last valid result.
- The provider of this slice is a deterministic, visibly disclosed sample source with reproducible success, delayed-stale-success, and failure paths, replaceable behind a narrow provider interface. It performed no network request and now survives only in focused tests: the application composition calls the Worker over HTTP.
- This slice does not add WeatherKit, Worker API routes, shared network contracts, TanStack Query, recommendation rules, AI, accounts, synchronization, analytics, notifications, background location, or background refresh.

## Implemented Worker weather v1 foundation

- `POST /v1/weather` accepts only normalized integer hundredth-degree latitude/longitude values and an IANA time zone. Profile IDs, location keys, native permission data, accuracy labels, and raw coordinates are not part of the API.
- Shared strict Zod schemas define the request, provider-neutral success data, established condition codes and weather invariants, and minimal stable error codes. The response identifies data only as `sample` or `live`; WeatherKit names and raw provider structures remain internal.
- The Worker validates before provider access, maps an injected provider-neutral model through an explicit API mapper, and sanitizes invalid input, route/method failures, unavailable or invalid provider data, and unexpected errors. Responses do not expose provider details, stacks, secrets, or internal configuration.
- The current Worker composition uses a deterministic clock-injected local mock and marks every success as sample data. It has no upstream call, credential, secret, binding, authentication, persistence, rate limiting, DNS, or remote resource. A controlled `workers.dev` development deployment of this same sample composition was added later for explicit remote development use and adds none of the above.
- Mobile development composition calls this local endpoint through a contract-validating HTTP provider adapter. Production WeatherKit integration remains deferred.

## Implemented mobile Worker weather adapter

- Mobile depends directly on the shared contracts package and validates every Worker success or stable error body before using it. The provider-neutral mobile boundary distinguishes network, service, and invalid-response failures; the application presents network failures as offline and all other provider failures as unavailable.
- Requests contain only normalized coordinates and IANA time zone. The response mapper restores the selected location key from local request context and assigns a stable local source ID; profile, catalog, permission, and accuracy identity never enters the API contract.
- Local development defaults to the iOS/web loopback or Android emulator host alias and supports `EXPO_PUBLIC_KUYARA_WORKER_BASE_URL` for a reachable LAN origin. Non-development configuration requires an explicit HTTPS origin.
- The provider switch does not change SQLite schema or ownership, the exact 30-minute freshness boundary, cache-first rendering, refresh coalescing, manual refresh, stale display, or last-known-good behavior. Offline and unavailable refreshes preserve both the active location and last valid snapshot; a successful retry clears the failure.

## Implemented deterministic weather-to-clothing requirements

- A pure provider-independent domain function converts one validated `WeatherSnapshot` into immutable, stably ordered clothing-property requirements without selecting garments, layers, slots, accessories, or outfits.
- Current and remaining-hour measurements take precedence over past daily extremes. Weather dimensions remain independent, explicit conditions override weaker probability guidance, and requirements merge deterministically without clothing preference weakening protection.
- The boundaries are coarse, deterministic everyday-guidance heuristics covered by tests, not comfort ratings, garment temperature ratings, medical or occupational-safety rules, severe-weather alerts, or assurances of safety. Their exact values live in `apps/mobile/src/features/recommendation/domain/weather-to-clothing-requirements.ts` and `weather-to-clothing-requirements.test.mjs`.

## Implemented deterministic garment eligibility and scoring

- A pure mobile domain layer projects bundled catalog defaults and successfully resolved owned-item overrides into one canonical effective-property input. Catalog preference mismatch and unavailable catalog types fail explicitly; active owned items remain independent of current catalog preference, while deleted, legacy, invalid, and unmappable owned items are excluded. Retained deprecated definitions remain valid for already-owned garments.
- Thermal, breathability, arm coverage, and leg coverage are composition-aware. Applicable shortfalls and missing values retain their weather reason codes and weighted score contribution but do not reject one garment, even when mandatory; later outfit composition must verify their combined satisfaction.
- Individual-garment hard rejection is limited to mandatory body water or wind protection on outerwear candidates and mandatory feet water protection or traction on footwear. Optional failures never reject, and incompatible requirement/category combinations are `not_applicable` and excluded from scoring. Accessories are unsupported in this slice and cannot satisfy protection requirements.
- Scoring is bounded and deterministic, over-protection is penalized, and language-independent reason codes and equal-score ties are stably ordered. Scores compare only candidates for the same composition role or compatible category, not global quality across categories. The exact weights, caps, and penalties live in `apps/mobile/src/features/recommendation/domain/garment-eligibility.ts` and `garment-eligibility.test.mjs`.

## Implemented deterministic one-outfit composition

- A pure mobile domain function now composes already evaluated eligible catalog and Wardrobe candidates into exactly one immutable outfit or a structured failure. A complete outfit uses either primary top plus bottom or one `one_piece`, always includes footwear, and may add at most one supported mid layer and one supported outer layer. Runtime slot and layer-role assignments never mutate garment or Wardrobe data, and one candidate key cannot fill multiple slots.
- Thermal contribution is summed across body garments while footwear warmth remains separate evidence. Body breathability normally uses the least-breathable assigned body garment; arm and leg coverage use the strongest applicable collective coverage. Mandatory body water and wind are authoritative only from the assigned outer layer's existing eligibility evaluation, while mandatory feet water and traction are authoritative only from footwear.
- A mandatory waterproof or wind-resistant outer layer may resolve, but never erase, a breathability conflict: when the body core and optional mid layer meet mandatory breathability, the outfit remains valid with a `breathability_protection_tradeoff` evaluation, the outer shortfall remains explicit, and a deterministic penalty applies. A non-breathable core still fails, and water or wind protection is never weakened to avoid the conflict.
- Outfit scores use aggregate requirement satisfaction and bounded thermal, unnecessary-water, and protection-versus-breathability penalties. Garment scores are used only inside compatible slot groups. Equal outcomes prefer fewer optional layers and then stable slot-local and composition-key ordering; catalog and owned candidates receive no source bonus.
- Failures retain stable codes, missing slots, unmet mandatory requirements with weather reasons, best observed evidence, and considered candidate keys. Accessories, fashion/color/occasion logic, comfort personalization, three-outfit diversity, UI integration, persistence, providers, AI, and Apple-dependent behavior remain outside this slice.

## Approved product model and API budget

Approved 2026-08-13. Not implemented.

- kuyara remains free, ad-free, subscription-free, and without in-app purchase.
- The maintainer may personally fund a small, controlled API budget. Paid API usage must have explicit hard or safely derived limits.
- Automatic top-up and uncontrolled pay-as-you-go overage are not allowed.
- The recurring API-cost target and the OpenRouter credit assumption are recorded, with their date, under [Dated operating assumptions](#dated-operating-assumptions).
- Prices, quotas, licences, and provider conditions are time-sensitive. Reverify them against official sources before implementation rather than trusting any figure recorded here.

## Approved weather provider strategy

Approved 2026-08-13. Implemented 2026-08-29 as milestone 5. Design, the pricing basis, and full rationale are canonical in [ADR 0002](adr/0002-real-weather-provider-chain.md); the decisions below stay recorded here and are not superseded.

- The chain is Open-Meteo primary, OpenWeather fallback, then the last valid device-local weather snapshot. OpenWeather is absent from the chain until the `OPENWEATHER_API_KEY` Worker secret is set, so Open-Meteo currently serves alone.
- Once WeatherKit becomes available the chain becomes WeatherKit primary, Open-Meteo fallback, OpenWeather fallback, then the last valid device-local weather snapshot. WeatherKit is inserted at the head of the established chain rather than replacing it.
- The existing provider-neutral Worker and mobile boundaries are preserved. Each upstream provider has an isolated adapter with raw-response runtime validation, explicit unit and condition mapping, timeout handling, and sanitized errors.
- Provider payloads and secrets do not cross into mobile and are not logged.
- Weather fallback eligibility is governed by the [repository rule in `AGENTS.md`](../AGENTS.md#weather-and-recommendation-behavior).
- Attempts per request are bounded, and retry or fallback loops are prevented.
- The exact 30-minute freshness behavior and last-known-good semantics already implemented on mobile did not change.
- Open-Meteo attribution requirements are supported, and WeatherKit attribution requirements must be supported when WeatherKit is introduced. The earlier "provider names never cross the API" rule is narrowed only as much as a controlled, non-secret attribution identifier or attribution metadata requires; raw provider data and internal errors remain private.
- OpenWeather usage is bounded by provider-side limits plus Kuyara-side protection. Exact limits were recalculated from official current pricing on 2026-08-29; see [ADR 0002's pricing and limits basis](adr/0002-real-weather-provider-chain.md#pricing-and-limits-basis-recalculated-2026-08-29-do-not-freeze) rather than restating the numbers here.
- Open-Meteo's free tier is non-commercial use only. Kuyara's free, ad-free, no-subscription, no-in-app-purchase, open-source nature is recorded as a deliberate reading that fits the terms' non-commercial examples, not a certification; re-check if the product ever monetizes.
- Before the `OPENWEATHER_API_KEY` secret is ever set, the OpenWeather account's Billing plans "Calls per day" must be lowered to 1,000 or less. The 2,000 default permits billed overage, which the repository rule against uncontrolled pay-as-you-go usage does not allow.

## Approved AI recommendation strategy

Approved 2026-08-13. Partly implemented. The shared AI contract and the Worker AI route use ordered Workers AI and OpenRouter adapters. The deterministic in-Worker stub is a test double only and is absent from production composition.

- AI must generate exactly three complete outfit combinations. These combinations are AI-generated, not deterministic.
- AI is constrained by the deterministic weather requirements and a closed set of allowed candidate garments, and may select only candidate identifiers supplied in the request.
- AI must not invent catalog entries, wardrobe items, slots, properties, or candidate identifiers.
- Every AI response must pass shared Zod validation and existing or new deterministic domain invariants before it can be displayed or persisted. Invalid or partially invalid output is never silently repaired into a different outfit.
- AI failure must not prevent the user from receiving recommendations. The final fallback is a device-local deterministic three-outfit generator built from the existing validated composition evidence.
- The deterministic three-outfit fallback is therefore a prerequisite for safely shipping AI, even though AI integration is the current product priority.
- The approved AI provider chain is a Cloudflare Workers AI binding first, then OpenRouter, then device-local deterministic three-outfit generation. This order was revised on 2026-08-19; it was originally OpenRouter primary with Workers AI as the fallback. The change is a user decision taken on the evidence in [Free-model evaluation, 2026-08-19](#free-model-evaluation-2026-08-19): no evaluated free OpenRouter model returned contract-valid output, while the Workers AI binding did, so the original order made every request exhaust failing attempts before reaching a working provider. OpenRouter stays in the chain, behind Workers AI, so a future re-evaluation can promote it again through configuration.
- AI output is structured data, not user-visible prose. It may return only allowed candidate identifiers plus a small closed vocabulary of approved intent or reason codes if the design needs them. All user-visible Turkish and English copy continues to come from application localization keys.
- Provider names, internal errors, prompts, model reasoning, and secret or configuration details must not be exposed in the mobile contract.

### Approved OpenRouter constraints

- Use only free models or a free-model routing configuration, and never silently fall back to a paid OpenRouter model.
- Do not enable automatic credit top-up.
- Keep the API key only as a Worker secret, and apply an API-key spending limit as an additional guardrail.
- Model choice is configuration-driven and replaceable.
- Prefer a specifically evaluated structured-output-capable free model, or a controlled ordered free-model set, over uncontrolled random model selection.

### Approved Workers AI constraints

- Integrate through a Cloudflare Workers AI binding rather than exposing Cloudflare credentials to mobile.
- Select an explicitly evaluated structured-output-capable model.
- Treat the free neuron allocation as a quota, not a guaranteed number of requests.
- Exceeding quota, capacity failure, invalid structured output, or provider failure must proceed to the deterministic fallback without breaking the product.

## Implemented real AI provider adapters

Implemented 2026-08-19 as Goal 2b, within the approved constraints above and the chain order recorded there as revised the same day. Both adapters sit behind the Goal 2a seam; no contract, handler, router, or endpoint changed. Configuration is `OPENROUTER_MODELS` and `WORKERS_AI_MODEL` in `wrangler.jsonc`, with `OPENROUTER_API_KEY` supplied as a gitignored local `.dev.vars` value. Nothing was deployed and no secret was set on the remote Worker. Milestone 4 added the Worker-side rate limiting that this waited on (see below); a deploy of the AI route and probe to the public `workers.dev` URL is still a separate operational step and remains gated by the pending Apple-independent deployment decision.

The deterministic stub was removed from production composition, since `AGENTS.md` forbids the deterministic sample provider from acting as a production fallback. `docs/current-status.md` had described 2b as appending the real adapters to the existing list, which would have left the stub answering every request; the real adapters now form the whole production list and the stub is a test double only.

### Free-model evaluation, 2026-08-19

The approved constraint is to prefer a specifically evaluated structured-output-capable free model or a controlled ordered free-model set over uncontrolled random model selection. Accordingly `openrouter/free` was rejected — it selects randomly — and all seven free OpenRouter models that advertise `structured_outputs` in the models API were evaluated directly against the real contract payload with `max_tokens: 2048`.

| Model | Result |
| --- | --- |
| `openai/gpt-oss-20b:free` | 429 once; then 200 after 95 s, ignoring the schema (bare array keyed by slot) |
| `z-ai/glm-5.2:free` | 429 on both attempts, upstream shared-pool rate limit |
| `google/gemma-4-26b-a4b-it:free` | 200 after 22.7 s, each outfit wrapped in `{ items: [...] }` |
| `nvidia/nemotron-nano-9b-v2:free` | 200 after 44.2 s, truncated |
| `nvidia/nemotron-3-super-120b-a12b:free` | 200 after 18.4 s, malformed JSON and truncated |
| `dots-studio/dots-3-note-preview:free` | 200 after 17.8 s, truncated |
| `liquid/lfm-2.5-2.6b:free` | 200 after 9.3 s, truncated |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Workers AI) | 200 in about 8 s, contract-valid three outfits |

None of the seven free OpenRouter models returned contract-valid output. Advertising `structured_outputs` in the models API did not mean the free-pool provider actually enforced the schema, and `strict: true` with `require_parameters: true` did not change that. The Cloudflare Workers AI fallback is currently the only provider that produces a valid recommendation.

The configured OpenRouter set is `openai/gpt-oss-20b:free`, `z-ai/glm-5.2:free`, `google/gemma-4-26b-a4b-it:free`, kept in configuration so it can be re-evaluated without a code change. **Resolved on 2026-08-19:** the user reordered the chain to put Workers AI first. A request that the Workers AI hop satisfies now returns in 8.6 to 17.0 seconds instead of spending about 29 seconds failing through OpenRouter first, and OpenRouter is reached only when the Workers AI hop fails or its daily Neuron allocation is exhausted. The reorder also required raising the per-attempt timeout to 20 seconds, because the Workers AI hop sits close enough to the previous 10-second default to be aborted at the boundary. Trimming the OpenRouter set and revisiting the free-only constraint remain open and are not blocking.

### Spend and quota posture as implemented

- The Cloudflare account is on the Workers Free plan, where the 10,000 Neuron daily allocation is a hard stop rather than billable overage. This satisfies the no-uncontrolled-overage rule with no code-side spend control.
- OpenRouter usage is free-model only. The hard cap remains the per-key credit limit configured in the OpenRouter dashboard, with automatic top-up left off.
- Free OpenRouter models require the account setting that permits providers which may train on submitted data. This is acceptable only because the Goal 2a request schema is strict and admits nothing but opaque candidate keys, closed enum properties, and deterministic requirements — no photos, paths, free-form names, identifiers, or coordinates have any representation in it.

## Implemented generation-mode surface, active AI probe, and Worker rate limiting

Implemented 2026-08-29 as milestone 4. Design and rationale, including the
recalculated provider pricing that set the probe limits, are canonical in
[ADR 0001](adr/0001-worker-ai-probe-and-rate-limiting.md).

- **Generation-mode surface.** Today shows a text-labelled `Pill` next to the
  recommendation heading ("AI-assisted" / "Standard recommendation"), and
  Settings shows the same as a read-only line. The value is the coarse
  `generationMode` already recorded on the snapshot; no domain or model change.
  State is never communicated by colour alone.
- **Active AI probe.** `POST /v1/ai/probe` is a distinct endpoint from Worker
  liveness and AI configuration readiness. It runs only the first provider in
  the chain, one attempt, a 20-second timeout, against a fixed minimal
  in-Worker request; it returns only `{ status: 'ok' | 'unavailable', checkedAt }`
  with no provider name, model identity, or error text. Results are cached in
  the isolate for 60 seconds. Settings has an explicit "Check AI status" action
  with an inline loading animation that respects Reduced Motion; the copy never
  states or implies that a later recommendation will succeed.
- **Rate limiting.** Both `POST /v1/ai/recommend` and `POST /v1/ai/probe` apply
  a per-IP burst limit through the native Cloudflare rate-limit binding
  (`cf-connecting-ip`, 10/60s and 3/60s). The probe additionally enforces a
  per-day global cap of 30 through a KV counter keyed `probe:YYYY-MM-DD`, so a
  determined caller cannot drain the daily Neuron allocation. When a binding is
  absent (local `wrangler dev`, unit tests) the check degrades to permissive.
  Exceeding a limit returns `429` with the `rate_limited` error code and
  `Retry-After: 60`.
- **Spend posture is unchanged.** OpenRouter models remain `:free`, so there is
  no billing risk; the risk the limits address is quota exhaustion and abuse of
  an unauthenticated endpoint. Cloudflare Workers AI stays a hard stop on the
  Free plan.
- **Deploy checklist (not done here).** `kv_namespaces`, `ratelimits`, `vars`,
  and `ai` are all declared at the top level of `wrangler.jsonc`, which is the
  Worker's only environment as of
  [ADR 0003](adr/0003-single-worker-environment.md). The named
  `env.development` was removed precisely because Cloudflare does not inherit
  top-level bindings into named environments. Deploying the AI route and probe
  is therefore a plain `wrangler deploy` with no `--env`, targeting
  `kuyara-worker`. **Done on 2026-08-29:** the `PROBE_COUNTER` KV namespace was
  created and its real id substituted for the placeholder, `OPENROUTER_API_KEY`
  and `OPENWEATHER_API_KEY` were set as secrets on `kuyara-worker`, and the
  Worker was deployed with every binding attached.

## Approved AI input privacy boundary

Approved 2026-08-13. Enforced in the shared contract as of 2026-08-14: the request schema is strict and admits only the fields listed below, so the forbidden fields have no representation and are rejected rather than filtered.

AI may receive only the minimum sanitized structured data required to compose outfits:

- an opaque candidate key,
- the catalog garment type,
- structural category and supported role or property evidence,
- canonical color family when available,
- source kind such as catalog or owned,
- the deterministic weather and clothing requirements,
- clothing preference where catalog applicability requires it.

AI must not receive wardrobe photos, photo paths or URIs, user-entered free-form wardrobe names, `localProfileId`, profile or device identifiers, exact coordinates, raw location payloads, secrets, complete internal database records, or unrelated personal data.

## Approved recommendation caching, refresh, and status behavior

Approved 2026-08-13. Implemented for milestone 3. Mobile persists one recommendation snapshot per local profile, coalesces duplicate in-flight refreshes, refreshes only for the approved triggers, preserves the last valid result on failure, and wires the device-local deterministic fallback. The generation-mode status surface and active AI probe were implemented in milestone 4 on 2026-08-29; see [Implemented generation-mode surface, active AI probe, and Worker rate limiting](#implemented-generation-mode-surface-active-ai-probe-and-worker-rate-limiting).

- The last valid recommendation snapshot must be persisted on-device and rendered immediately when available.
- AI must not be called on every application launch. A recommendation must be generated or refreshed only when the relevant weather snapshot is refreshed after becoming stale, the active location changes, clothing preference changes, relevant wardrobe contents or properties change, or the user explicitly requests a refresh.
- Duplicate in-flight generation requests must be coalesced, and a failed refresh must preserve the last valid recommendation.
- A successful deterministic fallback is a valid recommendation result and may replace an unavailable AI attempt according to the future implementation design.
- Transient provider or model identity must stay out of the durable domain model unless it is needed for coarse provenance or user status.
- The Worker must provide a non-AI liveness check. Worker liveness, AI configuration readiness, and an active AI provider probe are distinct. The active probe may consume provider quota, so it must be explicitly triggered, bounded, rate-limited, and briefly cached; a successful probe does not guarantee that a later full recommendation request will succeed. Implemented in milestone 4 as `POST /v1/ai/probe`.
- The recommendation result must record a coarse generation mode: AI-assisted or deterministic fallback.
- Today shows a small accessible localized "AI-assisted" or "Standard recommendation" indicator, and Settings includes an accessible localized "Check AI status" action with a manual active probe (both landed in milestone 4). Provider names and technical failures are not exposed to normal users.

## Dated operating assumptions

Recorded 2026-08-13. These are time-sensitive operating assumptions, not permanent architectural guarantees. Reverify each against official sources before implementation.

- The initial recurring API-cost target is approximately USD 5 per month, excluding the one-time OpenRouter credit purchase below.
- A one-time USD 10 OpenRouter credit purchase is the currently approved assumption for qualifying for OpenRouter's higher free-model request limit.
- OpenWeather's free-tier and paid limits were recalculated from official current pricing on 2026-08-29; see [ADR 0002's pricing and limits basis](adr/0002-real-weather-provider-chain.md#pricing-and-limits-basis-recalculated-2026-08-29-do-not-freeze) rather than this dated note.
- Provider pricing, quotas, licences, model availability, and terms may change at any time.

## Approved visual identity

Approved 2026-07-29.

- The canonical approved brand and visual constraints are recorded in [`docs/design/visual-identity.md`](design/visual-identity.md). That document is the source of truth for UI, UX, themes, icons, illustrations, motion, splash screens, and other branding work.
- The approved app symbol is Balanced Horizon — V2: Unified Gap System. Its repository master is `apps/mobile/assets/brand/kuyara-symbol-master.svg`, and its locked geometry must not be silently altered.

## Future possibilities, not MVP commitments

- A remote sync adapter may later be implemented with either Supabase or Firebase, but not both in production.
- Accounts, cross-device sync, an outbox, and conflict resolution require separate product and architecture decisions.
