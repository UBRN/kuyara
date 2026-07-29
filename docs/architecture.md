# Kuyara architecture

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

Expo SQLite will own durable local user data and required snapshots. TanStack Query will own remote request state. Hooks or narrow contexts will own transient UI state. These are confirmed boundaries, but none of those feature dependencies or implementations are part of the current scaffold.

## Worker and contract boundaries

The Worker is the server-side boundary for future WeatherKit and AI provider calls, credential protection, validation, and operational limits. Its current entrypoint deliberately returns an empty response and exposes no invented production API.

`packages/contracts` is reserved for Zod schemas shared by mobile and Worker and the TypeScript types inferred from them. It currently exports no schema because no request or response contract has been confirmed. Provider payloads, API DTOs, domain models, and persistence records must not be merged into one model.

## Data flow once implemented

1. Mobile presentation sends user intent to application services.
2. Application services read durable local state through repository interfaces and remote state through a Worker client.
3. The Worker validates input, calls privileged providers, validates their output, and returns a versioned response defined in the contracts package.
4. The mobile client validates the response before mapping it into domain state and preserves the last known good snapshot if refresh fails.

This describes the approved direction, not functionality implemented by this scaffold.
