# kuyara repository instructions

## Product and scope

kuyara is a publicly developed, source-available weather and outfit recommendation app built with React Native, TypeScript, and Expo for iOS and Android. It is licensed under the PolyForm Noncommercial License 1.0.0; do not describe it as open source. See [ADR 0024](docs/adr/0024-relicensing-to-polyform-noncommercial.md) and [`LICENSING.md`](LICENSING.md).

- Optimize the first release for iOS, but keep Android buildable and avoid iOS-only assumptions in shared code.
- Keep the first release small: no account and no cross-device sync. Notifications are on-device local weather alerts with no server-sent push; see [ADR 0004](docs/adr/0004-notifications-in-the-mvp.md) and [ADR 0032](docs/adr/0032-local-weather-alert-rules.md).
- Do not describe kuyara as fundamentally local-first. The accountless first release is a scope decision. Supabase Auth, PostgreSQL, and Storage are the intended long-term backend, and once accounts exist Postgres is authoritative for account-backed data while SQLite stays the device-side working store. See [ADR 0022](docs/adr/0022-supabase-is-the-intended-backend-and-kuyara-is-not-local-first.md).
- Behavioral product analytics is approved with PostHog as the provider and is sequenced before the first public release. It reaches PostHog only through the project-owned `ProductAnalytics` boundary and the reviewed event taxonomy; do not add provider SDK calls in features or emit events outside an approved task. See [ADR 0023](docs/adr/0023-behavioural-product-analytics-with-posthog.md) and [ADR 0033](docs/adr/0033-apple-privacy-obligations-for-first-party-analytics.md).
- kuyara is free and ad-free, with no subscription and no in-app purchase. Paid provider usage runs on a small maintainer-funded budget and must have explicit hard or safely derived limits; automatic top-up and uncontrolled pay-as-you-go overage are not allowed.
- Treat confirmed product decisions in `docs/` as authoritative. Do not silently change them. Current implementation state lives in [`docs/current-status.md`](docs/current-status.md), not in this file.
- Separate current MVP work from future possibilities.

## Release operations

- The Apple Developer Program membership is active. WeatherKit, EAS Build, iOS signing credentials, and TestFlight are permitted work.
- Being permitted is not pre-authorization. App Store Connect submission, TestFlight distribution, deploys, and other production release operations require an explicit user request per the Working rules.

## Working principles

- The release path comes first. Classify every task as a release blocker, user-evidence work, or maintenance, and say which.
- An accepted decision is not reopened without new evidence. A completed and accepted topic is not reviewed again without new risk or new evidence.
- Group small related fixes under one Goal. Every Goal carries a stop boundary, and a completed Goal returns to the release path without inventing follow-up work.
- Do not start unmeasured polish. Do not add speculative infrastructure.
- The default agent count is zero. Delegate only independent, clearly bounded work whose handoff cost is earned by its risk, uncertainty, or output volume.
- The executor's own checks plus the main session's acceptance are the default. An agent report, a READY line, or a green exit is evidence for acceptance, not acceptance.
- A second, independent review is required only for correctness-, security-, privacy-, migration-, or spend-critical changes, or comparable risk.

## Working rules

- Inspect the repository, applicable `AGENTS.md` files, and `git status` before editing.
- Preserve unrelated user changes. Do not revert or overwrite work you did not create.
- Prefer the smallest coherent change that satisfies the request and existing architecture.
- Do not create branches or worktrees, commit, push, publish, deploy, or mutate external systems unless the user explicitly requests it.
- An explicitly started implementation Goal may be committed and pushed with a normal non-force push without a second approval only after it succeeds, all required checks pass, the initially clean worktree still contains only Goal-scoped changes, the main session has reviewed and accepted the final diff, and the remote branch is not ahead. Do not do this when checks fail, scope is unclear, user changes are present, or the remote advanced; never force-push, rebase, create a branch or worktree, tag, PR, release, or deploy under this permission.
- Do not add or upgrade dependencies without explaining the need and checking compatibility with the installed Expo SDK.
- Never invent commands, paths, scripts, environment variables, API shapes, or completed verification.
- If a requested change conflicts with these rules or a recorded decision, stop and explain the conflict.

## Repository structure

