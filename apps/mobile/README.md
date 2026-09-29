# kuyara mobile

The Expo and React Native app. The workspace layout is in the root
[README Stack section](../../README.md#stack), and the commands are in
[docs/testing.md](../../docs/testing.md).

- `index.js` is the entry and hands off to Expo Router. Keeping it inside the package
  stops Metro, which runs from the monorepo root, from resolving the entry through a
  pnpm symlink.
- Rebuild the native app after changing a config plugin, a permission or other native
  configuration; an older development build does not pick those changes up.
- Development builds reach a local Worker at `http://127.0.0.1:8788` on the iOS
  Simulator and `http://10.0.2.2:8788` on the Android emulator, unless
  `EXPO_PUBLIC_KUYARA_WORKER_BASE_URL` overrides it. Production builds get the deployed
  Worker origin from `eas.json`. That origin is public and rate limited, not a secret,
  so never put credentials in the mobile environment.
