# ADR 0034: On-device AI selection through Apple Foundation Models

Status: Proposed (2026-09-12)

Implementation: the shared privacy projection and the distinctness rule in `packages/contracts`, the routed
client, the third generation mode with SQLite migration 13, the three badges, the AI status availability row
and the local Swift Expo module under `apps/mobile/modules/kuyara-on-device-ai` are implemented and bound.
This ADR defines the locus of the AI selection step decided
in [ADR 0007](0007-ai-selects-precomposed-outfits.md): where the selection runs, what the
user is told about it, and what may never move with it. It authorizes the native module,
the routed client, the third generation mode and the shared projection described below,
and nothing else.

## Context

ADR 0007 settled what the AI step does. The deterministic layer composes at most 24
complete, valid, requirement-satisfying, formality-consistent outfits, the model returns
exactly three of them with one archetype identifier each, and it never composes. What
ADR 0007 did not settle is where that selection runs. Until now the only executor has been
the Worker AI chain, with the deterministic device-local fallback behind it.

The task shape fits an on-device model unusually well. The request is a closed set of
identifiers with a fixed answer schema, it carries no free text, and it is small: the
option list is bounded at 24 and the prompt stays under a thousand tokens against the
4096-token session window Apple documents for a Foundation Models session. Guided
generation constrains `optionId` to the identifiers supplied in the request and
`archetypeId` to the twelve archetypes, which is the same structural guarantee the Worker
response schema already provides.

kuyara's minimum is iOS 26 ([ADR 0011](0011-minimum-ios-26.md)), which is the release that
ships the Foundation Models framework, so no deployment target moves and no second minimum
appears. Turkish is a supported device language from iOS 26.1.

Three facts bound the decision.

**Eligibility is narrow.** The on-device model requires Apple Intelligence eligible
hardware, Apple Intelligence switched on, and a supported device language. Android has no
equivalent with structured output today. Most installs will therefore keep using the
Worker, so the Worker tier is not a legacy path to be retired.

**Every Worker AI call costs network time, quota and budget.** kuyara is free and ad-free
and runs on a small maintainer-funded budget with hard limits. Calls that never leave the
device consume none of it, and they cannot be rate limited or fail on a flaky connection.

**No first-party module exists.** Expo ships no Foundation Models module, and the
community packages are beta. The repository's dependency policy prefers a platform API
reached through a small local module over a beta dependency that duplicates it.

## Decision

### 1. Three tiers, first eligible tier wins

The AI selection step runs through an ordered chain:

```text
1. On-device Foundation Models, when availability is "available"
2. Worker AI chain (unchanged)
3. Deterministic device-local fallback (unchanged)
```

Each tier falls to the next on failure. An on-device availability answer of "unavailable"
costs no time and no attempt: the request goes straight to the Worker. Ineligible devices,
Android, a model that is not ready, and every on-device error therefore behave exactly as
they do today.

The plug-in point is the composition boundary that builds the recommendation client. It
returns a routed client satisfying the existing `AiClient` interface, so the controller,
the mapper, persistence and the trigger rules keep their shape. The controller's existing
catch still lands on the deterministic fallback, which means tier 3 is reached by the same
code path as before.

### 2. The user-visible budget does not move

The single user-visible recommendation budget is 20 s. On-device gets 6 s of it and the
Worker gets the remainder, at least 14 s, which is above the Worker chain's measured
range. There is one on-device attempt and no retry; a timed-out attempt is abandoned and
the Worker tier runs within the remaining budget.

