# ADR 0007: AI selects and labels precomposed outfits

Status: Accepted (2026-08-30)

## Context

ADR 0005 narrowed the recommendation candidate set to the bundled catalog and
restated the AI job as turning deterministic weather requirements into three
outfits that are stylistically coherent and varied: color harmony, consistent
formality, plausible layering, and no repeat of the previous day. Reading that
job against the code exposed three facts.

**The catalog describes types rather than personal garments.** Formality is an
explicit type property. A closed suggested colorway can guide quick-add without
making an owned item's colour or palette harmony an AI input.

**The weather bucket already exists.** `weather-to-clothing-requirements.ts`
already quantizes continuous temperature, wind, precipitation probability, and
condition into discrete tiers. The derived requirement vector is the bucket. A
second bucketing scheme would be a competing source of truth.

**The deterministic layer already composes.** `outfit-composition.ts`
enumerates every valid combination, rejects those missing a mandatory
requirement, scores the rest, and `selectDiverseOutfits` picks three that differ
by body core or by at least two garments. It is fully deterministic and runs on
device.

The remaining constraint is model size. The Worker chain is Cloudflare Workers AI
(`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, then
`@cf/mistralai/mistral-small-3.1-24b-instruct`) followed by free OpenRouter models,
all small and free-tier, with a Workers AI free quota of 10,000 neurons per day.
The raw-garment request under consideration carried up to 125 candidates at a
measured worst case of 65,498 bytes and asked the model to compose, which is the
part a small model fails at. The on-device model ahead of that chain is small
too, so the constraint holds wherever the selection runs.

## Decision

### 1. The model selects, it does not compose

The deterministic layer produces at most **24 complete, valid,
requirement-satisfying, formality-consistent outfits**. The model returns
exactly three of them, each with one archetype identifier.

Which 24 are offered is decided by order rather than by score alone: the
score-sorted arrangements are taken one per formality and one per body core in
turn, and every second body core is offered with its best layered arrangement in
front, so a day that requires no layer still offers layered options.

An option is six body slots and four optional accessory slots. The body is a core
that is either `primary_top` plus `bottom` or a lone `one_piece`, an optional
`mid_layer`, an optional `outer_layer`, and a mandatory `footwear`; that is what is
composed and scored. `head`, `neck`, `hands` and `handheld` are not composed. One
accessory per slot is attached to each finished outfit, decided by the derived
requirements and that outfit's own formality, so an option carries between two and
nine garments. Accessories travel to the model as ordinary garments and are excluded
from the distinctness rule of section 6's table, because they follow from the outfit rather
than distinguish it.

Where that selection runs is decided in
[ADR 0034](0034-on-device-ai-selection-through-apple-foundation-models.md): on-device
through the approved native module when Apple Intelligence is available, otherwise
through the Worker AI chain, otherwise the deterministic device-local fallback of
section 7. The job below is identical on every tier, and so is the validation behind it.

Request and response shape:

```text
request:  { clothingPreference, catalogVersion, dayVariant,
            requirements[], options: [{ optionId, garments[], digest }] }
response: { data: { picks: [ { optionId, archetypeId } x3 ] } }
```

The response JSON schema builds the `optionId` enum from the identifiers
supplied in that request, so a structurally invalid or invented outfit cannot be
generated. Zod and the domain invariants still validate the result afterwards.
The optional `insightSentence` belongs to a versioned successor response while any
installed binary strictly reads this v1 body; the v1 response stays byte-shape
compatible. The device validates the sentence separately and falls back to line 1.
[ADR 0039](0039-ai-v2-route-and-the-validated-insight-sentence.md) defines that successor route and its validation.

`aiV1CandidateLimit`, `aiCandidateSchema`, `aiOutfitSchema`, and
`aiRecommendV1SuccessSchema` are replaced. The option limit is 24, which keeps
the candidate list under 30. The model input a full request serializes to is
11,560 bytes at 24 options of five garments each carrying the conditional archetypes
it qualifies for, and about half as much again on a cold day, whose options also carry
their accessories.

Mobile remains the owner of composition. The selection boundary validates
membership, count, distinctness, and archetype preconditions, and the mobile
mapper checks the same invariants whichever tier answered. No tier gains a
second composition implementation.

### 2. Formality is a catalog property enforced before the model

Each garment type has `formality: 'casual' | 'smart' | 'formal'`. The current
catalog content is version 5 under
[ADR 0013](0013-catalog-content-corrections-and-version-3.md). An outfit's formality spread may be
at most one step, enforced while options are built, so the model never sees an
inconsistent outfit and formality is not an AI responsibility. Dress style
reorders formality preference and excludes nothing, as decided in
[ADR 0031](0031-dress-style-is-the-formality-signal.md).

### 3. Closed colorways stay outside AI input

The catalog supplies a closed colorway per garment type or outfit palette, and the
outfit-detail quick-add sheet preselects its suggested colour. The catalog version
changes with this content so cached recommendations regenerate. A garment type alone
has no user-owned colour. Colour is not sent to AI without a separate privacy and
contract decision; the model still selects supplied option and archetype identifiers.

### 4. Shared result cache and day variant

The request contains no personal data, so one generation serves every user:

```text
cacheKey = hash( sorted requirement vector without reasonCodes,
                 clothingPreference, dressStyle, catalogVersion, dayVariant )
```

`reasonCodes` are excluded because `temperature_low` and
`apparent_temperature_low` produce the same clothing and would split the key
without changing the answer. They are excluded from the prompt for the same
reason.

`dayVariant` is the local day of year modulo 7, not a raw day seed. A raw seed
regenerates every bucket every day and ties quota consumption to daily bucket
count. A seven-slot ring bounds each bucket to at most seven generations, after
which it is a permanent cache hit. Consecutive days do not repeat, which is what
ADR 0005 requires. Weekly recurrence is the accepted tradeoff, and the modulus
is a single constant.

The cache is the Cloudflare Cache API (`caches.default`). No new binding is
added. If the measured hit rate is insufficient, KV is the next step, not the
first one. The shared cache is a Worker concern: an on-device selection is
computed locally and neither consults nor populates it.

### 5. Closed archetype list

Titles come from a closed list of twelve archetypes. The model selects an
identifier, never title text, so titles stay in localization keys. The validated
insight sentence is the one visible prose exception.

| Archetype id | Turkish | English | Code precondition |
|---|---|---|---|
| `everyday_easy` | Günlük Rahat | Easy Everyday | none |
| `smart_casual` | Şık Günlük | Smart Casual | formality at least `smart` |
| `office_ready` | Ofise Uygun | Office Ready | formality `smart` or `formal` |
| `weekend_relaxed` | Hafta Sonu (weekday: Keyifli Gün) | Easy Weekend (weekday: Easygoing) | formality `casual` and the day is not a weekday |
| `layered_warmth` | Katmanlı Sıcaklık | Layered Warmth | mid layer and outer layer both present |
| `cold_shield` | Soğuğa Karşı | Cold Shield | outer layer thermal `high` |
| `rain_ready` | Yağmura Hazır | Rain Ready | water-protective outer layer, on a day whose requirements carry rain or drizzle |
| `snow_day` | Karlı Gün | Snow Day | footwear traction `enhanced`, on a snow or sleet day |
| `wind_guard` | Rüzgara Karşı | Wind Guard | a wind-resistant garment |
| `light_and_airy` | Hafif ve Ferah | Light and Airy | no outer layer, breathability `high`, on a day with no mandatory insulation band at `moderate` or above |
| `on_the_move` | Hareketli Gün | On the Move | footwear `sneakers` |
| `in_between` | Değişken Hava | In-Between | mid layer present, no outer layer |

Twelve is deliberate. A longer list lowers selection quality in a small model
and creates a precondition to write for every entry.

`weekend_relaxed` is the one archetype whose precondition reads the calendar, and
`rain_ready`, `snow_day` and `light_and_airy` are the three that read the weather:
both executors derive the day from the requirements the request already carries
(the reason codes and the mandatory insulation band), so a label never contradicts
the day it is shown on and no request field exists for it; a caller that passes no
day keeps the property-only reading. The
request carries an optional `dayKind` of `weekday` or `weekend`, derived on the
device from its own local date; the seven-day `dayVariant` is a composition
rotation seed and says nothing about the weekday. A request without `dayKind`
leaves the archetype eligible, so a client that predates the field keeps its
behaviour. On a weekday the archetype is offered to neither executor and accepted
from neither, and a casual outfit takes `everyday_easy` instead. The identifier is
locale-independent and never changes; only the words follow the day the result is
read on, so a weekend result read on the Monday after says Casual.

### 6. Verification split

| Rule | Enforced where |
|---|---|
| Body core, single footwear, layer uniqueness | Option construction |
| Mandatory weather requirements | Option construction |
| Formality spread at most one step | Option construction |
| `optionId` is in the supplied set, exactly three, distinct | Selection boundary |
| `archetypeId` is in the closed list and the three differ | Selection boundary |
| The three picks differ by body core or by at least two body garments | Selection boundary |
| Archetype precondition holds for its outfit | Selection boundary |
| Optional `insightSentence` is one sentence, at most 90 characters, in the reader's language; every number matches the snapshot and no banned content appears | Device validation, with deterministic line-1 fallback |

The selection boundary is the on-device client when the selection runs on the
device and the Worker when it runs on the Worker; the mobile mapper enforces the
same invariants either way.

A failed outfit check rejects the whole response and advances to the next tier.
Partial repair remains forbidden.

The optional insight sentence is the one exception to localization-key-only visible
copy. Its failure falls back to the deterministic whole-sentence day insight, while
invalid outfit picks still reject the entire selection. The AI input boundary remains
the existing sanitized weather snapshot projection.

### 7. Fallback assigns archetypes by rule

When every AI tier fails, the deterministic top three ship with archetypes
assigned by the same preconditions, first match in a fixed order. A
recommendation is never withheld.

## Consequences

- The model cannot emit a structurally invalid outfit because it selects from
  options rather than constructing one.
- The request drops from a measured 65,498-byte worst case to roughly 2 KB and
  the response to a few hundred bytes. Measured from the account's Workers AI
  analytics over 30 August to 13 September 2026 (`aiInferenceAdaptiveGroups`,
  `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, 148 calls including the small probe
  requests), a call costs between 41 and 85 neurons, with recent days between 48 and
  63. The 10,000-neuron daily free allocation therefore covers roughly 120 to 200
  Worker selections a day before the quota stop and the deterministic fallback.
