# kuyara architecture

## Current workspace

The repository is a small pnpm monorepo running on Node.js 24:

```text
apps/mobile       Expo SDK 57 and React Native application
apps/worker       Cloudflare Worker boundary
packages/contracts Shared runtime schemas and API types
```

The root `pnpm-lock.yaml` is the only dependency lockfile. Workspace discovery is limited to `apps/*` and `packages/*`.

## Mobile boundaries

The mobile app uses Expo Router and managed Continuous Native Generation, so native projects are generated from Expo configuration rather than stored in the repository. The app config pins the Expo SDK 57 minimum of iOS 16.4 without introducing an iOS-only shared-code assumption.

As product features are added, mobile code is organized feature-first while preserving presentation, domain/application, and data boundaries. React components render state and emit user intent; use cases coordinate behavior; repositories isolate SQLite and external data. Domain models, local records, and API DTOs remain distinct and use explicit mappers.

Expo SQLite owns the implemented local profile, its preferences, and profile-owned wardrobe items. TanStack Query will own future remote request state. Hooks or narrow contexts own transient UI state.

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

`recommendOutfits` is a pure function: it reads no clock, performs no I/O, and returns the same result for the same input regardless of candidate order. Recomputation is memoized on weather snapshot identity, Wardrobe contents, and clothing preference, so a recommendation is produced only on a relevant change. The result records a coarse generation mode; only the deterministic fallback is produced today. No repository, provider DTO, runtime schema, persistence layer, network client, or global state container is introduced by Today itself — it consumes the Weather and Wardrobe application providers, both mounted at the root.

## Worker and contract boundaries

Apple Developer enrollment is temporarily pending. Production WeatherKit integration and credential work are therefore paused until the user explicitly lifts the constraint; this is not an architectural cancellation. Apple-independent implementation, testing, Simulator work, and release preparation proceed. The checked-in composition still serves deterministic sample weather, but that is the current state rather than a rule: real Apple-independent weather providers are approved, and the deterministic sample provider remains a development and test source that is never a production fallback.

The Worker is the server-side boundary for weather and AI provider calls, credential protection, validation, and operational limits. It now exposes the first versioned mobile API boundary at `POST /v1/weather`. The route accepts only normalized integer hundredth-degree coordinates and an IANA time zone; it does not accept a profile ID, location key, permission state, accuracy label, or raw native location payload.

`packages/contracts` owns the strict Zod request, success, and stable error schemas plus their inferred TypeScript types. The success contract uses the same settled weather condition vocabulary and validates timestamps, measurement ranges, minimum/current/maximum relationships, and ordered same-local-day hourly entries. Its provenance is only `sample | live`, and no provider identity crosses the shared API today. Raw provider payloads, credentials, and internal error detail must never cross it. The approved target composition narrows that rule only as much as attribution requires, because upstream providers oblige kuyara to display attribution: a controlled, non-secret attribution identifier or attribution metadata may reach mobile for display. The checked-in schema does not yet carry one.

The Worker route validates the request before invoking an injected provider. The provider returns a provider-neutral internal snapshot, and an explicit mapper validates and converts that model into the shared success DTO. Provider failures and invalid provider values become the same minimal `weather_unavailable` response; invalid requests, unknown routes, wrong methods, and unexpected failures have their own stable codes without localized messages, provider details, stacks, or configuration data.

The checked-in composition uses a deterministic local mock with an injected clock and explicit `sample` provenance. It has no credentials, bindings, authentication, persistence, rate limiting, or upstream network call. The route sets `Cache-Control: no-store` and does not log coordinates or request bodies. Each future real provider must have its own adapter-local raw response validation, unit and condition normalization, and provider-specific error mapping before producing the existing provider-neutral snapshot. Every real adapter, including the future WeatherKit one, implements that same interface and keeps signing, credentials, and raw provider data entirely inside the Worker.

## Approved target composition

Approved 2026-08-13 and recorded in [`product-decisions.md`](product-decisions.md). **None of this section is checked in.** It fixes where approved behavior will live so later work does not relitigate the boundaries. It deliberately does not name endpoints, schema fields, model identifiers, environment variables, migrations, or provider response mappings that have not been designed yet.

### Target weather provider chain

The chain lives entirely inside the Worker. Mobile keeps depending on the existing provider-neutral contract and gains no provider knowledge.

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

Once Apple Developer Program access exists, WeatherKit is inserted at the head of this same chain. The mobile weather domain, its repository, the exact 30-minute freshness boundary, and last-known-good behavior do not change when the chain changes.

The chain advances to the next provider only for eligible availability, timeout, quota or rate-limit, authentication or configuration, upstream, or invalid-response failures. Valid weather is never rejected because its conditions are undesirable or because two providers disagree. Attempts per request are bounded so a chain cannot loop.

Attribution is the one controlled addition to the shared contract, as described above.

### Target recommendation and AI flow

Deterministic rules bound the request, AI composes within those bounds, and validation gates the result twice.

