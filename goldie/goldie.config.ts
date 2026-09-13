import type { GoldieConfig } from "/opt/homebrew/lib/node_modules/goldie/dist/config";

// App Store assets for kuyara. Scene flows live in ../.argent/flows and are
// prefixed store-. Output renders into goldie/out (gitignored).
const APP_ROOT = "/Users/utkubarin/Developer/kuyara";

const config: GoldieConfig = {
  appRoot: APP_ROOT,
  // Release simulator build: `npx expo run:ios --configuration Release` from apps/mobile.
  appPath: `${process.env.HOME}/Library/Developer/Xcode/DerivedData/kuyara-euxuexjtpsjbnlevcwaggnvrdxul/Build/Products/Release-iphonesimulator/kuyara.app`,
  bundleId: "com.ubrn.kuyara",

  devices: ["iphone-6.9"],
  // goldie 0.3.1 captures the app once per device in locales[0] and only
  // localises the marketing copy, so each language is captured in its own
  // run: GOLDIE_CAPTURE_LOCALE=tr-TR goldie capture, then goldie frame
  // --locale tr-TR and goldie preview --locale tr-TR. Without the variable the
  // full list applies (frame, preview, manifest, studio, verify).
  locales: process.env.GOLDIE_CAPTURE_LOCALE
    ? [process.env.GOLDIE_CAPTURE_LOCALE]
    : ["en-US", "tr-TR"],
  appearance: "light",

  // Bezel finish is global: silver defines the device on the deep closing tile.
  frame: { variant: "17-pro-silver" },

  theme: {
    // Keep Calm Current copy over Soft Mist; it fails 4.5:1 on pure Quiet Sky.
    background: "linear-gradient(180deg, #F4F6F5 0%, #F4F6F5 35%, #9FC9D5 100%)",
    headlineColor: "#142F3B",
    subheadColor: "#27606A",
    // Bundled DM Sans: the system stack is not resolvable by the canvas
    // renderer and its fallback lacks the Turkish glyphs (ş, ı, ğ).
    fontFamily: '"DM Sans", -apple-system, system-ui, sans-serif',
    copyHeightRatio: 0.24,
    deviceWidthRatio: 0.84,
    template: ["hero", "tilt", "duo", "offset", "minimal"],
    layout: "classic",
  },

  store: {
    name: "kuyara",
    subtitle: {
      "en-US": "Outfits for today's weather",
      "tr-TR": "Bugünün havasına göre kombin",
    },
    developer: "Utku Barın",
    category: "Weather",
    rating: 4.8,
    ratingCount: "120 Ratings",
    ageRating: "4+",
    price: "Free",
    description: {
      "en-US":
        "kuyara reads the forecast for your location and suggests three complete outfits for the day, each explained piece by piece.\n\nKeep a closet of what you own and what you want, and see the coming hours before you head out. Free, with no ads.",
      "tr-TR":
        "kuyara bulunduğun yerin hava tahminini okur ve gün için üç tam kombin önerir; her birini parça parça açıklar.\n\nSahip olduğun ve istediğin parçaları gardırobunda tut, çıkmadan önce gelecek saatlere bak. Ücretsiz ve reklamsız.",
    },
  },

  scenes: [
    {
      kind: "screenshot",
      id: "today",
      flow: "store-01-today",
      background: "linear-gradient(180deg, #9FC9D5 0%, #F4F6F5 100%)",
      headline: {
        "en-US": "Dress for today's weather",
        "tr-TR": "Havaya göre giyin",
      },
      decorations: [{
        kind: "badge",
        text: { "en-US": "3 outfits a day", "tr-TR": "Günde 3 kombin" },
        position: "top-right",
        background: "#142F3B",
        color: "#EFF4F3",
      }],
    },
    {
      kind: "screenshot",
      id: "detail",
      flow: "store-02-detail",
      background: "#EFF4F3",
      headline: {
        "en-US": "See why it works",
        "tr-TR": "Neden uyduğunu gör",
      },
      subhead: {
        "en-US": "See how each piece meets the weather.",
        "tr-TR": "Her parçanın havaya katkısını keşfet.",
      },
    },
    {
      kind: "screenshot",
      id: "weather",
      flow: "store-03-weather",
      secondScene: "today",
      headline: {
        "en-US": "Head out prepared",
        "tr-TR": "Dışarı hazırlıklı çık",
      },
      subhead: {
        "en-US": "Check the coming hours before you go.",
        "tr-TR": "Çıkmadan önce saatlik tahmine göz at.",
      },
    },
    {
      kind: "screenshot",
      id: "closet",
      flow: "store-04-closet",
      background: "#F4F6F5",
      headline: {
        "en-US": "Keep your Closet close",
        "tr-TR": "Gardırobun cebinde",
      },
      subhead: {
        "en-US": "Track the pieces you own and want.",
        "tr-TR": "Olanı ve istediğini bir arada tut.",
      },
    },
    {
      kind: "screenshot",
      // Reuse the detail capture key for the fifth tile, without another raw PNG.
      // Copy colours are global, so the deep tile uses minimal with a light badge.
      id: "detail",
      flow: "store-02-detail",
      headline: { "en-US": "Ready for your day", "tr-TR": "Gününe hazır ol" },
      background: "linear-gradient(165deg, #142F3B 0%, #0D191E 100%)",
      decorations: [{
        kind: "badge",
        text: { "en-US": "Free, no ads", "tr-TR": "Ücretsiz, reklamsız" },
        position: "top-right",
        background: "#EFF4F3",
        color: "#142F3B",
      }],
    },
    {
      kind: "preview",
      id: "preview",
      segments: [
        { id: "setup", flow: "store-preview-01-setup", holdSeconds: 1 },
        { id: "outfit", flow: "store-preview-02-outfit", holdSeconds: 1 },
        { id: "weather", flow: "store-preview-03-weather", holdSeconds: 2 },
      ],
    },
  ],
};

export default config;
