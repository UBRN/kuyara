# kuyara mobile

The mobile workspace is an Expo SDK 57 and React Native application using Expo Router.

The checked-in app currently opens into kuyara’s first product-facing Today slice. Today is driven by a typed deterministic İstanbul fixture and presents a localized mock weather summary plus exactly three complete outfit suggestions. It does not access live weather, location, AI, a Worker API, SQLite, or wardrobe data.

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @kuyara/mobile start
```

Run the repository checks with:

```bash
pnpm check
```

Inspect the resolved public Expo configuration with:

```bash
pnpm --filter @kuyara/mobile exec expo config --type public --json
```

Final product navigation, onboarding, persisted language and appearance settings, real data integrations, and Android visual validation are separate future work.
