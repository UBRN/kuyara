# kuyara architecture

## Current workspace

The stack and workspace layout are documented in the [`README.md` Stack section](../README.md#stack).

## Mobile boundaries

The mobile app uses Expo Router and managed Continuous Native Generation, so native projects are generated from Expo configuration rather than stored in the repository. The app config pins iOS 26.0 as the minimum supported version. This is a recorded decision, not a pass-through of Expo SDK 57's own 16.4 floor; see [ADR 0011](adr/0011-minimum-ios-26.md). It introduces no iOS-only shared-code assumption.

As product features are added, mobile code is organized feature-first while preserving presentation, domain/application, and data boundaries. React components render state and emit user intent; use cases coordinate behavior; repositories isolate SQLite and external data. Domain models, local records, and API DTOs remain distinct and use explicit mappers.

Expo SQLite owns the implemented local profile, its preferences, and profile-owned wardrobe items. Hooks or narrow contexts own transient UI state. SQLite is the device-side working database rather than the product's permanent authority: once accounts land, Supabase Postgres becomes authoritative for account-backed data and SQLite keeps its read-and-write-first role. See [Intended future boundaries](#intended-future-boundaries).

Wardrobe data remains durable local state, but [ADR 0005](adr/0005-catalog-only-recommendation-candidates.md) removes it from recommendation inputs. Recommendations assemble catalog candidates independently from Wardrobe loading or ownership state.

Remote weather request state is a deliberate deviation from the `AGENTS.md` state-ownership rule that assigns remote request state to TanStack Query. A purpose-built application controller owns it instead, because it already provides exactly what the weather rules require: per-location coalescing of duplicate in-flight requests, preservation of the last valid snapshot across a failed refresh, and the exact 30-minute freshness boundary, each covered by tests. Adding TanStack Query now would introduce a dependency without adding behavior, and running both would create the competing sources of truth those same rules forbid. TanStack Query remains the intended owner for future remote state this controller does not already cover; what must hold either way is exactly one owner per piece of state.

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

`PRAGMA user_version` records the schema version. The database is opened and migrated once per process: the open promise and the migration run are memoized inside the SQLite boundary, so the six composition roots share one connection and one migration run. Bootstrap enables foreign keys and WAL on that shared connection and sets a five-second busy timeout, reads the current version, and applies each pending migration in ascending order through a transaction the boundary owns: it opens its own connection, sets the same busy timeout and `foreign_keys` on, and takes the write lock up front with `BEGIN IMMEDIATE` so a contending writer waits instead of failing. A migration updates `user_version` inside the same transaction and only after its schema work succeeds. Completed migrations are safe to call again; a newer unsupported version or failed migration surfaces a bootstrap error without deleting or recreating the database.

Version 1 creates only `local_profiles`. `singleton_key` is constrained to the sole value `1` and is the primary key, while `id` is a unique generated UUID. Stable, locale-independent checks constrain clothing (`womens`, `mens`, or null before onboarding), language (`system`, `tr`, `en`), theme (`system`, `light`, `dark`), and the integer onboarding flag. Lifecycle timestamps use UTC ISO-8601 text. `deleted_at` is nullable to preserve the settled local-data record shape, but profile deletion and soft-delete workflows are intentionally not implemented.

Version 2 leaves version 1 unchanged and adds `wardrobe_items`. Its UUID primary key is associated with `local_profiles.id` through a restrictive foreign key. Nullable `name`, `color`, `photo_relative_path`, and `deleted_at` columns are distinct from the required stable category and UTC ISO-8601 lifecycle timestamps. A database check restricts category storage to `top`, `bottom`, `one_piece`, `outerwear`, `footwear`, or `accessory`.

One composite index over `(local_profile_id, deleted_at, updated_at DESC)` supports the profile-scoped active and explicitly deleted access patterns without speculative indexes. The table and index use idempotent creation inside the migration transaction. Version 2 advances `user_version` only after both succeed; failure rolls back the new schema while preserving version 1 profile data and its schema version.

Version 3 leaves versions 1 and 2 unchanged and adds nine nullable columns to `wardrobe_items`: `garment_type_id`, `color_family`, and explicit thermal, water, wind, breathability, arm-coverage, leg-coverage, and traction overrides. SQL checks constrain each non-null enum value, while `garment_type_id` intentionally has no SQL list or foreign key because the canonical catalog is bundled TypeScript data. Existing rows retain their identity, owner, category, display values, photo path, lifecycle timestamps, and deletion state with every new column null; no type or property is inferred during migration.

Version 4 leaves the earlier schema unchanged and adds one profile-owned active location, location-bound weather snapshots, and their hourly entries. Coordinates are rounded to the nearest `0.01°` and represented as integer hundredths before they cross the location adapter. That is roughly 1.1 km north-to-south and less east-to-west at kuyara's sample latitudes: useful for local weather while avoiding unnecessary device precision. The normalized pair also forms device-location cache identity and can be converted back to decimal degrees by a future Worker request mapper. Manual selections store a stable catalog ID; device selections store normalized coordinates, time zone, approximate/full accuracy, and the locality name their reverse geocode resolved, if any. Raw coordinates, permission diagnostics, and provider payloads are not persisted or logged. Snapshot replacement and hourly replacement are atomic, and retention is bounded to the active location plus the newest previous location.

Version 5 leaves the earlier schema unchanged and adds `recommendation_snapshots`, with one row per `local_profile_id`. Each row stores a UUID `id`, the owning profile, `weather_snapshot_id`, `location_key`, an `ai-assisted` or `deterministic-fallback` generation mode, validated context and outfit JSON, and UTC ISO-8601 creation and update timestamps. A restrictive foreign key associates the unique `local_profile_id` with `local_profiles.id`.

Version 6 adds the required `notifications_opt_in` integer preference to `local_profiles`, defaulting to `0` and constrained to `0 | 1`.

Version 7 adds an `owned | wanted` `entry_state` to `wardrobe_items`, preserves every existing row, and defaults existing entries to `owned`. New entries require a catalog garment type; existing null `garment_type_id` rows remain readable, editable, and deletable as legacy records.

Version 8 rebuilds `local_profiles` to convert the clothing preference into `gender` (`womens` to `woman`, `mens` to `man`) and adds a nullable ISO calendar-date `birth_date`, preserving every other column, dependent row and the onboarding flag; the rebuild runs a `foreign_key_check` on the transaction connection before commit, and a failed rebuild rolls back. Foreign keys are enforced on every connection, the shared one and each transaction connection alike, so `ON DELETE RESTRICT` and the one `ON DELETE CASCADE` on hourly entries are runtime guarantees; the weather data source still deletes hourly entries explicitly so that behaviour does not depend on connection setup. Two red lines follow from enforcement: a migration that rebuilds a parent table must copy the version 8 and 13 recipe (`PRAGMA defer_foreign_keys` and its reset), because dropping a parent bumps the deferred violation counter, and no code adds `INSERT OR REPLACE`, a delete on `local_profiles`, or a new delete on `weather_snapshots` without re-reading the foreign-key graph (the weather data source's existing snapshot deletes remove the hourly rows first). Orphaned rows that older builds left behind stay in place; foreign keys check the row being written, never pre-existing children. Version 9 adds the active location's `display_name` and backfills the sample cities. Version 10 adds the nullable checked `dress_style` and resets onboarding once so existing installs answer it. Version 11 adds the `weather_alert_deliveries` ledger for local weather alerts. Version 12 adds the profile-owned `analytics_consent` state, defaulting existing rows to `undecided` and constraining it to `undecided | granted | withdrawn`. Version 13 rebuilds `recommendation_snapshots` to widen the generation-mode check to `on-device-ai | ai-assisted | deterministic-fallback`, copying every existing row verbatim with foreign keys deferred for the copy so that an orphan already on the device cannot block bootstrap; see [ADR 0034](adr/0034-on-device-ai-selection-through-apple-foundation-models.md). The current schema version is 13; see [Local profile lifecycle](#local-profile-lifecycle), [Local notifications](#local-notifications), and [The analytics boundary](#the-analytics-boundary) for how the later versions are used.

Future migrations must add one ordered migration object immediately after the current version. Do not edit released migrations, skip a version, or add a destructive fallback.

### Wardrobe application and persistence boundary

The wardrobe slice follows the established executor boundary and adds a narrow feature-local application controller for its list and forms:

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

ADR 0005 governs recommendation assembly: neither resolved owned items nor wanted items become candidates.

### Foreground location and local weather boundary

The Weather tab follows a feature-local dependency flow:

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
                    Worker provider chain
             WeatherKit → Open-Meteo → OpenWeather
```

The controller owns bootstrap, location-selection intent, permission rationale, foreground-only device lookup, fresh/stale evaluation, refresh coalescing, location-switch races, and foreground revalidation. Foreground revalidation re-acquires the device location once per event while it is the active one and permission is granted, and replaces the active location when its normalized key or time zone has moved, or when the lookup resolved a locality name the stored location does not carry, which is how a location stored before names existed acquires one; a failed lookup is silent and leaves the cached snapshot rendered. Because freshness ages with the clock rather than with a state change, Today and Weather re-run the same revalidation when they regain focus, which starts the identical coalesced background refresh. It reads permission state during bootstrap without prompting. The native foreground permission request occurs only after the user selects device location and confirms the localized rationale; permanently denied access offers the platform Settings action. Manual selection remains available without permission.

The `expo-location` adapter is the only feature code that imports the native location module. Raw platform positions stay inside that adapter and are reduced to normalized coordinates plus approximate/full accuracy before returning. The single reverse geocode that resolves the time zone also yields the locality name the location carries: the address's city, or its subregion when the city is unknown, trimmed and length-checked by the shared display-name schema. The rest of the address, the street above all, never leaves the adapter, and a geocode that times out or resolves nothing returns a location without a name rather than no location. Shared domain, repository, controller, and presentation code remains platform-neutral. iOS requests only When In Use authorization and defaults to reduced accuracy. Android declares coarse location while explicitly excluding fine, background, activity, and location foreground-service permissions for this scope.

SQLite is the durable source of truth for the active selection and the last valid snapshots. A cache is fresh through exactly 30 minutes, stale after that boundary, and still rendered while a background or manual refresh runs. A `fetchedAt` in the device's own future is tolerated up to five minutes and treated as fresh, because the Worker stamps it from Cloudflare's clock and an ordinary device clock runs seconds behind; beyond that tolerance the snapshot is rejected as invalid. Without the tolerance a device a few milliseconds slow rejects every live refresh from the deployed Worker. Failed refreshes never erase the prior valid snapshot. A refresh result is published only if it still belongs to the selected location; the repository validates time zone, source/location identity, measurements, and the shared ordered 36-hour window rule before persistence. Reads retain compatibility with already-persisted ordered same-local-day snapshots from the earlier contract.

The application composition uses the network-backed Worker provider adapter. It sends only normalized coordinates and the selected IANA time zone to `POST /v1/weather`, validates success and stable error bodies with the shared Zod contracts, then maps valid data into the existing provider snapshot. The mapper restores the device-local location key from the request context; profile identity, catalog identity, permission state, and accuracy remain outside the API. The deterministic in-process provider is available to focused tests only and is never the application composition.

Place search uses `POST /v1/places/search` through `WorkerPlaceSearchDataSource`, with shared request/result/error Zod schemas (strict request, tolerant result and error, as above). The Worker alone calls the assumed Open-Meteo Geocoding provider, validating raw fields and mapping at most five places to stable `place.<positive decimal id>` ids, display names, region/country lines, hundredth-degree coordinates and a nullable IANA time zone. Each search makes one upstream call with a four-second timeout; when the typed query answers fewer than the requested places and contains a lowercase i, the same deadline covers at most three further calls with dotless-ı spellings (each single position, then every position), because Open-Meteo folds every other Turkish letter but not ı, and their unseen ids are appended after the unchanged typed answer, with a failed retry returning what the typed query gave. It has its own per-IP limiter budget, so a burst of typed searches cannot exhaust the weather refresh budget or the reverse, and it fails closed if that limiter is unavailable. Query text stays in the POST body and is not logged; responses carry controlled `open-meteo` and `geonames` attribution identifiers for the picker. Manual ids accept validated `sample.<slug>` or `place.<positive decimal id>` shapes. SQLite v9 adds the active location's display name and backfills the three sample cities. The picker screen is the `/weather/location` route, which renders `LocationSelectionControls`: it shows that display name, renders the attribution as the result section's footer, and its `PlaceSearchController` drops a result without a time zone before a manual selection reaches the weather repository.

The Worker origin resolves from `EXPO_PUBLIC_KUYARA_WORKER_BASE_URL` when set. Development otherwise defaults to `http://127.0.0.1:8788` for the iOS Simulator and web, or `http://10.0.2.2:8788` for the Android emulator; physical devices need an explicit reachable LAN origin ([Development build on the physical iPhone](testing.md#development-build-on-the-physical-iphone)). The production EAS profile sets the deployed HTTPS origin. This configuration changes only the remote provider boundary: SQLite remains the source of truth, and exact 30-minute freshness, cache-first rendering, request deduplication, manual refresh, last-known-good preservation, and failure presentation remain owned by the existing controller and repository.

The mobile provider boundary classifies failures without depending on the Worker adapter: transport rejection is `network`, a validated non-success response is `service`, and malformed success or error data is `invalid-response`. The application maps only `network` to an offline outcome; every other provider or persistence failure becomes unavailable. A cached snapshot and its active location remain visible for either outcome, and only a successfully validated and persisted retry clears the failure. Local repository failures during bootstrap still use the existing screen-level load error rather than appearing as network failures.

### Local profile lifecycle

The data source performs get-or-create in an exclusive transaction. It reads the singleton first, then uses `INSERT OR IGNORE` with a newly generated Expo Crypto UUID v4 and reads the winning row. The in-memory initialization promise coalesces repeated React/Strict Mode calls, while the schema constraint protects across data-source instances. The UUID is never regenerated once a row exists and is never shown or logged.

`local_profiles.singleton_key` is the primary key under `CHECK (singleton_key = 1)`, so a second local profile on one device is impossible. That constraint is an open fork rather than a settled decision: it forces whatever the sign-out and second-device rules turn out to be, and it gates the account ADR. Resolving it in either direction may need a migration after version 13.

A new profile has null gender, dress style, and birth date, system language, system appearance, and `onboarding_completed = 0`. Onboarding completion updates gender, dress style, birth date, completion state, and `updated_at` in one transaction. Settings uses one explicit transactional update per selected preference. Application state changes only after SQLite succeeds; failures restore the previous domain profile and presentation shows localized, non-technical feedback.

The static year range is 1900 to 2100; the domain validates real calendar dates and rejects future dates against the local calendar. `Profile` and its persistence record hold gender, dress style, and birth date. `ProfileApplicationController` projects `LocalProfile.clothingPreference` through one gender-to-catalog mapping. Birth date drives no product logic. See [ADR 0031](adr/0031-dress-style-is-the-formality-signal.md).

The persisted record, domain profile, and UI state are deliberately distinct. The record retains integer booleans, storage column values, and `deleted_at`; the domain exposes strict preference unions, a boolean completion value, and no deletion field; presentation receives only the controller’s domain state and actions.

### Local notifications

Schema version 6 keeps notification opt-in as device-local profile state. Settings sends intent through the notification application controller; only the Expo gateway imports `expo-notifications`, and opt-in is persisted only after permission is granted. The root provider maps notification responses to Today.

Local weather alerts ([ADR 0032](adr/0032-local-weather-alert-rules.md)) build on that foundation under `features/notifications`: a pure planner in the domain layer derives structured alert plans from the persisted forecast (precipitation onset and an 8 °C apparent-temperature swing, 60 minutes ahead, quiet hours in the device time zone, one alert per rule per location per day); a `WeatherAlertScheduler` cancels kuyara's own pending notifications, records plans in the schema version 11 `weather_alert_deliveries` ledger, schedules localized copy in the active language and prunes old rows, coalescing concurrent calls; a `WeatherAlertObserver` mounted inside the weather provider reschedules on snapshot, opt-in, permission and language changes and passes a stale snapshot through rather than cancelling. A best-effort `expo-background-task` refresh reuses the foreground weather composition and the same scheduler, and no-ops without a profile, opt-in, permission or active location. There is no push token, Worker endpoint or server-side state.

### Bootstrap and routing

The profile application provider opens the database, migrates it, constructs the local data source and repository, and loads or creates the profile. While this is pending, a calm localized bootstrap state is rendered instead of Today. Initialization failure renders a stable localized error and never falls through to product routes.

After readiness, the root Expo Router Stack keeps `/onboarding` separate from the main application. The `(tabs)` route-group layout applies the local gate before mounting product navigation: incomplete profiles redirect to `/onboarding`, completed profiles resolve to `/`, and completed profiles cannot normally return to onboarding. Deep links to `/weather`, `/profile`, and Profile-hosted Wardrobe or Settings routes therefore pass through the same gate.

The main application has three finalized destinations: Today at `/`, Weather at `/weather`, and Profile at `/profile`. Route-group names remain absent from visible paths. Today is the explicit initial route, and each tab has one nested Stack boundary. Profile owns Wardrobe, wanted records, and Settings; Settings opens from the Profile header rather than the tab bar. See [ADR 0006](adr/0006-three-tab-information-architecture.md). The tab bar is Expo Router Native Tabs, accepting the documented alpha risk of the SDK 57 API; kuyara's three static, non-nested tabs do not hit any of its three documented limitations. See [ADR 0012](adr/0012-adopting-expo-router-native-tabs.md).

The OS draws the bar. `navigation/primary-tabs.tsx` declares the three triggers once with their localized labels, accessibility labels, test ids, platform symbol names from the frozen `iconNames` map (an outline and a filled SF Symbol per tab on iOS, one Material symbol on Android) and the `brandPrimary` tint; the native bar supplies the tab role, the selected state and its own Dynamic Type behaviour. Weather and Profile route files are thin adapters over feature presentation and application boundaries. Wardrobe's dirty-form guard uses the navigator's `beforeRemove` event so header back, iOS gestures, and Android system back share the same localized discard confirmation.

The localization provider resolves a saved `system | tr | en` preference through the established device-locale fallback. The existing theme provider receives the saved `system | light | dark` preference. Neither architecture is duplicated, and both providers update when the controller publishes a successfully persisted profile.

Today lives under `apps/mobile/src/features/today/`. Its screen model defines loaded, loading, and unavailable presentation states; a loaded snapshot carries the real `WeatherSnapshot`, the active location, its freshness, and the recommendation result, and holds no duplicated copy of the snapshot's own fields. A pure presentation mapper localizes the language-independent codes into English or Turkish before feature-specific React components render them with the shared primitives.

The route composes existing application state and owns no data access:

```text
weather snapshot + clothing preference + catalog version + local day seed
        ↓
recommendOutfits use case  (features/recommendation/application)
        ↓
deriveClothingRequirements → filter catalog candidates → garment eligibility → composeOutfitOptions
        ↓
Today screen model
        ↓
locale-aware presentation mapper
        ↓
Today screen compositions
        ↓
semantic tokens and adaptive UI primitives
```

`recommendOutfits` is a pure function: it reads no clock, performs no I/O, and returns the same result for the same input regardless of candidate order. Recommendation cache identity is weather snapshot identity, derived clothing preference, dress style, catalog version, and local calendar day seed. Generation occurs only after a stale weather snapshot refresh, an active-location, derived clothing-preference or dress-style change, a bundled catalog-version change, the start of a new local day, or an explicit user request. A birth date change triggers nothing. Today reads the persisted recommendation snapshot through `RecommendationApplicationProvider`; the result is tagged `on-device-ai` when the on-device tier answers, `ai-assisted` when the Worker AI call succeeds, and `deterministic-fallback` otherwise. Today never reads Wardrobe ownership state; outfit detail is the only recommendation surface that may show `owned` or `wanted`. No repository, provider DTO, runtime schema, persistence layer, network client, or global state container is introduced by Today itself; it consumes application providers mounted at the root.

Under [ADR 0031](adr/0031-dress-style-is-the-formality-signal.md), a gender change changes the derived clothing preference, while dress style is stored directly in the persisted recommendation context. The context also stores the optional `dayKind` the result was generated for, so a stored recommendation is read against its own day rather than today's and a row written without the field stays readable. The shared `formalityOrderByDressStyle` table in `packages/contracts` ranks all three formalities for both the Worker prompt and the deterministic fallback. Fallback ranks the same precomposed option set and selects three with distinct valid archetypes; no dress style filters the candidate set.

## Worker and contract boundaries

The [Apple Developer Program](../AGENTS.md#release-operations) status is canonical in `AGENTS.md`. The checked-in composition serves real weather through WeatherKit, then Open-Meteo, then the configured OpenWeather fallback; the deterministic sample provider is test-only and is never a production fallback.

The Worker is the server-side boundary for weather and AI provider calls, credential protection, validation, and operational limits. Its mobile API includes weather, AI recommendation, and active-probe routes plus non-AI liveness and configuration-only AI readiness. `POST /v1/weather` and `POST /v2/weather` accept only normalized integer hundredth-degree coordinates and an IANA time zone; neither accepts a profile ID, location key, permission state, accuracy label, or raw native location payload.

`packages/contracts` owns the Zod request, success, and stable error schemas plus their inferred TypeScript types. Request schemas are strict and the Worker owns them; success and error schemas strip unknown keys, so a published Worker may add a response field and installed binaries built from commit 8e949ec or later accept it, while a new enum member is additive only where a named unknown branch exists: binaries built from e292fd7 or later read a new `origin.sourceId` or error code as `unknown`, a new condition code or place-search attribution id breaks every installed binary, and while build 8 or 9 is installed every added member is still a breaking change because those binaries read each enum strictly. No provider joins the weather chain before every supported binary carries its attribution key. Binaries built before 8e949ec (build 8, live; build 9, in App Review) carry `.strict()` response schemas that reject any unknown response key at any level, so while one of them is installed every `/v1` response shape is frozen at every level, a changed shape ships on a new route while the old route keeps its exact shape, and adding a field becomes safe only once a binary built from 8e949ec or later is the oldest installed version. The request-side `office_ready` compatibility gate likewise keeps smart outfits ineligible when `dayKind` is absent, and that legacy branch may be removed only when the Release State in `docs/current-status.md` shows that every installed binary sends `dayKind`. The success contract uses the same settled weather condition vocabulary and validates timestamps, measurement ranges, minimum/current/maximum relationships, and one to 38 strictly ordered hourly entries whose timestamps fall from one hour before through 36 hours after `current.observedAt`. Its provenance is `sample | live`. Raw provider payloads, credentials, and internal error detail must never cross it. The one controlled addition is `origin.sourceId` (`sample | weatherkit | open-meteo | openweather`), a non-secret attribution identifier the mobile app maps to localized attribution text; see [Weather provider chain](#weather-provider-chain) below.

The two weather routes are one handler, one strict request schema, one rate-limit key and one provider chain; they differ only in the response schema the snapshot is mapped through, so /v2 can never spend quota /v1 does not. `POST /v2/weather` carries the whole v1 payload plus a `daily` array of one to seven ordered entries, each with the local `dateKey`, a condition code from the same closed eleven, that day's low and high, the precipitation chance and a nullable `precipitationMillimetres` the Worker never invents; its first entry is the observation's local day and repeats the snapshot's own low and high. The origin, attribution and error shapes are v1's, and `/v1/weather` keeps its exact body because the v1 schema has no `daily` key and strips it. A binary reads the daily block only if it was built against `weather-v2.ts`; the deployed Worker therefore has to serve /v2 before such a binary is built.

The Worker route validates the request before invoking an injected provider. The provider returns a provider-neutral internal snapshot, and an explicit mapper validates and converts that model into the shared success DTO. Provider failures and invalid provider values become the same minimal `weather_unavailable` response; invalid requests, unknown routes, wrong methods, and unexpected failures have their own stable codes without localized messages, provider details, stacks, or configuration data.

The checked-in production composition is the real chain described below; the deterministic local mock with its injected clock and explicit `sample` provenance is now a test double only. The route sets `Cache-Control: no-store`, does not log coordinates or request bodies, and is rate limited (see below). Worker observability is enabled, so Cloudflare retains invocation metadata for deployed requests. The Worker's own log statements are limited to structured provider-attempt outcomes (a provider or model identifier, the attempt position and a closed reason code) in `ai-handler.ts` and `weather-provider-chain.ts`; none prints a request body, so coordinates stay in the unlogged request body. Every real adapter, including WeatherKit, implements the same provider interface and keeps signing, credentials, and raw provider data entirely inside the Worker.

## Approved target composition

The approved [weather provider strategy](product-decisions.md#approved-weather-provider-strategy) and [AI recommendation strategy](product-decisions.md#approved-ai-recommendation-strategy), including their rationale, are canonical in `product-decisions.md`. This section records only where those boundaries and fallbacks live and how they connect.

### Weather provider chain

Design, the pricing basis, and full rationale are canonical in [ADR 0002](adr/0002-real-weather-provider-chain.md) and [ADR 0014](adr/0014-weatherkit-at-the-head-of-the-provider-chain.md); this section records only where the chain lives and how it connects. The chain lives entirely inside the Worker. Mobile keeps depending on the existing provider-neutral contract and gains no provider knowledge.

```text
Worker weather route
        ↓
ordered provider chain: WeatherKit primary → Open-Meteo fallback → OpenWeather fallback
        ↓                              ↓                              ↓
   per-provider adapter          per-provider adapter          per-provider adapter
   raw-response validation, unit and condition mapping,
   timeout, provider-specific error classification
        ↓
existing provider-neutral internal snapshot
        ↓
existing explicit API mapper and shared success DTO
```

WeatherKit sits at the head of this chain as the primary provider and serves live production traffic; OpenWeather is the tail fallback, behind its provider-side cap and Worker credential. The mobile weather domain, its repository, the exact 30-minute freshness boundary, and last-known-good behavior are independent of the chain's composition.

The chain advances only for the eligible failure kinds classified in the Worker's weather provider error module, per the [repository fallback eligibility rule](../AGENTS.md#weather-and-recommendation-behavior), never because valid weather is undesirable or differs between providers. Attempts per request are bounded at 3, with a 3,000 ms per-attempt timeout, so a retry or fallback loop is structurally impossible. Each adapter fills the daily block from the same single upstream call it already made, so the block costs no extra attempt and the budget is unchanged; Open-Meteo asks for seven forecast days instead of three and stops at the first day it answers `null` for rather than guessing one. The two weather routes share one limiter budget, at 20 requests/60s per IP, and OpenWeather calls carry an additional best-effort daily cap inside the Worker; see ADR 0002 for both and for the honest limits of that cap.

Attribution (`origin.sourceId`) is the one controlled addition to the shared contract, as described above.

### Target recommendation and AI flow

Deterministic rules bound the request, AI composes within those bounds, and validation gates the result twice. AI is not a personalization layer. It selects three meaningfully different outfits from catalog-only candidates that are already complete, formality-consistent and plausibly layered, avoiding previous-day repetition; colour harmony is not its job, because the catalog describes types without colour ([ADR 0007](adr/0007-ai-selects-precomposed-outfits.md) section 3).

```text
mobile: deterministic requirements + preference-filtered catalog candidates + day seed
        ↓  exclude the previous local day's three option ids when at least three remain
        ↓  sanitized request: no Wardrobe data, photos, paths, profile/device IDs, or coordinates
routed AI client on the device
        ↓  tier 1, only when the module reports the on-device model available
on-device Foundation Models through the local Expo module
        ↓  shared contract validation, then deterministic domain invariants
        ↓  every on-device failure falls to tier 2 with the remaining budget
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

Under [ADR 0034](adr/0034-on-device-ai-selection-through-apple-foundation-models.md), the composition boundary returns a routed client satisfying the existing `AiClient` interface, so the controller, the mapper, persistence, and the trigger rules keep their shape. It attempts the on-device tier only when the module answers `available`, spends at most 8 seconds there, and then gives the Worker request its own 38-second wait (the Worker's 36-second walk plus 2 seconds of transport), so the whole refresh is bounded at 46 seconds and the deterministic fallback is reached only after the last provider has failed. Mobile sends that wait minus a 1-second transport margin, 37 seconds, in a private validated header, and the Worker clamps it to its own 36-second walk; the strict request body and the Worker's shared cache identity exclude it. An unavailable answer costs no attempt and no time, so Android, web, and ineligible iPhones spend nothing in that tier. Both AI tiers pass through the same validation gate, so an on-device answer the gate rejects is that tier's failure and the Worker still gets its turn; the deterministic device-local fallback keeps its place behind both and is reached by the controller's existing catch. `aiModelInputFromRequest`, `picksAreMeaningfullyDifferent`, and `meetsArchetypePrecondition` in `packages/contracts` are the one model-input projection, the one distinctness rule, and the one archetype precondition both executors use, so the field list defining what a model may see and the rules its reply is judged by exist once. The native surface is a local Expo module in Swift under `apps/mobile/modules/kuyara-on-device-ai`, declared for Apple platforms only, and `features/recommendation/data/on-device-ai-module.ts` is its only importer anywhere in the app: it exports the module or null, so application, feature, and domain code see one branch and never touch the native surface. The AI status surface reads the module's availability, which runs no inference and consumes no quota, so the bounded Worker probe stays the only probe.

### AI contracts and Worker orchestration

The candidate source, day seed, and privacy boundary are defined by [ADR 0005](adr/0005-catalog-only-recommendation-candidates.md) and [`product-decisions.md`](product-decisions.md#approved-catalog-only-recommendation-and-wardrobe-model).

The candidate upper bound is **125**, derived from a measured worst-case serialized candidate of 494 bytes against a provider-neutral 64 KiB request-payload budget and locked by a test; it is a transport and prompt-size bound, not a token count, and assumes no model. The structural outfit invariants below live in the shared zod schema rather than in Worker code, so mobile and the Worker enforce one implementation and the Worker adds only the closed-candidate-set membership check, which is the single rule that needs the request. The per-attempt timeout is injectable, defaulting to 7 seconds, so timeout behavior is testable without real waiting; the request deadline defaults to 36 seconds for an old client and otherwise uses the validated transmitted budget clamped from 5 to 36 seconds.

- **Contracts** (`packages/contracts/src/ai-v1.ts`, `POST /v1/ai/recommend`). Request carries `clothingPreference`, the `ClothingRequirement[]` discriminated union (mirrors the existing mobile domain type, including `water_protection`'s `target: 'body'|'feet'`), and a bounded `candidates` array of only the mobile-side `status === 'eligible'` garments (`EligibleGarmentResult`), never the full ready/ineligible set. Each candidate carries contract-owned enums and nullable properties, matching `EffectiveGarmentCandidate`/`EffectiveGarmentProperties` shape without importing mobile types. The candidate-array upper bound is recorded above. Response success is exactly 3 outfits, each an ordered list of `{slot, layerRole, candidateKey}` using contract-owned slot/layer-role enums; mobile maps these to its own `OutfitSlot`/`LayerRole` types through an explicit, tested mapper in both directions. Response error reuses the weather-v1 error shape with codes `invalid_request | not_found | method_not_allowed | ai_unavailable | internal_error | rate_limited`.

  Under [ADR 0031](adr/0031-dress-style-is-the-formality-signal.md) the strict request accepts optional `dressStyle` (`casual`/`smart`/`formal`) so previous clients remain compatible. Mobile supplies the stored style, and the Worker treats an absent value as `smart` in both its prompt and shared cache key. Persisted recommendation context also carries dress style for cache comparison; snapshots written with the retired field or with neither style field are read as `smart`. Birth date and birth year never leave the device or enter the shared cache key.

  No repeat of what is on screen: on every regeneration, a new local day or a same-day refresh alike, the controller reads the currently persisted snapshot and, when it holds three outfits, drops those three option ids from the composed candidates before both the AI request and the deterministic fallback, provided at least three candidates remain; a narrower pool, such as hot weather's four options, keeps the exclusion off and may repeat. A fresh install and a snapshot without three outfits exclude nothing; nothing new is persisted. The Worker's shared cache key adds the sorted offered option ids, so a cached response can never name an option absent from the current offer.
- **Worker orchestration** (`apps/worker/src/ai/`). `createAiHandler({ providers })` mirrors `createWeatherHandler`'s dependency-injection shape, but takes an ordered provider list instead of one provider, so an adapter is appended without changing the handler. The deterministic in-Worker stub is a test double whose scenarios (success, invalid output, timeout, provider failure) are selected by injecting different stub instances, never by a request field. Each attempt is bounded by a per-attempt timeout (the `AbortController` race, 7 seconds); exhausting the provider list collapses to one sanitized `ai_unavailable`.
- **Worker-side validation is structural and closed-set only**, not a re-implementation of `composeOutfitOptions`'s scoring/tradeoff logic: response shape (zod), every `candidateKey` drawn from the request's closed candidate set, no duplicate `candidateKey` within one outfit, and slot completeness (`primary_top`+`bottom` XOR `one_piece`, exactly one `footwear`, at most one each of `mid_layer`/`outer_layer`, and at most one garment in each of the four accessory slots). Any violation collapses to `ai_unavailable`; the specific rule that failed is never exposed to the client. Full mandatory-requirement satisfaction checking stays where `composeOutfitOptions`/`evaluateGarmentEligibility` already live, in mobile.
- **The two endpoints that call no provider** are `GET /v1/health` (generic Worker liveness) and `GET /v1/ai/ready` (configuration readiness). The active AI provider probe from [Health, readiness, and probe distinctions](#health-readiness-and-probe-distinctions) is separate: it needs real provider quota and the Settings "Check AI status" trigger.

### AI handler and provider adapter contract

Candidate assembly and prompt acceptance must follow [ADR 0005](adr/0005-catalog-only-recommendation-candidates.md).

- **The handler owns everything an adapter would otherwise duplicate**: the ordered walk, the per-attempt timeout, zod validation, the closed-candidate-set check, and the collapse to one sanitized `ai_unavailable`. An adapter only has to return a candidate JSON object. `createAiHandler` bounds attempts per request through a `maxAttempts` option defaulting to 5, the two configured Workers AI models plus the three configured OpenRouter models, so the chain cannot loop.
- **The handler's response checks go past shape.** It rejects a response whose `layerRole` is not among the matching candidate's `supportedLayerRoles`, and requires an exact `application/json` media type rather than any type merely starting with it. In the contracts, `supportedLayerRoles` has no minimum size: the canonical taxonomy gives footwear and accessories an empty role set, and an earlier lower bound rejected every request containing footwear.
- **The shared prompt surface** (`ai-prompt.ts`) holds `outfitJsonSchema`, a hand-written JSON Schema whose shape is exactly `aiRecommendV1SuccessSchema`'s, so an adapter returns parsed model output with no mapping step. It is hand-written rather than derived because the workspace is on zod 3.25.76 and the structural outfit rules live in `superRefine`, which no converter can express. Those rules stay enforced by the handler's zod parse; the JSON Schema only shapes model output and is never treated as validation. `buildMessages` passes the already-sanitized request straight through, adding and filtering nothing.
- **`max_tokens: 2048` is a correctness bound, not a tuning knob.** Without it both runtimes stopped at their default length and returned truncated JSON that failed `JSON.parse` or zod. It is fixed in code and deliberately absent from `Env` and `wrangler.jsonc`. The timeouts are likewise measured bounds rather than defaults, and they are one budget across the boundary: every provider that answers the 2 KB request does so within 5 seconds (Workers AI 2 to 4.5 seconds, OpenRouter 0.3 to 1.9 seconds, measured live), while a provider that does not answer stalls indefinitely, so the per-attempt timeout is 7 seconds and `index.ts` passes no override. The Worker's own walk is bounded at 36 seconds, five attempts of 7 seconds plus one second for the rate limiter, the body parse and the cache lookup, so every configured provider gets its turn before the Worker answers `ai_unavailable`. Mobile waits 38 seconds for the request, the walk plus 2 seconds of transport, and sends that wait minus 1 second in `x-kuyara-ai-budget-ms`; the Worker validates the positive integer, clamps it from 5 to 36 seconds, and falls back to 36 seconds when the header is absent or invalid. The handler starts no attempt with less than a useful 5-second window and aborts an in-flight attempt at the request deadline. The budget does not enter the request body, shared cache identity, logs or analytics. Red line: do not raise the per-attempt timeout toward the deadline; a single stalled attempt then consumes several providers' turns. Red line: do not shorten the mobile wait below the Worker walk again; a client that aborts while the Worker is still walking its chain turns a working provider into the deterministic fallback. The probe client's 25 seconds is separate and unchanged.
- **Adapters keep sanitization at their own boundary.** The OpenRouter adapter holds its API key in a private class field and throws only constant-message errors, so the key, the response body, the status text, and provider identity are never interpolated into an error. The Workers AI binding takes no `AbortSignal`, so that adapter calls `signal.throwIfAborted()` first and otherwise relies on the handler's per-attempt race; no second timeout exists.
- **Composition happens once per isolate.** `buildRouter(env)` runs on the first `fetch` and its result is memoised at module scope; the memo holds a `CryptoKey` promise, strings, plain configuration and handler closures, never a `Request`, a `Response` or coordinates, and every handler takes the request as an argument. Composing inside `fetch` is a red line: it makes every per-isolate cache dead, so the probe's 60-second result cache never outlives a request and the WeatherKit token provider re-imports the key and signs a fresh JWT on every weather call. `buildRouter` calls `createAiProviders(env)`, which builds one Workers AI provider when the binding and its model are present, then one OpenRouter provider per configured model id in order. Per-model instances are deliberate: the handler's ordered walk *is* the model fallback chain, so no second fallback loop exists. `aiReady` is `providers.length > 0`, so `/v1/ai/ready` reports real configuration state while still calling no provider. The weather chain, the place-search provider and the probe handler are composed in the same pass.
- **The deterministic stub is never composed in production.** It survives only as an injected test double. When nothing is configured the provider list is empty, `/v1/ai/ready` reports `not_configured`, and `/v1/ai/recommend` returns `ai_unavailable`, which is the correct signal for the device-local deterministic fallback.

### Where each fallback lives

Five distinct fallbacks operate at three boundaries. Keeping them separate is what lets any one of them fail without breaking the product.

| Fallback | Location | Trigger |
| --- | --- | --- |
| Next weather provider in the chain | inside the Worker | eligible upstream weather failure |
| Last known good weather snapshot | mobile SQLite and weather repository | refresh fails after the chain is exhausted |
| Worker AI tier | mobile routed AI client | the on-device tier is unavailable, times out, fails, or its answer is rejected by validation |
| Next AI provider in the chain | inside the Worker | eligible AI provider failure or invalid structured output |
| Deterministic three-outfit generation | on device | AI unavailable, over quota, or rejected by validation |

The two Worker-side fallbacks are invisible to mobile, which sees one success or one sanitized failure. The routed client's hop from the on-device tier to the Worker is invisible to the rest of the app as well: both tiers return the same validated result and differ only in the recorded generation mode. The last known good weather snapshot and the deterministic three-outfit generation are what let the app still show weather and a recommendation with no network and no AI at all.

### Health, readiness, and probe distinctions

Three separate questions, deliberately not collapsed into one endpoint:

- **Worker liveness** (`GET /v1/health`): is the Worker running? Involves no AI provider and consumes no quota.
- **AI configuration readiness** (`GET /v1/ai/ready`): is AI configured well enough to attempt a request? Inspects configuration only and calls no provider.
- **Active AI provider probe** (`POST /v1/ai/probe`): will a provider answer right now? This consumes provider quota, so it is explicitly triggered, bounded, rate-limited, and briefly cached.

A successful probe describes only the moment it ran. It never guarantees that a later full recommendation request will succeed, so the deterministic fallback stays mandatory regardless of probe state.

The probe handler (`apps/worker/src/ai/probe-handler.ts`) is assembled by injection like `createAiHandler`. On each `POST` it: rejects non-`POST` with `405`; applies a per-IP burst limit (`cf-connecting-ip`) and returns `429 rate_limited` with `Retry-After: 60` when denied; returns an isolate-cached result when one is under 60 seconds old; checks its named daily counter in the `DAILY_COUNTERS` Durable Object keyed `probe:YYYY-MM-DD` and returns `429 rate_limited` at 30; then runs **only the first provider** in the chain once, against a fixed minimal in-Worker `AiRecommendV1Request`, with a 20-second timeout. The result is `ok` only if the output passes the same structural and closed-candidate-set validation a real recommendation uses; any parse failure, timeout, provider error, or empty provider list yields `unavailable`. The response is `{ data: { status: 'ok' | 'unavailable', checkedAt } }`, never a provider name, model id, upstream status, or error text. The daily counter increments only when a provider was actually called; cache hits and rate-limit rejections do not.

Rate limiting also covers `POST /v1/ai/recommend` (per-IP, 10/60s) and `POST /v1/places/search` (per-IP, 30/60s, keyed `places:${cf-connecting-ip}` through `PLACE_SEARCH_RATE_LIMIT`, namespace 1004). The place-search figure is derived, not guessed: the picker debounces typing at 300 ms, so a search session is a handful of requests, and one request costs at most four upstream Open-Meteo geocoding calls (the typed query plus at most three dotless-ı spellings), which is 120 calls a minute per IP at the cap, well under Open-Meteo's free 600 calls a minute (see ADR 0002's pricing basis). All of these endpoints use native Cloudflare rate-limit bindings; the probe, the Workers AI attempts of `POST /v1/ai/recommend` and the two capped weather providers each count against their own named counter in the `DAILY_COUNTERS` Durable Object binding (`apps/worker/src/daily-counter.ts`). The Workers AI daily attempt cap protects its shared Neuron pool; mild-day traffic can still raise OpenRouter volume against a shared free tier protected only by the per-IP 10/60s brake, so no second counter is added without owner direction. The deployed single environment keeps `durable_objects`, `ratelimits`, `vars`, and `ai` at the top level of `wrangler.jsonc`; see [ADR 0003](adr/0003-single-worker-environment.md). When a rate-limit binding is absent the route it guards goes offline with a 503 `*_unavailable` body and a `route_binding_missing` log line; when `DAILY_COUNTERS` is absent the AI routes go offline the same way and the weather chain runs on the uncapped Open-Meteo provider alone. Local development and unit tests supply the bindings through `wrangler dev` and the test doubles rather than through a permissive fallback.

## Intended future boundaries

The Supabase direction below is not implemented. The analytics boundary and its feature taxonomy call sites are implemented (see that section). Both directions remain forbidden to extend without an approved task: see [ADR 0022](adr/0022-supabase-is-the-intended-backend-and-kuyara-is-not-local-first.md) and [ADR 0023](adr/0023-behavioural-product-analytics-with-posthog.md).

### Supabase, when accounts arrive

Supabase Auth, PostgreSQL, and Storage are the intended long-term backend. They attach beside the existing stack rather than replacing any of it: the Cloudflare Worker keeps its role as the boundary for WeatherKit, AI, and provider secrets, and Expo SQLite keeps its role as the store the application reads and writes first.

The attachment point already exists. The repository interface is the seam, and a remote data source would sit alongside the SQLite local data source under it:

```text
application controller
        ↓
repository interface                      ← the seam
        ↓                    ↘
SQLite local data source      future Supabase remote data source
        ↓                              ↓
persistence record             future remote record
        ↘                      ↙
          explicit mappers → domain model
```

What the current code owes that future, and must keep: client-generated UUIDs, `localProfileId` on profile-owned rows, ordered migrations, `createdAt`/`updatedAt`/`deletedAt`, and four separate model families (domain, SQLite record, API DTO, future remote record) joined only by explicit mappers. What it must not add: a remote data source with no caller, an outbox, a sync engine, conflict resolution, or a server revision system. The UUID version is pinned in one place: `requireWardrobePhotoUuidV4` in `apps/mobile/src/features/wardrobe/data/wardrobe-photo-path.ts` accepts only `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`, so a move to UUID v7 would break every new managed photo path validated there.

Two tables are syncable: `local_profiles` and `wardrobe_items` carry `id`, `created_at`, `updated_at` and `deleted_at`, and profile-owned rows carry the `local_profile_id` link. `weather_snapshots`, `weather_hourly_entries` and `recommendation_snapshots` are caches, `weather_alert_deliveries` is a device-local delivery ledger, and `active_locations` is device selection state; none of the five is synced, none of them carries `deleted_at`, and `weather_hourly_entries` has no `id` at all. That absence of sync identity is deliberate: a cache is refetched from the Worker rather than reconciled, and a delivery ledger describes one device. `analytics_consent`, `notifications_opt_in` and `birth_date` on `local_profiles` stay on the device and are never linked to an account.

`updatedAt` is a device-local timestamp written from the device's own clock at write time, not a sync conflict arbiter; the weather cache tolerates a `fetchedAt` up to five minutes in the device's future (`weatherClockSkewToleranceMilliseconds`) precisely because device clocks drift against the Worker's. When accounts arrive a conflict rule has to be chosen separately. A future remote payload carries its own `schema_version`; `latestDatabaseVersion` in `apps/mobile/src/infrastructure/sqlite/migrations.ts` is the device database version and stays local. The database file and every managed wardrobe photo sit in the app's Documents directory (expo-sqlite's default `SQLite` subdirectory and `kuyara/wardrobe/photos`), so both are included in the user's own device backup by default; this is deliberate, because until accounts exist that backup is the Closet's only continuity (see [ADR 0022](adr/0022-supabase-is-the-intended-backend-and-kuyara-is-not-local-first.md) section 5).

Promoting existing device rows into an authenticated remote profile is real migration work and needs its own ADR when it is scheduled.

### The analytics boundary

Product analytics attaches through a project-owned boundary, on the same principle that keeps `expo-sqlite` and provider SDKs out of features:

```text
features / application
        ↓
ProductAnalytics boundary        ← event taxonomy and the privacy filter live here
        ↓
PostHog adapter
```

Feature code emits named domain events; the boundary owns the taxonomy, enforces the payload exclusion list, and is the single place a provider swap would touch.

**Phase 1** lives under `apps/mobile/src/features/analytics/`. `domain/analytics-events.ts` is [the approved taxonomy](analytics-taxonomy.md) as types: twenty-four events with closed property unions and `schema_version`, plus `domain/analytics-mappers.ts`, the one place domain values become analytics values (`FailureCategory`, generation mode, refresh trigger, condition code), each mapper total so an unmapped domain value fails to compile. `domain/product-analytics.ts` is the port (`capture`, `optIn`, `withdraw`, `flush`); `application/error-episode-tracker.ts` and `retry-counter.ts` implement the taxonomy's per-session `error_shown` / `error_recovered` rule and the `attempt_number` cap as pure, tested logic; `application/product-analytics-provider.tsx` mounts the boundary as the outermost provider of the app shell and flushes buffered failures before the SDK on the background transition. The prerequisite the taxonomy names, a shared failure classification, is `apps/mobile/src/domain/failure-category.ts` (`offline`, `unavailable`, `rate-limited`, `unknown`); weather, recommendation and the Closet carry a `FailureCategory` in application state. It is an outbound path with its own closed exclusion list, parallel to and independent of the [AI input privacy boundary](product-decisions.md#approved-ai-input-privacy-boundary) and the Worker logging rules, and it weakens neither.

**Phase 2.** Schema version 12 stores `analyticsConsent` on the local profile and treats it as the source of truth, using `withdrawn` for both first-launch decline and later withdrawal. After onboarding, an unanswered profile sees one dismissible consent sheet per process. Grant persists consent before constructing and opting in the SDK client, decline records no event, and withdrawal persists `withdrawn`, records the withdrawal, opts out, flushes the queued event, then severs the SDK identifier and drops the client. Settings exposes the same use case through a Privacy screen and shows the selectable analytics identifier only while consent is granted. The nullable `PRIVACY_POLICY_URL` keeps the policy row hidden until a real URL is configured. When both public Expo variables are valid, the app shell configures an adapter that constructs the PostHog client at startup only for granted consent; otherwise it remains unconstructed until opt-in. Because no client exists before consent, the client initialises opted in (`defaultOptIn: true`): the SDK captures and marks its one-time application-installed lifecycle event during initialisation, so an opted-out construction would lose the install signal permanently. This satisfies ADR 0033 section 6 item 1 structurally rather than through the flag it names. While the answer is `undecided` the adapter's own consent gate drops captures: nothing is recorded or queued until acceptance, which is why the onboarding funnel that precedes the sheet is not measurable. Missing configuration uses the no-op adapter. The adapter filters every event through the approved property allowlist and disables geographic enrichment, feature flags, surveys, session replay, person defaults and push capture; only its data module imports the SDK, and guard tests reject identity APIs.

**Error Tracking follows the same consent boundary.** The client autocaptures uncaught JavaScript exceptions and unhandled rejections only after consent. Its stateful `before_send` hook applies the exception field allowlist, deduplicates by exception type and topmost in-app frame, and accepts at most five exceptions per client session. Withdrawal disposes that hook so the SDK's retained global handlers drop every later capture; a later grant gets a fresh hook. Console capture, native crash capture and exception breadcrumbs stay off. The Expo config plugin wraps native bundle phases for Hermes source-map upload, and the Metro serializer injects matching chunk ids; `@posthog/cli` 0.18.2 performs the build upload. See [ADR 0035](adr/0035-posthog-error-tracking.md).

**Phase 3 shared scaffolding.** `useScreenViewed` emits the closed `screen_viewed` event on each route focus, total mappers translate active-location sources and completed AI-probe states into taxonomy values, and `firstUses.markFirstUse` serializes per-install feature adoption through an app-private JSON file that is independent of SQLite and profiles; withdrawal clears it after severing the identity, so a re-consented install reports first use again (taxonomy 5.11). With no PostHog key, development builds use a consent-aware `console.debug` adapter so Simulator sessions expose only the event name and its already-filtered properties; production keeps the no-op fallback.

**Phase 3 call sites.** Routes and application providers, not presentation components, emit the taxonomy's events: `screen_viewed` through `useScreenViewed` in every tracked route, onboarding and Settings events in the thin route files, `weather_refreshed` and `recommendation_regenerated` from the two controllers through an injected capture function with a no-op default, `error_shown` and `error_recovered` from the providers and routes that already observe a `FailureCategory`, and the Closet events from the wardrobe routes with a pure `fields_changed` helper. `age_bucket` and `dress_style` are derived at emit time by `ageBucketProperty` and `dressStyleProperty` in `analytics-mappers.ts` and are never stored. No feature file imports the SDK; the guard test and `rg` checks in `AGENTS.md` enforce the boundary.

### The observability boundary

EAS Observe is performance and diagnostic instrumentation, not a second analytics architecture. It attaches through its own project-owned port, `features/analytics/domain/performance-telemetry.ts` (`logEvent`, `reportError`, `setDispatching`), with `features/analytics/data/observe-performance-telemetry.ts` as the single adapter and the app's only importer of `expo-observe`; `rg "expo-observe" apps/mobile/src --glob '!*.test.*'` returns that file alone. `Observe.configure()` runs at module scope in `src/app/_layout.tsx`, before any screen mounts, because the expo-router integration cannot be enabled after the tree is mounted; the same call gates dispatch on the analytics consent answer, read synchronously from the existing `local_profiles.analytics_consent` column through `openKuyaraDatabaseSync()` and `readAnalyticsConsentSync()`, where a missing table or any error reads as `undecided` and dispatches nothing. Consent changes inside the session re-apply the configuration through the port, so withdrawal stops dispatch immediately. Screens mark readiness through `useScreenInteractive`, and only two user-defined events exist, `recommendation.generated` and `weather.refreshed`, whose attribute keys and closed value vocabularies live in `domain/performance-telemetry-events.ts`. Errors reach Observe only as a `TelemetryError` built from a closed code and coarse attributes, so a caught SQLite, provider or AI message cannot be forwarded. The route and query parameters the router integration would otherwise export are listed in `domain/telemetry-route-params.ts` and filtered, which also replaces the resolved URL with `urlHidden`.

## Current end-to-end data flow

1. Mobile presentation sends user intent to application services.
2. Application services read durable local state through repository interfaces and remote state through a Worker client.
3. The Worker validates input, calls privileged providers, validates their output, and returns a versioned response defined in the contracts package.
4. The mobile client validates the response before mapping it into domain state and preserves the last known good snapshot if refresh fails.

This flow operates end to end for live weather and AI recommendations. The Worker composes WeatherKit/Open-Meteo/OpenWeather for weather and Workers AI/OpenRouter for recommendations, and an Apple Intelligence eligible iPhone runs the AI selection step on the device before the Worker is asked at all; mobile validates and persists both response types, preserves the last valid weather snapshot, and uses the device-local deterministic outfit generator when AI is unavailable. The active AI probe and endpoint rate limits are deployed. Authentication and remote synchronization remain unimplemented. Analytics has its consent-gated adapter, its consent events, and the taxonomy's feature call sites in place; the remaining intended shape is in [Intended future boundaries](#intended-future-boundaries).
