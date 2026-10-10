# ADR 0034: Where AI selection runs, and the Foundation Models module

Status: Accepted (2026-09-13)

This ADR defines where the selection of [ADR 0007](0007-ai-selects-precomposed-outfits.md)
runs, what the user is told about it, what data may cross its boundaries, and what the app
does with the Apple Foundation Models module it carries.

## Context

ADR 0007 settled what the AI step does. The deterministic layer composes at most 24
complete, valid, requirement-satisfying, formality-consistent outfits, the model returns
exactly three of them with one archetype identifier each, and it never composes. What
ADR 0007 did not settle is where that selection runs.

Two executors exist. The Worker AI chain (Haiku first, then Workers AI, then OpenRouter)
answers through the versioned mobile API. The app also carries a local Expo module that runs
Apple Foundation Models on Apple Intelligence eligible iPhones, with guided generation that
constrains `optionId` to the supplied identifiers and `archetypeId` to the twelve archetypes.

Measured with the module's own instructions, schema and greedy decoding on a host Foundation
Models runtime (4096-token session window, 203 instruction tokens), over the 42-cell
recommendation grid of `apps/mobile/test/recommendation-grid.mjs`:

- A 24-option input on a cold, freezing or windy day serializes to 3,950 to 4,409 prompt
  tokens, about 2.98 characters of JSON per token, so the session exceeds its window before
  the model answers.
- Where the input fits, the model labels two or three picks with the same archetype. The
  shared gate requires three distinct archetypes, each satisfying its precondition, so it
  rejects the whole answer.
- No grid cell produced an answer the gate accepts.

The module's guided-generation schema is native code shipped in the binary, so neither
failure can be corrected by a JavaScript update.

## Decision

### 1. Two tiers: the Worker AI chain, then the deterministic fallback

The AI selection step runs through an ordered chain:

```text
1. Worker AI chain
2. Deterministic device-local fallback
```

The Foundation Models module is not a tier. No recommendation path, Tomorrow's preview
included, asks it to select outfits, on any device.

The plug-in point is the composition boundary that builds the recommendation client. It
returns a routed client satisfying the `AiClient` interface, so the controller, the mapper,
persistence and the trigger rules keep their shape. Every Worker failure, an answer the
validation gate rejects included, rejects the routed call, and the controller's catch
composes the deterministic fallback.

### 2. The Worker wait bounds the refresh

The Worker request gets 38 s: the Worker's 36 s walk (five attempts of 7 s plus one second)
and 2 s of transport. The deterministic fallback is reached only after the last provider
fails, so the refresh takes as long as a stylist answer needs rather than a clock deciding the
answer is standard. The mobile client sends that wait minus a 1 s transport margin in a
private validated request header; the Worker clamps it from 5 to 36 s and starts no attempt
with less than the 5 s window needed for a measured healthy response.

While the chain runs, Today's phase line narrates it: asking the AI stylist, the answer
being checked, the standard suggestions when the chain fails, then the outfits being
prepared.

### 3. Generation mode keeps its three coarse values

`generationMode` is `on-device-ai | ai-assisted | deterministic-fallback`. The values name a
locus, never a model, a version or a provider. New recommendations carry `ai-assisted` or
`deterministic-fallback`; `on-device-ai` stays a valid stored value, so a snapshot that holds
it still parses, persists and renders.

- SQLite migration v13 widened the `generation_mode` CHECK constraint to the three values by
  rebuilding the table and copying every row. No released migration is edited.
- The generation-mode union, its type guard, the analytics property map (`on_device_ai`) and
  the performance telemetry map stay total over the three values, so a missing branch is a
  type error rather than a silent default.

Provider and model identity stay out of the durable model, the analytics payload, Today and
the recommendation detail. The Settings Service providers screen is the one interface that
may name the provider and model behind the last check (section 5); that identifier crosses
the mobile API as a controlled non-secret value, like a weather attribution identifier, and is
never persisted with a recommendation or sent to analytics.

### 4. Badges, one source sentence, and no provider name

Today gives the AI modes a prominent filled badge directly below the title and leaves the
deterministic mode unmarked. The strings are final and reach the interface through
localization keys like every other string:

| Generation mode | English | Turkish |
| --- | --- | --- |
| `on-device-ai` | Chosen with Apple Intelligence | Apple Intelligence ile seçildi |
| `ai-assisted` | Chosen with AI | Yapay zeka ile seçildi |

The badge is a fragment, so the spoken label carries the subject the badge cannot show:

| Generation mode | English | Turkish |
| --- | --- | --- |
| `on-device-ai` | Recommendation source: kuyara chose this outfit with Apple Intelligence | Öneri kaynağı: kuyara bu kombini Apple Intelligence ile seçti |
| `ai-assisted` | Recommendation source: kuyara chose this outfit with AI | Öneri kaynağı: kuyara bu kombini yapay zeka ile seçti |

