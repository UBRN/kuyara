# kuyara repository instructions

## Product and current scope

kuyara is an open-source weather and outfit recommendation app built with React Native, TypeScript, and Expo for iOS and Android.

- Optimize the first release for iOS, but keep Android buildable and avoid iOS-only assumptions in shared code.
- Keep the MVP small: no account, cross-device sync, or behavioral analytics. Notifications are limited to on-device local weather alerts with no server-sent push; see [ADR 0004](docs/adr/0004-notifications-in-the-mvp.md).
- kuyara is free and ad-free, with no subscription and no in-app purchase. Paid provider usage runs on a small maintainer-funded budget and must have explicit hard or safely derived limits; automatic top-up and uncontrolled pay-as-you-go overage are not allowed.
- Treat confirmed product decisions in `docs/` as authoritative. Do not silently change them.
- Separate current MVP work from future possibilities. Do not implement speculative infrastructure.

## Apple Developer Program

- Apple Developer Program membership became active on 2026-08-29; the earlier enrollment-pending pause is lifted. WeatherKit integration and credentials, EAS Build, iOS signing credentials, and TestFlight are now permitted work.
- Being unblocked is not pre-authorization. App Store Connect submission, TestFlight distribution, deploys, and other production release operations still require an explicit user request per the Working rules.
- The Worker provider abstraction remains required. WeatherKit is inserted at the head of the established provider chain, not a replacement for it, and mobile keeps depending on the provider-neutral contract.
- Real Apple-independent weather providers may be implemented. The deterministic sample provider is a development and test source only; it is never a production fallback. (The earlier sample-only rule was revoked on 2026-08-13.)

## Working rules

- Inspect the repository, applicable `AGENTS.md` files, and `git status` before editing.
- Preserve unrelated user changes. Do not revert or overwrite work you did not create.
- Prefer the smallest coherent change that satisfies the request and existing architecture.
- Do not create branches or worktrees, commit, push, publish, deploy, or mutate external systems unless the user explicitly requests it.
- An explicitly started Codex Goal may be committed and pushed with a normal non-force push without a second approval only after it succeeds, all required checks pass, the initially clean worktree still contains only Goal-scoped changes, the final diff is reviewed, and the remote branch is not ahead. Do not do this when checks fail, scope is unclear, user changes are present, or the remote advanced; never force-push, rebase, create a branch or worktree, tag, PR, release, or deploy under this permission.
- Do not add or upgrade dependencies without explaining the need and checking compatibility with the installed Expo SDK.
- Never invent commands, paths, scripts, environment variables, API shapes, or completed verification.
- If a requested change conflicts with these rules or a recorded decision, stop and explain the conflict.

## Intended repository structure

The target is a small pnpm workspace monorepo:

```text
kuyara/
  apps/
    mobile/
    worker/
  packages/
    contracts/
  docs/
  AGENTS.md
```

- `apps/mobile`: Expo and React Native application.
- `apps/worker`: Cloudflare Worker for weather and AI provider integrations.
- `packages/contracts`: shared Zod schemas and API types.
- `docs`: product decisions, architecture, and ADRs.

The repository may be in transition. Inspect the real tree before assuming this structure exists. Do not move or generate the entire project unless the task explicitly includes scaffolding.

## Architecture boundaries

- Organize mobile code feature-first while keeping presentation, domain/application, and data responsibilities distinct.
- Keep business rules out of React components and route files.
- Components render state and emit user intent; use cases/services coordinate domain behavior; repositories abstract persistence and external data.
- UI and domain code must not import SQLite, Supabase, Firebase, WeatherKit, Cloudflare, or provider-specific SDKs directly.
- Keep domain models, SQLite records, API DTOs, and future remote records separate. Convert them through explicit, tested mappers.
- Prefer dependency injection at composition boundaries over global service locators.
- Avoid generic abstractions until at least one concrete boundary or repeated use justifies them.
- Keep one clear source of truth for each piece of state.

## Local-first data rules

