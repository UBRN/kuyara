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
  // full list applies (frame, manifest, studio, verify).
  locales: process.env.GOLDIE_CAPTURE_LOCALE
    ? [process.env.GOLDIE_CAPTURE_LOCALE]
    : ["en-US", "tr-TR"],
  appearance: "light",

  // Bezel finish is global: silver defines the device on the deep closing tile.
  frame: { variant: "17-pro-silver" },

  theme: {
    // Keep Calm Current copy over Soft Mist; it fails 4.5:1 on pure Quiet Sky.
    background: "linear-gradient(170deg, #27606A 0%, #142F3B 55%, #0D191E 100%)",
    headlineColor: "#EFF4F3",
    subheadColor: "#9FC9D5",
    // Bundled DM Sans: the system stack is not resolvable by the canvas
    // renderer and its fallback lacks the Turkish glyphs (ş, ı, ğ).
    fontFamily: '"Montserrat", "DM Sans", -apple-system, system-ui, sans-serif',
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
        "kuyara reads the forecast for your location and suggests complete outfits for the day, each explained piece by piece.\n\nKeep a closet of what you own and what you want, and see the coming hours before you head out. Free, with no ads.",
      "tr-TR":
        "kuyara bulunduğun yerin hava tahminini okur ve gün için eksiksiz kombinler önerir; her birini parça parça açıklar.\n\nSahip olduğun ve istediğin parçaları gardırobunda tut, çıkmadan önce gelecek saatlere bak. Ücretsiz ve reklamsız.",
    },
  },

  scenes: [
    {
      kind: "screenshot",
      id: "today",
      flow: "store-01-today",
      background: "linear-gradient(170deg, #27606A 0%, #142F3B 60%, #0D191E 100%)",
      headline: {
        "en-US": "Dressed right, every day",
        "tr-TR": "Her gün doğru giyin",
      },
      subhead: {
        "en-US": "Complete outfits, thoughtfully picked for today's forecast.",
        "tr-TR": "Bugünün hava tahminine göre özenle seçilen kombinler.",
      },
      decorations: [{
        kind: "badge",
        text: { "en-US": "Free, no ads", "tr-TR": "Ücretsiz, reklamsız" },
        position: "top-right",
        background: "#9FC9D5",
        color: "#142F3B",
      }],
    },
    {
      kind: "screenshot",
      id: "detail",
      flow: "store-02-detail",
      background: "linear-gradient(160deg, #142F3B 0%, #27606A 100%)",
      headline: {
        "en-US": "See why it works",
        "tr-TR": "Neden uyduğunu gör",
      },
      subhead: {
        "en-US": "Every piece explained against wind, rain and heat.",
        "tr-TR": "Her parça rüzgâra, yağmura ve sıcağa göre açıklanır.",
      },
    },
    {
      kind: "screenshot",
      id: "weather",
      flow: "store-03-weather",
      secondScene: "today",
      background: "linear-gradient(180deg, #0D191E 0%, #142F3B 50%, #27606A 100%)",
      headline: {
        "en-US": "Head out prepared",
        "tr-TR": "Dışarı hazırlıklı çık",
      },
      subhead: {
        "en-US": "Feels-like, wind and the coming hours at a glance.",
        "tr-TR": "Hissedilen, rüzgâr ve gelecek saatler bir bakışta.",
      },
    },
    {
      kind: "screenshot",
      id: "closet",
      flow: "store-04-closet",
      background: "linear-gradient(165deg, #27606A 0%, #142F3B 45%, #0D191E 100%)",
      headline: {
        "en-US": "Your closet, in your pocket",
        "tr-TR": "Gardırobun cebinde",
      },
      subhead: {
        "en-US": "Keep what you own and what you want in one place.",
        "tr-TR": "Olanı ve istediğini tek yerde tut.",
      },
    },
    {
      kind: "screenshot",
      // Reuse the detail capture for the closing tile, without another raw PNG.
      id: "detail",
      flow: "store-02-detail",
      layout: "classic",
      headline: { "en-US": "Ready for your day", "tr-TR": "Gününe hazır ol" },
      background: "linear-gradient(165deg, #142F3B 0%, #0D191E 100%)",
    },
  ],
};

export default config;
