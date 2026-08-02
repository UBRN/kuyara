# kuyara product decisions

## Confirmed MVP decisions

- kuyara is an open-source weather and outfit recommendation app for iOS and Android.
- The first release is optimized for iOS while shared code remains Android-compatible.
- Turkish and English are supported from the beginning. The device language and system theme are the defaults, with language and theme overrides available in Settings.
- The MVP has no account, cross-device sync, behavioral analytics, or notifications.
- Expo SQLite is the durable source of truth for user-created local data. Remote sync may complement, but must not replace, the local store in a future release.
- Apple WeatherKit is accessed through the Worker. Weather constraints are deterministic; AI can only rank or compose allowed items and must have a deterministic fallback.
- Wardrobe photos are optional, remain on-device in the MVP, and are not sent to AI.
- “Women's clothing” and “Men's clothing” are mutable clothing preferences, not biological-sex fields.

## Temporary Apple constraint

- Apple Developer enrollment is pending as of 2026-08-01. Until the user explicitly lifts this constraint, production WeatherKit integration and credentials, TestFlight, App Store Connect and production release operations, and other work requiring active Apple Developer Program membership are paused.
- This is a temporary project constraint, not a cancellation of WeatherKit or the iOS-first release direction. The provider abstraction remains the required architecture, and WeatherKit work will resume after membership is available and the user removes the constraint.
- Apple-independent development, automated tests, iOS Simulator validation, and release preparation continue. Weather uses only the deterministic/sample provider during this period; no temporary real provider is selected.

## Current scaffold

- The repository is a pnpm workspace with an Expo SDK 57 mobile app, a Cloudflare Worker package, and a shared contracts package.
- The mobile app uses Expo Router and managed Continuous Native Generation. Native `ios/` and `android/` directories are generated only when needed and are not committed.
- Expo SDK 57 sets iOS 16.4 as the minimum supported iOS version. Android remains supported by the shared Expo project.
- The Worker has a deterministic weather v1 foundation and a controlled development-only sample deployment, but no WeatherKit, AI, credential, persistence, rate-limit, or production-provider implementation.
- The contracts package contains the confirmed provider-neutral weather v1 request, success, and stable minimal error schemas.

## Implemented primary navigation

- The final main tabs are Today, Weather, Wardrobe, and Settings. Their visible paths are `/`, `/weather`, `/wardrobe`, and `/settings`; Expo Router route groups do not appear in user-visible URLs.
- The root Stack retains the device-local onboarding gate and keeps `/onboarding` outside the tab navigator. An incomplete profile cannot enter the tab group, while a completed profile opens Today by default.
- The current app uses Expo Router's stable JavaScript Tabs. SDK 57 Native Tabs remain alpha and are not used; moving to Native Tabs later requires a separate, deliberate migration decision.
- Each main tab owns a nested Stack boundary. Wardrobe create and edit screens live inside the Wardrobe Stack rather than being pushed from Today.
- Weather now provides foreground location selection and Worker-backed persisted sample weather at `/weather`. Wardrobe provides its first local CRUD experience at `/wardrobe`, `/wardrobe/new`, and `/wardrobe/[id]` without changing the tab or root Stack architecture.

## Implemented Today mock slice

- Today currently renders one typed, deterministic İstanbul fixture with a fixed retrieval time, a concise mock weather summary, localized clothing guidance, and exactly three complete outfit options in the vertical reading flow: Comfortable, Polished, and Rain-ready.
- Fixture values and language-independent weather, clothing, intent, and reason codes are separate from English and Turkish presentation copy. The fixture is a replaceable presentation input, not a WeatherKit DTO, database record, AI response, or recommendation-engine result.
- The presentation contract supports loaded, loading, unavailable, and stale-loaded states. The checked-in route intentionally renders only the canonical fresh loaded fixture and does not claim that it is live.
- The Today fixture still has no WeatherKit, Worker API, location permission, AI, wardrobe ownership, account, sync, analytics, notification, or refresh behavior. Its only integration with the local-profile slice is an accessible Settings navigation action and the application-wide persisted language/theme resolution.
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
- SQLite stores only a normalized relative photo path. Absolute paths, URIs, backslashes, parent traversal, and empty path values are not persisted; photo import, compression, copying, cleanup, and external transmission remain unimplemented.
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
- The current provider is a deterministic, visibly disclosed sample source with reproducible success, delayed-stale-success, and failure paths. It performs no network request and is replaceable behind a narrow provider interface.
- This slice does not add WeatherKit, Worker API routes, shared network contracts, TanStack Query, recommendation rules, AI, accounts, synchronization, analytics, notifications, background location, or background refresh.