- Expo SQLite is the durable on-device source of truth for user-created data. It is not a temporary database to be removed when remote sync is added.
- Access SQLite through repository interfaces and local data sources.
- Establish explicit, ordered, testable schema migrations from the first schema.
- Generate stable UUIDs on the client for user-created records. Do not use auto-incrementing IDs for syncable entities.
- Give syncable user records suitable lifecycle fields: `id`, `createdAt`, `updatedAt`, and nullable `deletedAt`.
- Use soft deletion where future cross-device deletion must be representable.
- Create a stable `localProfileId` before accounts exist so local data can later be linked to an authenticated profile.
- Do not implement an outbox, sync engine, conflict-resolution protocol, or server revision system in the MVP.
- Preserve boundaries that allow a future Supabase or Firebase remote adapter. A remote service will complement SQLite as a sync layer, not replace the local-first model.
- Do not use Supabase and Firebase simultaneously in production. A Firebase learning prototype should remain isolated from the production architecture.

## State ownership

- Expo SQLite owns durable local user data and necessary cached snapshots.
- TanStack Query owns remote request state, caching, retry, invalidation, and refetch behavior.
- React hooks or narrowly scoped context own transient UI state.
- Zod validates untrusted Worker, provider-derived, and AI payloads at runtime.
- Add Zustand only after demonstrating a concrete state-sharing problem. Do not add Redux Toolkit without an explicit requirement.
- Do not duplicate the same canonical data across React context, TanStack Query, and SQLite.

## Weather and recommendation behavior

- Reach every weather provider only through the Worker. The provider chain is a Worker composition concern; mobile depends on the provider-neutral contract.
- Apple WeatherKit is the integrated primary provider, live in production since 2026-09-03, at the head of the chain ahead of the real Apple-independent providers.
- Give each upstream provider an isolated adapter with raw-response runtime validation, explicit unit and condition mapping, timeout handling, and sanitized errors before it produces the provider-neutral model.
- Fall back to the next provider only for eligible failures: availability, timeout, quota or rate limit, authentication or configuration, upstream failure, or invalid response. Never fall back because valid conditions are undesirable or differ between providers.
- Bound the maximum attempts per request and prevent retry or fallback loops.
- Support each provider's attribution requirements. A controlled, non-secret attribution identifier or attribution metadata may cross the mobile API; raw provider data, credentials, and internal errors must not.
- Cache the last valid weather data and recommendation snapshot on-device and render them immediately when available.
- Treat data older than 30 minutes as stale: show it, then refresh in the background on app launch.
- Provide manual refresh and show the last successful update time.
- A failed refresh must not erase the last valid result.
- Do not build a long-term weather archive.
- Determine weather constraints and required clothing properties with deterministic, testable rules.
- A deterministic layer composes at most 24 complete, valid, requirement-satisfying, formality-consistent outfits from the bundled catalog filtered by clothing preference. AI then selects exactly three of them and labels each with one archetype identifier from a closed twelve-entry list. The Wardrobe is never a candidate source in the MVP. AI may select only supplied option identifiers and must never invent outfits, catalog entries, wardrobe items, slots, properties, or identifiers. See [ADR 0007](docs/adr/0007-ai-selects-precomposed-outfits.md).
- Validate every AI response with shared Zod schemas and deterministic domain invariants before it is displayed or persisted. Never silently repair invalid or partially invalid output into a different outfit.
- Keep AI output structured data, not user-visible prose. All Turkish and English copy comes from localization keys.
- AI turns a set of already valid outfits into three that are meaningfully different from each other and do not repeat the previous day. Structural validity, mandatory weather requirements, plausible layering, and formality consistency are enforced before the request rather than by the model, and color harmony is out of scope for the MVP. It is not personalization. Its inputs are the deterministic requirements, precomposed option identifiers and properties, clothing preference, age band, catalog version, and a local day variant. The age band reorders formality preference among the supplied options and excludes none of them, so it changes which three are chosen rather than what is valid (decided, not yet implemented; see [ADR 0015](docs/adr/0015-gender-and-age-band-in-the-profile.md)).
- Provide a device-local deterministic three-outfit fallback that also composes from the catalog only. AI failure must never prevent a recommendation, so that fallback is a prerequisite for shipping AI.
- Generate or refresh a recommendation only when a stale weather snapshot is refreshed, the active location changes, clothing preference changes, a new local calendar day starts, or the user explicitly requests it, not on every launch. Cache identity is weather snapshot identity, clothing preference, catalog version, and day variant. The Worker additionally caches the shared AI result under a key derived from the requirement vector without reason codes, clothing preference, catalog version, and day variant, because the request contains no personal data. Coalesce duplicate in-flight requests and preserve the last valid recommendation when a refresh fails.
- Record a coarse generation mode on the result, AI-assisted or deterministic fallback. Never expose provider names, model identity, or technical failures to users.

