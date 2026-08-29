# kuyara mobile

The mobile workspace uses the repository [stack and workspace layout](../../README.md#stack).

The checked-in app opens through a device-local onboarding gate backed by Expo
SQLite. It persists profile preferences, Wardrobe data, weather and recommendation
snapshots, and the notification opt-in state. Weather comes from the Worker's
Open-Meteo/OpenWeather chain; Today uses the Worker AI route when available and
the device-local deterministic generator otherwise. WeatherKit and local weather
alert rules are not implemented yet.

`index.js` is the physical mobile entry that delegates to Expo Router. Keeping the entry inside the workspace package avoids resolving the app entry itself through a pnpm symlink when Metro uses the monorepo server root.

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @kuyara/mobile start
```

For local weather and AI development, start the Worker in another terminal:

```bash
pnpm --filter @kuyara/worker dev --port 8788
```

Worker origins are intentionally distinct:

| Development target | Worker origin | Configuration |
| --- | --- | --- |
| iOS Simulator and web | `http://127.0.0.1:8788` | Built-in development default |
| Android emulator | `http://10.0.2.2:8788` | Built-in development default |
| Preview and production builds | HTTPS deployed Worker | Set in `eas.json` |

Preview and production EAS profiles provide the deployed HTTPS origin. Development
keeps the platform-specific local defaults unless
`EXPO_PUBLIC_KUYARA_WORKER_BASE_URL` overrides them; a physical device can use a
reachable LAN origin through the same variable. The deployed Worker is
unauthenticated but rate limited, so do not treat its public origin as a secret or
put credentials in the mobile environment.

Test and verification commands are documented in [`docs/testing.md`](../../docs/testing.md).

Rebuild the generated native app after changing native plugins, permissions, or configuration instead of relying on an older Expo Go or development binary. Live WeatherKit, account/sync behavior, and Android visual refinement are separate future work.
