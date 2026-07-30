# kuyara architecture

## Current workspace

The repository is a small pnpm monorepo running on Node.js 24:

```text
apps/mobile       Expo SDK 57 and React Native application
apps/worker       Cloudflare Worker boundary
packages/contracts Shared runtime schemas and API types
```

The root `pnpm-lock.yaml` is the only dependency lockfile. Workspace discovery is limited to `apps/*` and `packages/*`.

## Mobile boundaries

The mobile app uses Expo Router and managed Continuous Native Generation, so native projects are generated from Expo configuration rather than stored in the repository. The app config pins the Expo SDK 57 minimum of iOS 16.4 without introducing an iOS-only shared-code assumption.

As product features are added, mobile code is organized feature-first while preserving presentation, domain/application, and data boundaries. React components render state and emit user intent; use cases coordinate behavior; repositories isolate SQLite and external data. Domain models, local records, and API DTOs remain distinct and use explicit mappers.

Expo SQLite owns the implemented local profile and its preferences. TanStack Query will own future remote request state. Hooks or narrow contexts own transient UI state.

The local-profile vertical slice follows this concrete dependency flow:

```text
Expo SQLite database open + ordered migrations
        ↓
project-owned SQLite executor boundary
        ↓
SQLite profile local data source and persistence record
        ↓
local profile repository and domain profile
        ↓
profile application controller/provider
        ↓
onboarding gate, Settings, localization/theme preferences, Today navigation
```

Only the infrastructure adapter imports `expo-sqlite`. The data source owns SQL and row mapping; the repository validates and maps persistence records into domain values; the application controller owns loading, failure, saving, and refreshed profile state. Routes and presentation components depend on that application contract and do not know table names, columns, or SQL.

### Database version 1

`PRAGMA user_version` records the schema version. Bootstrap enables foreign keys and WAL, reads the current version, and applies each pending migration in ascending order through an exclusive transaction. A migration updates `user_version` inside the same transaction and only after its schema work succeeds. Completed migrations are safe to call again; a newer unsupported version or failed migration surfaces a bootstrap error without deleting or recreating the database.

Version 1 creates only `local_profiles`. `singleton_key` is constrained to the sole value `1` and is the primary key, while `id` is a unique generated UUID. Stable, locale-independent checks constrain clothing (`womens`, `mens`, or null before onboarding), language (`system`, `tr`, `en`), theme (`system`, `light`, `dark`), and the integer onboarding flag. Lifecycle timestamps use UTC ISO-8601 text. `deleted_at` is nullable to preserve the settled local-data record shape, but profile deletion and soft-delete workflows are intentionally not implemented.

To add migration version 2, add one migration object with version `2` immediately after version 1, make its schema change idempotent within the migration transaction, and raise the exported latest version to `2`. Do not edit version 1 after release, skip a version, or add a destructive fallback.

### Local profile lifecycle

The data source performs get-or-create in an exclusive transaction. It reads the singleton first, then uses `INSERT OR IGNORE` with a newly generated Expo Crypto UUID v4 and reads the winning row. The in-memory initialization promise coalesces repeated React/Strict Mode calls, while the schema constraint protects across data-source instances. The UUID is never regenerated once a row exists and is never shown or logged.

An incomplete profile has null clothing preference, system language, system appearance, and `onboarding_completed = 0`. Onboarding completion updates all three preferences, completion state, and `updated_at` in one transaction. Settings uses one explicit transactional update per selected preference. Application state changes only after SQLite succeeds; failures restore the previous domain profile and presentation shows localized, non-technical feedback.

The persisted record, domain profile, and UI state are deliberately distinct. The record retains integer booleans, storage column values, and `deleted_at`; the domain exposes strict preference unions, a boolean completion value, and no deletion field; presentation receives only the controller’s domain state and actions.

### Bootstrap and routing

The profile application provider opens the database, migrates it, constructs the local data source and repository, and loads or creates the profile. While this is pending, a calm localized bootstrap state is rendered instead of Today. Initialization failure renders a stable localized error and never falls through to product routes.

After readiness, the Expo Router Stack applies a local onboarding gate: incomplete profiles redirect to `/onboarding`, completed profiles resolve to `/`, and completed profiles cannot normally return to onboarding. `/settings` remains deep-linkable but redirects incomplete profiles back to onboarding. It is presented as a normal pushed screen from Today; no authentication/session naming or tab scaffold is involved.

The localization provider resolves a saved `system | tr | en` preference through the established device-locale fallback. The existing theme provider receives the saved `system | light | dark` preference. Neither architecture is duplicated, and both providers update when the controller publishes a successfully persisted profile.

The first product-facing mobile slice lives under `apps/mobile/src/features/today/`. Its small screen model defines loaded, loading, and unavailable presentation states; loaded snapshots additionally distinguish fresh and stale content. A single frozen fixture supplies the checked-in route with language-independent weather, outfit, clothing, and reason codes. A pure presentation mapper formats the fixed timestamp and maps those codes to English or Turkish before feature-specific React components render them with the shared primitives.

This flow is intentionally local and presentational:

```text
typed deterministic Today fixture
        ↓
locale-aware presentation mapper
        ↓
Today screen compositions
        ↓
semantic tokens and adaptive UI primitives
```

The fixture boundary can later be replaced by a controller or repository result without making the route responsible for data access. No repository, use case, provider DTO, runtime schema, persistence layer, network client, recommendation engine, or global state container is introduced by the mock slice.

## Worker and contract boundaries

The Worker is the server-side boundary for future WeatherKit and AI provider calls, credential protection, validation, and operational limits. Its current entrypoint deliberately returns an empty response and exposes no invented production API.

`packages/contracts` is reserved for Zod schemas shared by mobile and Worker and the TypeScript types inferred from them. It currently exports no schema because no request or response contract has been confirmed. Provider payloads, API DTOs, domain models, and persistence records must not be merged into one model.

## Data flow once implemented

1. Mobile presentation sends user intent to application services.
2. Application services read durable local state through repository interfaces and remote state through a Worker client.
3. The Worker validates input, calls privileged providers, validates their output, and returns a versioned response defined in the contracts package.
4. The mobile client validates the response before mapping it into domain state and preserves the last known good snapshot if refresh fails.

This describes the approved direction. The local profile and SQLite portion is now implemented; Worker, remote request state, live weather, recommendation logic, and remote synchronization remain deferred.
