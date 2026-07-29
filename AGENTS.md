# kuyara repository instructions

## Product and current scope

kuyara is an open-source weather and outfit recommendation app built with React Native, TypeScript, and Expo for iOS and Android.

- Optimize the first release for iOS, but keep Android buildable and avoid iOS-only assumptions in shared code.
- Keep the MVP small: no account, cross-device sync, behavioral analytics, or notifications.
- Treat confirmed product decisions in `docs/` as authoritative. Do not silently change them.
- Separate current MVP work from future possibilities. Do not implement speculative infrastructure.

## Working rules

- Inspect the repository, applicable `AGENTS.md` files, and `git status` before editing.
- Preserve unrelated user changes. Do not revert or overwrite work you did not create.
- Prefer the smallest coherent change that satisfies the request and existing architecture.
- Do not create branches or worktrees, commit, push, publish, deploy, or mutate external systems unless the user explicitly requests it.
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
- `apps/worker`: Cloudflare Worker for WeatherKit and AI integrations.
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
- Zod validates untrusted Worker, WeatherKit-derived, and AI payloads at runtime.
- Add Zustand only after demonstrating a concrete state-sharing problem. Do not add Redux Toolkit without an explicit requirement.
- Do not duplicate the same canonical data across React context, TanStack Query, and SQLite.

## Weather and recommendation behavior

- Apple WeatherKit is the initial weather provider, accessed only through the Worker.
- Cache the last valid weather data and recommendation snapshot on-device and render them immediately when available.
- Treat data older than 30 minutes as stale: show it, then refresh in the background on app launch.
- Provide manual refresh and show the last successful update time.
- A failed refresh must not erase the last valid result.
- Do not build a long-term WeatherKit archive.
- Determine weather constraints and required clothing properties with deterministic, testable rules.
- AI may rank or compose only from allowed catalog items and rule outputs.
- Validate AI output with Zod and domain invariants before displaying it.
- Never allow AI output to invent catalog entries or user wardrobe items.
- Provide a deterministic fallback when AI is unavailable, invalid, rate-limited, or over budget.

## Wardrobe and local files

- Wardrobe photos are optional and are not sent to AI in the MVP.
- Resize and compress an imported image, copy it into app-private storage, and store only its relative path in SQLite.
- Do not store image blobs in SQLite.
- When a wardrobe item is deleted, remove its associated private file safely after preserving database consistency.
- Handle missing or corrupt local image files without breaking the wardrobe screen.

## Worker, API, security, and privacy

- Keep the Worker focused on protecting credentials, calling WeatherKit and AI providers, validating inputs/outputs, enforcing rate and spend limits, and exposing a versioned mobile API.
- Store credentials as Cloudflare Worker secrets. Never commit them, expose them through public Expo environment variables, bundle them in the mobile app, or log them.
- Keep privileged signing and provider authentication server-side.
- Put shared request and response schemas in `packages/contracts` when both mobile and Worker use them.
- Treat every network and AI response as untrusted until runtime validation succeeds.
- Return stable, minimal error shapes; do not leak provider responses, tokens, stack traces, or internal configuration.
- Do not log exact coordinates, wardrobe contents, photos, personal preferences, complete AI prompts, or unnecessary user data.
- Prefer coarse, privacy-preserving operational metrics. Do not add behavioral tracking in the MVP.
- Use free tiers and hard spend controls where available. Fail safely when a quota or limit is reached.

## Localization and preferences

- Support Turkish and English from the beginning.
- All user-visible strings must use localization keys; do not hard-code display text in components.
- Default to the device language and system theme.
- Allow Turkish/English and System/Light/Dark overrides in Settings.
- Model “Women's clothing” and “Men's clothing” as a mutable clothing preference, not biological sex.
- Keep stored enum values locale-independent; translate only at the presentation boundary.
- Avoid constructing sentences from translated fragments.

## Platform-adaptive UI and accessibility

- Keep product identity and information architecture consistent while adapting controls, navigation, feedback, and interaction patterns to each platform.
- Follow Apple Human Interface Guidelines on iOS. Use Liquid Glass selectively on supported systems, principally for navigation and controls, with a graceful fallback on older supported iOS versions.
- Follow Material 3 Expressive guidance on Android.
- Do not force one platform's visual components or interaction conventions onto the other.
- Accessibility is a definition-of-done requirement: support font scaling, meaningful screen-reader labels, logical focus order, sufficient contrast, adequate touch targets, and reduced-motion preferences.
- Target the minimum iOS version supported by the selected stable Expo SDK and pin the actual deployment target in repository configuration.

## Testing and verification

- Test behavior and boundaries, not implementation details or coverage percentages alone.
- Give the deterministic recommendation engine thorough unit coverage, including boundary weather values and fallback behavior.
- Test SQLite migrations, repositories, mapper round trips, soft deletion, and local-file cleanup.
- Add contract tests for shared Worker schemas and failure shapes.
- Test critical screens and user interactions with React Native Testing Library.
- Keep Maestro E2E coverage small and focused on critical flows such as onboarding, permission handling, and receiving a recommendation.
- Run commands from the repository root unless a different directory is stated.
- Install exactly from the committed lockfile with `pnpm install --frozen-lockfile`.
- Run the verified aggregate lint, TypeScript, and Worker bundle checks with `pnpm check`.
- Run lint alone with `pnpm run lint` and all current TypeScript checks with `pnpm run typecheck`.
- Inspect the resolved mobile configuration with `pnpm --filter @kuyara/mobile exec expo config --type public --json`.
- Run Expo Doctor from `apps/mobile` with `pnpm dlx expo-doctor@latest`.
- For a local iOS Simulator smoke test, run `pnpm --filter @kuyara/mobile exec expo start --ios --port 8082` and stop Metro with Ctrl+C after verification.
- Verify the Worker bundle without deployment with `pnpm --filter @kuyara/worker bundle`.
- Start the local Worker with `pnpm --filter @kuyara/worker dev --port 8788`; this is a long-running process and must be stopped after verification.
- No format, unit, contract, E2E, or Android build script exists yet. Do not invent or document one as available until the corresponding infrastructure is added and verified.

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

## Code review rules

- Flag presentation code that contains business rules or directly accesses providers or persistence.
- Flag secrets, privileged credentials, sensitive personal data, or complete AI prompts in client code, Git-tracked files, analytics, or logs.
- Flag unvalidated external or AI data crossing into domain or presentation code.
- Flag changes that break offline use, discard last-known-good data after refresh failure, or create competing sources of truth.
- Flag iOS-only shared-code assumptions that leave Android unbuildable.
- Flag hard-coded user-visible strings, inaccessible controls, and missing platform fallbacks.
- Flag speculative sync infrastructure or provider coupling added without an approved requirement.
- Prefer CI for deterministic formatting and lint enforcement; review should focus on correctness, security, privacy, architecture, and regressions.
