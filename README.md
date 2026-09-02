# kuyara

An open-source weather and outfit recommendation app for iOS and Android.

kuyara reads the local weather and suggests what to wear from its bundled garment
catalog. The Wardrobe is a personal record of garments you own or want; it does
not shape recommendations. Deterministic, testable rules bound what AI may compose.

The name comes from *Koyash* (also written *Kuyash*), one of the names associated
with the sun in Turkic mythology.

## Status

Pre-release. The app fetches live weather through the Worker, produces up to
three validated outfit recommendations with a device-local deterministic fallback,
and includes the mobile notification foundation. Approved next work includes the
UI and UX revision, catalog-only recommendation and three-tab navigation changes,
WeatherKit, and local weather alerts. The current MVP has no account, cross-device
sync, behavioral analytics, or server-sent push. See
[`docs/current-status.md`](docs/current-status.md) for the current state.

## Stack

Expo SDK 57, React Native, TypeScript, Expo Router, Expo SQLite, and a Cloudflare
Worker boundary, in a pnpm workspace on Node.js 24.

```text
apps/mobile         Expo and React Native application
apps/worker         Cloudflare Worker for weather and AI providers
packages/contracts  Shared Zod schemas and API types
docs/               Product decisions, architecture, and design
```

The root `pnpm-lock.yaml` is the only dependency lockfile, and workspace discovery is limited to `apps/*` and `packages/*`. Mobile uses managed Continuous Native Generation, so native `ios/` and `android/` directories are generated only when needed and are not committed. The app config pins iOS 26.0 as the minimum supported version (see [ADR 0011](docs/adr/0011-minimum-ios-26.md)), while the shared Expo project remains Android-compatible.

The Worker serves real weather through an Open-Meteo/OpenWeather chain and AI
recommendations through ordered Workers AI/OpenRouter adapters. Weather and AI
routes are rate limited, the active AI probe is available from Settings, and
preview/production mobile builds use the deployed Worker. The contracts package
owns the provider-neutral runtime schemas; WeatherKit is not integrated yet.

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

- [`docs/current-status.md`](docs/current-status.md) — current state and next milestones
- [`docs/product-decisions.md`](docs/product-decisions.md) — confirmed MVP decisions
- [`docs/architecture.md`](docs/architecture.md) — boundaries and data flow
- [`docs/clothing-taxonomy.md`](docs/clothing-taxonomy.md) — garment catalog contract
- [`docs/design/visual-identity.md`](docs/design/visual-identity.md) — brand and visual rules
- [`docs/design/design-system.md`](docs/design/design-system.md) — tokens and components
- [`docs/testing.md`](docs/testing.md) — test conventions and how to run them
- [`AGENTS.md`](AGENTS.md) — repository rules for contributors and coding agents

## License

[MIT](LICENSE)