The recommendation detail has room for a whole sentence, so it says the source in all three
modes, in plain words after the pieces and before the weather recap. The deterministic
sentence names kuyara as the subject and no AI:

| Generation mode | English | Turkish |
| --- | --- | --- |
| `on-device-ai` | kuyara chose this outfit on your device with Apple Intelligence. | Bu kombini kuyara, cihazında Apple Intelligence ile seçti. |
| `ai-assisted` | kuyara chose this outfit with online AI. | Bu kombini kuyara çevrimiçi yapay zeka ile seçti. |
| `deterministic-fallback` | kuyara put this outfit together on your device. | kuyara bu kombini cihazında hazırladı. |

No string names a provider or a model. What they say is where the outfit was chosen, which
is the fact a user can act on; the provider and model behind the last check are technical
identity and belong on the Settings Service providers screen (section 5).

The rules around them:

- The on-device badge, its spoken label and its source sentence appear only for a stored
  snapshot whose generation mode is `on-device-ai`. A badge shown for any other mode would
  advertise a capability that did not produce the result, which App Store Review Guideline
  2.3.1(a) treats as misleading marketing.
- A settled `deterministic-fallback` result carries no badge at all. The absence of the
  mark is the signal, and a redundant "Standard" badge is not introduced to fill the
  space ([ADR 0021](0021-direction-e-a-visual-first-design-language.md) section 8). The
  detail's source sentence is where that mode is said in words instead. The phase line
  shown while a recommendation is being produced is a different surface and still narrates
  the deterministic fallback as it runs.
- The on-device badge pairs its words with the system's rendering of the `apple.intelligence` SF Symbol and uses a non-purple badge colour. The Worker badge pairs "Chosen with AI" with the SF Symbol `sparkles` drawn as a vivid multicolour layer in violet, fuchsia and gold. It twinkles once on appearance and every six seconds. The symbols supplement the words rather than carrying provenance alone.
- The Apple Intelligence word mark appears only in the on-device badge and its spoken label, the detail source sentence, and the Settings Service providers line naming the last outfit's source, each only for a stored `on-device-ai` snapshot. It stays referential, untranslated and unabbreviated, with no trademark sign under [Apple's third-party trademark guidance](https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html). **Risk accepted:** Apple has not publicly answered whether third parties may draw the `apple.intelligence` SF Symbol; the badge never makes the symbol the only provenance carrier. Apple trademark guidance remains a submission check.
- The copy never claims personalisation. AI picks three meaningfully different outfits
  from already valid options; it does not learn the user
  ([ADR 0031](0031-dress-style-is-the-formality-signal.md)).
- The copy names no model and no version.

### 5. Service providers reports AI and weather status

Settings > Service providers has two grouped sections. Artificial intelligence first names who chose the last outfit, with kuyara as subject: with online AI, from its standard suggestions, or, for a stored `on-device-ai` snapshot, with Apple Intelligence. The footer states the order: online AI, then the standard suggestions. The bounded active Worker probe, "Test online AI", follows. The controlled last-check provider and model ID may appear here alone, never in Today, detail, analytics or persistence. The check calls `POST /v2/ai/probe`, which tests the first provider of the online chain (Haiku when composed) and names it; `POST /v1/ai/probe` serves installed binaries whose closed provider list has no Haiku. The screen reports no on-device availability.

Weather data names the provider behind the last valid snapshot and shows its full attribution, including marks, text, links and the OpenWeather logo as applicable. This is the only weather-attribution surface. The active AI probe retains its quota, cache and rate-limit bounds from ADR 0001.

### 6. The native module stays in the binary, read for availability only

The Foundation Models module lives in Swift under `apps/mobile/modules/kuyara-on-device-ai`.
It is declared for Apple platforms only and its JavaScript entry guards on `Platform.OS`, so
Android and web never load a native module and the entry exports null there. There is no
Kotlin stub.

- The app reads only the module's `getAvailability()`: once per mount of the recommendation
  provider, bounded at 8 s, with no inference and no quota. The answer feeds the
  `on_device_availability` attribute of the `recommendation.generated` Observe event
  ([ADR 0033](0033-apple-privacy-obligations-for-first-party-analytics.md) section 7) and
  nothing user-visible. A read that throws or never settles reports `unknown`; a missing
  module reports `device_not_eligible`.
- The module's `selectOutfits` stays compiled and is called by no production code; an
  invariant test fails on any call.
- Only the recommendation feature's data layer imports the module, through a single file
  that re-exports it. Application, feature and domain code never import it, mirroring the
  rule that `components/ui` is the only importer of the native control layer
  ([ADR 0019](0019-adopting-expo-ui-at-the-control-layer.md)), and enforced the same
  greppable way.
