# ADR 0042: The Siri outfit card and adding to the Closet by phrase

Status: Accepted (2026-10-11)

Implementation: the phrase matcher, `apps/mobile/src/features/wardrobe/domain/closet-phrase.ts`, and the Closet add form's phrase field (`fillWardrobeFormFromPhrase` in `features/wardrobe/application/wardrobe-form.ts`) are built and tested. The App Intents, the App Group and the summary writer are not built; the native half needs a new binary.

## Context

[ADR 0034](0034-on-device-ai-selection-through-apple-foundation-models.md) left Siri to its own decision and sketched its shape: App Intents, App Shortcut phrases and a small localized projection written to an App Group container after each snapshot save, because JavaScript does not run during a Siri call.

Two Apple surfaces work on every iOS 26 iPhone in Turkish and English, with or without Apple Intelligence: App Shortcuts, whose fixed phrases classic Siri understands in Turkish when the phrase contains the app name (at most ten shortcuts per app), and the interactive snippet an App Intent can show (`SnippetIntent`). The free-phrasing Siri and its app schemas are English only and have no clothing or weather domain, so kuyara reaches Siri by phrase, not through Siri's personal index.

kuyara has no App Intents, no App Group and no Swift in the app target today. `kuyara.db` lives in expo-sqlite's private folder, and Expo SDK 57 has no App Intents package (`expo-app-intents` is not adopted, ADR 0034 red lines).

Adding a piece to the Closet today means choosing a category, a garment type tile and a colour swatch. A person can say what the piece is in four words ("lacivert keten gömlek"), and the Closet can be filled faster if kuyara reads those words. Measured on 72 labelled phrases, Apple's on-device model mapped 19% to 43% of them to the right catalog type, with or without a glossary in the prompt, while a deterministic name and synonym table reached 97%. The on-device model is not used for this.

## Decision

### 1. The Siri outfit card

