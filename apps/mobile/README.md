# kuyara mobile

The mobile workspace is an Expo SDK 57 and React Native application using Expo Router.

The checked-in app opens through a device-local onboarding gate backed by Expo SQLite. Onboarding stores one UUID-backed local profile plus clothing, language, and appearance preferences; Today exposes a pushed Settings screen for editing those values. Today itself remains driven by a typed deterministic İstanbul fixture and does not access live weather, location, AI, a Worker API, or wardrobe data.

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @kuyara/mobile start
```

Run the repository checks with:

```bash
pnpm check
```

Run the complete mobile test suite with:

```bash
pnpm --filter @kuyara/mobile test
```

Inspect the resolved public Expo configuration with:

```bash
pnpm --filter @kuyara/mobile exec expo config --type public --json
```

Final product tab navigation, real data integrations, account/sync behavior, and Android visual validation are separate future work.
