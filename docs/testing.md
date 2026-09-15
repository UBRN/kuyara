# kuyara testing conventions

## Apple Developer Program

The [Apple Developer Program](../AGENTS.md#release-operations) section governs release-facing validation; weather integration tests use deterministic providers and fixed raw-response fixtures rather than live external weather calls.

## Repository and configuration checks

Run commands from the repository root unless a different directory is stated. The aggregate check covers lint, TypeScript, every workspace Node test suite, and the Worker bundle:

```bash
pnpm check
```

Run focused repository checks with `pnpm run lint`, `pnpm run typecheck`, or `pnpm test`. The mobile
typecheck depends on the git-ignored `expo-env.d.ts` and `.expo/types/router.d.ts`, which `expo start`
writes; on a fresh checkout with no dev server run, generate them first with
`pnpm --filter @kuyara/mobile exec expo customize tsconfig.json`, which is what CI does. The mobile Jest
component suite is separate from `pnpm check`:

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

Maestro reads `.maestro/config.yaml` and executes the local flows tagged for the default set (onboarding, settings, and the deterministic-fallback flow). The fallback flow needs the standing setup from [AI tiers in E2E](#ai-tiers-in-e2e) to be running first: the `e2e` Worker on port 8788 and Metro with `EXPO_PUBLIC_KUYARA_WORKER_BASE_URL` empty and `EXPO_PUBLIC_KUYARA_ON_DEVICE_AI=off`. Each run removes Kuyara's Simulator data because the flows launch with `clearState: true`; do not use a Simulator whose local app data must be preserved.

## AI tiers in E2E

The AI chain is three tiers (on-device, Worker, deterministic fallback), and an automated run has to be able to pick one deliberately. Two switches do that; neither adds a branch to production code.

The **no-AI Worker** is the named `e2e` environment in `apps/worker/wrangler.jsonc`. It serves real weather and real place search with both provider model lists empty, so `/v1/ai/recommend` answers `503 ai_unavailable` at once and the app falls to the deterministic three. Wrangler does not inherit bindings into a named environment, so that environment repeats the AI, KV and rate-limit bindings; the empty model lists are the only difference from the deployed configuration. Run it on the port the mobile default expects:

```bash
pnpm --filter @kuyara/worker exec wrangler dev --env e2e --port 8788
```

The **on-device switch** is `EXPO_PUBLIC_KUYARA_ON_DEVICE_AI=off` (documented in `apps/mobile/.env.example`). A development build then drops the on-device tier, exactly as an ineligible device does. `__DEV__` gates it, so a release build ignores the variable.

The **chain measurement** script sends the same grid the AI-selection suite uses (`apps/mobile/test/recommendation-grid.mjs`: clothing preference x dress style x weather profile, built by the functions the application itself calls), so a catalog or threshold change moves what is measured too. It sends at most `--max-calls` of them (default 10, hard cap 30) and prints status, latency, whether the shared response schema and the mobile validation gate accept each reply, and a summary. `--base-url` is required so nothing reaches the deployed Worker by accident, and `--max-calls 0` builds the grid without sending anything. With `OPENROUTER_API_KEY` in the environment it ends with the remaining free-model quota, never printing the key. The recommend contract carries no provider identifier; which provider answered is readable only from `wrangler tail` or the probe route.

```bash
pnpm --filter @kuyara/mobile measure:ai-chain --base-url http://127.0.0.1:8788 --max-calls 5
```

Two Maestro flows use these switches:

- `.maestro/flows/today-standard-suggestions.yaml`: against the `e2e` Worker with the on-device switch off, "Standard suggestions" appears. It is part of the default `pnpm e2e:ios` set and passes in about 45 seconds.
- `.maestro/flows/today-ai-recommendation.yaml`: against the real Worker with the on-device tier enabled, Today reaches an AI badge within 46 seconds and never shows "Standard suggestions". It is tagged `ai-network`, excluded from the default set because each run spends the shared free AI quota, and run explicitly with `maestro test .maestro/flows/today-ai-recommendation.yaml`. While that quota is spent (it resets at 00:00 UTC) the flow fails at the badge, and the measurement script shows 503 `ai_unavailable` on every call.

## Release path

The version scheme, the Submit for Review step and the EAS Update rule are recorded in
[Approved release versioning and update path](product-decisions.md#approved-release-versioning-and-update-path).
This section is the command sequence only.

### Preconditions

- The worktree is clean and holds only the changes being released.
- `pnpm check` and `pnpm --filter @kuyara/mobile test:components` are green.
- `expo.version` in `apps/mobile/app.json` is bumped to the next `0.MINOR.YYYYMMDD` string.
  Never edit a build number: `eas.json`
  sets `appVersionSource: "remote"` and the production profile auto-increments it on EAS.
- If `packages/contracts` or a Worker route changed, deploy the Worker before submitting the
  app. The deployed Worker is the top-level configuration; the named `e2e` environment is
  local-only and never deployed ([ADR 0003](adr/0003-single-worker-environment.md)):

  ```bash
  pnpm --filter @kuyara/worker exec wrangler deploy --env=""
  ```

  The deployed Worker must stay compatible with the binary store users already have. Add fields
  and routes; never remove or rename a field or route that a shipped version reads until no
  installed version needs it.

### Build and submit

Run both from `apps/mobile`, where `eas.json` lives:

```bash
eas build --profile production --platform ios
eas submit --profile production --platform ios --latest
```

`eas submit` reads `submit.production.ios.ascAppId` from `eas.json`, so no app identifier is
passed on the command line.

### Workflow

`apps/mobile/.eas/workflows/release-ios.yml` runs the same two steps on EAS
infrastructure: a production iOS build, then a submit against the same
`submit.production` profile. It declares no `push` or `pull_request` trigger, so it never
starts on its own. Run it from `apps/mobile`, where both `eas.json` and the `.eas`
directory live:

```bash
eas workflow:validate .eas/workflows/release-ios.yml
eas workflow:run .eas/workflows/release-ios.yml
```

`workflow:validate` checks the file against the EAS schema and against the build and
submit profiles in `eas.json`. A started run is followed with `eas workflow:status`,
`eas workflow:logs` and `eas workflow:runs`, and on the project's workflows page in the
Expo dashboard.

Linking the GitHub repository to the EAS project is not required here. That link exists
for the GitHub event triggers, and `eas workflow:run` works without it ([Get started with
EAS Workflows](https://docs.expo.dev/eas/workflows/get-started/#automate-workflows-with-github-events)).
The one-time setup the workflow does need is an App Store Connect API key held by EAS, so
the submit job can authenticate with Apple non-interactively: run
`eas credentials --platform ios`, choose the `production` profile, then **App Store
Connect: Manage your API Key** and **Set up your project to use an API Key for EAS
Submit** ([Automate with EAS
Workflows](https://docs.expo.dev/submit/ios/#automate-with-eas-workflows)).

The workflow replaces those two commands and nothing else. The Preconditions above still
come first, in the same order: the `expo.version` bump in `apps/mobile/app.json`, green
`pnpm check` and component tests, and the Worker deploy when a contract or a route
changed. The TestFlight pass on the phone and Submit for Review in App Store Connect stay
manual after the run finishes. The run happens on EAS infrastructure and draws on the
account's EAS plan: the build job is billed like any other EAS build, and the remaining
job time comes out of the plan's CI/CD minutes. Check the current allowances on
<https://expo.dev/pricing> rather than assuming them.

### TestFlight pass on the phone

Both profiles ship the same bundle id `com.ubrn.kuyara`, so the TestFlight build replaces the
installed store build in place and keeps its SQLite database. Do not delete the app first: the
in-place replacement is the real migration test. Install from TestFlight, then check that
onboarding does not reappear, the Closet still lists its rows with their photos, Today renders
the cached snapshot before any refresh, and the Settings AI status screen answers.

Then, in App Store Connect, create the version with the same string if it does not exist,
attach the build and Submit for Review. That step stays manual; automatic release after
approval is selected, and the store build replaces the TestFlight build in place.

### Development build on the physical iPhone

Register the phone once for internal distribution (the command takes no flags), then build and
install from the EAS link, both from `apps/mobile`:

```bash
eas device:create
eas build --profile development --platform ios
```

This build also replaces the store build in place and keeps its data.

The `development` profile sets no Worker URL, so `apps/mobile/src/config/worker-base-url.ts`
falls back to `http://127.0.0.1:8788`, which on a phone is the phone. To reach a Worker running
on the Mac, set `EXPO_PUBLIC_KUYARA_WORKER_BASE_URL` in `apps/mobile/.env` to the Mac's LAN
origin (origin only, no path, query or fragment; a development build accepts `http`), restart
Metro so the new value is bundled, and bind Wrangler to every interface:

```bash
pnpm --filter @kuyara/worker dev --ip 0.0.0.0 --port 8788
```

### Quota

Any build pointed at the deployed Worker, a development build included, spends the same shared
AI quota and cache as store users. Use the switches in [AI tiers in E2E](#ai-tiers-in-e2e) to
avoid it.