```text
mobile: deterministic requirements + closed candidate set
        ↓  sanitized request: no photos, paths, identifiers, or coordinates
Worker AI route
        ↓
ordered AI chain: OpenRouter primary → Workers AI binding fallback
        ↓
Worker-side runtime validation and sanitized failure mapping
        ↓  structured response: allowed candidate identifiers + closed code vocabulary
mobile: shared contract validation, then deterministic domain invariants
        ↓
persisted recommendation snapshot and localized presentation
```

The request carries only sanitized structured evidence; the forbidden inputs are listed in [`product-decisions.md`](product-decisions.md). The response carries structured data, never user-visible prose, so all Turkish and English copy stays in localization keys. A response failing either validation stage is rejected rather than repaired into a different outfit.

### Goal 2a design: AI contracts and Worker orchestration

Designed 2026-08-13, not implemented. Covers only the shared contracts and Worker side of the flow above; real provider credentials (2b), the mobile Worker client, and recommendation persistence (milestone 3) are separate Goals.

- **Contracts** (`packages/contracts/src/ai-v1.ts`, `POST /v1/ai/recommend`). Request carries `clothingPreference`, the `ClothingRequirement[]` discriminated union (mirrors the existing mobile domain type, including `water_protection`'s `target: 'body'|'feet'`), and a bounded `candidates` array of only the mobile-side `status === 'eligible'` garments (`EligibleGarmentResult`) — never the full ready/ineligible set. Each candidate carries contract-owned enums and nullable properties, matching `EffectiveGarmentCandidate`/`EffectiveGarmentProperties` shape without importing mobile types. The exact candidate-array upper bound is set during implementation from real payload and model-context measurements, not assumed here. Response success is exactly 3 outfits, each an ordered list of `{slot, layerRole, candidateKey}` using contract-owned slot/layer-role enums; mobile maps these to its own `OutfitSlot`/`LayerRole` types through an explicit, tested mapper in both directions. Response error reuses the weather-v1 error shape with codes `invalid_request | not_found | method_not_allowed | ai_unavailable | internal_error`.
- **Worker orchestration** (`apps/worker/src/ai/`). `createAiHandler({ providers })` mirrors `createWeatherHandler`'s dependency-injection shape, but takes an ordered provider list instead of one provider so Goal 2b can append real adapters without changing the handler. Goal 2a's list has one entry: a deterministic in-Worker stub whose test scenarios (success, invalid output, timeout, provider failure) are selected by injecting different stub instances, never by a request field. Each attempt is bounded by a per-attempt timeout (the existing 10-second `AbortController` pattern); exhausting the provider list collapses to one sanitized `ai_unavailable`.
- **Worker-side validation is structural and closed-set only**, not a re-implementation of `composeOutfits`'s scoring/tradeoff logic: response shape (zod), every `candidateKey` drawn from the request's closed candidate set, no duplicate `candidateKey` within one outfit, and slot completeness (`primary_top`+`bottom` XOR `one_piece`, exactly one `footwear`, at most one each of `mid_layer`/`outer_layer`). Any violation collapses to `ai_unavailable`; the specific rule that failed is never exposed to the client. Full mandatory-requirement satisfaction checking stays where `composeOutfits`/`evaluateGarmentEligibility` already live, in mobile.
- **Endpoints in scope for 2a**: `GET /v1/health` (generic Worker liveness) and `GET /v1/ai/ready` (configuration readiness, calls no provider). The active AI provider probe from [Health, readiness, and probe distinctions](#health-readiness-and-probe-distinctions) is explicitly deferred — it needs real provider quota and the Today "Check AI status" trigger, so it belongs with milestone 4, not 2a.

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

- **Worker liveness** — is the Worker running? Involves no AI provider and consumes no quota.
- **AI configuration readiness** — is AI configured well enough to attempt a request? Inspects configuration only and calls no provider.
- **Active AI provider probe** — will a provider answer right now? This consumes provider quota, so it must be explicitly triggered, bounded, rate-limited, and briefly cached.

A successful probe describes only the moment it ran. It never guarantees that a later full recommendation request will succeed, so the deterministic fallback stays mandatory regardless of probe state.

## Data flow once implemented

1. Mobile presentation sends user intent to application services.
2. Application services read durable local state through repository interfaces and remote state through a Worker client.
3. The Worker validates input, calls privileged providers, validates their output, and returns a versioned response defined in the contracts package.
4. The mobile client validates the response before mapping it into domain state and preserves the last known good snapshot if refresh fails.

Steps 2 through 4 now operate end-to-end in local development through the HTTP adapter and deterministic Worker sample endpoint. Authentication and remote synchronization remain deferred, and production WeatherKit stays blocked by Apple Developer Program enrollment. The real weather provider chain, the AI recommendation flow, operational limits, and recommendation persistence are approved and sequenced in [`current-status.md`](current-status.md) but are not implemented.