- One App Shortcut opens it: "kuyara'da bugün ne giysem?" in Turkish and "What should I wear today in kuyara?" in English, with a few fixed variants per language that keep the app name. The phrases ship in the binary's App Shortcuts string catalog.
- The intent reads the outfit summary (section 3) and shows a snippet card: the outfit name, a drawing of the outfit (the summary's board image, or the pieces as text when there is none), the temperature and condition, and one button, "Başka seçenek" / "Another option", that shows the next of the snapshot's three outfits and comes back to the first after the third. Tapping the card opens that outfit's detail in the app.
- Siri speaks one line. The line is a whole localized sentence written by the app from localization keys, never AI prose and never assembled from translated fragments.
- The card generates nothing. It makes no Worker or AI request, spends no ask-again allowance, reads no Closet data, shows no ownership and no provenance badge, and writes nothing back.
- On a stale day the card is honest: when the summary is missing, unreadable, of an unknown version or past its `validUntil`, it shows no outfit and says that today's outfit is ready when kuyara is opened, with an "Open kuyara" button. Yesterday's outfit is never shown as today's.
- The card has no glow, rainbow edge or other imitation of Siri's own animation, no Apple Intelligence wording or glyph, and no haptic: Law 8's sites in [`design-language.md`](../design/design-language.md#law-8-non-visual-feedback) are unchanged.

### 2. Adding to the Closet by phrase

- In the app first: the Closet's add form gains a phrase field ("lacivert keten gömlek"). The system keyboard's dictation is the voice input; kuyara records no audio. On submit, `matchClosetPhrase` fills the garment type and colour of the form, and the person still saves with the form's own button. Nothing is saved without that press.
- The field accepts a match only when its type is selectable for the profile's clothing preference (`listSelectableGarmentTypes`); otherwise the form stays unfilled and shows the not-understood line. A phrase that is not understood leaves the visual pickers as they are and shows one localized line for its reason.
- Then Siri: one App Shortcut, "kuyara'da gardıroba ekle" / "Add to my Closet in kuyara", asks for the piece in Siri's own words and opens the app at the add form with the phrase, so the same matcher fills it and the person confirms there. The intent itself matches nothing and writes nothing.

### 3. The outfit summary in the App Group

- The app writes one JSON file, `outfit-summary.json`, into the App Group container `group.com.ubrn.kuyara` through expo-file-system's shared-container path, after every recommendation snapshot save and after a language change. Removing the local profile removes the file.
- The file is a derived feed, never a second source of truth: nothing reads it back into the app.
- Version 1 holds: `version`; `language` (`tr | en`, the app's language at writing); `validFrom` and `validUntil`, the instants that bound the snapshot's dressing day, computed by the dressing-day owners (`localDayKey` and `wardrobeDayWindow`) so Swift never repeats the 04:00 and 18:00 rule; the spoken line; the card's localized labels; and up to three outfits, each with its option id, localized outfit name, localized piece names and an optional relative path to a board image in the same container.
- Every string in the file is already localized in the app's language, so a template or wording change ships as a JavaScript update. The binary carries only the App Shortcut phrases and the few lines it needs when no readable summary exists, in Turkish and English.
- A field is only ever added. A change that removes or retypes a field takes a new version, and the app writes a new version only from a binary that reads it. Swift treats an unknown version as no summary.
- The file holds no coordinates, place name, display name, profile or device identifier, Closet data, provider or model name. It uses the file protection class that allows reading after the first unlock, so the card works with a locked phone.

### 4. The native surface

- The App Intents are Swift sources tracked in the repository and added to the main app target by one config plugin registered in `app.json`, the way [ADR 0040](0040-ios-scene-based-life-cycle.md)'s plugin works. The same plugin adds the App Group entitlement. There is no App Intents extension, widget, Control or Live Activity.
- The intents never import the Foundation Models module, which keeps its single importer in the recommendation data layer (ADR 0034 section 6), and they do not need JavaScript to run.
- Android has no counterpart. Shared JavaScript (the matcher, the summary projection) stays platform-neutral; only the summary's file adapter is iOS-only and is a no-op elsewhere.

### 5. The phrase matcher

- `matchClosetPhrase(phrase)` is a pure Wardrobe domain function: no SQLite, React, network, clock or randomness. It returns either `matched` with a catalog `garmentTypeId` and a palette `colorChoice` (or null), or `not-understood` with a reason: `unknown`, `unsupported` (a piece the catalog lacks, such as a bag or socks), `ambiguous` (a word for several types, such as "ceket" or "şapka") or `several-pieces`. The answer holds ids only, never words, so a Turkish and an English phrase for the same piece give the same answer.
- It reads catalog names, synonyms, brand names that stand for one type, colour and pattern words, and fabric and fit words, in Turkish and English. Capital letters, Turkish letters typed without their marks and the dotted and dotless i read alike. A typed word of four letters or more may be one letter away from a name word of five or more (missing, added, changed or two letters swapped); an exact spelling wins over a corrected one, and a correction that could mean two things is dropped.
- Names side by side are one piece named by the last ("kot şort" is shorts in denim); any other word between two names makes them several pieces. An unknown word right after the name may be the real piece ("puffer gilet"), so the phrase is then not understood.
- The colour is a palette option only when the words name one exactly: a single colour, a two-colour option, or a pattern with its colour ("mavi beyaz çizgili" is blue stripes). Denim words choose the denim swatches. Otherwise the colour is left empty and the piece is still matched. Fabric words are read and not returned, because fabric stays outside the Closet record.
- A wrong match costs more than none. A change to the vocabulary keeps the labelled phrase suite in `closet-phrase.test.mjs` passing with no wrong match, and every catalog name in both languages matches its own type.

### 6. Privacy

- The phrase never leaves the device: kuyara sends it to no Worker, AI provider, analytics or telemetry, logs nothing of it and stores it nowhere. The add route reads it once and drops it from the route, and its parameter joins the filtered list in `domain/telemetry-route-params.ts`. Speech recognition is the system's (keyboard dictation, Siri) and follows Apple's terms.
- The [AI input privacy boundary](../product-decisions.md#approved-ai-input-privacy-boundary) is unchanged: a Closet record made from a phrase is Wardrobe data and never reaches AI.
- Neither surface emits an analytics or telemetry event; any count of their use needs its own taxonomy review ([ADR 0033](0033-apple-privacy-obligations-for-first-party-analytics.md)).

## Red lines

- No AI model, on the device or anywhere else, matches a phrase or writes the card's line.
- The card never shows an outfit for a dressing day other than the current one.
- The Siri intent never saves a Closet record without the person's press in the app.
- No Apple Intelligence wording or glyph, no Siri glow imitation and no new haptic on these surfaces.
- The summary never carries location, identity, Closet or provider data.

## Consequences

- The matcher ships as a JavaScript update; the card and the Siri half of the Closet add need a new binary with an App Group capability on the App ID, and the plugin carries the independent review for native configuration.
- Turkish App Shortcut phrases with the app name and a suffix ("kuyara'da") must be checked on a device with Turkish Siri before release; the Simulator cannot show the spoken match.
- Before the app has saved a snapshot on a given dressing day the card shows the stale state, so the morning before kuyara is opened is the common stale case.
- Inflected Turkish forms beyond one letter ("gömleğim", "kazağı") are not understood; the vocabulary grows by adding labelled phrases.

## Not part of this decision

Adding to the Closet from Visual Intelligence and writing the outfit note with a Private Cloud Compute model are measured first and need their own decisions.
