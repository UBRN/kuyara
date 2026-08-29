# Current Project Status

## Recently Completed Milestones

Keep only the most recent two or three completed milestones here. Older entries stay in Git history; this document describes the current state, not the full changelog.

Milestone 7, the mobile notification foundation (N1), was completed on 2026-08-29 in `6e586e9`. Schema v6 adds `notifications_opt_in`; `expo-notifications` stays behind one adapter; Settings provides the opt-in toggle and OS-settings redirect; notification taps deep-link to Today; and the test-notification action is development-only. Validation included `pnpm check` and 106 passing component tests.

Milestone 5, the real weather provider chain, was completed on 2026-08-29. Open-Meteo is now the primary live provider; OpenWeather is the fallback but is absent from the chain until the `OPENWEATHER_API_KEY` Worker secret is set, so Open-Meteo serves alone today. Each adapter validates its raw response with a Zod schema, maps units and conditions explicitly, times out at 4,000 ms per attempt, and never falls back for valid-but-undesirable weather; attempts are bounded at 2. `POST /v1/weather` is rate limited at 20 requests/60s per IP (`rate_limited`), and OpenWeather calls carry an additional best-effort daily cap in the Worker, honestly not atomic and fail-open. The shared contract gained `origin.sourceId` for controlled attribution and the `rate_limited` error code. The deterministic sample provider was removed from production composition and is now test-only. The mobile weather domain, the 30-minute freshness boundary, and last-known-good behavior did not change. Open-Meteo was verified end-to-end against the live API through `wrangler dev`; OpenWeather has unit coverage only and has not yet been exercised against the real API. Design and the recalculated provider pricing are canonical in [`adr/0002-real-weather-provider-chain.md`](adr/0002-real-weather-provider-chain.md).

Milestone 4, the generation-mode status surface plus the active AI probe and Worker-side rate limiting, was completed on 2026-08-29. Design and the recalculated provider pricing behind the probe limits are canonical in [`adr/0001-worker-ai-probe-and-rate-limiting.md`](adr/0001-worker-ai-probe-and-rate-limiting.md), the repository's first ADR. Contracts gained `aiProbeV1Path`, `aiProbeV1SuccessSchema` (`{ status: 'ok' | 'unavailable', checkedAt }`), and a `rate_limited` error code. `apps/worker/src/ai/probe-handler.ts` is a new injected handler behind `POST /v1/ai/probe`: it method-gates, applies a per-IP burst limit, serves a 60-second isolate cache, enforces a KV daily counter capped at 30, then runs only the first provider once against a fixed minimal in-Worker request with a 20-second timeout, returning `ok` only when the output passes the same structural and closed-candidate-set validation a real recommendation uses. `createAiHandler` gained an optional per-IP rate limiter for `POST /v1/ai/recommend`; both use the native Cloudflare rate-limit binding, and `wrangler.jsonc` adds `PROBE_COUNTER` KV and the two `ratelimits`. Missing bindings degrade to permissive, so local dev and tests are unchanged. On mobile, Today shows a text-labelled `Pill` ("AI-assisted" / "Standard recommendation") next to the recommendation heading, driven by the existing snapshot `generationMode` with no domain change; Settings gained an "AI status" section with a last-recommendation line, a "Check AI status" action backed by a new sanitized `WorkerAiProbeClient` and `useAiProbe` hook, and an inline Reanimated pulsing-dots loading overlay that respects Reduced Motion. All copy is localized in Turkish and English; provider names, model identity, and technical failures never reach the client. Validation covered `pnpm check`, `pnpm --filter @kuyara/mobile test:components` (80 tests), and a Simulator check confirming the Today generation-mode `Pill` and the full Settings "AI status" section render correctly in the running app; the probe interaction itself (loading overlay, result copy, Reduced Motion) is covered by component tests because the Simulator UI-automation tools were unavailable. Nothing was deployed; the Codex review-gate lane hit an external usage limit before finishing and its pass was completed in the main agent instead.

## Implemented Capabilities

