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

<sub>Android coming soon</sub>

</div>

## The name

**kuyara** comes from *koyash* (also written *kuyash*), a Turkic word for the sun. In
Tatar and Bashkir it is still the everyday word for it. Long ago it meant something
warmer: Mahmud al-Kashgari's 11th-century dictionary of Turkic explains it as the
blazing heat of the midday sun. So the name began as sunshine you can feel, which is
exactly the thing you dress for.

The old Turkic sky has more to say about the weather:

- **Sun Mother, Moon Father.** Many Turkic traditions saw the sun as female and the moon
  as male. In Altai belief they are *Kün Ana* and *Ay Ata*.
- **A day named after the sun.** The more common Turkic word for sun, *kün*, also means
  "day". Turkish *gün* (day) and *güneş* (sun) grew from the same root.
- **Sky before God.** In Old Turkic, *kök* meant both "sky" and "blue", and *tengri*
  meant "sky" before it meant "God". The Orkhon inscriptions begin the world with the
  blue sky above and the brown earth below, and people made between them.
- **A compass made of daylight.** The same inscriptions name directions by the sun: east
  is where the sun rises, south is the middle of the day, west is where it sets and
  north is the middle of the night.
- **Weather on demand.** The *yada* stone was believed to bring rain, snow or wind.
  Kashgari writes that he saw it used to make snow fall and put out a summer fire.
- **Winter versus spring.** His dictionary also keeps a verse quarrel between winter and
  spring, one of the oldest debate poems in Turkic. People have been arguing about the
  weather for a very long time.

## What it is

kuyara is a free app for iPhone, with Android coming soon. It lays out a few complete
outfits suited to the day's weather, chosen from a garment catalog built into the app,
so getting dressed is one calm decision instead of a dozen small ones.

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

Weather comes from WeatherKit, then Open-Meteo, then OpenWeather. The same Expo project
builds the Android app.

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

## License

kuyara is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE),
not open source. You may use, modify and redistribute it for noncommercial purposes;
commercial use needs written permission. Earlier versions were released under the MIT
license and remain so. See [LICENSING.md](LICENSING.md).