- The catalog carries an explicit formality field assigned by hand to every
  entry.
- A closed suggested colorway can preselect quick-add colour without widening AI input.
- Results of a Worker selection are shared across all users by construction,
  which ADR 0005 already accepted. An on-device selection is computed per device.
- Outfits recur on a seven-day cycle for an unchanged weather bucket. Within a
  day, a regeneration excludes the three outfits on screen, so an explicit
  refresh answers with different ones; where excluding them would leave fewer
  than three candidates, as hot weather's four options do, the exclusion is
  dropped whole and the same three return.

## Alternatives considered

- **Let the model compose from raw candidates.** Rejected because it is the
  failure mode of small models, requires the full 65 KB request, and pushes
  every structural invariant into post-hoc validation and retries.
- **Send catalog colorways to AI.** Rejected without a separate privacy and contract
  decision; a suggested quick-add colour does not need model input.
- **Raw local day seed in the cache key.** Rejected because it ties quota
  consumption to daily bucket count under a 10,000-neuron free quota.
- **A new explicit weather bucket model.** Rejected because the requirement
  vector already is one, and a second scheme competes with it.
- **A KV namespace for the shared cache.** Deferred. The Cache API needs no
  binding and the user base is geographically concentrated.
- **Move composition into the Worker.** Rejected for the MVP because it
  duplicates or relocates working device code for no behavioral gain.

## Out of scope

- Sending colour to AI without a separate privacy and contract decision.
- Further catalog expansion or content changes, governed by
  [ADR 0013](0013-catalog-content-corrections-and-version-3.md).
- Wardrobe as a candidate source or a tie-breaker.
- Replacing the OpenRouter step, which stays in the chain before the
  deterministic fallback.
