<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/mobile/assets/splash/kuyara-splash-symbol-dark.png">
  <img src="apps/mobile/assets/splash/kuyara-splash-symbol-light.png" alt="kuyara" width="152">
</picture>

# kuyara

**Reads the day's weather and lays out what to wear.**

<a href="https://apps.apple.com/app/kuyara/id6806664440"><img src="docs/assets/img/badges/app-store-badge-en.svg" alt="Download on the App Store" width="150"></a>

</div>

## What it is

kuyara is a free iPhone app, with Android coming soon. It reads the day's weather and
lays out a few complete outfits from a garment catalog built into the app. Simple rules
decide what the weather asks of your clothes, and a small AI step picks outfits that
differ from each other; if the AI step is unavailable, the rules choose on their own.
No ads, no subscription and nothing to buy.

- **Today**: an outfit for the weather ahead, with a couple of alternatives.
- **Weather**: current conditions, the coming hours and days, for your location or a
  city you search for.
- **Closet** and **History**, inside Profile: pieces you own or want, and the looks you
  chose to wear.
- **Weather alerts** before rain or a sharp temperature swing.
- English and Turkish, with System, Light and Dark themes.

## Stack

- Expo, React Native and TypeScript, with Expo Router and Expo SQLite (`apps/mobile`).
- A Cloudflare Worker in front of the weather and AI providers (`apps/worker`).
- Shared Zod schemas and API types (`packages/contracts`).
- A pnpm workspace; minimum iOS 26.

## Running it

```bash
pnpm install --frozen-lockfile
pnpm check                                     # lint, types, tests, Worker bundle
pnpm --filter @kuyara/mobile test:components   # component tests
```

Running the app, the Worker and the end-to-end tests is covered in
[docs/testing.md](docs/testing.md).

## License

kuyara is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE).
Noncommercial use, modification and redistribution are allowed; commercial use needs
written permission. See [LICENSING.md](LICENSING.md).
