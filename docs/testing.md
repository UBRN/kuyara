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

The focused coverage includes strict normalized-coordinate and IANA-time-zone requests, the complete condition vocabulary, timestamp and measurement constraints, minimum/current/maximum consistency, ordered same-local-day hourly data, stable error shapes, deterministic sample output, route/method handling, malformed input, provider failure, invalid provider output, and privacy-safe responses. This does not require a Worker-runtime test framework because the foundation uses only Web APIs and injected boundaries; local Wrangler smoke testing covers the actual development runtime.

The AI v1 contract suite covers strict privacy-safe request fields, candidate and payload bounds, the full clothing-requirement union, exactly three structurally complete outfits, and health, readiness, and stable error schemas. Worker AI coverage verifies ordered provider fallback, bounded attempts and per-attempt timeout, closed-candidate-set and supported-role validation, structural rejection, and exact sanitized `ai_unavailable` exhaustion. Composition tests require Workers AI before OpenRouter and exclude the deterministic stub from production. Adapter suites cover OpenRouter structured-output requests and sanitized failures plus Workers AI binding input, response unwrapping, and abort handling. Router tests cover liveness, configuration-only readiness without provider calls, method handling, unknown routes, and unchanged weather routing.

## Mobile unit and boundary tests

The mobile workspace uses Node's built-in test runner with Node's TypeScript stripping and the checked-in path resolver. Run every current mobile test from the repository root with:

```bash
pnpm --filter @kuyara/mobile test
```

React Native component tests use Jest, `jest-expo`, React Native Testing Library 14, and the React 19-compatible `test-renderer` package. They remain separate from the Node suites and run with:

```bash
pnpm --filter @kuyara/mobile test:components
```

The component suite renders the production tab-bar presentation, localized Weather states, Wardrobe list/form states, and the profile route gate. Expo Router 57's `renderRouter` helper assumes the older synchronous Testing Library renderer, while React Native Testing Library 14 uses an asynchronous React 19 renderer. The suite therefore does not force the native route tree through that incompatible helper: it tests production controls, form behavior, confirmation boundaries, and navigation intents directly while mocking Expo Router only where native navigation state is outside the component boundary. Device-level path transitions, nested native Stack behavior, gestures, VoiceOver/TalkBack output, and platform visuals remain simulator or device verification concerns.

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

Migration tests must verify empty-database application, ordered version changes across versions 1 through 5, released-schema upgrades, idempotent re-entry, required constraints, and rollback without data deletion or version advancement. Profile data-source/repository tests cover singleton creation, concurrent initialization, row/domain mapping, explicit preference updates, atomic onboarding completion, invalid stored values, and sanitized errors. Controller tests cover loading, incomplete, completed, failure, repeated initialization, saving, and refreshed profile state.

Wardrobe persistence tests execute the production migrations through the current schema while covering the version 3 wardrobe contract: foreign-key/category/enum constraints, version 2 row preservation, rollback, UUID creation, profile isolation, explicit domain-record mapping, active list/get behavior, taxonomy and nullable-override round trips, lifecycle preservation, atomic soft deletion, missing/deleted write behavior, relative photo-path validation, bound parameters, and sanitized repository errors. Deleted rows must disappear from default reads while remaining available only through the explicit include-deleted operation.

The same focused suite validates every taxonomy enum and Zod schema, all 30 immutable canonical catalog entries, duplicate and category-shape rejection, deprecation cycles, Turkish/English localization completeness, approved clothing-preference applicability, and pure effective-garment resolution for defaults, overrides, legacy rows, and invalid data.

Wardrobe application tests additionally cover form-value mapping, catalog-derived property applicability, hidden legacy-field preservation, type-change reset behavior, UUID route validation, list loading/retry state, duplicate mutation coalescing, and confirmed-write fallback when a follow-up list read fails. RNTL tests cover localized empty/list/error states, catalog labels, create/edit validation, selected semantics, busy state, retryable save/delete failures, type-change and delete confirmation boundaries, dirty-state navigation intent, not-found recovery, and semantic light/dark rendering.

Weather tests execute migration version 4 and its rollback, validate source-specific location records, normalized coordinate keys, profile/location isolation, atomic snapshot replacement, bounded retention, exact 30-minute freshness, same-local-day hourly entries, and invalid stored data. Provider and controller tests cover network, stable service, and invalid-response classification; cacheless offline/unavailable outcomes; cached stale preservation; successful and failed retry; active-location preservation; prompt-free bootstrap; permission states; refresh coalescing; and location-switch races. The deterministic provider's success, delayed stale success, and failure paths are reproducible. RNTL covers English and Turkish offline/unavailable states, retry intent, live-region announcements, manual selection, sample disclosure, permission handling, stale notices, and hourly accessibility output.

Recommendation domain suites cover exact weather thresholds and precedence, remaining-hour behavior, immutable deterministic output, effective catalog and Wardrobe garment projection, eligibility and scoring, structural composition, requirement trade-offs, stable ordering, and meaningful three-outfit diversity. Application tests cover catalog and owned-garment recommendations, clothing preference, deleted-item exclusion, approved refresh triggers, private-field-insensitive invalidation, cache-first initialization, duplicate-request coalescing, AI failure and oversized-candidate fallback, and last-valid preservation. Data tests cover sanitized Worker AI failure classification, AI-to-domain mapping with deterministic re-validation, migration version 5 snapshot persistence, atomic replacement, lifecycle fields, and corrupt-payload errors. Shared UI primitive tests cover semantic appearance, accessibility, scaling, interaction, and minimum targets; Today tests cover real domain-shaped recommendation input, localized outfit mapping and reasons, unavailable recommendations, stale weather, accessibility labels, and semantic theme behavior.

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
