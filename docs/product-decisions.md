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

- The mobile app opens Today only after the device-local onboarding gate is complete. Final product tab navigation remains deferred; Weather and Wardrobe routes are not implemented, and Settings is a normal pushed route rather than a tab.
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
- Completing onboarding atomically stores the three preferences and completion state, then the local route gate replaces onboarding with Today.
- Settings is reachable from Today and persists clothing, language, and appearance changes immediately. The existing localization and semantic theme providers consume the saved preferences, so successful changes update visible UI without an app reload.
- The slice adds no account, authentication, remote profile, synchronization engine, analytics, notifications, location permission, WeatherKit, Worker request, AI, wardrobe persistence, or final tab navigation.

## Approved visual identity

- The canonical approved brand and visual constraints are recorded in [`docs/design/visual-identity.md`](design/visual-identity.md). That document is the source of truth for UI, UX, themes, icons, illustrations, motion, splash screens, and other branding work.
- The approved app symbol is Balanced Horizon — V2: Unified Gap System. Its repository master is `apps/mobile/assets/brand/kuyara-symbol-master.svg`, and its locked geometry must not be silently altered.

## Future possibilities, not MVP commitments

- A remote sync adapter may later be implemented with either Supabase or Firebase, but not both in production.
- Accounts, cross-device sync, an outbox, and conflict resolution require separate product and architecture decisions.
