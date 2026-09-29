<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/mobile/assets/splash/kuyara-splash-symbol-dark.png">
  <img src="apps/mobile/assets/splash/kuyara-splash-symbol-light.png" alt="kuyara" width="152">
</picture>

# kuyara

**Reads the day's weather and lays out what to wear.**

![Platform: iOS 26+](https://img.shields.io/badge/platform-iOS%2026%2B-27606A)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm%20Noncommercial-27606A)](LICENSING.md)

<a href="https://apps.apple.com/app/kuyara/id6806664440"><img src="docs/assets/img/badges/app-store-badge-en.svg" alt="Download on the App Store" width="150"></a>

</div>

kuyara is a free iPhone app. It lays out a few complete outfits suited to the day's
weather, chosen from a garment catalog built into the app, so getting dressed is one
calm decision instead of a dozen small ones.

## What it does

- **Today** shows an outfit for the weather ahead, plus a couple of alternatives.
  Tap a piece and swipe to swap it, or open the outfit to see why each piece suits
  the day.
- **Weather** shows current conditions, feels like, wind, UV, the coming hours and
  days, and when it last updated, for your location or a city you search for.
- **Closet**, inside Profile, is a personal record of pieces you own or want, with an
  optional photo. It never shapes suggestions. History keeps the looks you chose to wear.
- **Weather alerts** arrive before rain or a sharp temperature swing, with quiet hours.
- **Your profile** chooses women's or men's clothing. Your dress style (Casual, Smart
  or Formal) and up to three optional styles change the order of suggestions, never
  which ones you can get.

English and Turkish. System, Light and Dark themes. kuyara follows iOS Larger Text,
Bold Text and Increase Contrast.

## How it decides

The weather comes first. Simple rules work out what the weather asks of your clothes,
such as warmth or rain cover, and set aside every piece that cannot handle it. The pieces
that are left are put together into complete outfits. A small AI step then picks a few
that are meaningfully different from each other. On a recent iPhone it runs on the
device; otherwise it runs through kuyara's server. If it is unavailable, the same rules
choose without it.

## Free and quiet

No ads, no subscription, nothing to buy inside the app, and no sign-in. Usage analytics
and performance diagnostics follow the choice you make in the app, apart from rare
technical records described in the [privacy policy](https://ubrn.github.io/kuyara/privacy-policy).
A launch count and update check run regardless of that choice. You can switch sharing
off in Settings. Your location is used to fetch the weather, rounded before it is sent.
It never goes into analytics.

## Stack

Expo, React Native and TypeScript with Expo Router and Expo SQLite, a Cloudflare Worker
in front of the weather and AI providers, and shared Zod contracts, in a pnpm workspace.

```text
apps/mobile         Expo and React Native app
apps/worker         Cloudflare Worker for weather and AI providers
packages/contracts  Shared Zod schemas and API types
docs/               Product decisions, architecture and design
```

Weather comes from WeatherKit, then Open-Meteo, then OpenWeather. The Expo project stays
buildable for Android.

## Getting started

```bash
pnpm install --frozen-lockfile
pnpm check                                     # lint, types, Node tests, Worker bundle
pnpm --filter @kuyara/mobile test:components   # component tests
```

Everything else, from running the app to the Worker and end-to-end tests, is in
[docs/testing.md](docs/testing.md).

## Learn more

**Using the app:** [App Store](https://apps.apple.com/app/kuyara/id6806664440) ·
[Website](https://ubrn.github.io/kuyara/) ·
[Privacy policy](https://ubrn.github.io/kuyara/privacy-policy) ·
[Support](https://ubrn.github.io/kuyara/support) ·
[Issues](https://github.com/UBRN/kuyara/issues)

**Reading the code:** [Architecture](docs/architecture.md) ·
[Product decisions](docs/product-decisions.md) · [Testing](docs/testing.md) ·
[Design](docs/design/) · [Decision records](docs/adr/) · [Licensing](LICENSING.md)

## The name

kuyara comes from *Koyash* (also written *Kuyash*), one of the names associated with
the sun in Turkic mythology.

## License

kuyara is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE),
not open source. You may use, modify and redistribute it for noncommercial purposes;
commercial use needs written permission. Earlier versions were released under the MIT
license and remain so. See [LICENSING.md](LICENSING.md).
