# Current Project Status

## Recently Completed Milestones

Keep only the most recent two or three completed milestones here. Older entries stay in Git history; this document describes the current state, not the full changelog.

An external-audit remediation pass was completed on 2026-08-13. It closed nine confirmed findings and one documentation conflict without changing architecture, adding a dependency, or altering visual design. The weather Worker provider is no longer constructed during module evaluation, so a missing production Worker URL now produces the existing localized unavailable state inside Weather instead of preventing the whole application from starting. Worker requests are bounded by a 10-second `AbortController` timeout covering both the response and its body, classified as the existing network failure. The weather persistence mapper now projects domain measurements explicitly, so `WeatherSnapshot.current` no longer carries `localProfileId` and other persistence metadata at runtime. The Today weather card exposes three semantic accessibility groups instead of one card-wide node, so wind, humidity, UV, sunrise, sunset, and the rain outlook are reachable by screen reader; the decorative glyph is hidden. The Today settings control and the Weather location control keep their intended visual size but reach the 44-point touch target through `hitSlop`. Weather metric values use localized formatters, so Turkish renders `m/sn` and a leading percent sign. Profile preference mutations serialize instead of coalescing, so a second distinct intent is no longer silently dropped. `ACCESS_FINE_LOCATION` was removed from the Android `permissions` array, leaving it blocked. Deleting a Wardrobe item now clears the stored photo path and removes the managed private file after the confirmed database write, aligning the implementation with `AGENTS.md`; `docs/architecture.md` was corrected accordingly and no restore flow was built. `docs/design/design-system.md` no longer carries a stale milestone inventory. Validation covered `pnpm check` and the separate component suite. The resolved Android manifest was not verified because `expo-location`'s config plugin re-adds the permission and only prebuild applies `blockedPermissions`; Simulator and physical-device accessibility verification were not performed in this pass.

The shared stretchy-header presentation slice was completed on 2026-08-03. Loaded Today and the ready Wardrobe list now share one feature-independent Reanimated primitive that measures the current top safe area, reserves compact overlay clearance, and stretches only its semantic background during native negative overscroll. The background reaches the top edge at exactly the measured inset, clamps further visual expansion, and returns through native scroll physics; text, controls, accessibility frames, and list virtualization remain unchanged. Wardrobe retains React Native FlatList, and no dependency, route, localization, persistence, domain, recommendation, or provider behavior was added. Automated coverage and native Release validation on the approved iPhone 17 iOS 26.5 Simulator covered its Dynamic Island inset, compact and stretched states, positive scrolling, Today and empty/populated Wardrobe content, pull-to-refresh, English and Turkish, light and dark appearances, accessibility text, Reduce Motion, and the runtime accessibility hierarchy. An actual VoiceOver session was unavailable because that Simulator environment does not expose the required control; the app's existing portrait-only configuration also prevents a live landscape layout, while changing inset values and remeasurement are covered by component tests.

The deterministic one-outfit composition milestone was completed on 2026-08-01. A pure mobile domain function now consumes `ClothingRequirements` and evaluated effective garment candidates to return one immutable complete outfit or a structured failure. It supports separates or one-piece body cores, required footwear, optional maximum-one mid and outer layers, runtime role assignment, unique candidate use, collective thermal/breathability/coverage evaluation, authoritative outerwear and footwear protection, bounded outfit penalties, source-neutral catalog/Wardrobe treatment, and stable composition ordering. Mandatory protective outer layers can produce an explicit penalized `breathability_protection_tradeoff` when the non-protective core remains breathable; protection is never weakened and a deficient core still fails. No UI or three-outfit diversity behavior was added.

## Implemented Capabilities

- A device-local profile, accountless onboarding, and persisted language, theme, and clothing preference.
- Primary Today, Weather, Wardrobe, and Settings tabs.
- Local-first Wardrobe persistence and CRUD, including soft deletion and catalog-backed garment properties.
- A private, single-photo Wardrobe lifecycle covering system-library selection, resize/compression, relative-path persistence, replacement, removal, and safe cleanup, including private-file deletion when the owning item is deleted.
- Foreground-only manual or device location selection with localized permission handling.
- Device-local weather snapshots with exact 30-minute freshness behavior, stale-data preservation, manual refresh, and deterministic sample data fetched from the local Worker.
- A versioned Worker weather endpoint with shared runtime contracts, deterministic local mock data, and privacy-safe error handling.
- A controlled `workers.dev` deployment of the deterministic sample endpoint for explicit remote development use.
- A mobile HTTP weather provider with environment-aware Worker origins, runtime response validation, and explicit contract-to-domain mapping.
- Provider-independent mobile weather failure classification with localized offline/unavailable states, retry, and last-known-good preservation.
- Deterministic provider-independent conversion from validated weather snapshots into structured clothing-property requirements, with tested boundary, conflict, precedence, and remaining-hour behavior.
- Pure catalog/Wardrobe effective-property projection and deterministic per-garment eligibility, requirement evaluation, bounded scoring, over-protection penalties, and stable tie behavior.
- Pure one-outfit composition with separates/one-piece branches, runtime roles, collective mandatory validation, targeted protection authority, explicit protection-versus-breathability trade-offs, bounded scoring, deterministic ordering, and structured failures.
- Turkish and English presentation plus System, Light, and Dark appearance preferences.

