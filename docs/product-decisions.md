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

## Current scaffold

- The repository is a pnpm workspace with an Expo SDK 57 mobile app, a Cloudflare Worker package, and a shared contracts package.
- The mobile app uses Expo Router and managed Continuous Native Generation. Native `ios/` and `android/` directories are generated only when needed and are not committed.
- Expo SDK 57 sets iOS 16.4 as the minimum supported iOS version. Android remains supported by the shared Expo project.
- The Worker has a local deterministic weather v1 foundation but no WeatherKit, AI, credential, persistence, rate-limit, deployment, or production-provider implementation.
- The contracts package contains the confirmed provider-neutral weather v1 request, success, and stable minimal error schemas.

## Implemented primary navigation

- The final main tabs are Today, Weather, Wardrobe, and Settings. Their visible paths are `/`, `/weather`, `/wardrobe`, and `/settings`; Expo Router route groups do not appear in user-visible URLs.
- The root Stack retains the device-local onboarding gate and keeps `/onboarding` outside the tab navigator. An incomplete profile cannot enter the tab group, while a completed profile opens Today by default.
- The current app uses Expo Router's stable JavaScript Tabs. SDK 57 Native Tabs remain alpha and are not used; moving to Native Tabs later requires a separate, deliberate migration decision.
- Each main tab owns a nested Stack boundary. Wardrobe create and edit screens live inside the Wardrobe Stack rather than being pushed from Today.
- Weather now provides foreground location selection and persisted sample weather at `/weather`. Wardrobe provides its first local CRUD experience at `/wardrobe`, `/wardrobe/new`, and `/wardrobe/[id]` without changing the tab or root Stack architecture.

## Implemented Today mock slice

- Today currently renders one typed, deterministic İstanbul fixture with a fixed retrieval time, a concise mock weather summary, localized clothing guidance, and exactly three complete outfit options in the vertical reading flow: Comfortable, Polished, and Rain-ready.
- Fixture values and language-independent weather, clothing, intent, and reason codes are separate from English and Turkish presentation copy. The fixture is a replaceable presentation input, not a WeatherKit DTO, database record, AI response, or recommendation-engine result.
- The presentation contract supports loaded, loading, unavailable, and stale-loaded states. The checked-in route intentionally renders only the canonical fresh loaded fixture and does not claim that it is live.
- The Today fixture still has no WeatherKit, Worker API, location permission, AI, wardrobe ownership, account, sync, analytics, notification, or refresh behavior. Its only integration with the local-profile slice is an accessible Settings navigation action and the application-wide persisted language/theme resolution.
- Today uses the existing semantic theme and adaptive primitives, keeps all important content in a scalable vertical layout, supplies grouped VoiceOver labels for weather and outfit summaries, and has no animation dependency, so Reduced Motion does not remove information.
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
- The mobile app remains wired to its existing local deterministic provider. Its Worker HTTP adapter, base URL configuration, contract-to-domain mapper, and provider switch are deferred with production WeatherKit integration.

## Approved visual identity

- The canonical approved brand and visual constraints are recorded in [`docs/design/visual-identity.md`](design/visual-identity.md). That document is the source of truth for UI, UX, themes, icons, illustrations, motion, splash screens, and other branding work.
- The approved app symbol is Balanced Horizon — V2: Unified Gap System. Its repository master is `apps/mobile/assets/brand/kuyara-symbol-master.svg`, and its locked geometry must not be silently altered.

## Future possibilities, not MVP commitments

- A remote sync adapter may later be implemented with either Supabase or Firebase, but not both in production.
- Accounts, cross-device sync, an outbox, and conflict resolution require separate product and architecture decisions.
