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
apps/worker         Cloudflare Worker for weather and future AI providers
packages/contracts  Shared Zod schemas and API types
docs/               Product decisions, architecture, and design
```

## Getting started

```bash
pnpm install --frozen-lockfile
```

Start the deterministic Worker in one terminal and the app in another:

```bash
pnpm --filter @kuyara/worker dev --port 8788
```

```bash
pnpm --filter @kuyara/mobile start
```

Run lint, TypeScript, the Node test suites, and the Worker bundle check:

```bash
pnpm check
```

More detail is in [`apps/mobile/README.md`](apps/mobile/README.md) and
[`docs/testing.md`](docs/testing.md).

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
