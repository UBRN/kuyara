# kuyara testing conventions

## Apple Developer Program

The [Apple Developer Program](../AGENTS.md#apple-developer-program) section governs release-facing validation; weather integration tests use deterministic providers and fixed raw-response fixtures rather than live external weather calls.

## Repository and configuration checks

Run commands from the repository root unless a different directory is stated. The aggregate check covers lint, TypeScript, every workspace Node test suite, and the Worker bundle:

```bash
pnpm check
```

Run focused repository checks with `pnpm run lint`, `pnpm run typecheck`, or `pnpm test`. The mobile Jest component suite is separate from `pnpm check`:

```bash
pnpm --filter @kuyara/mobile test:components
```

Inspect the resolved public Expo configuration from the repository root:

```bash
pnpm --filter @kuyara/mobile exec expo config --type public --json
```

Run Expo Doctor from `apps/mobile`:

```bash
pnpm dlx expo-doctor@latest
```

Verify the Worker bundle without deployment:

```bash
pnpm --filter @kuyara/worker bundle
```

Start the local Worker when runtime verification is needed, then stop it after the check:

```bash
pnpm --filter @kuyara/worker dev --port 8788
```

Start the mobile development server from the repository root with:

```bash
pnpm --filter @kuyara/mobile start
```

For a local iOS Simulator smoke test, start Metro and stop it with Ctrl+C after verification:

```bash
pnpm --filter @kuyara/mobile exec expo start --ios --port 8082
```

## Shared contract and Worker tests

The weather v1 schemas and invariant checks use Node 24's built-in test runner. Run them from the repository root with:

```bash
pnpm --filter @kuyara/contracts test
```

The Worker suite calls the production request handler directly with Web-standard `Request` and `Response` objects and injected providers:

```bash
pnpm --filter @kuyara/worker test
```

The focused coverage includes strict normalized-coordinate and IANA-time-zone requests, weather invariants, stable error shapes, route/method handling, and privacy-safe responses. Real-provider suites cover WeatherKit, Open-Meteo, and OpenWeather raw validation, unit/condition mapping, eligible ordered fallback, bounded timeouts, attribution, rate limiting, and the best-effort OpenWeather daily cap; the deterministic provider remains an injected test double. WeatherKit's suite also covers the raw-response condition-code mapping, asserting all 34 codes resolve in both Apple's PascalCase REST spelling and the camelCase Swift `WeatherCondition` case names. Local Wrangler smoke testing covers the actual development runtime.

The AI v1 contract suite covers strict privacy-safe request fields, candidate and payload bounds, exactly three structurally complete outfits, and health, readiness, probe, rate-limit, and stable error schemas. Worker coverage verifies ordered provider fallback, bounded attempts and timeouts, structural and closed-candidate-set validation, sanitized exhaustion, active-probe method handling and caching, per-IP limits, and the KV daily cap. Composition tests require Workers AI before OpenRouter and exclude the deterministic stub from production.

## Mobile unit and boundary tests

The mobile workspace uses Node's built-in test runner with Node's TypeScript stripping and the checked-in path resolver. Run every current mobile test from the repository root with:

```bash
pnpm --filter @kuyara/mobile test
```

React Native component tests use Jest, `jest-expo`, React Native Testing Library 14, and the React 19-compatible `test-renderer` package. They remain separate from the Node suites and run with:

```bash
pnpm --filter @kuyara/mobile test:components
```

The component suite covers the production tab bar, localized Weather and Wardrobe states, the profile route gate, Today/Settings generation-mode surfaces, the AI probe flow, and notification Settings. The approved three-tab Profile navigation requires corresponding component coverage when implemented; no such coverage is claimed yet. Expo Router 57's `renderRouter` helper assumes an older synchronous renderer, so tests exercise production controls and navigation intents directly while mocking only native navigation state. Device-level transitions, gestures, VoiceOver/TalkBack output, notification delivery, and platform visuals remain simulator or device verification concerns.

Run the focused local-profile persistence suite with:

```bash
pnpm --filter @kuyara/mobile test:profile
```

Run the focused wardrobe application, persistence, catalog, and migration suite with:

```bash
pnpm --filter @kuyara/mobile test:wardrobe
```

Run the focused location, weather persistence, provider, and controller suite with:

```bash
pnpm --filter @kuyara/mobile test:weather
```

The profile migration and data-source tests use Node 24's built-in in-memory SQLite implementation through a test-only adapter for the small project-owned executor contract. This executes the production migration SQL, constraints, parameterized writes, transaction rollback, and repository mappings without mocking SQL statements or importing the Expo native module into Node.

Production still opens Expo SQLite on device. The Node adapter is test infrastructure only and must not become an application persistence implementation.

Migration tests verify empty-database application, ordered version changes across versions 1 through 6, released-schema upgrades, idempotent re-entry, required constraints, and rollback without data deletion or version advancement. Profile tests include the schema v6 notification opt-in default, persistence, mapping, and preference propagation alongside the existing profile lifecycle coverage.

Wardrobe persistence tests execute the production migrations through the current schema while covering the version 3 wardrobe contract: foreign-key/category/enum constraints, version 2 row preservation, rollback, UUID creation, profile isolation, explicit domain-record mapping, active list/get behavior, taxonomy and nullable-override round trips, lifecycle preservation, atomic soft deletion, missing/deleted write behavior, relative photo-path validation, bound parameters, and sanitized repository errors. Deleted rows must disappear from default reads while remaining available only through the explicit include-deleted operation.

The same focused suite validates every taxonomy enum and Zod schema, all 30 immutable canonical catalog entries, duplicate and category-shape rejection, deprecation cycles, Turkish/English localization completeness, approved clothing-preference applicability, and pure effective-garment resolution for defaults, overrides, legacy rows, and invalid data.

Wardrobe application tests additionally cover form-value mapping, catalog-derived property applicability, hidden legacy-field preservation, type-change reset behavior, UUID route validation, list loading/retry state, duplicate mutation coalescing, and confirmed-write fallback when a follow-up list read fails. RNTL tests cover localized empty/list/error states, catalog labels, create/edit validation, selected semantics, busy state, retryable save/delete failures, type-change and delete confirmation boundaries, dirty-state navigation intent, not-found recovery, and semantic light/dark rendering.

Weather tests execute migration version 4 and its rollback, validate location/snapshot persistence, exact 30-minute freshness, bounded future-clock tolerance, and invalid stored data. Provider and controller tests cover failure classification, cache preservation, retries, permissions, refresh coalescing, location races, contract mapping, and source attribution. RNTL covers English and Turkish failure states, retry intent, live-region announcements, manual selection, source disclosure, permissions, stale notices, and hourly accessibility output.

Recommendation suites cover deterministic requirements, garment evaluation, composition, diversity, approved refresh triggers, coalescing, AI validation/fallback, and migration version 5 snapshot persistence. Today tests cover real domain-shaped recommendations and the coarse generation-mode indicator; Settings tests cover sanitized probe states and Reduced Motion. Notification tests cover the adapter/application boundary, permission and opt-in behavior, and localized accessible Settings states.

Presentation tests should focus on pure onboarding/route decisions, localization completeness, accessibility contracts, navigation intents, and source boundaries. Simulator verification remains required for genuine persistence across termination/relaunch, complete navigation behavior, native accessibility output, Dynamic Type, appearances, Reduced Motion, and visual regressions.

## Local iOS end-to-end flows

The repository contains two critical local Maestro flows in `.maestro/flows`:

- fresh-install onboarding;
- fresh-install onboarding followed by updating and relaunch-verifying clothing, language, and theme preferences.

Both flows clear the application state at the start, run independently, and use the app's stable accessibility identifiers. They intentionally exclude Android, cloud execution, CI, screenshots, system permission permutations, and broad regression coverage.

### Prerequisites

- Install the current official Maestro CLI on macOS:

  ```bash
  brew tap mobile-dev-inc/tap
  brew install mobile-dev-inc/tap/maestro
  ```

- Start an iPhone Simulator containing the local `com.ubrn.kuyara` development build.
- Start Metro if the installed development build is not already connected to a running bundler:

  ```bash
  pnpm --filter @kuyara/mobile exec expo start
  ```

### Run

From the repository root:

```bash
pnpm e2e:ios
```

Maestro reads `.maestro/config.yaml` and executes the two local flows. Each run removes Kuyara's Simulator data because the flows launch with `clearState: true`; do not use a Simulator whose local app data must be preserved.
