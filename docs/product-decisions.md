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

- Apple Developer enrollment is pending as of 2026-08-01. Until the user explicitly lifts this constraint, production WeatherKit integration and credentials, TestFlight, App Store Connect and production release operations, and other work requiring active Apple Developer Program membership are paused.
- This is a temporary project constraint, not a cancellation of WeatherKit or the iOS-first release direction. The provider abstraction remains the required architecture, and WeatherKit work will resume after membership is available and the user removes the constraint.
- Apple-independent development, automated tests, iOS Simulator validation, and release preparation continue.
- The earlier rule that weather must use only the deterministic/sample provider during this period, with no temporary real provider selected, was revoked on 2026-08-13. Real Apple-independent weather providers are now approved; see [Approved weather provider strategy](#approved-weather-provider-strategy). The deterministic sample provider remains a development and test source only and is never a production fallback. The membership pause above is unchanged: WeatherKit credentials and integration, TestFlight, App Store Connect, and release operations stay paused.

## Current scaffold

- The repository is a pnpm workspace with an Expo SDK 57 mobile app, a Cloudflare Worker package, and a shared contracts package.
- The mobile app uses Expo Router and managed Continuous Native Generation. Native `ios/` and `android/` directories are generated only when needed and are not committed.
- Expo SDK 57 sets iOS 16.4 as the minimum supported iOS version. Android remains supported by the shared Expo project.
- The Worker has a deterministic weather v1 foundation, a controlled development-only sample deployment, and the AI recommendation contract, route, and orchestration behind a deterministic stub provider, but no WeatherKit, real AI provider, credential, persistence, rate-limit, or production-provider implementation.
- The contracts package contains the confirmed provider-neutral weather v1 request, success, and stable minimal error schemas.

## Implemented primary navigation

- The final main tabs are Today, Weather, Wardrobe, and Settings. Their visible paths are `/`, `/weather`, `/wardrobe`, and `/settings`; Expo Router route groups do not appear in user-visible URLs.
- The root Stack retains the device-local onboarding gate and keeps `/onboarding` outside the tab navigator. An incomplete profile cannot enter the tab group, while a completed profile opens Today by default.
- The current app uses Expo Router's stable JavaScript Tabs. SDK 57 Native Tabs remain alpha and are not used; moving to Native Tabs later requires a separate, deliberate migration decision.
- Each main tab owns a nested Stack boundary. Wardrobe create and edit screens live inside the Wardrobe Stack rather than being pushed from Today.
- Weather now provides foreground location selection and Worker-backed persisted sample weather at `/weather`. Wardrobe provides its first local CRUD experience at `/wardrobe`, `/wardrobe/new`, and `/wardrobe/[id]` without changing the tab or root Stack architecture.

## Implemented deterministic Today integration

The Today mock slice was replaced by the real deterministic recommendation flow. The former fixture, its three named intents, and their pre-written prose no longer exist.

- Today composes its outfits from the live chain: the active weather snapshot and the persisted clothing preference derive clothing requirements, bundled catalog types and owned Wardrobe items become evaluated candidates, and the deterministic composition returns up to three meaningfully different outfits. The result records a coarse generation mode, currently always the deterministic fallback; no AI is involved yet.
- Outfits have no intent identity. The former Comfortable, Polished, and Rain-ready labels were removed because the deterministic engine produces diversity, not intent, and no domain evidence supports an intent claim. An outfit's heading is now its localized catalog garment names in slot order, the first option carries the Recommended emphasis, and the others are presented as other options.
- Explanations are language-independent codes localized at the presentation boundary: the snapshot's clothing-requirement reason codes lead every outfit's reason list, followed by that outfit's own composition reason codes. They are rendered as a list on the outfit detail screen rather than as a paragraph, because a wide-range day legitimately emits both a low-temperature and a high-temperature reason.
- Today shows only weather fields the real snapshot actually carries. Sunrise time, sunset time, wind direction, and the accessory slot were removed because no data source produces them; wind is reported in metres per second, matching Weather. The rain outlook is derived from the real hourly forecast and renders only when future hourly entries exist.
- The Wardrobe application provider is mounted at the root alongside Weather, because Today depends on Wardrobe contents. Wardrobe state is application-scoped, not tab-scoped.
- Today renders loading while weather or wardrobe is still loading, and the unavailable state when weather failed, no snapshot exists, or no location is active. A Wardrobe refresh failure never blanks Today; it recommends from the catalog alone. The recommendation is recomputed only when the weather snapshot identity, Wardrobe contents, or clothing preference changes.
- Today still has no WeatherKit, AI, account, sync, analytics, or notification behavior, and no recommendation persistence.
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

## Approved product model and API budget

Approved 2026-08-13. Not implemented.

- kuyara remains free, ad-free, subscription-free, and without in-app purchase.
- The maintainer may personally fund a small, controlled API budget. Paid API usage must have explicit hard or safely derived limits.
- Automatic top-up and uncontrolled pay-as-you-go overage are not allowed.
- The recurring API-cost target and the OpenRouter credit assumption are recorded, with their date, under [Dated operating assumptions](#dated-operating-assumptions).
- Prices, quotas, licences, and provider conditions are time-sensitive. Reverify them against official sources before implementation rather than trusting any figure recorded here.

## Approved weather provider strategy

Approved 2026-08-13. Not implemented. The checked-in application still fetches deterministic sample data from the Worker.

- The current target chain is Open-Meteo primary, OpenWeather fallback, then the last valid device-local weather snapshot.
- Once WeatherKit becomes available the target chain is WeatherKit primary, Open-Meteo fallback, OpenWeather fallback, then the last valid device-local weather snapshot. WeatherKit is inserted at the head of the established chain rather than replacing it.
- The existing provider-neutral Worker and mobile boundaries must be preserved. Each upstream provider must have an isolated adapter with raw-response runtime validation, explicit unit and condition mapping, timeout handling, and sanitized errors.
- Provider payloads and secrets must not cross into mobile and must not be logged.
- Fallback may occur only for eligible availability, timeout, quota or rate-limit, authentication or configuration, upstream, or invalid-response failures. Valid weather that is merely undesirable, or that differs between providers, is never a fallback trigger.
- Attempts per request must be bounded, and retry or fallback loops must be prevented.
- The exact 30-minute freshness behavior and last-known-good semantics already implemented on mobile must not change.
- Open-Meteo attribution requirements must be supported, and WeatherKit attribution requirements must be supported when WeatherKit is introduced. The earlier "provider names never cross the API" rule is narrowed only as much as a controlled, non-secret attribution identifier or attribution metadata requires; raw provider data and internal errors remain private.
- OpenWeather usage must be bounded by provider-side limits plus Kuyara-side protection. Exact limits must be recalculated from official current pricing during implementation.

## Approved AI recommendation strategy

Approved 2026-08-13. Partly implemented. The shared AI contract and the Worker AI route with ordered provider orchestration exist as of 2026-08-14; no real AI provider does, so the route is currently served by a deterministic in-Worker stub.

- AI must generate exactly three complete outfit combinations. These combinations are AI-generated, not deterministic.
- AI is constrained by the deterministic weather requirements and a closed set of allowed candidate garments, and may select only candidate identifiers supplied in the request.
- AI must not invent catalog entries, wardrobe items, slots, properties, or candidate identifiers.
- Every AI response must pass shared Zod validation and existing or new deterministic domain invariants before it can be displayed or persisted. Invalid or partially invalid output is never silently repaired into a different outfit.
- AI failure must not prevent the user from receiving recommendations. The final fallback is a device-local deterministic three-outfit generator built from the existing validated composition evidence.
- The deterministic three-outfit fallback is therefore a prerequisite for safely shipping AI, even though AI integration is the current product priority.
- The approved AI provider chain is OpenRouter primary, a Cloudflare Workers AI binding fallback, then device-local deterministic three-outfit generation.
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

Approved 2026-08-13. Not implemented. Today still renders the deterministic fixture, and no recommendation snapshot is persisted.

- The last valid recommendation snapshot must be persisted on-device and rendered immediately when available.
- AI must not be called on every application launch. A recommendation must be generated or refreshed only when the relevant weather snapshot is refreshed after becoming stale, the active location changes, clothing preference changes, relevant wardrobe contents or properties change, or the user explicitly requests a refresh.
- Duplicate in-flight generation requests must be coalesced, and a failed refresh must preserve the last valid recommendation.
- A successful deterministic fallback is a valid recommendation result and may replace an unavailable AI attempt according to the future implementation design.
- Transient provider or model identity must stay out of the durable domain model unless it is needed for coarse provenance or user status.
- The Worker must provide a non-AI liveness check. Worker liveness, AI configuration readiness, and an active AI provider probe are distinct. The active probe may consume provider quota, so it must be explicitly triggered, bounded, rate-limited, and briefly cached; a successful probe does not guarantee that a later full recommendation request will succeed.
- The recommendation result must record a coarse generation mode: AI-assisted or deterministic fallback.
- Today will eventually show a small accessible localized "AI-assisted" or "Standard recommendation" indicator, and Settings will eventually include an accessible localized "Check AI status" action with a manual active probe. Provider names and technical failures are not exposed to normal users.

## Dated operating assumptions

Recorded 2026-08-13. These are time-sensitive operating assumptions, not permanent architectural guarantees. Reverify each against official sources before implementation.

- The initial recurring API-cost target is approximately USD 5 per month, excluding the one-time OpenRouter credit purchase below.
- A one-time USD 10 OpenRouter credit purchase is the currently approved assumption for qualifying for OpenRouter's higher free-model request limit.
- OpenWeather's exact free-tier and paid limits must be recalculated from official current pricing during implementation rather than frozen here.
- Provider pricing, quotas, licences, model availability, and terms may change at any time.

## Approved visual identity

- The canonical approved brand and visual constraints are recorded in [`docs/design/visual-identity.md`](design/visual-identity.md). That document is the source of truth for UI, UX, themes, icons, illustrations, motion, splash screens, and other branding work.
- The approved app symbol is Balanced Horizon — V2: Unified Gap System. Its repository master is `apps/mobile/assets/brand/kuyara-symbol-master.svg`, and its locked geometry must not be silently altered.

## Future possibilities, not MVP commitments

- A remote sync adapter may later be implemented with either Supabase or Firebase, but not both in production.
- Accounts, cross-device sync, an outbox, and conflict resolution require separate product and architecture decisions.