## Wardrobe and local files

- Treat the Wardrobe as a personal record, not a recommendation input. Each entry is `owned` or `wanted`; do not add a separate wishlist table, screen, or tab, and do not let either state affect recommendations in the MVP.
- Require a catalog garment type for every newly created Wardrobe entry. Keep legacy entries with a null `garmentTypeId` readable, editable, and deletable, and do not offer new free-form entries outside the catalog.
- Add Wardrobe entry state through ordered SQLite schema version 7. Preserve every existing row and default existing entries to `owned`.
- Show ownership state only on outfit detail, never on Today.
- Wardrobe photos are optional and are not sent to AI in the MVP.
- Resize and compress an imported image, copy it into app-private storage, and store only its relative path in SQLite.
- Do not store image blobs in SQLite.
- When a wardrobe item is deleted, remove its associated private file safely after preserving database consistency.
- Handle missing or corrupt local image files without breaking the wardrobe screen.

## Worker, API, security, and privacy

- Keep the Worker focused on protecting credentials, calling weather and AI providers, validating inputs/outputs, enforcing rate and spend limits, and exposing a versioned mobile API.
- Store credentials as Cloudflare Worker secrets. Never commit them, expose them through public Expo environment variables, bundle them in the mobile app, or log them.
- Integrate AI providers through server-side adapters or platform bindings. Provider credentials must never reach mobile.
- Keep privileged signing and provider authentication server-side.
- Put shared request and response schemas in `packages/contracts` when both mobile and Worker use them.
- Treat every network and AI response as untrusted until runtime validation succeeds.
- Return stable, minimal error shapes; do not leak provider responses, tokens, stack traces, or internal configuration.
- Send AI only the minimum sanitized structured data defined by the [approved AI input privacy boundary](docs/product-decisions.md#approved-ai-input-privacy-boundary): precomposed catalog option identifiers and properties, deterministic weather requirements, clothing preference, age band, catalog version, and day variant. Never send wardrobe-derived data, photos, paths, free-form names, profile or device identifiers, birth year, or coordinates.
- Do not log exact coordinates, wardrobe contents, photos, personal preferences, complete AI prompts, or unnecessary user data.
- Prefer coarse, privacy-preserving operational metrics. Do not add behavioral tracking in the MVP.
- Use free tiers and hard spend controls where available. Fail safely when a quota or limit is reached.
- Keep paid provider keys as Worker secrets, apply a provider-side spending limit where one exists, and never enable automatic credit top-up or uncontrolled pay-as-you-go overage.
- Recalculate exact provider quota, rate, and spend limits from current official pricing during implementation. Do not freeze prices or quotas in this file.
- Distinguish a non-AI Worker liveness check, AI configuration readiness that calls no provider, and an active AI provider probe. An active probe consumes quota, so it must be explicitly triggered, bounded, rate-limited, and briefly cached, and a successful probe never guarantees that a later full request will succeed.

## Localization and preferences

- Support Turkish and English from the beginning.
- All user-visible strings must use localization keys; do not hard-code display text in components.
- Default to the device language and system theme.
- Allow Turkish/English and System/Light/Dark overrides in Settings.
- Model gender in the profile as `woman` or `man`, required, with woman listed before man. The catalog keeps its own `womens`/`mens` applicability vocabulary; a single explicit mapping converts gender to it, and catalog applicability is still not a sex field. Store birth year as an optional device-only field and send only the band derived from it (decided, not yet implemented; the code still stores a `womens`/`mens` clothing preference. See [ADR 0015](docs/adr/0015-gender-and-age-band-in-the-profile.md)).
- Do not promise in user-facing copy that there will never be an account or that everything stays on the device. Accounts are planned; factual documentation about the current accountless MVP is allowed.
- Keep stored enum values locale-independent; translate only at the presentation boundary.
- Avoid constructing sentences from translated fragments.

## Platform-adaptive UI and accessibility

- Keep three primary tabs: Today at `/`, Weather at `/weather`, and Profile at `/profile`. Put Wardrobe and the wanted list inside Profile, and reach Settings from the Profile header rather than a tab. Keep gender prominent and required in onboarding, but place its Settings control last and do not make it prominent there. Birth year is optional and sits beside it in both places (decided, not yet implemented; see [ADR 0015](docs/adr/0015-gender-and-age-band-in-the-profile.md)).
- Keep product identity and information architecture consistent while adapting controls, navigation, feedback, and interaction patterns to each platform.
- Follow Apple Human Interface Guidelines on iOS. The system draws Liquid Glass on the native tab bar and other standard navigation and controls; at a 26.0 minimum there is no older supported iOS appearance to maintain as a fallback.
- Follow Material 3 Expressive guidance on Android.
- Do not force one platform's visual components or interaction conventions onto the other.
- Accessibility is a definition-of-done requirement: support font scaling, meaningful screen-reader labels, logical focus order, sufficient contrast, adequate touch targets, and reduced-motion preferences.
- Target iOS 26.0 as the minimum supported version, a recorded decision rather than merely the floor the selected stable Expo SDK happens to allow (see [ADR 0011](docs/adr/0011-minimum-ios-26.md)), and pin the actual deployment target in repository configuration.

## UI and visual identity

- Before UI, UX, theme, icon, illustration, animation, splash, or branding work, read the canonical [`docs/design/visual-identity.md`](docs/design/visual-identity.md) and treat its approved decisions as constraints.
- Do not introduce new brand colors, fonts, icon geometry, visual metaphors, or motion styles without explicit approval, and never silently modify the approved Balanced Horizon V2 master geometry.
- Use semantic design tokens rather than hardcoded brand values in feature UI.
- Preserve platform-adaptive iOS and Android behavior instead of forcing pixel-identical interfaces.
- Validate important UI in Turkish and English, light and dark themes, text scaling, screen readers, and Reduced Motion; report conflicts between documentation and implementation instead of silently choosing one.
- Agents that support skills should load `beautiful-ui` before UI work, `platform-ios-ui` or `platform-android-ui` for platform-specific behavior, and `ui-verification` before calling UI work done. They live in `.claude/skills/` and hold reading order, measured platform traps, and the verification gate; the rules themselves stay in this file and in `docs/design/`.

## Testing and verification

- Test behavior and boundaries, not implementation details or coverage percentages alone.
- Give the deterministic recommendation engine thorough unit coverage, including boundary weather values and fallback behavior.
- Test SQLite migrations, repositories, mapper round trips, soft deletion, and local-file cleanup.
- Add contract tests for shared Worker schemas and failure shapes.
- Test critical screens and user interactions with React Native Testing Library.
- Keep Maestro E2E coverage small and focused on critical flows such as onboarding, permission handling, and receiving a recommendation.
- Run commands from the repository root unless a different directory is stated.
- Install exactly from the committed lockfile with `pnpm install --frozen-lockfile`.
- Run the verified aggregate lint, TypeScript, Node test, and Worker bundle checks with `pnpm check`.
- Run lint alone with `pnpm run lint` and all current TypeScript checks with `pnpm run typecheck`.
- Run every workspace Node test suite with `pnpm test`. The mobile React Native Testing Library suite uses Jest, runs separately with `pnpm --filter @kuyara/mobile test:components`, and is not part of `pnpm check`.
- See [`docs/testing.md`](docs/testing.md) for focused suites, Expo configuration and Doctor checks, Simulator smoke testing, Worker bundle and development commands, and `pnpm e2e:ios`.
- No format or Android build script exists yet. Do not invent or document one as available until the corresponding infrastructure is added and verified.

## Dependency policy

- Use pnpm and commit the lockfile.
- Start from a current stable Expo SDK and use versions compatible with that SDK.
- Prefer platform APIs and existing dependencies before adding a production package.
- Evaluate maintenance, license, bundle/runtime impact, platform support, and security before adding a dependency.
- Make major upgrades separately and document required migrations.
- Do not replace working libraries merely because another option is more popular.

## Documentation and decisions

- Record confirmed MVP and product decisions in `docs/product-decisions.md`.
- Explain architecture and data flow in `docs/architecture.md`.
- Use ADRs for consequential, difficult-to-reverse choices or changes to existing decisions.
- Update the relevant document when behavior or a durable decision changes.
- Keep this file concise and focused on rules that apply repeatedly. Put explanations and historical context in `docs/`.
- This file is the single instruction source for every coding agent. `CLAUDE.md` only imports it; do not duplicate these rules into another agent-instruction file. The skills in `.claude/skills/` are workflow and pointers, not a second rule source, and must stay that way.

## Code review rules

- Flag presentation code that contains business rules or directly accesses providers or persistence.
- Flag secrets, privileged credentials, sensitive personal data, or complete AI prompts in client code, Git-tracked files, analytics, or logs.
- Flag unvalidated external or AI data crossing into domain or presentation code.
- Flag changes that break offline use, discard last-known-good data after refresh failure, or create competing sources of truth.
- Flag iOS-only shared-code assumptions that leave Android unbuildable.
- Flag hard-coded user-visible strings, inaccessible controls, and missing platform fallbacks.
- Flag speculative sync infrastructure or provider coupling added without an approved requirement.
- Prefer CI for deterministic formatting and lint enforcement; review should focus on correctness, security, privacy, architecture, and regressions.

## Efficient execution and validation

- Use risk-proportionate validation.
- Protect correctness, safety, and architectural consistency before token savings.
- Read only files relevant to the current task.
- Do not perform repository-wide scans unless necessary.
- Do not reread unchanged documentation without a task-specific reason.
- Batch related inspections and commands.
- Keep exploratory command output bounded.
- Do not repeat a successful check unless the implementation changed afterward.
- During implementation, run only the smallest relevant checks.
- Run one consolidated validation pass at the end only when proportionate to risk.
- Documentation-only changes normally require only Markdown review and `git diff --check`, not builds or full test suites.
- Domain logic changes require focused unit tests.
- UI changes require focused component tests and relevant accessibility checks.
- Native iOS changes require one affected iOS build or Simulator verification.
- Do not run Android validation unless Android code or shared native configuration changed.
- Delegate scoped, mechanical work when the spec is cheaper to write than the work. A delegated task needs files in scope, invariants, and its verification stated up front.
- Architecture, integration, and final verification stay with the main agent; delegated output is not accepted until it passes the repository checks.
- A sandboxed delegate lane has no network access. Do not give a lane any step that needs `pnpm install --frozen-lockfile` or registry access. Install from the lockfile in the main agent before the lane starts, and state the lane's acceptance check in terms of commands that run offline against the already installed workspace.
- Steps that need the iOS Simulator or a long-running local server are not lane work either. Keep `pnpm e2e:ios` and `pnpm --filter @kuyara/worker dev --port 8788` in the main agent or a non-sandboxed sub-agent, and give the lane `pnpm check` or a filtered test command as its acceptance criterion instead.
- Keep final reports focused on changes, validation, risks, and next state.