- The Swift source is guarded by `#if canImport(FoundationModels)` and
  `#available(iOS 26, *)`, so it compiles on any Xcode 26 toolchain and reports an
  unsupported OS otherwise. iOS 26.0 stays the minimum deployment target. Building with
  Xcode 27 and the iOS 27 SDK is allowed and is the current local release path. The app uses
  no iOS 27-only API.

### 7. One privacy projection and one distinctness rule

The model-input projection, the pick-distinctness rule and the archetype preconditions live
in `packages/contracts` as shared pure functions. The Worker builds its prompt from the
projection, and the mobile validation gate judges every answer by the same rules, so the
field list defining what a model may see and the rules its reply is judged by exist once.
The wire contract does not change.

The mobile mapper enforces the closed candidate set, the archetype preconditions and the
distinctness rule before anything is displayed or persisted.

### 8. Privacy

The Worker tier follows the [approved AI input privacy
boundary](../product-decisions.md#approved-ai-input-privacy-boundary). The availability read
sends nothing anywhere; its answer leaves the device only as the closed telemetry attribute
above, behind the same consent as every Observe event.

The App Privacy questionnaire answers and the privacy manifest recorded in
[ADR 0033](0033-apple-privacy-obligations-for-first-party-analytics.md) do not change.

## Consequences

- Every device takes the same path: the Worker AI chain, then the deterministic fallback.
  Selection quality no longer varies by device, and Android, ineligible iPhones and eligible
  iPhones behave alike.
- A refresh waits at most 38 s for an AI answer before the standard suggestions.
- The binary still carries the Swift module and its availability check, which the Node
  suites cannot exercise. Removing the module is a native change for a later binary.
- Stored `on-device-ai` snapshots keep their badge, source sentence and Settings line, and the
  analytics and telemetry vocabularies keep the value, so no stored row and no taxonomy entry
  moves.

## Red lines

- The Wardrobe is never a candidate source, on any tier.
- AI selects only from the option identifiers supplied in the request, and only from the
  twelve archetype identifiers.
- Invalid or partially invalid output is rejected whole. It is never repaired into a
  different outfit.
- AI output is structured data. The one user-visible prose field is a device-validated insight sentence with a deterministic localized fallback; other visible copy comes from localization keys.
- [ADR 0039](0039-ai-v2-route-and-the-validated-insight-sentence.md) owns the versioned Worker response carrying that optional sentence.
- No recommendation path calls the on-device model. Putting it back in the chain needs a new
  decision that fits the input in the session window and gets three distinct, eligible
  archetypes from the model itself.
- The Worker AI chain and the deterministic device-local fallback are never removed or
  weakened.
- No third-party Apple Intelligence package: not `@react-native-ai/apple`, not
  `react-native-apple-llm`, not `expo-apple-intelligence`, not `expo-ai-kit`. All are beta
  and all duplicate a small local module.
- `expo-app-intents` is not adopted from expo/expo main.
- Do not raise the minimum deployment target above iOS 26.0 or use an API that requires iOS 27.
- No provider identity, model identity or model version reaches Today, the recommendation
  detail, analytics or the durable domain model; the Settings Service providers screen is the only
  surface that names them.

## Siri is a separate decision

Reaching kuyara from Siri is a second, independent piece of work with its own ADR. Its shape
is two App Intents (one that returns the current recommendation's three outfits, one that
opens Today), one outfit entity, bilingual App Shortcut phrases, and a small localized
projection written to an App Group container after each snapshot save, because JavaScript
does not run during a Siri call. That projection is a derived feed, not a second source of
truth. Stated plainly: no Apple schema covers outfits, so Siri reaches kuyara by phrase and by
shortcut, not through Siri's cross-app personal index, and no copy may suggest otherwise.

## Alternatives considered

**On-device Foundation Models as the first tier.** Rejected. The measurement in the context
produced no answer the gate accepts: large inputs overflow the session window and the rest
repeat an archetype.

**On-device Foundation Models as a fallback behind the Worker, with code assigning distinct
archetypes and a capped input.** Not adopted. The archetype would be chosen by code on that
tier and by the model on the Worker, so ADR 0007's contract would differ by tier, and the
tier's quality and latency on eligible hardware remain unmeasured.

**Adopt a community Apple Intelligence package.** Rejected under the dependency policy. All
candidates are beta, all wrap the same platform API, and a local module keeps the surface
under the repository's own review.

**Wait for the iOS 27 model APIs, including Private Cloud Compute execution.** Deferred,
not rejected. Adopting them would raise the deployment target.

## Out of scope

- Siri, App Intents and App Shortcuts, which have their own ADR.
- Any other use of the Foundation Models module, which is its own decision.
- Any change to what the AI step decides, which stays governed by
  [ADR 0007](0007-ai-selects-precomposed-outfits.md).
- Colorways, catalog content and the candidate set.
- Android on-device inference.
- Changes to the weather provider chain, which stays a Worker composition concern.
