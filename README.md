# kuyara

An open-source weather and outfit recommendation app for iOS and Android.

kuyara reads the local weather and suggests what to wear from a canonical clothing
catalog and your own wardrobe. Recommendations come from deterministic, testable
rules; AI may only rank or compose items those rules already allow.

The name comes from *Koyash* (also written *Kuyash*), one of the names associated
with the sun in Turkic mythology.

## Status

Pre-release. The app runs locally against a deterministic sample weather endpoint;
production WeatherKit is not integrated. There is no account, cross-device sync,
analytics, or notifications in the MVP. See [`docs/current-status.md`](docs/current-status.md)
for what is implemented today.

## Stack

Expo SDK 57, React Native, TypeScript, Expo Router, Expo SQLite, and a Cloudflare
Worker boundary, in a pnpm workspace on Node.js 24.

```text
apps/mobile         Expo and React Native application
apps/worker         Cloudflare Worker for weather and AI providers
packages/contracts  Shared Zod schemas and API types
docs/               Product decisions, architecture, and design
```

The root `pnpm-lock.yaml` is the only dependency lockfile, and workspace discovery is limited to `apps/*` and `packages/*`. Mobile uses managed Continuous Native Generation, so native `ios/` and `android/` directories are generated only when needed and are not committed. Expo SDK 57 sets iOS 16.4 as the minimum supported version, while the shared Expo project remains Android-compatible.

The Worker currently serves the deterministic weather v1 foundation, has a controlled development-only sample deployment, and serves the AI route through ordered Workers AI and OpenRouter adapters. Mobile persists one recommendation snapshot per local profile and has a device-local deterministic fallback. WeatherKit, the real weather provider chain, Worker rate limiting, and the active AI probe are not implemented. The contracts package owns the provider-neutral weather v1 request, success, and stable minimal error schemas.

## Getting started

```bash
pnpm install --frozen-lockfile
```

Run lint, TypeScript, the Node test suites, and the Worker bundle check:

```bash
pnpm check
```

Development, focused test, Worker, Expo, and Simulator commands are in [`docs/testing.md`](docs/testing.md); mobile configuration details are in [`apps/mobile/README.md`](apps/mobile/README.md).

## Documentation

- [`docs/product-decisions.md`](docs/product-decisions.md) — confirmed MVP decisions
- [`docs/architecture.md`](docs/architecture.md) — boundaries and data flow
- [`docs/clothing-taxonomy.md`](docs/clothing-taxonomy.md) — garment catalog contract
- [`docs/design/visual-identity.md`](docs/design/visual-identity.md) — brand and visual rules
- [`docs/design/design-system.md`](docs/design/design-system.md) — tokens and components
- [`docs/testing.md`](docs/testing.md) — test conventions and how to run them
- [`AGENTS.md`](AGENTS.md) — repository rules for contributors and coding agents

## License

[MIT](LICENSE)
