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
- The Worker currently has no WeatherKit, AI, credential, persistence, rate-limit, or production API implementation.
- The contracts package intentionally contains no request/response schemas until an API contract is confirmed.

## Implemented primary navigation

- The final main tabs are Today, Weather, Wardrobe, and Settings. Their visible paths are `/`, `/weather`, `/wardrobe`, and `/settings`; Expo Router route groups do not appear in user-visible URLs.
- The root Stack retains the device-local onboarding gate and keeps `/onboarding` outside the tab navigator. An incomplete profile cannot enter the tab group, while a completed profile opens Today by default.
- The current app uses Expo Router's stable JavaScript Tabs. SDK 57 Native Tabs remain alpha and are not used; moving to Native Tabs later requires a separate, deliberate migration decision.
- Each main tab owns a nested Stack boundary. Future Wardrobe create and edit screens will live inside the Wardrobe Stack rather than being pushed from Today.
- Weather and Wardrobe currently contain only short localized placeholder screens. No live weather behavior or Wardrobe CRUD interface is implemented by the navigation foundation.

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
- The version 2 slice itself added no Wardrobe screen, navigation, application context, global state, catalog, recommendation engine, WeatherKit, AI, account, authentication, synchronization, outbox, or conflict-resolution behavior.

## Implemented clothing taxonomy and wardrobe schema version 3

- The bundled version 1 garment catalog defines the 30 canonical types, structural categories, weather-relevant default properties, stable localization keys, and deprecation metadata specified in [`clothing-taxonomy.md`](clothing-taxonomy.md). Zod schemas and TypeScript types derive from the same readonly value sources.
- Catalog applicability filters only general catalog suggestions. It is not biological sex and never hides, invalidates, deletes, or excludes a valid item the user already owns or deliberately adds to the Wardrobe.
- `blouse`, `skirt`, and `dress` apply to the `womens` catalog preference. Every other canonical type, including `jumpsuit`, applies to both `womens` and `mens`.
- SQLite migration version 3 preserves every version 2 field and row while adding a nullable canonical type reference, canonical color family, and seven explicit property-override columns. Legacy rows remain unclassified until the user chooses a type; migration never infers one.
- Catalog defaults remain bundled code rather than duplicated SQLite data. A pure effective-garment resolver uses an explicit item override when present and otherwise the current catalog default; legacy, resolved, and invalid-data outcomes remain distinct.
- The taxonomy foundation adds no Wardrobe UI, recommendation algorithm, weather threshold, provider contract, WeatherKit integration, AI, authentication, remote catalog, or sync behavior.

## Approved visual identity

- The canonical approved brand and visual constraints are recorded in [`docs/design/visual-identity.md`](design/visual-identity.md). That document is the source of truth for UI, UX, themes, icons, illustrations, motion, splash screens, and other branding work.
- The approved app symbol is Balanced Horizon — V2: Unified Gap System. Its repository master is `apps/mobile/assets/brand/kuyara-symbol-master.svg`, and its locked geometry must not be silently altered.

## Future possibilities, not MVP commitments

- A remote sync adapter may later be implemented with either Supabase or Firebase, but not both in production.
- Accounts, cross-device sync, an outbox, and conflict resolution require separate product and architecture decisions.