Weather uses the local Worker's deterministic sample endpoint by default in development. Developers may explicitly select the remote development sample URL; production mobile configuration does not use it. Three-outfit diversity and the deterministic Today integration are now implemented: Today consumes the domain recommendation rules through a pure `recommendOutfits` use case and renders real composed outfits instead of a fixture. Production WeatherKit is still not implemented. Nothing from the approved AI-first strategy is implemented either: the repository contains no real weather provider, no AI provider, no shared AI contract, no Worker AI route, no liveness, readiness, or probe endpoint, and no recommendation persistence. The recommendation is recomputed in memory on each relevant change and is not persisted, so it does not survive a cold start without a weather snapshot.

## In Progress

A mobile UI redesign is checked in on `main` as explicit work in progress (`9a693b6`, 2026-08-04, committed as `wip(mobile): redesign onboarding/settings/today/wardrobe/weather UI`). It is not a completed milestone. Its author landed it deliberately unfinished on top of the isolated onboarding/settings safe-area spacing fix (`adbbba7`), which is complete on its own.

The change adds `Pill` and `PhotoPlaceholder` shared primitives with their `resolvePillColors` contract, an eyebrow typography style, and a `withAlpha` theme helper in `apps/mobile/src/theme/color-alpha.ts`. Today replaces `weather-summary.tsx` with a new weather card and weather glyph and gains an outfit detail screen behind the new `(tabs)/(today)/[id].tsx` route. The resulting visual language is then applied across onboarding, settings, the Wardrobe list and item form, Weather, and the primary tab bar, with extended localization messages. Theme, primitive, Today, Wardrobe, and Weather test files were updated in the same commit.

No data source, persistence, migration, domain, recommendation, provider, or route-architecture behavior changed. The new outfit detail route still reads the existing deterministic `canonicalTodayScreenState` fixture, so Today remains a mock experience.

The commit does not claim completed visual-identity conformance, accessibility definition-of-done, Turkish/English and light/dark verification, or Simulator validation. Do not assume them, and do not record this work as complete until they are performed. Verify the result against [`design/visual-identity.md`](design/visual-identity.md) before building further presentation work on top of it.

## Development Environment

- Kuyara is an Expo SDK 57, React Native, and TypeScript pnpm workspace with `apps/mobile`, `apps/worker`, and `packages/contracts`.
- iOS is the first release target. Shared code and Expo configuration must keep Android buildable, while Android-specific feature work remains deferred.
- Codex is updated and healthy. Expo MCP is configured.
- XcodeBuildMCP is installed through Homebrew, configured for Codex, and has been verified through a successful iPhone Simulator build and launch.
- The generated local iOS project is not tracked. Its machine-local `apps/mobile/ios/.xcode.env.local` selects `/opt/homebrew/opt/node@24/bin/node`; the file is covered by the ignored generated `ios/` directory.
- Built-in Codex Memories are enabled. No separate Memory MCP is required.
- `AGENTS.md` contains the repository's efficient-execution rules and risk-proportionate validation strategy. `CLAUDE.md` only imports it, so the rules keep a single source.
- `.agents/skills/kuyara-next-goal/SKILL.md` is the single source for the repository-scoped workflow that selects, executes, and reviews Goals. `.claude/skills/kuyara-next-goal` is a relative symlink to that directory so Claude Code discovers the same skill; do not copy the file.
- On 2026-08-09 the mobile `test` script moved from a hand-listed file set to Node's `src/**/*.test.mjs` glob discovery (`f780498`). Hand-listing had silently dropped `wardrobe-application.test.mjs`, so its 12 tests had never executed; the focused `test:wardrobe` script now includes it. The same change added a root `pnpm test` script and wired it into `pnpm check`, which previously ran lint, typecheck, and the Worker bundle but no tests. This was a test-discovery and verification fix, not a product milestone.
- The development-only Worker is named `kuyara-weather-dev` and uses its assigned `workers.dev` URL. The deployment has no bindings, secrets, credentials, persistence, analytics, custom domain, or production WeatherKit access.

## Current Focus

Kuyara's approved direction is AI-first: AI generates three complete outfits from a closed candidate set, with a device-local deterministic three-outfit generator as the final fallback. The full approved strategy — provider chains, privacy boundary, spend controls, caching, and status behavior — is recorded in [`product-decisions.md`](product-decisions.md). None of it is implemented yet.

