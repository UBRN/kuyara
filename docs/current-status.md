# Current Project Status

## Last Completed Milestone

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

- Prepare the production WeatherKit adapter behind the confirmed Worker provider boundary when Apple credentials and setup are available.

## Next Approved Milestones

1. Integrate production WeatherKit behind the Worker provider boundary after credentials and Apple Developer setup are available.
2. Design and implement the deterministic recommendation engine in separate focused milestones.

## Known Issues or Blockers

- The Worker foundation, remote development deployment, and mobile adapter have no implementation blocker; the local and remote development endpoints intentionally serve only sample data.
- Production WeatherKit work cannot begin until credentials and Apple Developer setup are available. The provider, contract, and mobile adapter boundaries are ready, while the app intentionally continues to use local sample weather.
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
