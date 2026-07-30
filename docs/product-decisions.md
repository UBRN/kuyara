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

## Implemented Today mock slice

- The mobile app opens directly into a single Today route. Final product tab navigation remains deferred; Weather, Wardrobe, and Settings placeholder routes are not implemented.
- Today currently renders one typed, deterministic İstanbul fixture with a fixed retrieval time, a concise mock weather summary, localized clothing guidance, and exactly three complete outfit options in the vertical reading flow: Comfortable, Polished, and Rain-ready.
- Fixture values and language-independent weather, clothing, intent, and reason codes are separate from English and Turkish presentation copy. The fixture is a replaceable presentation input, not a WeatherKit DTO, database record, AI response, or recommendation-engine result.
- The presentation contract supports loaded, loading, unavailable, and stale-loaded states. The checked-in route intentionally renders only the canonical fresh loaded fixture and does not claim that it is live.
- The slice has no WeatherKit, Worker API, location permission, AI, wardrobe ownership, SQLite, persistence, account, sync, analytics, notification, onboarding, or refresh behavior.
- Today uses the existing semantic theme and adaptive primitives, keeps all important content in a scalable vertical layout, supplies grouped VoiceOver labels for weather and outfit summaries, and has no animation dependency, so Reduced Motion does not remove information.
- English and Turkish plus light, dark, and system appearances are supported through the existing device-language and device-appearance defaults. Persisted Settings overrides remain deferred.
- Shared React Native source remains Android-compatible, but Android build, emulator, and visual refinement are intentionally deferred for this slice.

## Approved visual identity

- The canonical approved brand and visual constraints are recorded in [`docs/design/visual-identity.md`](design/visual-identity.md). That document is the source of truth for UI, UX, themes, icons, illustrations, motion, splash screens, and other branding work.
- The approved app symbol is Balanced Horizon — V2: Unified Gap System. Its repository master is `apps/mobile/assets/brand/kuyara-symbol-master.svg`, and its locked geometry must not be silently altered.

## Future possibilities, not MVP commitments

- A remote sync adapter may later be implemented with either Supabase or Firebase, but not both in production.
- Accounts, cross-device sync, an outbox, and conflict resolution require separate product and architecture decisions.
