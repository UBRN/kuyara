# kuyara testing conventions

The iOS Simulator is the default for mobile verification. Codex runs the relevant screens
and captures screenshots and debug logs itself. Use a physical iPhone only for a specific
question the Simulator cannot answer, such as actual `BGTaskScheduler` execution or
on-device Apple Intelligence performance. State the unverified behavior when the device is
unavailable; it does not block routine Simulator checks. Simulator AI latency is not a
measurement of physical-iPhone latency.

## Apple Developer Program

The [Apple Developer Program](../AGENTS.md#release-operations) section governs release-facing validation; weather integration tests use deterministic providers and fixed raw-response fixtures rather than live external weather calls.

## Repository and configuration checks

Run commands from the repository root unless a different directory is stated. The aggregate check covers lint, TypeScript, every workspace Node test suite, and the Worker bundle:

```bash
pnpm check
```

Run focused repository checks with `pnpm run lint`, `pnpm run typecheck`, or `pnpm test`. Lint covers
all three packages: the mobile app through its own Expo config, and `apps/worker/src` and
`packages/contracts/src` through the workspace root `eslint.config.js`, which reuses the same rule set.
The mobile typecheck depends on the git-ignored `expo-env.d.ts` and `.expo/types/router.d.ts`, which
`expo start` writes; on a fresh checkout with no dev server run, generate them first with
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

CI runs the same command on every push to `main` and every pull request.

CI also guards the dependency and secret surface. `.github/dependabot.yml` proposes weekly
npm updates for the four workspace directories, grouped into one development and one
patch-and-minor pull request after a seven-day cooldown (fourteen for majors), and monthly
GitHub Actions updates; the Expo SDK packages (`expo`, `expo-*`, `@expo/*`, `react-native`,
`react-native-*`, `@react-native/*`, `jest-expo`, `eslint-config-expo`, `babel-preset-expo`)
and React majors are excluded because `npx expo install --check` owns those versions. A
`dependency-review` job in `ci.yml` fails a pull request that adds a dependency with a
known high or critical vulnerability. On the repository itself Dependabot alerts,
Dependabot security updates, secret scanning with push protection and CodeQL default setup
(JavaScript and TypeScript, weekly) are switched on; all four are free for a public
repository and none can deploy or spend. Branch rulesets are deliberately not set up yet.

`.github/workflows/secret-scan.yml` runs gitleaks 8.30.1 over the pushed or proposed
commits on every push to `main` and every pull request, and over the whole history when
dispatched by hand. It reads `.gitleaks.toml`, the same configuration the local pre-commit
hook uses, so a commit made with `--no-verify` or without gitleaks installed is still
scanned. That configuration extends the default rules and allowlists two known false
positives: the PEM header lines in `apps/worker/src/weather/weatherkit-token.test.mjs`,
which belong to a throwaway P-256 key the test generates at runtime, and the PostHog
`phc_` project token, a public write-only client key that ships inside the app bundle.
Every third-party action in every workflow is pinned to a full commit SHA with its release
tag in a trailing comment, so Dependabot's `github-actions` ecosystem bumps both together.

`.github/workflows/deploy-worker.yml` is the only workflow that can deploy the Worker, and
it starts only from a manual `workflow_dispatch` that picks the `production` or `e2e`
Wrangler environment; nothing deploys on push and one deploy runs at a time. It installs
from the lockfile, typechecks and tests the Worker, bundles it with a dry-run
`wrangler deploy`, then deploys through the GitHub `production` environment. That
environment needs the secret `CLOUDFLARE_API_TOKEN` and the variable
`CLOUDFLARE_ACCOUNT_ID`; neither exists yet, so the workflow has never run.

Verify the Worker bundle without deployment:

```bash
pnpm --filter @kuyara/worker bundle
```

Start the local Worker when runtime verification is needed, then stop it after the check:

```bash
pnpm --filter @kuyara/worker dev --port 8788
```

`wrangler dev` reads the git-ignored `apps/worker/.dev.vars`; the secret names are listed in
`apps/worker/.dev.vars.example`. Without the four `WEATHERKIT_*` entries the local chain
starts at Open-Meteo, so a local run proves nothing about the WeatherKit adapter or its
signer; add them when the weather head or `weatherkit-token.ts` changed.

Start the mobile development server from the repository root with:

```bash
pnpm --filter @kuyara/mobile start
```

For a local iOS Simulator smoke test, start Metro and stop it with Ctrl+C after verification:

```bash
pnpm --filter @kuyara/mobile exec expo start --ios --port 8081
```

### Codex Simulator control and debugging

Codex and Claude Code share Argent through the Goldie plugin, plus XcodeBuildMCP and
Maestro. No additional MCP registration is needed. Start with the user-scoped
`argent-ios-simulator-setup`, `argent-device-interact`, and `argent-metro-debugger` skills.
Select an iOS Simulator UDID explicitly; skip `kind: device`. Reuse the existing debug
build and Metro when their configuration matches the test, and preserve Simulator data.

- Read screens with Argent `describe` and `screenshot`; inspect React with
  `debugger-component-tree`. Use returned targets and verify the destination after an action.
  `tapped: true` is only an input acknowledgement, not proof of navigation.
- Use `run-sequence` and `await-ui-element` for known transitions instead of repeated
  screenshots or fixed sleeps. If input is acknowledged but the screen does not change,
  inspect the target and try one independent input path instead of repeating the gesture.
- With Xcode 27, the visible Simulator window belongs to **Device Hub**
  (`com.apple.dt.Devices`). Codex computer use can select that app, read its accessibility
  tree, click controls, scroll and type. This is the working fallback when Argent or Maestro
  touch injection does not change the screen. Its coordinates are window coordinates,
  not Argent's normalized device coordinates. Discover the window and targets afresh.
- Attach `debugger-connect` to the Simulator UDID and the actual Metro port. Use
  `debugger-evaluate` for bounded runtime checks and `debugger-log-registry` for the console
  file, then search only the relevant log lines. Capture starts at connection; it does not
  reconstruct earlier JavaScript logs. Keep build and Metro terminal output separately.
- For native hierarchy and network diagnostics, inspect `native-devtools-status` first;
  restart the app once when it reports `stale_process`. Native system logs are separate:
  `xcrun simctl spawn <UDID> log show --last 5m --style compact --predicate 'process == "kuyara"'`.
  Use `log stream` for a live capture. Native logs may redact private fields.

For local debugging with Apple Intelligence enabled and no cloud AI inference, use the
existing `e2e` Worker from [AI tiers in E2E](#ai-tiers-in-e2e) on port 8788 and start Metro:

```bash
env -u EXPO_PUBLIC_KUYARA_ON_DEVICE_AI \
  EXPO_PUBLIC_KUYARA_WORKER_BASE_URL=http://127.0.0.1:8788 \
  pnpm --filter @kuyara/mobile exec expo start --port 8081 --localhost
```

Weather and place search still use real providers. A debug build without `expo-dev-client`
uses `RCTBundleURLProvider`; an `expo-development-client` URL does not switch its Metro
port. After replacing a mismatched Metro session, wait until its port is free, start the
correct server and relaunch the app. Do not carry the fallback test's `ON_DEVICE_AI=off`
into a Foundation Models test.

An Apple Silicon Mac with Apple Intelligence ready can execute Foundation Models for the
Simulator. Verify an actual synthetic `selectOutfits` response through the existing native
module, not just `getAvailability`. This establishes functional inference, not iPhone
latency or battery behavior; see [ADR 0034](adr/0034-on-device-ai-selection-through-apple-foundation-models.md).
Jev is an optional text classification tool, not a Simulator, screenshot reader or debugger.
It is not needed for the control loop; its data boundary stays in the user-scoped Jev MCP guide.

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

The component suite covers the production tab bar, localized Weather and Wardrobe states, the profile route gate, Today/Settings generation-mode surfaces, the AI probe flow, and notification Settings. The approved three-tab Profile navigation requires corresponding component coverage when implemented; no such coverage is claimed yet. Expo Router 57's `renderRouter` helper assumes an older synchronous renderer, so tests exercise production controls and navigation intents directly while mocking only native navigation state. Device-level transitions, gestures, notification delivery, and platform visuals remain simulator or device verification concerns; manual accessibility scope follows `AGENTS.md`.

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

Recommendation suites cover deterministic requirements, garment evaluation, composition, diversity, approved refresh triggers, coalescing, AI validation/fallback, and migration version 5 snapshot persistence. Today tests cover real domain-shaped recommendations and the coarse generation-mode indicator; Settings tests cover sanitized probe states and motion behavior. Notification tests cover the adapter/application boundary, permission and opt-in behavior, and localized accessible Settings states.

Presentation tests should focus on pure onboarding/route decisions, localization completeness, accessibility contracts, navigation intents, and source boundaries. Simulator verification remains required for genuine persistence across termination/relaunch, complete navigation behavior, native accessibility output, Dynamic Type, appearances, and visual regressions.

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

- `.maestro/flows/today-standard-suggestions.yaml`: against the `e2e` Worker with the on-device switch off, Today settles on an outfit and shows no generation-mode badge, which is what the deterministic fallback looks like at rest. It is part of the default `pnpm e2e:ios` set and passes in about 45 seconds.
- `.maestro/flows/today-ai-recommendation.yaml`: against the real Worker with the on-device tier enabled, Today reaches an AI badge within 46 seconds. It is tagged `ai-network`, excluded from the default set because each run spends the shared free AI quota, and run explicitly with `maestro test .maestro/flows/today-ai-recommendation.yaml`. While that quota is spent (it resets at 00:00 UTC) the flow fails at the badge, and the measurement script shows 503 `ai_unavailable` on every call.

## Release path

The version scheme, the Submit for Review step and the EAS Update rule are recorded in
[Approved release versioning and update path](product-decisions.md#approved-release-versioning-and-update-path).
This section is the command sequence only.

### Preconditions

- The version bump and the changes being released are committed, and the worktree holds
  nothing else: `eas.json` sets `cli.requireCommit: true`, so the build runs against the
  committed tree and an uncommitted bump would carry the old version string into the binary.
- `pnpm check` and `pnpm --filter @kuyara/mobile test:components` are green.
- The production profile must not set `uploadSourceMaps`. EAS's own upload pre-sets
  `SOURCEMAP_FILE` to its `observe-source-maps` directory, the PostHog build phase then
  composes the map there and looks for it under `DERIVED_FILE_DIR`, and the build fails with
  "No hermes sourcemaps with a chunk id found". PostHog's upload ([ADR 0035](adr/0035-posthog-error-tracking.md))
  is the one source-map channel.
- `expo.version` in `apps/mobile/app.json` is bumped to the next `0.MINOR.YYYYMMDD` string,
  and `version` in `apps/mobile/package.json` is set to the same string. Never edit a build
  number: `eas.json` sets `appVersionSource: "remote"` and the production profile
  auto-increments it on EAS.
- If `packages/contracts` or a Worker route changed, deploy the Worker before submitting the
  app. The deployed Worker is the top-level configuration; the named `e2e` environment is
  local-only and never deployed ([ADR 0003](adr/0003-single-worker-environment.md)):

  ```bash
  pnpm --filter @kuyara/worker exec wrangler deploy --env=""
  ```

  The deployed Worker must stay compatible with the binary store users already have. Binaries
  built before commit 8e949ec (build 8, commit 67c20ae, and build 9, commit e4c9350, both
  released) carry `.strict()` response schemas and reject any unknown response key at any level.
  While one of them is installed every `/v1` response shape is frozen at every level: a changed
  shape ships on a new route and the old route keeps its exact shape. The shipped-shape test in
  `packages/contracts` enforces this offline. Once a binary built from 8e949ec or later is the
  oldest installed version, adding a field becomes safe; removing, renaming or retyping a field
  or route a shipped version reads never is, until no installed version needs it.

### Build and submit

`apps/mobile/.eas/workflows/release-ios.yml` is the build and upload path: a production iOS
build, then a submit against the `submit.production` profile, both on EAS infrastructure. It
replaces separate `eas build` and `eas submit` commands. It declares no `push` or
`pull_request` trigger, so it never starts on its own. Run it from `apps/mobile`, where both
`eas.json` and the `.eas` directory live:

```bash
eas workflow:validate .eas/workflows/release-ios.yml
eas workflow:run .eas/workflows/release-ios.yml
```

`workflow:validate` checks the file against the EAS schema and against the build and
submit profiles in `eas.json`. `eas workflow:run FILE` uploads the local project directory,
so the bump has to be committed before the run and no `--ref` is passed. The submit job
reads `submit.production.ios.ascAppId` from `eas.json`, so no app identifier is passed on
the command line. A started run is followed with `eas workflow:status`,
`eas workflow:logs` and `eas workflow:runs`, and on the project's workflows page in the
Expo dashboard. If the submit job fails the build survives, and the upload alone is retried
with `eas submit --profile production --platform ios --latest`.

Linking the GitHub repository to the EAS project is not required here. That link exists
for the GitHub event triggers, and `eas workflow:run` works without it ([Get started with
EAS Workflows](https://docs.expo.dev/eas/workflows/get-started/#automate-workflows-with-github-events)).
The one setup the workflow needs is an App Store Connect API key held by EAS, so the
submit job can authenticate with Apple non-interactively. The account already holds one:
`eas submit --non-interactive` uploaded build 9 without a prompt. If it ever has to be
recreated, run `eas credentials --platform ios`, choose the `production` profile, then
**App Store Connect: Manage your API Key** and **Set up your project to use an API Key for
EAS Submit** ([Automate with EAS
Workflows](https://docs.expo.dev/submit/ios/#automate-with-eas-workflows)).

The workflow builds and uploads, and does nothing else. The Preconditions above still come
first, in the same order: the committed `expo.version` bump in `apps/mobile/app.json`, green
`pnpm check` and component tests, and the Worker deploy when a contract or a route changed.
After the run finishes, the agent completes the App Store Connect record steps below
under the standing iOS release authorization in `AGENTS.md`. Once the required checks,
independent review and Simulator verification pass, submit without another approval or
a maintainer TestFlight confirmation. The run happens on EAS infrastructure and draws on
the account's EAS plan: the build job is billed like any other EAS build, and the remaining
job time comes out of the plan's CI/CD minutes. Check the current allowances on
<https://expo.dev/pricing> rather than assuming them.

### TestFlight pass on the phone

The iOS Simulator is the default release verification environment. Require a physical
check only when a specific changed behavior cannot be verified there and that evidence is
necessary to accept the release, or when the maintainer explicitly asks for the check.
A routine release does not require a separate phone tour or a connected phone. Record a maintainer-reported TestFlight update with no apparent issues
as that evidence; do not request the same confirmation again. Migration changes still
require the upgrade and realistic-database replay checks in `AGENTS.md`.

When an in-place phone upgrade is checked, TestFlight and the store app share
`com.ubrn.kuyara`, so install over the existing app without deleting it. Check that
onboarding does not reappear, the Closet still lists its rows with their photos, Today
renders the cached snapshot before any refresh, and the Settings AI status screen answers.

### App Store Connect record

The App Store Connect record is the one part of the release EAS does not do: creating the
version record, attaching a build to it, the per-locale release notes and the review
submission are ASC API calls, not build artefacts. The `asc` CLI is used for these record
steps only, never to build or upload; it runs on the maintainer's Mac against the `kuyara`
profile. Create the version record first, copying the metadata forward from the version
before it, then read the ids with `asc status --app 6806664440` for the version id and the
build id and `asc localizations list --version "VERSION_ID"` for the `en-US` and `tr`
localization ids:

```bash
asc versions create --app 6806664440 --version "VERSION" --platform IOS --copy-metadata-from "PREVIOUS_VERSION"
asc versions attach-build --version-id "VERSION_ID" --build-id "BUILD_ID"
asc localizations update --id "LOCALIZATION_ID" --whats-new "..."
asc review doctor
asc review submit --app 6806664440 --version-id "VERSION_ID" --build-id "BUILD_ID" --platform IOS --dry-run
asc review submit --app 6806664440 --version-id "VERSION_ID" --build-id "BUILD_ID" --platform IOS --confirm
```

Run `asc localizations update` once per locale, `en-US` first and then `tr`; an update
version needs release notes in both. `asc review doctor` must report no blocking check
before the submission. `asc review submit` leaves the version in `WAITING_FOR_REVIEW` and
does not change the release type, so automatic release after approval stays selected and the
store build replaces the TestFlight build in place.

### JavaScript-only fix for the live version

A fix that touches no native code, no dependency, no config plugin and nothing under
`apps/mobile/modules` can reach the live version without a store build. `runtimeVersion`
follows `expo.version`, so the update reaches only installs of the version string in
`apps/mobile/app.json`; do not bump the version for it, and do not use this path when a newer
version with the same fix is already in review, because that version is a different runtime.
From `apps/mobile`, with a clean committed tree and green checks:

```bash
eas update --channel production --message "..."
posthog-cli hermes upload --directory dist
```

Confirm the target with `eas update:list --branch production`. A native change never goes this
way: it bumps the date stamp and takes the build-and-submit steps above.

### Development build on the physical iPhone

This optional path is for a concrete device-only verification question. Routine mobile
checks use the iOS Simulator above.

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

## Building the Pages site locally

The site under `docs/` is built by GitHub Pages with the `github-pages` gem (versions at
https://pages.github.com/versions.json). To build it locally, keep a scratch directory outside
the repository holding a `Gemfile` with `gem "github-pages", group: :jekyll_plugins` (on Ruby 4
add `csv`, `base64`, `bigdecimal`, `logger`, `ostruct` and `webrick`, and pass `RUBYOPT=-r<shim>`
where the shim stubs `tainted?`, `taint` and `untaint`), run `bundle install`, then build a copy
of `docs/` with the scratch directory as the working directory:

```bash
cd <scratch> && LC_ALL=en_US.UTF-8 PAGES_REPO_NWO=ubrn/kuyara bundle exec jekyll build --source <copy-of-docs> --destination <out>
```

Jekyll loads the `github-pages` plugins only when a `Gemfile` exists in the working directory;
started elsewhere it renders pages without layouts. Append `url: https://ubrn.github.io` and
`baseurl: /kuyara` to the copied `_config.yml` to reproduce live URLs. Ruby 4 resolves
`github-pages` 223, so the local `<head>` lags Pages (no `og:type`, older generator and SEO-tag
lines); page bodies match.
