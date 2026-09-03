# kuyara

A publicly developed, source-available weather and outfit recommendation app for iOS
and Android.

kuyara reads the local weather and suggests what to wear from its bundled garment
catalog. The Closet is a personal record of garments you own or want; it does
not shape recommendations. Deterministic, testable rules bound what AI may compose.

The name comes from *Koyash* (also written *Kuyash*), one of the names associated
with the sun in Turkic mythology.

## Status

Pre-release. The app fetches live weather through the Worker, produces up to
three validated outfit recommendations with a device-local deterministic fallback,
and includes the mobile notification foundation. Apple WeatherKit is live in
production at the head of the weather provider chain. The active work is an
interface redesign whose visual direction is settled (Direction E, [ADR 0021](docs/adr/0021-direction-e-a-visual-first-design-language.md));
local weather alerts are approved and unblocked but not started. The shipped app has no
account, cross-device sync, analytics, or server-sent push; accounts on Supabase and
PostHog product analytics are both approved directions with no implementation yet, and
analytics is sequenced before the first public release. See
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

The Worker serves real weather through a WeatherKit/Open-Meteo/OpenWeather chain
and AI recommendations through ordered Workers AI/OpenRouter adapters. Weather
and AI routes are rate limited, the active AI probe is available from Settings,
and preview/production mobile builds use the deployed Worker. The contracts
package owns the provider-neutral runtime schemas.

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
- [`docs/design/design-language.md`](docs/design/design-language.md) — the laws between intent and tokens
- [`docs/design/design-system.md`](docs/design/design-system.md) — tokens and components
- [`docs/testing.md`](docs/testing.md) — test conventions and how to run them
- [`AGENTS.md`](AGENTS.md) — repository rules for contributors and coding agents

## License

[PolyForm Noncommercial License 1.0.0](LICENSE). Source-available, not open source:
noncommercial use, modification, and redistribution are granted, and commercial use
needs separate written permission from the copyright holder. Versions distributed
before 2026-09-04 were MIT licensed and remain so. See [`LICENSING.md`](LICENSING.md)
and [ADR 0024](docs/adr/0024-relicensing-to-polyform-noncommercial.md).