The workspace is a pnpm monorepo: `apps/mobile` (Expo and React Native), `apps/worker` (Cloudflare Worker for weather and AI providers), `packages/contracts` (shared Zod schemas and API types), and `docs` (product decisions, architecture, design, and ADRs). The layout is canonical in the [`README.md` Stack section](README.md#stack). Inspect the real tree before assuming a path exists.

## Architecture boundaries

- Organize mobile code feature-first while keeping presentation, domain/application, and data responsibilities distinct.
- Keep business rules out of React components and route files.
- Components render state and emit user intent; use cases/services coordinate domain behavior; repositories abstract persistence and external data.
- UI and domain code must not import SQLite, Supabase, Firebase, WeatherKit, Cloudflare, or provider-specific SDKs directly.
- Keep domain models, SQLite records, API DTOs, and future remote records separate. Convert them through explicit, tested mappers.
- Prefer dependency injection at composition boundaries over global service locators.
- Avoid generic abstractions until at least one concrete boundary or repeated use justifies them.
- Keep one clear source of truth for each piece of state.

## Local data and future-sync rules

- Expo SQLite is the durable device-side database for user-created data and the store the application reads and writes first. It is neither a temporary database nor the product's permanent final authority; see [ADR 0022](docs/adr/0022-supabase-is-the-intended-backend-and-kuyara-is-not-local-first.md).
- Access SQLite only through repository interfaces and local data sources.
- Migrations are explicit, ordered, and tested. Add one migration after the current version; never edit a released migration, skip a version, or add a destructive fallback. Preserve existing rows.
- Generate stable client UUIDs for user-created records, give syncable records `id`, `createdAt`, `updatedAt`, and nullable `deletedAt`, use soft deletion where future cross-device deletion must be representable, and keep the stable `localProfileId` so local data can later be linked to an authenticated profile.
- Do not implement an outbox, sync engine, conflict-resolution protocol, server revision system, remote repository implementation, or placeholder sync abstraction with no caller.
- Supabase is the intended production backend. Firebase is not; any Firebase evaluation stays an isolated prototype, and the two are never used simultaneously in production.

## State ownership

- Expo SQLite owns durable local user data and necessary cached snapshots.
- TanStack Query owns remote request state, caching, retry, invalidation, and refetch behavior where it is used; the existing weather controller is a recorded deviation, see [`docs/architecture.md`](docs/architecture.md).
- React hooks or narrowly scoped context own transient UI state.
- Zod validates untrusted Worker, provider-derived, and AI payloads at runtime.
- Add Zustand only after demonstrating a concrete state-sharing problem. Do not add Redux Toolkit without an explicit requirement.
- Do not duplicate the same canonical data across React context, TanStack Query, and SQLite.

## Weather and recommendation behavior

- Reach every weather provider only through the Worker. The provider chain is a Worker composition concern; mobile depends on the provider-neutral contract. Apple WeatherKit is the primary provider at the head of the chain ahead of the Apple-independent providers, inserted rather than substituted. The deterministic sample provider is a development and test source only, never a production fallback.
- Give each upstream provider an isolated adapter with raw-response runtime validation, explicit unit and condition mapping, timeout handling, and sanitized errors before it produces the provider-neutral model.
- Fall back to the next provider only for eligible failures: availability, timeout, quota or rate limit, authentication or configuration, upstream failure, or invalid response. Never fall back because valid conditions are undesirable or differ between providers. Bound attempts per request and prevent retry or fallback loops.
- Support each provider's attribution requirements. A controlled, non-secret attribution identifier may cross the mobile API; raw provider data, credentials, and internal errors must not.
- Cache the last valid weather data and recommendation snapshot on-device and render them immediately. Treat data older than 30 minutes as stale: show it, then refresh in the background. Provide manual refresh and show the last successful update time. A failed refresh must not erase the last valid result. Do not build a long-term weather archive.
- Determine weather constraints and required clothing properties with deterministic, testable rules.
- A deterministic layer composes at most 24 complete, valid, requirement-satisfying, formality-consistent outfits from the bundled catalog filtered by clothing preference. AI selects exactly three of them and labels each with one archetype identifier from a closed twelve-entry list. The Wardrobe is never a candidate source. AI may select only supplied option identifiers and must never invent outfits, catalog entries, wardrobe items, slots, properties, or identifiers. See [ADR 0007](docs/adr/0007-ai-selects-precomposed-outfits.md).
- Validate every AI response with shared Zod schemas and deterministic domain invariants before it is displayed or persisted. Never silently repair invalid or partially invalid output into a different outfit. Keep AI output structured data, not user-visible prose; all copy comes from localization keys.
- AI is not personalization: it picks three meaningfully different outfits that do not repeat the previous day from already valid options. Dress style reorders formality preference and excludes nothing ([ADR 0031](docs/adr/0031-dress-style-is-the-formality-signal.md)).
- Provide a device-local deterministic three-outfit fallback that composes from the catalog only. AI failure must never prevent a recommendation.
- Generate or refresh a recommendation only on the approved triggers recorded in [`docs/product-decisions.md`](docs/product-decisions.md#approved-recommendation-caching-refresh-and-status-behavior), never on every launch. Cache identity is weather snapshot identity, clothing preference, dress style, catalog version, and day variant. Coalesce duplicate in-flight requests and preserve the last valid recommendation when a refresh fails.
- Record a coarse generation mode on the result: on-device AI, AI-assisted, or deterministic fallback. Never expose provider names, model identity, or technical failures to users or analytics; the single exception is the on-device badge, which names Apple Intelligence as a referential word mark with no logo or glyph. See [ADR 0034](docs/adr/0034-on-device-ai-selection-through-apple-foundation-models.md).

## Wardrobe and local files

- The Wardrobe is a personal record, not a recommendation input. Each entry is `owned` or `wanted`; there is no separate wishlist table, screen, or tab, and neither state affects recommendations in the MVP.
- Every newly created entry references a catalog garment type. Legacy entries with a null `garmentTypeId` stay readable, editable, and deletable; there is no free-form entry outside the catalog.
- Show ownership state only on outfit detail, never on Today.
- Photos are optional and are not sent to AI. Resize and compress an imported image, copy it into app-private storage, and store only its relative path in SQLite. Never store image blobs in SQLite.
- When an item is deleted, remove its private file only after the database write is confirmed. Handle missing or corrupt local image files without breaking the Closet screen.

## Worker, API, security, and privacy

- Keep the Worker focused on protecting credentials, calling weather and AI providers, validating inputs/outputs, enforcing rate and spend limits, and exposing a versioned mobile API.
- Store credentials as Cloudflare Worker secrets. Never commit them, expose them through public Expo environment variables, bundle them in the mobile app, or log them. Keep privileged signing and provider authentication server-side; provider credentials never reach mobile.
- Put shared request and response schemas in `packages/contracts` when both mobile and Worker use them.
- Treat every network and AI response as untrusted until runtime validation succeeds.
- Return stable, minimal error shapes; do not leak provider responses, tokens, stack traces, or internal configuration.
- Send AI only the minimum sanitized structured data defined by the [approved AI input privacy boundary](docs/product-decisions.md#approved-ai-input-privacy-boundary). Never send wardrobe-derived data, photos, paths, free-form names, profile or device identifiers, birth date or birth year, or coordinates.
- Do not log exact coordinates, wardrobe contents, photos, personal preferences, complete AI prompts, or unnecessary user data. Prefer coarse, privacy-preserving operational metrics.
- Analytics and error payloads must never carry exact coordinates, photos or image content, free-form user text, full AI prompts or model responses, raw provider responses, secrets, complete SQLite rows, credentials, or a persistent device fingerprint. Never reuse `localProfileId` as an analytics identifier. Keep properties structured, language-independent, and low-cardinality; aggregate, sample, or omit high-frequency signals.
- Verify App Privacy disclosure, consent, retention, deletion, and revocation obligations against current official Apple documentation before changing analytics and again before submission; the current findings are in ADR 0033. Do not record a conclusion that no privacy work is required.
- Use free tiers and hard spend controls where available. Fail safely when a quota or limit is reached. Keep paid provider keys as Worker secrets, apply a provider-side spending limit where one exists, and never enable automatic credit top-up. Recalculate exact provider quota, rate, and spend limits from current official pricing during implementation; do not freeze prices or quotas in this file.
- Distinguish a non-AI Worker liveness check, AI configuration readiness that calls no provider, and an active AI provider probe. An active probe consumes quota, so it must be explicitly triggered, bounded, rate-limited, and briefly cached.

## Localization and preferences

- Support Turkish and English from the beginning. All user-visible strings use localization keys; do not hard-code display text in components.
- Default to the device language and system theme, with Turkish/English and System/Light/Dark overrides in Settings.
- The profile stores required `gender` (`woman` or `man`, woman listed first), required `dressStyle` (`casual`, `smart`, or `formal`), and an optional device-only birth date shown only as the locale-formatted date and kept out of product logic. One explicit mapping converts gender to the catalog's `womens`/`mens` applicability vocabulary, which is not a sex field. Neither the birth date nor its year may leave the device; analytics may derive a coarse age bucket at emit time only. See [ADR 0031](docs/adr/0031-dress-style-is-the-formality-signal.md).
- Do not promise in user-facing copy that there will never be an account or that everything stays on the device. Accounts are planned; factual documentation about the current accountless MVP is allowed.
- Keep stored enum values locale-independent; translate only at the presentation boundary. Avoid constructing sentences from translated fragments.

## Platform-adaptive UI and accessibility

- Keep three primary tabs: Today at `/`, Weather at `/weather`, and Profile at `/profile`, with the Closet and Settings inside Profile. The English user-facing label for the garment collection is **Closet**, never "Wardrobe"; Turkish is **Gardırop**. The internal domain name, tables, route segment, types and test ids stay `wardrobe`; renaming them for terminology alone is out of scope. Read [ADR 0028](docs/adr/0028-the-profile-tab-and-the-list-row-anatomy.md), [ADR 0029](docs/adr/0029-the-closet-grid.md), [ADR 0030](docs/adr/0030-settings-as-a-native-grouped-list.md), and [ADR 0031](docs/adr/0031-dress-style-is-the-formality-signal.md) before touching Profile, the Closet, Settings, or onboarding.
- Keep product identity and information architecture consistent while adapting controls, navigation, feedback, and interaction patterns to each platform. Follow Apple Human Interface Guidelines on iOS, where the system draws Liquid Glass on the native tab bar and other standard controls, and Material 3 Expressive guidance on Android. Do not force one platform's visual components or interaction conventions onto the other.
- Accessibility is a definition-of-done requirement: support font scaling, meaningful screen-reader labels, logical focus order, sufficient contrast, adequate touch targets, and reduced-motion preferences.
- Target iOS 26.0 as the minimum supported version, a recorded decision ([ADR 0011](docs/adr/0011-minimum-ios-26.md)) pinned in repository configuration.

## UI and visual identity

- Before UI, UX, theme, icon, illustration, animation, splash, or branding work, read the canonical [`docs/design/visual-identity.md`](docs/design/visual-identity.md) and treat its approved decisions as constraints. The accepted visual direction is Direction E, recorded in [ADR 0021](docs/adr/0021-direction-e-a-visual-first-design-language.md); read it before ADR 0017 and ADR 0018, which it constrains. The garment board's composition rule is [ADR 0025](docs/adr/0025-the-garment-board-composition-rule.md), specified in [`docs/design/garment-board.md`](docs/design/garment-board.md); the detail surface it feeds is [ADR 0026](docs/adr/0026-the-recommendation-detail-surface.md). The laws between intent and tokens are in [`docs/design/design-language.md`](docs/design/design-language.md).
- Do not introduce new brand colors, fonts, icon geometry, visual metaphors, or motion styles without explicit approval, and never silently modify the approved Balanced Horizon V2 master geometry. The approved garment silhouette vocabulary is ADR 0025's; additions need approval.
- Use semantic design tokens rather than hardcoded brand values in feature UI.
- Feature code never imports `@expo/ui` or `expo-haptics`. `components/ui` wraps both and is the only importer; `rg "@expo/ui|expo-haptics" apps/mobile/src/features` must return nothing. Native controls render in system colours by design; see [ADR 0019](docs/adr/0019-adopting-expo-ui-at-the-control-layer.md).
- The local Foundation Models Expo module has exactly one importer. `rg "modules/kuyara-on-device-ai" apps/mobile/src` must return only files under `apps/mobile/src/features/recommendation/data/`; see [ADR 0034](docs/adr/0034-on-device-ai-selection-through-apple-foundation-models.md).
- Preserve platform-adaptive iOS and Android behavior instead of forcing pixel-identical interfaces.
- Routine UI work keeps the accessibility standard through the automated checks: the theme and component suites, the greppable design-language checks, and one affected Simulator run for iOS changes. The granular manual pass (a VoiceOver tour, focus-order inspection, a Reduced Motion Simulator tour, the largest accessibility text size) runs only when a task directly changes accessibility behavior, when motion or animation behavior changes and Reduced Motion is affected, in the dedicated accessibility and polish milestone, or when the user asks. Report conflicts between documentation and implementation instead of silently choosing one.
- The reading-order and verification helpers under `.claude/skills/` are for agents whose runtime loads them; the rules stay in this file and in `docs/design/`, and an agent without those helpers follows the documents directly.

## Testing and verification

- Test behavior and boundaries, not implementation details or coverage percentages alone.
- Give the deterministic recommendation engine thorough unit coverage, including boundary weather values and fallback behavior.
- Test SQLite migrations, repositories, mapper round trips, soft deletion, and local-file cleanup.
- Add contract tests for shared Worker schemas and failure shapes.
- Test critical screens and user interactions with React Native Testing Library.
- Keep Maestro E2E coverage small and focused on critical flows such as onboarding, permission handling, and receiving a recommendation.
- Run commands from the repository root unless a different directory is stated. Install exactly from the committed lockfile with `pnpm install --frozen-lockfile`.
- Run the aggregate lint, TypeScript, Node test, and Worker bundle checks with `pnpm check`; lint alone with `pnpm run lint`; TypeScript with `pnpm run typecheck`; every workspace Node test suite with `pnpm test`. The mobile React Native Testing Library suite runs separately with `pnpm --filter @kuyara/mobile test:components` and is not part of `pnpm check`.
- See [`docs/testing.md`](docs/testing.md) for focused suites, Expo configuration and Doctor checks, Simulator smoke testing, Worker bundle and development commands, and `pnpm e2e:ios`.

## Dependency policy

- Use pnpm and commit the lockfile.
- Start from a current stable Expo SDK and use versions compatible with that SDK.
- Prefer platform APIs and existing dependencies before adding a production package. Evaluate maintenance, license, bundle/runtime impact, platform support, and security before adding one.
- Make major upgrades separately and document required migrations.
- Do not replace working libraries merely because another option is more popular.

## Documentation and decisions

- Three layers. Active documents (`AGENTS.md`, [`docs/current-status.md`](docs/current-status.md), [`docs/product-decisions.md`](docs/product-decisions.md), [`docs/architecture.md`](docs/architecture.md), and the canonical `docs/design/` documents) carry only what is true today. An ADR states its decision as it stands today and is rewritten in place when the decision changes: no amendment or supersession markers, no dated inline notes, no amendment sections, no change narrative. Where an abandoned approach must stay abandoned, record it as a red line (what not to do, what to avoid, what to watch for), not as history. Git history is the record of what changed and when; active documents and ADRs do not repeat it.
- Record confirmed product decisions in `docs/product-decisions.md`, architecture and data flow in `docs/architecture.md`, and consequential or hard-to-reverse choices as ADRs. Update the relevant document when behavior or a durable decision changes.
- Do not create archive, cleanup-report, meta-policy, spec, or plan documents in the repository.
- Keep this file concise and focused on rules that apply repeatedly. Put explanations and historical context in `docs/`.
- This file is the single instruction source for every coding agent, whichever runtime runs it. `CLAUDE.md` only imports it; do not duplicate these rules into another agent-instruction file or into a skill. Skills in `.agents/skills/` and `.claude/skills/` are workflow and pointers, not a second rule source.
- Repository documents and ADRs outrank any external memory or vault note.

## Code review rules

- Flag presentation code that contains business rules or directly accesses providers or persistence.
- Flag secrets, privileged credentials, sensitive personal data, or complete AI prompts in client code, Git-tracked files, analytics, or logs.
- Flag unvalidated external or AI data crossing into domain or presentation code.
- Flag changes that break offline use, discard last-known-good data after refresh failure, or create competing sources of truth.
- Flag iOS-only shared-code assumptions that leave Android unbuildable.
- Flag hard-coded user-visible strings, inaccessible controls, and missing platform fallbacks.
- Flag speculative sync infrastructure or provider coupling added without an approved requirement.
- Flag analytics or error payloads that carry raw user content, exact coordinates, photos, free-form text, or a reused persistence identifier.
- Prefer CI for deterministic formatting and lint enforcement; review should focus on correctness, security, privacy, architecture, and regressions.

## Efficient execution and validation

- Use risk-proportionate validation. Protect correctness, safety, and architectural consistency before token savings.
- Read only files relevant to the current task. Do not perform repository-wide scans unless necessary, and do not reread unchanged documentation without a task-specific reason. Batch related inspections and keep exploratory output bounded.
- Do not repeat a successful check unless the implementation changed afterward. During implementation, run only the smallest relevant checks and one consolidated validation pass at the end when proportionate to risk.
- Documentation-only changes normally require only Markdown review and `git diff --check`. Domain logic changes require focused unit tests. UI changes require focused component tests and the automated accessibility checks. Native iOS changes require one affected iOS build or Simulator verification. Do not run Android validation unless Android code or shared native configuration changed.
- Before delivering a change, review it for over-engineering: reinvented standard library, unneeded dependencies, speculative abstractions, and dead flexibility. Remove what the task does not need.
- A delegated task states its files in scope, invariants, and its acceptance check up front, in commands that run offline against the already installed workspace. Install from the lockfile before handing work to a sandboxed executor, and do not give it any step that needs network access, the iOS Simulator, or a long-running local server; keep `pnpm e2e:ios` and the Worker dev server with the main session and give the executor `pnpm check` or a filtered test command instead.
- Architecture and integration stay with the main session, and delegated output is accepted only against the scoped diff and the repository checks.
- Keep final reports focused on changes, validation, risks, and next state.
