# Current Project Status

## Last Completed Milestone

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
- Device-local weather snapshots with exact 30-minute freshness behavior, stale-data preservation, manual refresh, and deterministic sample data.
- Turkish and English presentation plus System, Light, and Dark appearance preferences.

Weather currently uses the local deterministic sample-provider path. The Today screen remains a deterministic mock experience; neither it nor Weather uses production WeatherKit or a completed recommendation engine.

## Development Environment

- Kuyara is an Expo SDK 57, React Native, and TypeScript pnpm workspace with `apps/mobile`, `apps/worker`, and `packages/contracts`.
- iOS is the first release target. Shared code and Expo configuration must keep Android buildable, while Android-specific feature work remains deferred.
- Codex is updated and healthy. Expo MCP is configured.
- XcodeBuildMCP is installed through Homebrew, configured for Codex, and has been verified through a successful iPhone Simulator build and launch.
- The generated local iOS project is not tracked. Its machine-local `apps/mobile/ios/.xcode.env.local` selects `/opt/homebrew/opt/node@24/bin/node`; the file is covered by the ignored generated `ios/` directory.
- Built-in Codex Memories are enabled. No separate Memory MCP is required.
- `AGENTS.md` contains the repository's efficient-execution rules and risk-proportionate validation strategy.
- `.agents/skills/kuyara-next-goal/SKILL.md` contains the repository-scoped workflow for selecting, executing, and reviewing Goals.

## Current Focus

- Plan the Cloudflare Worker foundation and versioned weather contract.

## Next Approved Milestones

1. Plan and implement the Cloudflare Worker foundation and versioned weather contract.
2. Integrate production WeatherKit later, after credentials and provider boundaries are ready.
3. Design and implement the deterministic recommendation engine in separate focused milestones.

## Known Issues or Blockers

- No known blocker prevents the next approved milestone.
- The Worker currently exposes no production weather API, and `packages/contracts` has no confirmed weather request/response contract.
- Production WeatherKit work cannot begin until credentials and the Worker/provider boundaries are ready; the app intentionally continues to use sample weather.
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