The 6 s figure is deliberately conservative because on-device latency has not been
measured on eligible hardware (see [Verification boundary](#verification-boundary)). It is
a ceiling on the cost of trying, not an estimate of the cost of succeeding.

### 3. Generation mode gains a third coarse value

`generationMode` becomes `on-device-ai | ai-assisted | deterministic-fallback`. The new
value names the locus, never a model, a version or a provider. It exists for two reasons:
it is the only signal the user can see that the answer was computed on their device, and
it is the only way to measure how much Worker spend the on-device tier displaces.

The durable cost is explicit:

- SQLite migration v13 widens the `generation_mode` CHECK constraint by rebuilding the
  table and copying every existing row. No released migration is edited, no version is
  skipped, and there is no destructive fallback.
- The generation-mode union, its type guard and its total analytics property map gain the
  third member, so a missing branch is a type error rather than a silent default.
- The analytics taxonomy gains the property value `on_device_ai` and the analytics schema
  version moves to 2.

Provider and model identity stay out of the durable model, the analytics payload and the
interface, exactly as before.

### 4. Three badges, three localized strings, one referential mention

Today and the AI status surface show a badge for each of the three modes. The strings are
final and reach the interface through localization keys like every other string:

| Generation mode | English | Turkish |
| --- | --- | --- |
| `on-device-ai` | Chosen on your device with Apple Intelligence | Apple Intelligence ile cihazında seçildi |
| `ai-assisted` | AI-assisted | AI destekli |
| `deterministic-fallback` | Standard suggestions | Standart öneriler |

The rules around them:

- The on-device badge appears only when the stored generation mode is `on-device-ai`. A
  badge shown for any other mode would advertise a capability that did not produce the
  result, which App Store Review Guideline 2.3.1(a) treats as misleading marketing.
- No Apple logo, glyph or icon accompanies the words. Apple's guidelines for third parties
  permit a word mark in a referential phrase such as "with", and permit no Apple-owned
  graphic symbol.
- kuyara stays the subject of the sentence on the AI status screen, and the Apple word
  mark stays less prominent than the product name.
- The copy never claims personalisation. AI picks three meaningfully different outfits
  from already valid options; it does not learn the user
  ([ADR 0031](0031-dress-style-is-the-formality-signal.md)).
- The copy names no model and no version.

### 5. The AI status screen reports availability without calling anything

The AI status surface gains a first row fed by the module's `getAvailability()` call, with
three user-visible states: available, not available on this device, and Apple Intelligence
is off. Reading availability performs no inference, consumes no quota and takes no
measurable time, so it is not a probe. The active probe stays a Worker probe with its
bounded call, its cached sanitized result and its daily cap
([ADR 0001](0001-worker-ai-probe-and-rate-limiting.md)).

### 6. The native surface is a local Expo module, and only the data layer touches it

The Foundation Models call lives in a local Expo module in Swift under
`apps/mobile/modules/kuyara-on-device-ai`. The module is declared for Apple platforms only
and its JavaScript entry guards on `Platform.OS`, so Android and web never load a native
module and read as unavailable. There is no Kotlin stub: shared code still sees one branch,
because the entry exports the module or null and the routed client treats null as an
unavailable tier.

- The Swift source is guarded by `#if canImport(FoundationModels)` and
  `#available(iOS 26, *)`, so it compiles on any Xcode 26 toolchain and reports an
  unsupported OS otherwise.
- Guided generation constrains `optionId` to the identifiers supplied in the request and
  `archetypeId` to the twelve archetypes of ADR 0007, both as closed enums built as a
  dynamic schema per call. The archetype list cannot be imported into Swift, so it is
  mirrored there and the two copies change together; a drift fails closed onto the Worker,
  because the shared gate rejects an archetype the request did not allow.
- Structured JSON goes in and structured JSON comes out. Prose never crosses the boundary
  in either direction, and the module logs neither the input nor the output.
- One session per call, non-streaming `respond(to:schema:)`, cancelled at the timeout in
  section 2, which the module enforces itself as well as being told it.
- Every on-device failure crosses the boundary as one coded error with a fixed message. The
  caller's next step is the Worker either way, and a finer taxonomy would only risk carrying
  model detail out of the module.
- iOS 26.0 stays the minimum and the build stays on Xcode 26.x.
- Only the recommendation feature's data layer imports the module, through a single file
  that re-exports it. Application, feature and domain code never import it, mirroring the
  rule that `components/ui` is the only importer of the native control layer
  ([ADR 0019](0019-adopting-expo-ui-at-the-control-layer.md)), and enforced the same
  greppable way.

### 7. One privacy projection and one distinctness rule

The model-input projection and the pick-distinctness rule move into `packages/contracts` as
shared pure functions used by both the Worker and the on-device client. Two executors must
not carry two copies of the field list that defines what a model may see, nor two
definitions of "meaningfully different". The wire contract does not change.

The mobile mapper keeps enforcing the closed candidate set and the archetype
preconditions, so both tiers pass through the same validation gate before anything is
displayed or persisted.

### 8. Privacy: nothing new leaves the device

The on-device client is fed from the same request projection as the Worker client, so the
[approved AI input privacy boundary](../product-decisions.md#approved-ai-input-privacy-boundary)
is inherited structurally rather than reimplemented. The inference itself is local, so the
on-device tier sends strictly less off the device than the tier it replaces.

No new data type is collected. The App Privacy questionnaire answers and the privacy
manifest recorded in
[ADR 0033](0033-apple-privacy-obligations-for-first-party-analytics.md) do not change.
Analytics gains the coarse mode value from section 3 and nothing else.

## Consequences

- Eligible devices get a recommendation with no network call, no Worker quota use and no
  spend for the AI step. Worker spend falls by whatever share the released app reports
  through the generation mode.
- The recommendation pipeline gains one decision point and one native surface. The
  controller, mapper, persistence and trigger rules keep their shape, and the deterministic
  fallback keeps its position behind everything.
- The schema, the analytics taxonomy and the analytics schema version move together in one
  step, with migration v13 preserving every existing snapshot row.
- Selection quality now varies by tier, because the on-device model and the Worker models
  choose independently from the same option set. The validation gate bounds the damage to
  an invalid pick, not to a worse-looking pick, so quality is judged by inspection during
  implementation.
- The app carries Swift source and a platform capability check that the Codex sandbox and
  the Node suites cannot exercise. The routed client is tested against a fake native
  module; the real module is verified on a host that can run the model.
- Android behaviour is unchanged in every respect.
- A user on an ineligible device sees the "AI-assisted" badge exactly as before and loses
  nothing.

## Verification boundary

Quality is measured in the iOS 26 Simulator on the maintainer's M3 Pro host, after
confirming that the host runs macOS 26 with Apple Intelligence switched on and that the
Simulator can reach Foundation Models at all. That check comes first, because it decides
whether measurement is possible without borrowed hardware.

The available iPhone 14 Pro is not Apple Intelligence eligible. It exercises the Worker
tier and the deterministic fallback and can prove that an ineligible device costs no extra
time, but it cannot measure the on-device tier.

On-device latency on eligible hardware is therefore unmeasured before release. Two things
follow: the 6 s timeout is conservative rather than tuned, and the real share of
recommendations produced on-device is read from the generation mode after release rather
than predicted before it.

The latency record below is filled in from five runs over a 24-option request when the
measurement is made. It is left empty rather than estimated.

| Measurement | Value |
| --- | --- |
| On-device latency p50, 24 options, five runs | not yet measured |
| On-device latency maximum, 24 options, five runs | not yet measured |

The iPhone 17 Pro Simulator on the maintainer's macOS 26.6 host does reach Foundation
Models: `SystemLanguageModel.default.availability` answers `available` and the system loads
the 3B instruct assets and runs the inference on the host. That is not a device measurement.
Simulator inference runs on the Mac, not on an iPhone's neural engine, so the numbers it
produces describe neither eligible hardware nor a released build. One complete 24-option
round trip there took about 5.3 s, inside the 6 s budget and close to it.

Other attempts on the same host failed inside a tenth of a second with a
`LanguageModelSession.GenerationError` carrying nested underlying errors. **That failure is
undiagnosed.** It is not attributed to the Simulator, because nothing rules out the request
itself: a 24-value `anyOf` dynamic schema sent with `includeSchemaInPrompt` at its default
repeats every option identifier into the same 4096-token session window the projection
already fills, which is one candidate cause among several. Diagnosing it is an open item for
the hardware measurement, and it is the first thing to read before the table below is
filled in: an on-device tier that fails fast is invisible to the user but buys nothing.

Automated verification covers the routed client against a fake native module (available,
unavailable, timeout, invalid JSON, invented identifier, duplicate archetype), the shared
projection and distinctness rule against the Worker's existing expectations, migration v13
row preservation and its rejection of an unknown mode, analytics property totality, and
the three badges and the availability row in the component suite.

## Red lines

- The Wardrobe is never a candidate source, on any tier.
- AI selects only from the option identifiers supplied in the request, and only from the
  twelve archetype identifiers.
- Invalid or partially invalid output is rejected whole. It is never repaired into a
  different outfit.
- AI output is structured data. User-visible copy comes from localization keys.
- The Worker AI chain and the deterministic device-local fallback are never removed,
  weakened or made conditional on the on-device tier.
- No third-party Apple Intelligence package: not `@react-native-ai/apple`, not
  `react-native-apple-llm`, not `expo-apple-intelligence`, not `expo-ai-kit`. All are beta
  and all duplicate a small local module.
- `expo-app-intents` is not adopted from expo/expo main.
- No Xcode 27 build and no higher deployment target.
- No provider identity, model identity or model version reaches users, analytics or the
  durable domain model.

## Siri is a separate decision

Reaching kuyara from Siri is a second, independent piece of work with its own ADR, taken
up only after this one is accepted. Its shape is two App Intents (one that returns the
current recommendation's three outfits, one that opens Today), one outfit entity, bilingual
App Shortcut phrases, and a small localized projection written to an App Group container
after each snapshot save, because JavaScript does not run during a Siri call. That
projection is a derived feed, not a second source of truth. Stated plainly: no Apple schema
covers outfits, so Siri reaches kuyara by phrase and by shortcut, not through Siri's
cross-app personal index, and no copy may suggest otherwise.

## Alternatives considered

**Keep the Worker as the only AI executor.** Rejected. It spends budget and quota on every
request, it needs a working network connection for a decision that is a pure function of
data already on the device, and it pays network latency on hardware that could answer
locally.

**Fold the on-device tier into `ai-assisted`.** Rejected. It costs nothing to implement and
loses both things the third value exists for: the only user-visible signal that the answer
was computed on the device, and the only measurement of Worker spend displacement. The
argument that a third value is provider identity does not hold, because the value names a
locus and no model.

**Adopt a community Apple Intelligence package.** Rejected under the dependency policy. All
candidates are beta, all wrap the same platform API, and a local module keeps the surface
under the repository's own review.

**Wait for the iOS 27 model APIs, including Private Cloud Compute execution.** Deferred,
not rejected. They add an executor abstraction that this decision does not need, and
adopting them would raise the deployment target for a capability the on-device model
already provides.

**Send the on-device tier straight to the deterministic fallback after a timeout.**
Rejected. It shortens the worst case but denies a user with a slow on-device attempt the
better answer the Worker can still produce inside the remaining budget.

## Out of scope

- Siri, App Intents and App Shortcuts, which have their own ADR.
- Any change to what the AI step decides, which stays governed by
  [ADR 0007](0007-ai-selects-precomposed-outfits.md).
- Colorways, catalog content and the candidate set.
- Android on-device inference, which has no framework with structured output today.
- Any new analytics event. Only the generation-mode value changes.
- Changes to the weather provider chain, which stays a Worker composition concern.
