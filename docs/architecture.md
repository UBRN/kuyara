# kuyara architecture

## Current workspace

The stack and workspace layout are documented in the [`README.md` Stack section](../README.md#stack).

## Mobile boundaries

The mobile app uses Expo Router and managed Continuous Native Generation, so native projects are generated from Expo configuration rather than stored in the repository. The app config pins the Expo SDK 57 minimum of iOS 16.4 without introducing an iOS-only shared-code assumption.

As product features are added, mobile code is organized feature-first while preserving presentation, domain/application, and data boundaries. React components render state and emit user intent; use cases coordinate behavior; repositories isolate SQLite and external data. Domain models, local records, and API DTOs remain distinct and use explicit mappers.

Expo SQLite owns the implemented local profile, its preferences, and profile-owned wardrobe items. Hooks or narrow contexts own transient UI state.

Remote weather request state is a deliberate deviation from the `AGENTS.md` state-ownership rule that assigns remote request state to TanStack Query. A purpose-built application controller owns it instead, because it already provides exactly what the weather rules require — per-location coalescing of duplicate in-flight requests, preservation of the last valid snapshot across a failed refresh, and the exact 30-minute freshness boundary — each covered by tests. Adding TanStack Query now would introduce a dependency without adding behavior, and running both would create the competing sources of truth those same rules forbid. TanStack Query remains the intended owner for future remote state this controller does not already cover; what must hold either way is exactly one owner per piece of state.

The local-profile vertical slice follows this concrete dependency flow:

```text
Expo SQLite database open + ordered migrations
        ↓
project-owned SQLite executor boundary
        ↓
SQLite profile local data source and persistence record
        ↓
local profile repository and domain profile
        ↓
profile application controller/provider
        ↓
onboarding gate, Settings, localization/theme preferences, Today navigation
```

Only the infrastructure adapter imports `expo-sqlite`. The data source owns SQL and row mapping; the repository validates and maps persistence records into domain values; the application controller owns loading, failure, saving, and refreshed profile state. Routes and presentation components depend on that application contract and do not know table names, columns, or SQL.

### Database migrations

`PRAGMA user_version` records the schema version. Bootstrap enables foreign keys and WAL, reads the current version, and applies each pending migration in ascending order through an exclusive transaction. A migration updates `user_version` inside the same transaction and only after its schema work succeeds. Completed migrations are safe to call again; a newer unsupported version or failed migration surfaces a bootstrap error without deleting or recreating the database.

Version 1 creates only `local_profiles`. `singleton_key` is constrained to the sole value `1` and is the primary key, while `id` is a unique generated UUID. Stable, locale-independent checks constrain clothing (`womens`, `mens`, or null before onboarding), language (`system`, `tr`, `en`), theme (`system`, `light`, `dark`), and the integer onboarding flag. Lifecycle timestamps use UTC ISO-8601 text. `deleted_at` is nullable to preserve the settled local-data record shape, but profile deletion and soft-delete workflows are intentionally not implemented.

Version 2 leaves version 1 unchanged and adds `wardrobe_items`. Its UUID primary key is associated with `local_profiles.id` through a restrictive foreign key. Nullable `name`, `color`, `photo_relative_path`, and `deleted_at` columns are distinct from the required stable category and UTC ISO-8601 lifecycle timestamps. A database check restricts category storage to `top`, `bottom`, `one_piece`, `outerwear`, `footwear`, or `accessory`.

One composite index over `(local_profile_id, deleted_at, updated_at DESC)` supports the profile-scoped active and explicitly deleted access patterns without speculative indexes. The table and index use idempotent creation inside the migration transaction. Version 2 advances `user_version` only after both succeed; failure rolls back the new schema while preserving version 1 profile data and its schema version.

Version 3 leaves versions 1 and 2 unchanged and adds nine nullable columns to `wardrobe_items`: `garment_type_id`, `color_family`, and explicit thermal, water, wind, breathability, arm-coverage, leg-coverage, and traction overrides. SQL checks constrain each non-null enum value, while `garment_type_id` intentionally has no SQL list or foreign key because the canonical catalog is bundled TypeScript data. Existing rows retain their identity, owner, category, display values, photo path, lifecycle timestamps, and deletion state with every new column null; no type or property is inferred during migration.

Version 4 leaves the earlier schema unchanged and adds one profile-owned active location, location-bound weather snapshots, and their current-local-day hourly entries. Coordinates are rounded to the nearest `0.01°` and represented as integer hundredths before they cross the location adapter. That is roughly 1.1 km north-to-south and less east-to-west at kuyara's sample latitudes: useful for local weather while avoiding unnecessary device precision. The normalized pair also forms device-location cache identity and can be converted back to decimal degrees by a future Worker request mapper. Manual selections store a stable catalog ID; device selections store only normalized coordinates, time zone, and approximate/full accuracy. Raw coordinates, permission diagnostics, and provider payloads are not persisted or logged. Snapshot replacement and hourly replacement are atomic, and retention is bounded to the active location plus the newest previous location.

Version 5 leaves the earlier schema unchanged and adds `recommendation_snapshots`, with one row per `local_profile_id`. Each row stores a UUID `id`, the owning profile, `weather_snapshot_id`, `location_key`, an `ai-assisted` or `deterministic-fallback` generation mode, validated context and outfit JSON, and UTC ISO-8601 creation and update timestamps. A restrictive foreign key associates the unique `local_profile_id` with `local_profiles.id`. The current schema version is 5.

Future migrations must add one ordered migration object immediately after the current version. Do not edit released migrations, skip a version, or add a destructive fallback.

### Wardrobe application and persistence boundary

The wardrobe slice follows the established executor boundary and now adds a narrow feature-local application controller for its list and forms:

```text
Wardrobe routes and localized presentation
        ↓
feature-local controller/provider and explicit form mapper
        ↓
wardrobe domain model and input invariants
        ↓
local wardrobe repository and sanitized error model
        ↓
explicit domain/category ↔ persistence record mapper
        ↓
SQLite wardrobe local data source with profile-scoped bound SQL
        ↓
project-owned SQLite executor
```

The domain item and SQLite record are separate types. The mapper explicitly converts the stable category representation and rejects invalid stored enums, timestamps, nullable values, or non-canonical photo paths. The repository owns client UUID and clock dependencies, input normalization, profile isolation checks, patch-style domain updates, and stable `invalid-input | invalid-data | not-found | unavailable` errors. SQLite and its raw errors do not cross this boundary.

The local data source owns fixed-column parameterized create and update statements. Updates preserve the UUID, `local_profile_id`, and `created_at`; successful writes refresh `updated_at`. Soft delete atomically sets `deleted_at` and `updated_at`, after which normal get/list/update operations ignore the row. A separate explicit read can include deleted items for tests or a future recovery workflow.

The controller owns initial loading, stable active-list refresh, retry state, and one in-flight mutation. It injects the ready local profile ID into repository calls, refreshes the list after successful writes, coalesces rapid duplicate save intents, and rejects malformed route UUIDs before repository access. Presentation never receives SQLite records or SQL.

The form model contains only the editable optional name, required catalog type, color family, and seven nullable overrides. Its pure mapper derives applicable overrides from non-null catalog defaults, clears unsupported values, and deliberately omits UUID, owner, lifecycle, deletion, legacy `color`, and photo fields. Patch-style updates therefore preserve hidden fields. A confirmed type change resets explicit overrides and lets the effective-garment resolver use the new catalog defaults.

Photo persistence is deliberately path-only. The domain and record store a normalized forward-slash relative path into app-private document storage, never a blob, base64 value, absolute path, or `file://` URI. A feature-local photo manager coordinates three injected adapters: the system library picker, the contextual image processor, and private storage. Selection requests one image without base64 or EXIF; processing preserves aspect ratio, limits the long edge to 1600 pixels without upscaling, and writes JPEG at 0.8 quality. Managed staging files live in private cache storage and UUID-named canonical files live below `kuyara/wardrobe/photos` in the private document root.

Create and replace operations copy a staged photo to a new canonical path before the SQLite write. A failed write removes the new canonical file while retaining staging for retry; a successful write clears staging and only then cleans up the prior managed file. Removing a photo follows the same database-first rule. Cleanup failure never reverses a confirmed database write, unmanaged paths are never deleted, and soft deletion clears the stored path and removes the managed private file after the database write is confirmed while retaining the tombstone row for future cross-device deletion. Presentation receives only renderable URIs through the application boundary; it does not import picker, image-manipulation, or file-system APIs. Photos remain local and are never sent to the Worker, AI providers, analytics, or another network service.

The six categories continue to express only structural outfit roles. A versioned, immutable mobile catalog supplies canonical garment types and validated coarse defaults without copying those definitions into SQLite. Wardrobe rows store the selected type reference, an optional canonical color family, and only explicit user overrides. Weather, fabric, formality, selected runtime layer role, brand, purchase, AI, and provider metadata remain outside the item schema. A future remote sync adapter will map separate remote records and complement rather than replace SQLite.

The research-backed taxonomy and version 3 contract are specified in [`clothing-taxonomy.md`](clothing-taxonomy.md). Mobile-only values and Zod schemas live in the catalog domain because no Worker API contract uses them yet. The catalog validator enforces ID, category, coverage, localization, applicability, and deprecation invariants before exporting deeply frozen definitions.

The effective-garment read model is derived at runtime:

```text
validated canonical type defaults ─┐
                                   ├─ pure effective resolver
validated Wardrobe item overrides ─┘
```

The resolver has no SQLite, localization, weather-provider, UI, or outfit-composition dependency. It returns an explicit legacy view for unclassified version 2 rows, a resolved view for valid typed rows, or a sanitized invalid-data outcome for missing types, category mismatches, and inapplicable overrides. Catalog applicability filters future catalog suggestions only and is never consulted when reading or resolving an owned item.

### Foreground location and local weather boundary

The Weather tab now follows a feature-local dependency flow:

```text
localized Weather presentation
        ↓
weather application controller/provider
        ↓
weather repository and validated domain snapshots
        ↓                         ↓
SQLite weather data source        provider interface
                                  ↓
                         Worker HTTP provider adapter
                                  ↓
                    shared weather v1 Zod contracts
                                  ↓
                    local Worker sample provider
```

The controller owns bootstrap, location-selection intent, permission rationale, foreground-only device lookup, fresh/stale evaluation, refresh coalescing, location-switch races, and foreground revalidation. It reads permission state during bootstrap without prompting. The native foreground permission request occurs only after the user selects device location and confirms the localized rationale; permanently denied access offers the platform Settings action. Manual selection remains available without permission.

The `expo-location` adapter is the only feature code that imports the native location module. Raw platform positions stay inside that adapter and are reduced to normalized coordinates plus approximate/full accuracy before returning. Shared domain, repository, controller, and presentation code remains platform-neutral. iOS requests only When In Use authorization and defaults to reduced accuracy. Android declares coarse location while explicitly excluding fine, background, activity, and location foreground-service permissions for this scope.

SQLite is the durable source of truth for the active selection and the last valid snapshots. A cache is fresh through exactly 30 minutes, stale after that boundary, and still rendered while a background or manual refresh runs. Failed refreshes never erase the prior valid snapshot. A refresh result is published only if it still belongs to the selected location; the repository validates time zone, source/location identity, measurements, ordering, and same-local-day hourly membership before persistence.

The development composition uses the network-backed Worker provider adapter. It sends only normalized coordinates and the selected IANA time zone to `POST /v1/weather`, validates success and stable error bodies with the shared Zod contracts, then maps valid data into the existing provider snapshot. The mapper restores the device-local location key from the request context; profile identity, catalog identity, permission state, and accuracy remain outside the API. The existing deterministic in-process provider remains available to focused tests but is no longer the application composition.

The Worker origin resolves from `EXPO_PUBLIC_KUYARA_WORKER_BASE_URL` when set. Development otherwise defaults to `http://127.0.0.1:8788` for the iOS Simulator and web, or `http://10.0.2.2:8788` for the Android emulator. Physical devices use an explicit reachable LAN origin. Non-development composition requires an explicit HTTPS origin. This configuration changes only the remote provider boundary: SQLite remains the source of truth, and exact 30-minute freshness, cache-first rendering, request deduplication, manual refresh, last-known-good preservation, and failure presentation remain owned by the existing controller and repository.

The mobile provider boundary classifies failures without depending on the Worker adapter: transport rejection is `network`, a validated non-success response is `service`, and malformed success or error data is `invalid-response`. The application maps only `network` to an offline outcome; every other provider or persistence failure becomes unavailable. A cached snapshot and its active location remain visible for either outcome, and only a successfully validated and persisted retry clears the failure. Local repository failures during bootstrap still use the existing screen-level load error rather than appearing as network failures.

### Local profile lifecycle

The data source performs get-or-create in an exclusive transaction. It reads the singleton first, then uses `INSERT OR IGNORE` with a newly generated Expo Crypto UUID v4 and reads the winning row. The in-memory initialization promise coalesces repeated React/Strict Mode calls, while the schema constraint protects across data-source instances. The UUID is never regenerated once a row exists and is never shown or logged.

An incomplete profile has null clothing preference, system language, system appearance, and `onboarding_completed = 0`. Onboarding completion updates all three preferences, completion state, and `updated_at` in one transaction. Settings uses one explicit transactional update per selected preference. Application state changes only after SQLite succeeds; failures restore the previous domain profile and presentation shows localized, non-technical feedback.

The persisted record, domain profile, and UI state are deliberately distinct. The record retains integer booleans, storage column values, and `deleted_at`; the domain exposes strict preference unions, a boolean completion value, and no deletion field; presentation receives only the controller’s domain state and actions.

### Bootstrap and routing

The profile application provider opens the database, migrates it, constructs the local data source and repository, and loads or creates the profile. While this is pending, a calm localized bootstrap state is rendered instead of Today. Initialization failure renders a stable localized error and never falls through to product routes.

After readiness, the root Expo Router Stack keeps `/onboarding` separate from the main application. The `(tabs)` route-group layout applies the local gate before mounting product navigation: incomplete profiles redirect to `/onboarding`, completed profiles resolve to `/`, and completed profiles cannot normally return to onboarding. Deep links to `/weather`, `/wardrobe`, or `/settings` therefore pass through the same gate.

The main application uses Expo Router's stable JavaScript Tabs with four finalized destinations: Today at `/`, Weather at `/weather`, Wardrobe at `/wardrobe`, and Settings at `/settings`. Route-group names remain absent from visible paths. Today is the explicit initial route, and each tab has one nested Stack boundary. Wardrobe owns `/wardrobe/new` and `/wardrobe/[id]` inside its existing Stack. SDK 57 Native Tabs are alpha and are intentionally not used; adopting them later is a separate migration decision.

The localized tab-bar presentation is separate from route composition. Expo Router owns route state and tab events, while the bar renders semantic-theme colors, platform-specific `expo-symbols` names, visible labels, 44-point minimum targets, localized tab roles and names, and selected accessibility state. Weather and Wardrobe route files are thin adapters over feature presentation and application boundaries. Wardrobe's dirty-form guard uses the navigator's `beforeRemove` event so header back, iOS gestures, and Android system back share the same localized discard confirmation.

The localization provider resolves a saved `system | tr | en` preference through the established device-locale fallback. The existing theme provider receives the saved `system | light | dark` preference. Neither architecture is duplicated, and both providers update when the controller publishes a successfully persisted profile.

Today lives under `apps/mobile/src/features/today/`. Its screen model defines loaded, loading, and unavailable presentation states; a loaded snapshot carries the real `WeatherSnapshot`, the active location, its freshness, and the recommendation result, and holds no duplicated copy of the snapshot's own fields. A pure presentation mapper localizes the language-independent codes into English or Turkish before feature-specific React components render them with the shared primitives.

The route composes existing application state and owns no data access:

```text
weather snapshot + wardrobe items + clothing preference
        ↓
recommendOutfits use case  (features/recommendation/application)
        ↓
deriveClothingRequirements → garment eligibility → composeOutfits
        ↓
Today screen model
        ↓
locale-aware presentation mapper
        ↓
Today screen compositions
        ↓
semantic tokens and adaptive UI primitives
```

`recommendOutfits` is a pure function: it reads no clock, performs no I/O, and returns the same result for the same input regardless of candidate order. Recomputation is memoized on weather snapshot identity, Wardrobe contents, and clothing preference, so a recommendation is produced only on a relevant change. Today reads the persisted recommendation snapshot through `RecommendationApplicationProvider`; the result is tagged `ai-assisted` when the Worker AI call succeeds and `deterministic-fallback` otherwise. No repository, provider DTO, runtime schema, persistence layer, network client, or global state container is introduced by Today itself; it consumes application providers mounted at the root.

## Worker and contract boundaries

The [temporary Apple constraint](../AGENTS.md#temporary-project-constraint) is canonical in `AGENTS.md`. The checked-in composition now serves real weather through Open-Meteo; the deterministic sample provider is a development and test source only and is never a production fallback.

The Worker is the server-side boundary for weather and AI provider calls, credential protection, validation, and operational limits. It now exposes the first versioned mobile API boundary at `POST /v1/weather`. The route accepts only normalized integer hundredth-degree coordinates and an IANA time zone; it does not accept a profile ID, location key, permission state, accuracy label, or raw native location payload.

`packages/contracts` owns the strict Zod request, success, and stable error schemas plus their inferred TypeScript types. The success contract uses the same settled weather condition vocabulary and validates timestamps, measurement ranges, minimum/current/maximum relationships, and ordered same-local-day hourly entries. Its provenance is `sample | live`. Raw provider payloads, credentials, and internal error detail must never cross it. The one controlled addition is `origin.sourceId` (`sample | open-meteo | openweather`), a non-secret attribution identifier the mobile app maps to localized attribution text; see [Weather provider chain](#weather-provider-chain) below.

The Worker route validates the request before invoking an injected provider. The provider returns a provider-neutral internal snapshot, and an explicit mapper validates and converts that model into the shared success DTO. Provider failures and invalid provider values become the same minimal `weather_unavailable` response; invalid requests, unknown routes, wrong methods, and unexpected failures have their own stable codes without localized messages, provider details, stacks, or configuration data.

The checked-in production composition is the real chain described below; the deterministic local mock with its injected clock and explicit `sample` provenance is now a test double only. The route sets `Cache-Control: no-store`, does not log coordinates or request bodies, and is rate limited (see below). Every real adapter, including the future WeatherKit one, implements the same provider interface and keeps signing, credentials, and raw provider data entirely inside the Worker.

## Approved target composition

The approved [weather provider strategy](product-decisions.md#approved-weather-provider-strategy) and [AI recommendation strategy](product-decisions.md#approved-ai-recommendation-strategy), including their rationale, are canonical in `product-decisions.md`. This section records only where those boundaries and fallbacks live and how they connect. The composition is implemented through Goals 2a, 2b, milestone 3, milestone 4 (the active AI probe and Worker rate limiting), and milestone 5 (the real weather provider chain); only production WeatherKit remains unimplemented.

### Weather provider chain

Implemented 2026-08-29 as milestone 5. Design, the pricing basis, and full rationale are canonical in [ADR 0002](adr/0002-real-weather-provider-chain.md); this section records only where the chain lives and how it connects. The chain lives entirely inside the Worker. Mobile keeps depending on the existing provider-neutral contract and gains no provider knowledge.

```text
Worker weather route
        ↓
ordered provider chain: Open-Meteo primary → OpenWeather fallback
        ↓                              ↓
   per-provider adapter          per-provider adapter
   raw-response validation, unit and condition mapping,
   timeout, provider-specific error classification
        ↓
existing provider-neutral internal snapshot
        ↓
existing explicit API mapper and shared success DTO
```

OpenWeather is absent from the chain entirely until the `OPENWEATHER_API_KEY` Worker secret is set, so Open-Meteo currently serves alone. WeatherKit will be inserted at the head of this same chain once Apple Developer Program membership is available (milestone 6, paused by the [temporary Apple constraint](../AGENTS.md#temporary-project-constraint)). The mobile weather domain, its repository, the exact 30-minute freshness boundary, and last-known-good behavior did not change when the chain changed.

The chain advances only for the eligible failure kinds classified in the Worker's weather provider error module, per the [repository fallback eligibility rule](../AGENTS.md#weather-and-recommendation-behavior), never because valid weather is undesirable or differs between providers. Attempts per request are bounded at 2, with a 4,000 ms per-attempt timeout, so a retry or fallback loop is structurally impossible. `POST /v1/weather` is separately rate limited at 20 requests/60s per IP, and OpenWeather calls carry an additional best-effort daily cap inside the Worker; see ADR 0002 for both and for the honest limits of that cap.

Attribution (`origin.sourceId`) is the one controlled addition to the shared contract, as described above.

### Target recommendation and AI flow

Deterministic rules bound the request, AI composes within those bounds, and validation gates the result twice.

```text
mobile: deterministic requirements + closed candidate set
        ↓  sanitized request: no photos, paths, identifiers, or coordinates
Worker AI route
        ↓
ordered AI chain: Workers AI binding → OpenRouter fallback
        ↓
Worker-side runtime validation and sanitized failure mapping
        ↓  structured response: allowed candidate identifiers + closed code vocabulary
mobile: shared contract validation, then deterministic domain invariants
        ↓
persisted recommendation snapshot and localized presentation
```

The request follows the canonical [AI input privacy boundary](product-decisions.md#approved-ai-input-privacy-boundary). The response carries structured data, never user-visible prose, so all Turkish and English copy stays in localization keys. A response failing either validation stage is rejected rather than repaired into a different outfit.

### Goal 2a design: AI contracts and Worker orchestration

Designed 2026-08-13, implemented 2026-08-14 as described below. Covers only the shared contracts and Worker side of the flow above; real provider credentials (2b), the mobile Worker client, and recommendation persistence (milestone 3) are separate Goals.

Two details were settled during implementation. The candidate upper bound is **125**, derived from a measured worst-case serialized candidate of 494 bytes against a provider-neutral 64 KiB request-payload budget and locked by a test; it is a transport and prompt-size bound, not a token count, and assumes no model. The structural outfit invariants below live in the shared zod schema rather than in Worker code, so mobile and the Worker enforce one implementation and the Worker adds only the closed-candidate-set membership check, which is the single rule that needs the request. The per-attempt timeout is injectable, defaulting to 10 seconds, so timeout behavior is testable without real waiting.

- **Contracts** (`packages/contracts/src/ai-v1.ts`, `POST /v1/ai/recommend`). Request carries `clothingPreference`, the `ClothingRequirement[]` discriminated union (mirrors the existing mobile domain type, including `water_protection`'s `target: 'body'|'feet'`), and a bounded `candidates` array of only the mobile-side `status === 'eligible'` garments (`EligibleGarmentResult`) — never the full ready/ineligible set. Each candidate carries contract-owned enums and nullable properties, matching `EffectiveGarmentCandidate`/`EffectiveGarmentProperties` shape without importing mobile types. The candidate-array upper bound was measured during implementation and is recorded above. Response success is exactly 3 outfits, each an ordered list of `{slot, layerRole, candidateKey}` using contract-owned slot/layer-role enums; mobile maps these to its own `OutfitSlot`/`LayerRole` types through an explicit, tested mapper in both directions. Response error reuses the weather-v1 error shape with codes `invalid_request | not_found | method_not_allowed | ai_unavailable | internal_error | rate_limited` (`rate_limited` added in milestone 4).
- **Worker orchestration** (`apps/worker/src/ai/`). `createAiHandler({ providers })` mirrors `createWeatherHandler`'s dependency-injection shape, but takes an ordered provider list instead of one provider so Goal 2b can append real adapters without changing the handler. Goal 2a's list has one entry: a deterministic in-Worker stub whose test scenarios (success, invalid output, timeout, provider failure) are selected by injecting different stub instances, never by a request field. Each attempt is bounded by a per-attempt timeout (the existing 10-second `AbortController` pattern); exhausting the provider list collapses to one sanitized `ai_unavailable`.
- **Worker-side validation is structural and closed-set only**, not a re-implementation of `composeOutfits`'s scoring/tradeoff logic: response shape (zod), every `candidateKey` drawn from the request's closed candidate set, no duplicate `candidateKey` within one outfit, and slot completeness (`primary_top`+`bottom` XOR `one_piece`, exactly one `footwear`, at most one each of `mid_layer`/`outer_layer`). Any violation collapses to `ai_unavailable`; the specific rule that failed is never exposed to the client. Full mandatory-requirement satisfaction checking stays where `composeOutfits`/`evaluateGarmentEligibility` already live, in mobile.
- **Endpoints in scope for 2a**: `GET /v1/health` (generic Worker liveness) and `GET /v1/ai/ready` (configuration readiness, calls no provider). The active AI provider probe from [Health, readiness, and probe distinctions](#health-readiness-and-probe-distinctions) is explicitly deferred — it needs real provider quota and the Today "Check AI status" trigger, so it belongs with milestone 4, not 2a.

### AI handler and provider adapter contract

This is the current state of the seam, not the state any one Goal left it in.

- **The handler owns everything an adapter would otherwise duplicate**: the ordered walk, the per-attempt timeout, zod validation, the closed-candidate-set check, and the collapse to one sanitized `ai_unavailable`. An adapter only has to return a candidate JSON object. `createAiHandler` bounds attempts per request through a `maxAttempts` option defaulting to 4, the Workers AI hop plus the three configured OpenRouter models, so the chain cannot loop.
- **The handler's response checks go past shape.** It rejects a response whose `layerRole` is not among the matching candidate's `supportedLayerRoles`, and requires an exact `application/json` media type rather than any type merely starting with it. In the contracts, `supportedLayerRoles` has no minimum size: the canonical taxonomy gives footwear and accessories an empty role set, and an earlier lower bound rejected every request containing footwear.
- **The shared prompt surface** (`ai-prompt.ts`) holds `outfitJsonSchema`, a hand-written JSON Schema whose shape is exactly `aiRecommendV1SuccessSchema`'s, so an adapter returns parsed model output with no mapping step. It is hand-written rather than derived because the workspace is on zod 3.25.76 and the structural outfit rules live in `superRefine`, which no converter can express. Those rules stay enforced by the handler's zod parse; the JSON Schema only shapes model output and is never treated as validation. `buildMessages` passes the already-sanitized request straight through, adding and filtering nothing.
- **`max_tokens: 2048` is a correctness bound, not a tuning knob.** Without it both runtimes stopped at their default length and returned truncated JSON that failed `JSON.parse` or zod. It is fixed in code and deliberately absent from `Env` and `wrangler.jsonc`. The per-attempt timeout is likewise a measured bound rather than a default: `index.ts` passes `attemptTimeoutMs: 20_000` into the handler's existing injectable parameter, because the Workers AI hop runs close enough to 10 seconds to be aborted mid-success.
- **Adapters keep sanitization at their own boundary.** The OpenRouter adapter holds its API key in a private class field and throws only constant-message errors, so the key, the response body, the status text, and provider identity are never interpolated into an error. The Workers AI binding takes no `AbortSignal`, so that adapter calls `signal.throwIfAborted()` first and otherwise relies on the handler's per-attempt race; no second timeout exists.
- **Composition happens in the request path.** `fetch(request, env)` calls `createAiProviders(env)`, which builds one Workers AI provider when the binding and its model are present, then one OpenRouter provider per configured model id in order. Per-model instances are deliberate: the handler's ordered walk *is* the model fallback chain, so no second fallback loop exists. `aiReady` is `providers.length > 0`, so `/v1/ai/ready` reports real configuration state while still calling no provider. Weather composition stays at module scope.
- **The deterministic stub is never composed in production.** It survives only as an injected test double. When nothing is configured the provider list is empty, `/v1/ai/ready` reports `not_configured`, and `/v1/ai/recommend` returns `ai_unavailable`, which is the correct signal for the device-local deterministic fallback.

### Where each fallback lives

Four distinct fallbacks operate at three boundaries. Keeping them separate is what lets any one of them fail without breaking the product.

| Fallback | Location | Trigger |
| --- | --- | --- |
| Next weather provider in the chain | inside the Worker | eligible upstream weather failure |
| Last known good weather snapshot | mobile SQLite and weather repository | refresh fails after the chain is exhausted |
| Next AI provider in the chain | inside the Worker | eligible AI provider failure or invalid structured output |
| Deterministic three-outfit generation | on device | AI unavailable, over quota, or rejected by validation |

The two Worker-side fallbacks are invisible to mobile, which sees one success or one sanitized failure. The two device-side fallbacks are what let the app still show weather and a recommendation with no network and no AI at all.

### Health, readiness, and probe distinctions

Three separate questions, deliberately not collapsed into one endpoint:

- **Worker liveness** (`GET /v1/health`) — is the Worker running? Involves no AI provider and consumes no quota.
- **AI configuration readiness** (`GET /v1/ai/ready`) — is AI configured well enough to attempt a request? Inspects configuration only and calls no provider.
- **Active AI provider probe** (`POST /v1/ai/probe`, milestone 4) — will a provider answer right now? This consumes provider quota, so it is explicitly triggered, bounded, rate-limited, and briefly cached.

A successful probe describes only the moment it ran. It never guarantees that a later full recommendation request will succeed, so the deterministic fallback stays mandatory regardless of probe state.

The probe handler (`apps/worker/src/ai/probe-handler.ts`) is assembled by injection like `createAiHandler`. On each `POST` it: rejects non-`POST` with `405`; applies a per-IP burst limit (`cf-connecting-ip`) and returns `429 rate_limited` with `Retry-After: 60` when denied; returns an isolate-cached result when one is under 60 seconds old; checks a KV daily counter keyed `probe:YYYY-MM-DD` and returns `429 rate_limited` at 30; then runs **only the first provider** in the chain once, against a fixed minimal in-Worker `AiRecommendV1Request`, with a 20-second timeout. The result is `ok` only if the output passes the same structural and closed-candidate-set validation a real recommendation uses; any parse failure, timeout, provider error, or empty provider list yields `unavailable`. The response is `{ data: { status: 'ok' | 'unavailable', checkedAt } }` — never a provider name, model id, upstream status, or error text. The daily counter increments only when a provider was actually called; cache hits and rate-limit rejections do not.

Rate limiting also covers `POST /v1/ai/recommend` (per-IP, 10/60s). Both endpoints use the native Cloudflare rate-limit binding; the probe additionally uses a `PROBE_COUNTER` KV namespace. All four (`kv_namespaces`, `ratelimits`, `vars`, `ai`) sit at the top level of `wrangler.jsonc`, which is the Worker's only environment: the named `env.development` was removed because Cloudflare does not inherit top-level bindings into named environments, so a deploy is a plain `wrangler deploy` with no `--env` (see [ADR 0003](adr/0003-single-worker-environment.md)). Deploying still requires provisioning the real KV id and the `OPENROUTER_API_KEY` secret first (see [product-decisions.md](product-decisions.md#implemented-generation-mode-surface-active-ai-probe-and-worker-rate-limiting)). When a binding is absent the handlers degrade to permissive, so local dev and unit tests are unaffected.

## Data flow once implemented

1. Mobile presentation sends user intent to application services.
2. Application services read durable local state through repository interfaces and remote state through a Worker client.
3. The Worker validates input, calls privileged providers, validates their output, and returns a versioned response defined in the contracts package.
4. The mobile client validates the response before mapping it into domain state and preserves the last known good snapshot if refresh fails.

Steps 2 through 4 now operate end-to-end in local development through the HTTP adapters and deterministic Worker weather sample endpoint. Authentication, remote synchronization, and production WeatherKit remain unimplemented. The AI recommendation flow is implemented end-to-end: the Worker composes ordered Workers AI and OpenRouter adapters, mobile validates and maps the response, and one recommendation snapshot per local profile is persisted with a device-local deterministic fallback. Milestone 4 (2026-08-29) added the `POST /v1/ai/probe` endpoint, per-IP rate limiting on both AI endpoints, the Today and Settings generation-mode surface, and the Settings "Check AI status" action. The real weather provider chain remains approved and sequenced in [`current-status.md`](current-status.md), but is not implemented.
