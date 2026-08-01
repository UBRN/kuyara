# kuyara mobile

The mobile workspace is an Expo SDK 57 and React Native application using Expo Router.

The checked-in app opens through a device-local onboarding gate backed by Expo SQLite. Onboarding stores one UUID-backed local profile plus clothing, language, and appearance preferences. The Weather tab supports manual sample locations and explicit foreground device location, then reads deterministic sample weather from the local Worker and persists it for cache-first fresh/stale behavior. Today remains driven by its separate typed İstanbul fixture; neither surface accesses live WeatherKit or AI.

`index.js` is the physical mobile entry that delegates to Expo Router. Keeping the entry inside the workspace package avoids resolving the app entry itself through a pnpm symlink when Metro uses the monorepo server root.

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @kuyara/mobile start
```

For local weather development, start the deterministic Worker in another terminal:

```bash
pnpm --filter @kuyara/worker dev --port 8788
```

Worker origins are intentionally distinct:

| Development target | Worker origin | Configuration |
| --- | --- | --- |
| iOS Simulator and web | `http://127.0.0.1:8788` | Built-in development default |
| Android emulator | `http://10.0.2.2:8788` | Built-in development default |
| Remote development sample | `https://kuyara-weather-dev.ubarin08.workers.dev` | Set `EXPO_PUBLIC_KUYARA_WORKER_BASE_URL` explicitly |

The remote URL is the deployed deterministic sample Worker for development verification only. It is not production mobile configuration. [`apps/mobile/.env.example`](.env.example) records the optional value without enabling it; leave the variable unset to keep the platform-specific local defaults. A physical device can instead use the Mac's LAN origin, such as `http://192.168.1.10:8788`, by setting the same variable before starting Expo. Non-development builds require this variable to contain an HTTPS origin, but must not use the sample Worker.

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