- A device-local profile, accountless onboarding, and persisted language, theme, and clothing preference.
- Primary Today, Weather, Wardrobe, and Settings tabs.
- Local-first Wardrobe persistence and CRUD, including soft deletion and catalog-backed garment properties.
- A private, single-photo Wardrobe lifecycle covering system-library selection, resize/compression, relative-path persistence, replacement, removal, and safe cleanup, including private-file deletion when the owning item is deleted.
- Foreground-only manual or device location selection with localized permission handling.
- Device-local weather snapshots with exact 30-minute freshness behavior, stale-data preservation, manual refresh, and real weather fetched from the local Worker's Open-Meteo/OpenWeather provider chain.
- A versioned Worker weather endpoint with shared runtime contracts, an isolated-adapter real provider chain, per-IP rate limiting, and privacy-safe error handling; the deterministic mock is now a test double only.
- A controlled `workers.dev` deployment of the real Worker (`kuyara-worker`) for explicit remote development use.
- A mobile HTTP weather provider with environment-aware Worker origins, runtime response validation, and explicit contract-to-domain mapping.
- Provider-neutral shared AI recommendation contracts, a Worker `POST /v1/ai/recommend` route with ordered provider fallback, per-attempt timeouts, structural and closed-candidate-set validation, sanitized failures, and non-AI liveness and configuration-readiness endpoints, now backed by real OpenRouter and Cloudflare Workers AI adapters composed from Worker configuration, with the deterministic stub retained only as a test double.
- Provider-independent mobile weather failure classification with localized offline/unavailable states, retry, and last-known-good preservation.
- Deterministic provider-independent conversion from validated weather snapshots into structured clothing-property requirements, with tested boundary, conflict, precedence, and remaining-hour behavior.
- Pure catalog/Wardrobe effective-property projection and deterministic per-garment eligibility, requirement evaluation, bounded scoring, over-protection penalties, and stable tie behavior.
- Pure one-outfit composition with separates/one-piece branches, runtime roles, collective mandatory validation, targeted protection authority, explicit protection-versus-breathability trade-offs, bounded scoring, deterministic ordering, and structured failures.
- Turkish and English presentation plus System, Light, and Dark appearance preferences.
- A mobile Worker AI client with contract validation and sanitized failure mapping, a device-local recommendation snapshot persisted per profile, refresh/invalidation limited to the approved change triggers with duplicate-request coalescing, and the deterministic generator wired in as the on-device fallback whenever AI fails.
- A coarse generation-mode indicator in Today (a text-labelled `Pill`) and Settings, a `POST /v1/ai/probe` endpoint that runs one bounded provider attempt behind a per-IP burst limit, a 60-second isolate cache, and a KV daily cap, a sanitized mobile probe client with a Settings "Check AI status" action and Reduced-Motion-aware loading animation, and per-IP rate limiting on `POST /v1/ai/recommend`.

Weather now runs through a real provider chain: Open-Meteo primary with OpenWeather One Call 3.0 as fallback. Both were verified end-to-end via `wrangler dev` against the live APIs on 2026-08-29, including a forced Open-Meteo outage that demonstrated the live fallback. `OPENWEATHER_API_KEY` is set as a Worker secret and locally in `.dev.vars`, and the OpenWeather account's daily call cap is lowered to 1,000 so no billable overage range exists. The deterministic sample provider is a test double only. The same chain is deployed to `kuyara-worker` on `workers.dev` and was smoke-tested there, so the remote endpoint serves real weather rather than sample data. Three-outfit diversity and the deterministic Today integration are now implemented: Today consumes the persisted recommendation snapshot, produced by AI when available and by the pure `recommendOutfits`/`composeOutfits` fallback otherwise, and renders real composed outfits instead of a fixture. Production WeatherKit is still not implemented. The approved AI-first strategy is now implemented end to end: the shared AI contract, the Worker AI route with ordered real-provider orchestration, the mobile Worker AI client, the device-local recommendation snapshot, the coarse generation-mode surface in Today and Settings, and the explicitly triggered rate-limited `POST /v1/ai/probe` with its Settings "Check AI status" action all exist. Both AI endpoints are rate-limited, and so is `POST /v1/weather`. The recommendation survives a cold start via the persisted snapshot; it is recomputed only on the approved refresh triggers, not on every launch.

## In Progress

Nothing is in progress. N1 was completed on 2026-08-29 and is recorded under Recently Completed Milestones above; N2 remains an approved next milestone.

## Development Environment

