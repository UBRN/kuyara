# Current Project Status

## Current State

- **Mobile:** Expo SDK 57, React Native, Expo Router, and Expo SQLite provide an accountless onboarding flow; three primary tabs for Today, Weather, and Profile; Profile-hosted Wardrobe and wanted records; Settings from the Profile header; private Wardrobe photos; Turkish/English localization; and System/Light/Dark appearance.
- **Weather:** Mobile preserves the last valid snapshot, refreshes data older than 30 minutes, and reaches providers only through the Worker. The deployed chain is Open-Meteo followed by OpenWeather, with bounded attempts, runtime validation, attribution, rate limiting, and a best-effort OpenWeather daily cap. The deterministic provider is test-only.
- **Recommendations:** Deterministic weather requirements, garment evaluation, and up-to-three-outfit composition are implemented. The Worker uses Workers AI followed by OpenRouter; mobile validates and persists the result and falls back to the device-local deterministic generator. Today and Settings expose only the coarse generation mode, and Settings includes the bounded active AI probe.
- **Notifications:** N1 is complete. Schema v6 stores `notifications_opt_in`; Settings owns the permission flow and OS-settings redirect; notification taps open Today; and the test action is development-only. N2 weather-alert rules and background rescheduling are not implemented.
- **Builds:** iOS is the first release target. EAS production credentials, a production build, and an App Store Connect record (`com.ubrn.kuyara`, ASC app `6806664440`) exist; build 1.0.0 (2) is on TestFlight internal testing and was verified on a physical device against the deployed Worker. EAS preview and production profiles use the deployed Worker; development keeps its local Worker fallback. Shared code remains Android-compatible, but Android validation is deferred.

The MVP still has no account, cross-device sync, behavioral analytics, or server-sent push. Production WeatherKit is not implemented.

## Recently Completed

- **Manual refresh affordance** (2026-08-30): pull-to-refresh on Today and Weather, refreshing weather only and never triggering recommendation generation. Today gains a visible refresh button in its stretchy header and a three-state freshness line (last updated, refreshing, refresh failed) on a polite live region; Weather's existing refresh button moves below the location row. The gesture is never the only refresh path, because it is unreachable for VoiceOver and Switch Control. See [Approved manual refresh affordance](product-decisions.md#approved-manual-refresh-affordance).
- **First TestFlight path** (2026-08-30): iOS distribution credentials, production build, App Store Connect app record, and `eas submit` to TestFlight internal testing. Adds `ITSAppUsesNonExemptEncryption: false`, a localized `NSMotionUsageDescription` (CoreMotion is linked transitively by `expo-location`), and `promptToConfigurePushNotifications: false`. Verified live weather on a physical device.
- **N1 mobile notification foundation** (`6e586e9`, 2026-08-29): local opt-in and permission handling, notification-response routing, development-only test action, and schema v6.
- **Milestone 5, real weather providers** (2026-08-29): Open-Meteo primary and OpenWeather fallback with bounded attempts, validation, attribution, and usage controls. See [ADR 0002](adr/0002-real-weather-provider-chain.md).

Nothing is currently in progress.

## Next Approved Milestones

1. **M6, UI and UX revision.** The first TestFlight build reads as flat and undifferentiated: the approved palette is fine, but the design system's deferred list removed every device that separates one block of content from another. Revisit that list, then redesign the product screens on top of the restored vocabulary. It also carries the three-tab navigation of [ADR 0006](adr/0006-three-tab-information-architecture.md), because M6 already redraws these screens and shipping the navigation separately would touch them twice. Profile arrives with the Wardrobe entry point and location; the wanted list follows with the catalog revision. Presentation-layer only; no change to the weather domain, the recommendation contract, or persistence.
2. **Catalog-only recommendation revision.** Remove Wardrobe items from the existing catalog-plus-Wardrobe candidate set; add the `owned | wanted` Wardrobe state in schema v7 while preserving every row as `owned`; add the local calendar day seed; surface the wanted list inside Profile; and review whether the existing 30 garment types, their Turkish and English names, and their thermal and water-protection values are adequate. See [ADR 0005](adr/0005-catalog-only-recommendation-candidates.md) and [ADR 0006](adr/0006-three-tab-information-architecture.md).
3. **WeatherKit integration.** Insert WeatherKit at the head of the existing Worker provider chain without changing the mobile weather domain. Apple Developer Program membership is active, so this milestone is startable.
4. **Local weather alerts (N2).** Add deterministic alert rules, local scheduling from fresh forecasts, repeat suppression, quiet hours, and best-effort background refresh. No server or push token; see [ADR 0004](adr/0004-notifications-in-the-mvp.md).

Do not combine these milestones merely for convenience. Server-sent push (N3) remains deferred and requires its own ADR.

## Known Issues and Manual Verification Gaps

- Primary tab labels truncate at the largest accessibility text size; accessible names remain complete. Adding or changing tab icons requires design approval.
- The resolved Android manifest has not been checked after blocking fine-location permission through Expo configuration.
- Real-device VoiceOver focus order and spoken grouping remain unverified for the weather card.
- N2's background execution cannot be verified on the iOS Simulator and will require a physical-device check.
- A generated local iOS project may need its own ignored `.xcode.env.local` Node path before native builds.
- The AI prompt and its acceptance criteria must be rewritten for the catalog-only, stylistic-coherence job recorded in ADR 0005.
