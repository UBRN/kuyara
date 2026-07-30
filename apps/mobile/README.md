# kuyara mobile

The mobile workspace is an Expo SDK 57 and React Native application using Expo Router.

The checked-in app opens through a device-local onboarding gate backed by Expo SQLite. Onboarding stores one UUID-backed local profile plus clothing, language, and appearance preferences. The Weather tab supports manual sample locations and explicit foreground device location, then persists deterministic sample weather for cache-first fresh/stale behavior. Today remains driven by its separate typed İstanbul fixture; neither surface accesses live WeatherKit, AI, or a Worker API.

`index.js` is the physical mobile entry that delegates to Expo Router. Keeping the entry inside the workspace package avoids resolving the app entry itself through a pnpm symlink when Metro uses the monorepo server root.

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

Run the focused weather suite with:

```bash
pnpm --filter @kuyara/mobile test:weather
```

Inspect the resolved public Expo configuration with:

```bash
pnpm --filter @kuyara/mobile exec expo config --type public --json
```

Because `expo-location` changes native permissions, rebuild the generated native app after configuration changes instead of relying on an older Expo Go or development binary. Live WeatherKit, account/sync behavior, and Android visual refinement are separate future work.