- The current stack and workspace layout are documented in the [`README.md` Stack section](../README.md#stack).
- iOS is the first release target. Shared code and Expo configuration must keep Android buildable, while Android-specific feature work remains deferred.
- Codex is updated and healthy. Expo MCP is configured.
- XcodeBuildMCP is installed through Homebrew, configured for Codex, and has been verified through a successful iPhone Simulator build and launch.
- The generated local iOS project is not tracked. Its machine-local `apps/mobile/ios/.xcode.env.local` selects `/opt/homebrew/opt/node@24/bin/node`; the file is covered by the ignored generated `ios/` directory.
- Built-in Codex Memories are enabled. No separate Memory MCP is required.
- `AGENTS.md` contains the repository's efficient-execution rules and risk-proportionate validation strategy. `CLAUDE.md` only imports it, so the rules keep a single source.
- `.agents/skills/kuyara-next-goal/SKILL.md` is the single source for the repository-scoped workflow that selects, executes, and reviews Goals. `.claude/skills/kuyara-next-goal` is a relative symlink to that directory so Claude Code discovers the same skill; do not copy the file.
- Every workspace `test` script discovers suites through the `src/**/*.test.mjs` glob rather than a hand-listed file set, so a new suite cannot be silently omitted. The root `pnpm test` script runs them and is part of `pnpm check`.
- The Worker has a single environment, deployed as `kuyara-worker` at `https://kuyara-worker.ubarin08.workers.dev` ([ADR 0003](adr/0003-single-worker-environment.md)). As of 2026-08-29 it is live with the full binding set (`PROBE_COUNTER` KV, the three rate-limit bindings, the Workers AI binding, vars) and both secrets, `OPENWEATHER_API_KEY` and `OPENROUTER_API_KEY`. Remote smoke test on deploy: `/v1/health` ok, `/v1/ai/ready` ready, and `POST /v1/weather` returned live Open-Meteo data. The earlier `kuyara-weather-dev` deployment (sample-only code, no bindings, no secrets) was deleted on 2026-08-29, so no sample endpoint is reachable any more. The deployment has no custom domain, persistence, analytics, or production WeatherKit access.
- The `preview` and `production` EAS build profiles carry the deployed Worker origin, so TestFlight builds boot against the real Worker; the `development` profile retains its local fallback.

## Current Focus

Kuyara's approved direction is AI-first: AI generates three complete outfits from a closed candidate set, with a device-local deterministic three-outfit generator as the final fallback. The full approved strategy (provider chains, privacy boundary, spend controls, caching, and status behavior) is recorded in [`product-decisions.md`](product-decisions.md). Real Workers AI and OpenRouter adapters now serve the Worker route, while the mobile client validates their output and persists one recommendation snapshot per local profile. Milestone 4 (generation-mode surface, active AI probe, Worker rate limiting), milestone 5 (the real weather provider chain), and milestone 7/N1 (the mobile notification foundation) were completed on 2026-08-29. Milestone 6, WeatherKit integration, is now startable: the Apple Developer Program pause was lifted on 2026-08-29 once membership became active. N2 local weather alerts can proceed on the completed N1 foundation alongside milestone 6; server-sent push N3 remains deferred. Notification design is recorded in [`adr/0004`](adr/0004-notifications-in-the-mvp.md).

- Milestone 3 is complete: the mobile Worker AI client, device-local recommendation snapshot, refresh/invalidation rules, and the deterministic fallback are implemented, wired into Today, and verified against the Goal brief's acceptance criteria.
- Milestone 4 is complete: the Today/Settings generation-mode surface, `POST /v1/ai/probe`, and per-IP rate limiting on both AI endpoints plus a KV daily cap on the probe. Design in [`adr/0001`](adr/0001-worker-ai-probe-and-rate-limiting.md).
- Milestone 5 is complete: the real weather provider chain, Open-Meteo primary and OpenWeather fallback, adapter isolation, bounded attempts, per-IP rate limiting on `POST /v1/weather`, and a best-effort daily cap on OpenWeather. Design and the recalculated pricing basis are in [`adr/0002`](adr/0002-real-weather-provider-chain.md).
- The chain order question is resolved: Workers AI runs first as of 2026-08-19. The Worker-side rate-limiting question is resolved: milestone 4 added a native per-IP burst limit on both AI endpoints and a KV daily counter on the probe. A deploy of the AI route and probe to the public `workers.dev` URL is still a separate operational step. The named-environment inheritance trap is resolved by [ADR 0003](adr/0003-single-worker-environment.md): `env.development` was removed, so the top-level bindings are the ones deployed and the command is `wrangler deploy` with no `--env`.

## Next Approved Milestones

1. ~~**Deterministic three-outfit generation and diversity.**~~ Completed on 2026-08-13 as `composeOutfits`, which selects up to three meaningfully different outfits from the sorted valid compositions. Meaningfully different means a different body core, or at least two candidate keys present in one outfit and absent from the other; fewer than three are returned rather than padding with a near-duplicate.
2. **Provider-neutral AI recommendation contracts and Worker orchestration.** Split into two Goals, mirroring the existing precedent where the Worker weather v1 foundation and the real mobile adapter were separate milestones:
   - ~~**2a — contracts and orchestration.**~~ Completed on 2026-08-14. Sanitized request and structured response contracts, the Worker route and orchestration, a deterministic in-Worker stub provider, structural and closed-candidate-set validation, bounded attempts, sanitized failures, and the liveness and configuration-readiness endpoints all landed as designed in [`architecture.md`](architecture.md#goal-2a-design-ai-contracts-and-worker-orchestration).
   - ~~**2b — real AI provider adapters.**~~ Completed on 2026-08-19. Cloudflare Workers AI binding adapter and OpenRouter adapter, composed in that order from Worker configuration behind the unchanged Goal 2a seam. Out of scope: the explicitly triggered active AI probe, which needs real provider quota and its Settings trigger surface and therefore belongs to milestone 4; the Today UI; and recommendation persistence.
   - ~~**3 — mobile recommendation application and persistence flow.**~~ Completed on 2026-08-24. Worker client boundary, device-local recommendation snapshot, refresh and invalidation rules, and the device-local deterministic fallback. Out of scope, not built: broad UI redesign.
4. ~~**Today and Settings integration.**~~ Completed on 2026-08-29. The Today deterministic flow landed early on 2026-08-13; the generation-mode surface in Today and Settings, the explicitly triggered, bounded, rate-limited, briefly cached `POST /v1/ai/probe` with its Settings trigger and loading animation, and per-IP rate limiting on both AI endpoints landed as milestone 4, designed in [`adr/0001`](adr/0001-worker-ai-probe-and-rate-limiting.md). The UI redesign it depended on was finished the same day. Out of scope, not done: deploying the AI route or probe, provisioning the KV namespace, setting any remote secret.
5. ~~**Real weather provider chain.**~~ Completed on 2026-08-29. Open-Meteo primary, OpenWeather fallback (absent from the chain until `OPENWEATHER_API_KEY` is set), controlled attribution metadata, and rate, quota, timeout, budget, and fallback behavior, designed in [`adr/0002`](adr/0002-real-weather-provider-chain.md). Mobile last-known-good behavior and the exact 30-minute freshness boundary did not change.
6. **WeatherKit integration.** Insert WeatherKit at the head of the established provider chain without changing the mobile weather domain. Startable as of 2026-08-29, when the [Apple Developer Program](../AGENTS.md#apple-developer-program) pause was lifted.
7. **Local weather alerts (N2).** A deterministic alert-rule module over the existing weather snapshot and hourly data, local notifications scheduled on each fresh forecast (foreground and via `expo-background-task`), repeat suppression, and quiet hours. No server. Approved 2026-08-29; design in [`adr/0004`](adr/0004-notifications-in-the-mvp.md). Server-sent push (N3) is deferred and needs its own ADR.

A milestone may be split further if repository evidence shows it cannot be safely reviewed or tested as one Goal. Do not combine milestones for convenience.

## Known Issues or Blockers

- The primary tab bar's labels truncate to two or three characters at the largest accessibility text size. The full label stays in each tab's accessible name, and the truncation was chosen over adding tab icons because icon selection needs design approval under [`design/visual-identity.md`](design/visual-identity.md). Revisit if the truncated labels prove confusing in use.
- The Android `permissions` array no longer requests `ACCESS_FINE_LOCATION`, but `expo-location`'s config plugin still adds it and only prebuild applies `blockedPermissions`. The resolved AndroidManifest has not been verified; confirm it during the deferred Android validation.
- Physical-device accessibility verification is still outstanding for the weather card: real VoiceOver focus order and spoken grouping cannot be confirmed by component tests or the Simulator.
- The Worker foundation, remote deployment, and mobile adapter have no implementation blocker. Local development defaults to `wrangler dev`; `preview` and `production` EAS builds use the deployed `kuyara-worker`, and an explicit `EXPO_PUBLIC_KUYARA_WORKER_BASE_URL` can override the development origin.
- The provider, contract, and mobile adapter boundaries are implemented, and the app now serves real Open-Meteo weather (milestone 5, completed 2026-08-29; see [`adr/0002`](adr/0002-real-weather-provider-chain.md)). WeatherKit itself remains unimplemented; it is milestone 6, startable now that the [Apple Developer Program](../AGENTS.md#apple-developer-program) pause was lifted on 2026-08-29.
- The generated iOS project depends on a machine-local Node path. A newly generated local project may need its own ignored `.xcode.env.local` before native builds.

## Deferred Scope

- Accounts and cross-device synchronization.
- Analytics.
- Server-sent push notifications (N3). MVP notifications are on-device local weather alerts only; see [`adr/0004`](adr/0004-notifications-in-the-mvp.md).
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