- The next Goal is deterministic three-outfit generation and meaningful diversity, built from the existing validated one-outfit composition evidence.
- It comes first because it is the minimum safety prerequisite for AI: AI failure must never leave the user without a recommendation.
- Do not add provider, Worker, persistence, Today, or UI integration to that Goal.

## Next Approved Milestones

1. ~~**Deterministic three-outfit generation and diversity.**~~ Completed on 2026-08-13 as `composeOutfits`, which selects up to three meaningfully different outfits from the sorted valid compositions. Meaningfully different means a different body core, or at least two candidate keys present in one outfit and absent from the other; fewer than three are returned rather than padding with a near-duplicate.
2. **Provider-neutral AI recommendation contracts and Worker orchestration.** Split into two Goals, mirroring the existing precedent where the Worker weather v1 foundation and the real mobile adapter were separate milestones:
   - **2a — contracts and orchestration.** Sanitized request and structured response contracts, the Worker route and orchestration, a deterministic in-Worker stub provider, the runtime validation and deterministic domain validation boundary, bounded attempts, sanitized failures, plus liveness and configuration-readiness design. Out of scope: real provider credentials, Today UI, recommendation persistence.
   - **2b — real AI provider adapters.** OpenRouter primary adapter, Cloudflare Workers AI binding fallback, and the explicitly triggered active probe. Out of scope: Today UI and recommendation persistence.
3. **Mobile recommendation application and persistence flow.** Worker client boundary, device-local recommendation snapshot, refresh and invalidation rules, and the device-local deterministic fallback. Out of scope: broad UI redesign.
4. **Today and Settings integration.** Partially completed out of order on 2026-08-13: the Today fixture was replaced by the real deterministic recommendation flow, which `AGENTS.md` treats as the prerequisite for shipping AI at all. Still outstanding for this milestone: surfacing the coarse generation-mode status once a second mode exists, the manual AI status probe surface, and re-checking Today against the unfinished UI redesign recorded under In Progress. Milestone 3's persistence work will replace Today's in-memory recomputation.
5. **Real weather provider chain.** Open-Meteo primary, OpenWeather fallback, controlled attribution metadata, and rate, quota, timeout, budget, and fallback behavior. Mobile last-known-good behavior and the exact 30-minute freshness boundary must not change.
6. **WeatherKit integration**, after Apple Developer Program access becomes available and the user explicitly lifts the temporary constraint. Insert WeatherKit at the head of the established provider chain without changing the mobile weather domain.

A milestone may be split further if repository evidence shows it cannot be safely reviewed or tested as one Goal. Do not combine milestones for convenience.

## Known Issues or Blockers

- The in-progress UI redesign described above is unfinished by its author's own commit message. The 2026-08-13 remediation pass closed two specific accessibility defects in it — the sub-44-point touch targets and the card-wide weather accessibility node — but this does not complete its accessibility definition of done. Its visual-identity conformance, full accessibility review, appearance, and Simulator verification status remains unknown.
- The Android `permissions` array no longer requests `ACCESS_FINE_LOCATION`, but `expo-location`'s config plugin still adds it and only prebuild applies `blockedPermissions`. The resolved AndroidManifest has not been verified; confirm it during the deferred Android validation.
- Physical-device accessibility verification is still outstanding for the weather card: real VoiceOver focus order and spoken grouping cannot be confirmed by component tests or the Simulator.
- The Worker foundation, remote development deployment, and mobile adapter have no implementation blocker; the local and remote development endpoints currently serve only sample data.
- Apple Developer enrollment is pending. Production WeatherKit and credential work, TestFlight, App Store Connect and production release operations, and other membership-dependent work are paused until the user explicitly lifts the constraint. This is temporary and does not cancel WeatherKit or the iOS-first direction.
- The provider, contract, and mobile adapter boundaries are ready, and the app still uses only deterministic sample weather. That is current state rather than a constraint: real Apple-independent providers are approved and sequenced as milestone 5. Apple-independent development, tests, Simulator work, and release preparation remain unblocked.
- The generated iOS project depends on a machine-local Node path. A newly generated local project may need its own ignored `.xcode.env.local` before native builds.

## Deferred Scope

- Accounts and cross-device synchronization.
- Analytics and notifications.
- App Store submission.
- Android-specific feature development.
- Maestro Cloud and CI integration.
- Production WeatherKit credentials.
- Broad E2E coverage.

## How to Continue

For each new agent session:

1. Read `AGENTS.md`.
2. Read this document.
3. Read only the documentation relevant to the current milestone.
4. Inspect Git status before making changes.
5. Avoid repeating already completed environment setup; verify only what the active milestone requires.