## Implemented Worker weather v1 foundation

- `POST /v1/weather` accepts only normalized integer hundredth-degree latitude/longitude values and an IANA time zone. Profile IDs, location keys, native permission data, accuracy labels, and raw coordinates are not part of the API.
- Shared strict Zod schemas define the request, provider-neutral success data, established condition codes and weather invariants, and minimal stable error codes. The response identifies data only as `sample` or `live`; WeatherKit names and raw provider structures remain internal.
- The Worker validates before provider access, maps an injected provider-neutral model through an explicit API mapper, and sanitizes invalid input, route/method failures, unavailable or invalid provider data, and unexpected errors. Responses do not expose provider details, stacks, secrets, or internal configuration.
- The current Worker composition uses a deterministic clock-injected local mock and marks every success as sample data. It has no upstream call, credential, secret, binding, authentication, persistence, rate limiting, deployment, DNS, or remote resource.
- Mobile development composition calls this local endpoint through a contract-validating HTTP provider adapter. Production WeatherKit integration remains deferred.

## Implemented mobile Worker weather adapter

- Mobile depends directly on the shared contracts package and validates every Worker success or stable error body before using it. The provider-neutral mobile boundary distinguishes network, service, and invalid-response failures; the application presents network failures as offline and all other provider failures as unavailable.
- Requests contain only normalized coordinates and IANA time zone. The response mapper restores the selected location key from local request context and assigns a stable local source ID; profile, catalog, permission, and accuracy identity never enters the API contract.
- Local development defaults to the iOS/web loopback or Android emulator host alias and supports `EXPO_PUBLIC_KUYARA_WORKER_BASE_URL` for a reachable LAN origin. Non-development configuration requires an explicit HTTPS origin.
- The provider switch does not change SQLite schema or ownership, the exact 30-minute freshness boundary, cache-first rendering, refresh coalescing, manual refresh, stale display, or last-known-good behavior. Offline and unavailable refreshes preserve both the active location and last valid snapshot; a successful retry clears the failure.

## Implemented deterministic weather-to-clothing requirements

- A pure provider-independent domain function converts one validated `WeatherSnapshot` into immutable, stably ordered clothing-property requirements. It emits only thermal level, breathability, arm/leg coverage, body/feet water protection, wind protection, traction, mandatory/optional priority, and language-independent reason codes. It does not select garments, catalog candidates, Wardrobe items, layers, slots, accessories, or outfits.
- Current measurements and hourly measurements at or after `current.observedAt` are the primary exposure horizon. At least one hourly entry strictly after `observedAt` counts as remaining-hour coverage. Only when no such entry exists do the daily minimum and maximum participate in mandatory thermal and breathability exposure as a documented fallback. A past daily extreme therefore cannot independently escalate a current requirement when remaining-hour coverage exists.
- Cold exposure is the lowest relevant air or apparent temperature: below `5°C` requires high thermal protection, `5°C` through below `12°C` requires moderate, and `12°C` through below `18°C` requires light. Below `12°C`, full arm and leg coverage is mandatory; from `12°C` through below `18°C`, it is optional.
- Heat exposure is the highest relevant air or apparent temperature: `24°C` through below `28°C` produces optional moderate breathability, while `28°C` and above requires high breathability. Wind remains independent: `5 m/s` through below `8 m/s` produces optional wind resistance, while `8 m/s` and above requires it. Wind does not additionally promote thermal level after apparent temperature is considered.
- A daily maximum-minus-minimum range of at least `8°C` emits `daily_range_wide` but does not itself escalate protection when adequate remaining-hour coverage exists. Precipitation probability from `0.30` through below `0.60` produces optional water-resistant body protection; `0.60` and above requires waterproof body protection.
- Explicit conditions override weaker probability guidance. Drizzle requires water-resistant body protection; rain requires waterproof body protection and makes water-resistant feet protection optional; heavy rain and thunderstorms require waterproof body plus water-resistant feet protection and make enhanced traction optional; sleet and snow require waterproof body and feet protection plus enhanced traction. Thunderstorm protection requirements never imply that clothing makes outdoor activity safe.
- Requirements on the same property and target merge to the strongest value, with mandatory taking precedence and reason codes deduplicated in stable order. Independent needs do not cancel one another, so hot rain may require both breathability and water protection. Clothing preference is not an input and cannot weaken weather protection.
- Every numeric boundary above is a deliberately coarse Kuyara product heuristic for everyday guidance. None is a scientific comfort rating, garment temperature rating, medical recommendation, occupational-safety rule, severe-weather alert, or assurance of safety.

