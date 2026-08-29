# Current Project Status

## Current State

- **Mobile:** Expo SDK 57, React Native, Expo Router, and Expo SQLite provide an accountless onboarding flow; Today, Weather, Wardrobe, and Settings; local Wardrobe CRUD and private photos; Turkish/English localization; and System/Light/Dark appearance.
- **Weather:** Mobile preserves the last valid snapshot, refreshes data older than 30 minutes, and reaches providers only through the Worker. The deployed chain is Open-Meteo followed by OpenWeather, with bounded attempts, runtime validation, attribution, rate limiting, and a best-effort OpenWeather daily cap. The deterministic provider is test-only.
- **Recommendations:** Deterministic weather requirements, garment evaluation, and up-to-three-outfit composition are implemented. The Worker uses Workers AI followed by OpenRouter; mobile validates and persists the result and falls back to the device-local deterministic generator. Today and Settings expose only the coarse generation mode, and Settings includes the bounded active AI probe.
- **Notifications:** N1 is complete. Schema v6 stores `notifications_opt_in`; Settings owns the permission flow and OS-settings redirect; notification taps open Today; and the test action is development-only. N2 weather-alert rules and background rescheduling are not implemented.
- **Builds:** iOS is the first release target. EAS preview and production profiles use the deployed Worker; development keeps its local Worker fallback. Shared code remains Android-compatible, but Android validation is deferred.

The MVP still has no account, cross-device sync, behavioral analytics, or server-sent push. Production WeatherKit is not implemented.

## Recently Completed

- **N1 mobile notification foundation** (`6e586e9`, 2026-08-29): local opt-in and permission handling, notification-response routing, development-only test action, and schema v6.
- **Milestone 5, real weather providers** (2026-08-29): Open-Meteo primary and OpenWeather fallback with bounded attempts, validation, attribution, and usage controls. See [ADR 0002](adr/0002-real-weather-provider-chain.md).
- **Milestone 4, AI status and limits** (2026-08-29): Worker rate limits, active AI probe, and Today/Settings generation-mode UI. See [ADR 0001](adr/0001-worker-ai-probe-and-rate-limiting.md).

Nothing is currently in progress.

## Next Approved Milestones

1. **WeatherKit integration.** Insert WeatherKit at the head of the existing Worker provider chain without changing the mobile weather domain. Apple Developer Program membership is active, so this milestone is startable.
2. **Local weather alerts (N2).** Add deterministic alert rules, local scheduling from fresh forecasts, repeat suppression, quiet hours, and best-effort background refresh. No server or push token; see [ADR 0004](adr/0004-notifications-in-the-mvp.md).

Do not combine these milestones merely for convenience. Server-sent push (N3) remains deferred and requires its own ADR.

## Known Issues and Manual Verification Gaps

- Primary tab labels truncate at the largest accessibility text size; accessible names remain complete. Adding or changing tab icons requires design approval.
- The resolved Android manifest has not been checked after blocking fine-location permission through Expo configuration.
- Real-device VoiceOver focus order and spoken grouping remain unverified for the weather card.
- N2's background execution cannot be verified on the iOS Simulator and will require a physical-device check.
- A generated local iOS project may need its own ignored `.xcode.env.local` Node path before native builds.
