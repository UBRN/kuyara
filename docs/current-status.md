# Current Project Status

## Last Completed Milestone

The first deterministic weather-to-clothing requirement milestone was completed on 2026-08-01. A pure provider-independent mobile domain function now converts validated current and remaining-hour weather into immutable mandatory and optional thermal, coverage, breathability, wind, water, and traction requirements with language-independent reason codes. Past daily extrema do not escalate current requirements when remaining-hour coverage exists; daily min/max retain the wide-range reason and a documented no-future-hour fallback. The slice selects no garments, Wardrobe items, layers, slots, accessories, or outfits.

The mobile Weather resilience slice was completed on 2026-08-01. The provider-neutral mobile boundary now distinguishes network, service, and invalid-response failures; Weather presents cacheless network failures as offline and other provider failures as unavailable, while cached stale weather and the active location remain intact. Successful retry clears the failure, and Turkish/English accessible notices preserve the sample-data disclosure.

The deterministic sample Weather Worker was deployed to a controlled Cloudflare development Worker on 2026-08-01. `kuyara-weather-dev` is available at `https://kuyara-weather-dev.ubarin08.workers.dev`; remote contract smoke tests returned 200 for a valid request, 400 for an invalid request, 405 for a wrong method, and 404 for a wrong route. Deployment version `8c0b59cd-bdaa-4dcb-a903-3c41839f5ec2` has no bindings or secrets, observability is disabled, and no WeatherKit credential or production provider is present.

The mobile Worker weather adapter was completed on 2026-08-01. Mobile development now calls the local `POST /v1/weather` sample endpoint through shared Zod contracts, maps responses into the existing local snapshot model while retaining local location identity, and preserves the established SQLite cache-first and failure behavior.

The Cloudflare Worker foundation and versioned weather v1 contract were completed on 2026-08-01. `POST /v1/weather` validates normalized coordinates and IANA time zones through shared Zod contracts, uses an injected provider-neutral boundary and explicit API mapper, and serves deterministic sample data locally with stable sanitized errors.

The Wardrobe list navigation regression was corrected on 2026-08-01. Add and edit actions now use the documented absolute Wardrobe routes, with focused route-level regression coverage.

The minimal local Maestro foundation was completed on 2026-08-01. It adds the current official local CLI workflow, repository-local configuration, and two independently reset iOS Simulator flows covering onboarding and persisted preference updates.

The last completed product milestone is the device-local weather foundation (`dcb39ae`, 2026-07-30). It added foreground-only location selection, normalized approximate device coordinates, persisted local weather snapshots, bounded stale-cache behavior, and a deterministic sample provider. Production WeatherKit is not integrated.

The repository-scoped `kuyara-next-goal` Skill was completed and validated on 2026-08-01. It provides bounded Propose, Execute, and Review workflows grounded in the current repository state.

## Implemented Capabilities

- A device-local profile, accountless onboarding, and persisted language, theme, and clothing preference.
- Primary Today, Weather, Wardrobe, and Settings tabs.
- Local-first Wardrobe persistence and CRUD, including soft deletion and catalog-backed garment properties.
- A private, single-photo Wardrobe lifecycle covering system-library selection, resize/compression, relative-path persistence, replacement, removal, and safe cleanup.
- Foreground-only manual or device location selection with localized permission handling.
- Device-local weather snapshots with exact 30-minute freshness behavior, stale-data preservation, manual refresh, and deterministic sample data fetched from the local Worker.
- A versioned Worker weather endpoint with shared runtime contracts, deterministic local mock data, and privacy-safe error handling.
- A controlled `workers.dev` deployment of the deterministic sample endpoint for explicit remote development use.
- A mobile HTTP weather provider with environment-aware Worker origins, runtime response validation, and explicit contract-to-domain mapping.
- Provider-independent mobile weather failure classification with localized offline/unavailable states, retry, and last-known-good preservation.
- Deterministic provider-independent conversion from validated weather snapshots into structured clothing-property requirements, with tested boundary, conflict, precedence, and remaining-hour behavior.
- Turkish and English presentation plus System, Light, and Dark appearance preferences.

Weather uses the local Worker's deterministic sample endpoint by default in development. Developers may explicitly select the remote development sample URL; production mobile configuration does not use it. The Today screen remains a deterministic mock experience, and neither it nor Weather uses production WeatherKit or a completed recommendation engine.

## Development Environment

- Kuyara is an Expo SDK 57, React Native, and TypeScript pnpm workspace with `apps/mobile`, `apps/worker`, and `packages/contracts`.
- iOS is the first release target. Shared code and Expo configuration must keep Android buildable, while Android-specific feature work remains deferred.
- Codex is updated and healthy. Expo MCP is configured.
- XcodeBuildMCP is installed through Homebrew, configured for Codex, and has been verified through a successful iPhone Simulator build and launch.
- The generated local iOS project is not tracked. Its machine-local `apps/mobile/ios/.xcode.env.local` selects `/opt/homebrew/opt/node@24/bin/node`; the file is covered by the ignored generated `ios/` directory.
- Built-in Codex Memories are enabled. No separate Memory MCP is required.
- `AGENTS.md` contains the repository's efficient-execution rules and risk-proportionate validation strategy.
- `.agents/skills/kuyara-next-goal/SKILL.md` contains the repository-scoped workflow for selecting, executing, and reviewing Goals.
- The development-only Worker is named `kuyara-weather-dev` and uses its assigned `workers.dev` URL. The deployment has no bindings, secrets, credentials, persistence, analytics, custom domain, or production WeatherKit access.

## Current Focus

- Continue the deterministic recommendation engine in separate Apple-independent milestones, next by matching structured clothing requirements against canonical effective garment properties without composing complete outfits.

## Next Approved Milestones

1. Design and implement requirement-to-effective-garment eligibility and scoring as a separate focused deterministic milestone, without complete outfit composition.
2. Integrate the resulting local recommendation flow with Today in a later focused milestone.
3. Return to production WeatherKit behind the existing Worker provider boundary only after Apple Developer enrollment is available and the user explicitly lifts the temporary constraint.

## Known Issues or Blockers

- The Worker foundation, remote development deployment, and mobile adapter have no implementation blocker; the local and remote development endpoints intentionally serve only sample data.
- Apple Developer enrollment is pending. Production WeatherKit and credential work, TestFlight, App Store Connect and production release operations, and other membership-dependent work are paused until the user explicitly lifts the constraint. This is temporary and does not cancel WeatherKit or the iOS-first direction.
- The provider, contract, and mobile adapter boundaries are ready, and the app intentionally continues to use only deterministic sample weather. Apple-independent development, tests, Simulator work, and release preparation remain unblocked.
- The generated iOS project depends on a machine-local Node path. A newly generated local project may need its own ignored `.xcode.env.local` before native builds.

## Deferred Scope

- Accounts and cross-device synchronization.
- Analytics and notifications.
- Production AI integration.
- App Store submission.
- Android-specific feature development.
- Maestro Cloud and CI integration.
- Production WeatherKit credentials.
- Broad E2E coverage.

## How to Continue

For each new Codex session:

1. Read `AGENTS.md`.
2. Read this document.
3. Read only the documentation relevant to the current milestone.
4. Inspect Git status before making changes.
5. Avoid repeating already completed environment setup; verify only what the active milestone requires.