## Implemented deterministic garment eligibility and scoring

- A pure mobile domain layer projects bundled catalog defaults and successfully resolved owned-item overrides into one canonical effective-property input. Catalog preference mismatch and unavailable catalog types fail explicitly; active owned items remain independent of current catalog preference, while deleted, legacy, invalid, and unmappable owned items are excluded. Retained deprecated definitions remain valid for already-owned garments.
- Thermal, breathability, arm coverage, and leg coverage are composition-aware. Applicable shortfalls and missing values retain their weather reason codes and weighted score contribution but do not reject one garment, even when mandatory; later outfit composition must verify their combined satisfaction.
- Individual-garment hard rejection is limited to mandatory body water or wind protection on outerwear candidates and mandatory feet water protection or traction on footwear. Optional failures never reject, and incompatible requirement/category combinations are `not_applicable` and excluded from scoring. Accessories are unsupported in this slice and cannot satisfy protection requirements.
- Applicable mandatory requirements have weight `2` and optional requirements weight `1`. Ordinal contribution is the actual-to-minimum strength ratio capped at `100`; an eligible candidate with no applicable requirement starts at neutral `50`. Scores are rounded integers clamped to `0..100`, and stronger-than-minimum values receive no unbounded bonus.
- Over-protection subtracts `5` per thermal step above an applicable minimum; with no thermal need, moderate and high thermal levels subtract `10` and `20`. When breathability is requested without an applicable water need, water-resistant and waterproof properties subtract `5` and `10`. Combined penalties are capped at `30`.
- Eligibility and scoring reason codes are language-independent and stably ordered. Equal scores use the stable candidate key as the deterministic tie break. Scores are comparable only among candidates for the same composition role or compatible category; they are not global quality scores across tops, bottoms, outerwear, footwear, or other categories. This slice does not assign roles, combine garments, or produce outfits.

## Implemented deterministic one-outfit composition

- A pure mobile domain function now composes already evaluated eligible catalog and Wardrobe candidates into exactly one immutable outfit or a structured failure. A complete outfit uses either primary top plus bottom or one `one_piece`, always includes footwear, and may add at most one supported mid layer and one supported outer layer. Runtime slot and layer-role assignments never mutate garment or Wardrobe data, and one candidate key cannot fill multiple slots.
- Thermal contribution is summed across body garments while footwear warmth remains separate evidence. Body breathability normally uses the least-breathable assigned body garment; arm and leg coverage use the strongest applicable collective coverage. Mandatory body water and wind are authoritative only from the assigned outer layer's existing eligibility evaluation, while mandatory feet water and traction are authoritative only from footwear.
- A mandatory waterproof or wind-resistant outer layer may resolve, but never erase, a breathability conflict: when the body core and optional mid layer meet mandatory breathability, the outfit remains valid with a `breathability_protection_tradeoff` evaluation, the outer shortfall remains explicit, and a deterministic penalty applies. A non-breathable core still fails, and water or wind protection is never weakened to avoid the conflict.
- Outfit scores use aggregate requirement satisfaction and bounded thermal, unnecessary-water, and protection-versus-breathability penalties. Garment scores are used only inside compatible slot groups. Equal outcomes prefer fewer optional layers and then stable slot-local and composition-key ordering; catalog and owned candidates receive no source bonus.
- Failures retain stable codes, missing slots, unmet mandatory requirements with weather reasons, best observed evidence, and considered candidate keys. Accessories, fashion/color/occasion logic, comfort personalization, three-outfit diversity, UI integration, persistence, providers, AI, and Apple-dependent behavior remain outside this slice.

## Approved visual identity

- The canonical approved brand and visual constraints are recorded in [`docs/design/visual-identity.md`](design/visual-identity.md). That document is the source of truth for UI, UX, themes, icons, illustrations, motion, splash screens, and other branding work.
- The approved app symbol is Balanced Horizon — V2: Unified Gap System. Its repository master is `apps/mobile/assets/brand/kuyara-symbol-master.svg`, and its locked geometry must not be silently altered.

## Future possibilities, not MVP commitments

- A remote sync adapter may later be implemented with either Supabase or Firebase, but not both in production.
- Accounts, cross-device sync, an outbox, and conflict resolution require separate product and architecture decisions.
