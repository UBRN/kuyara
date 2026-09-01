# ADR 0007: AI selects and labels precomposed outfits

Status: Accepted (2026-08-30)

Implementation: Landed, with one outstanding item. The contract, Worker
validation, deterministic option construction, catalog formality, the mapper,
and rule-based fallback archetype assignment shipped in `ade0d58`; archetype
names became the outfit titles on Today and outfit detail in the change that
followed. Neuron cost per call still has to be measured against a live Workers
AI call rather than estimated.

Amends [ADR 0005](0005-catalog-only-recommendation-candidates.md), section 4.

## Context

ADR 0005 narrowed the recommendation candidate set to the bundled catalog and
restated the AI job as turning deterministic weather requirements into three
outfits that are stylistically coherent and varied: color harmony, consistent
formality, plausible layering, and no repeat of the previous day. Reading that
job against the code exposed three facts.

**The catalog has no color and no formality.** `garment-catalog.ts` describes
garment *types*, not garments. Its fields are thermal, water, wind,
breathability, coverage, traction, and clothing-preference applicability. The
`colorFamily` field in `packages/contracts/src/ai-v1.ts` is therefore always
null for catalog candidates. Color harmony cannot be expressed in the request,
produced by the model, or verified by code.

**The weather bucket already exists.** `weather-to-clothing-requirements.ts`
already quantizes continuous temperature, wind, precipitation probability, and
condition into discrete tiers. The derived requirement vector is the bucket. A
second bucketing scheme would be a competing source of truth.

**The deterministic layer already composes.** `outfit-composition.ts`
enumerates every valid combination, rejects those missing a mandatory
requirement, scores the rest, and `selectDiverseOutfits` picks three that differ
by body core or by at least two garments. It is fully deterministic and runs on
device.

The remaining constraint is provider size. The chain is Cloudflare Workers AI
(`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) followed by free OpenRouter models,
all small and free-tier, with a Workers AI free quota of 10,000 neurons per day.
The current request carries up to 125 candidates at a measured worst case of
65,498 bytes and asks the model to compose from raw garments, which is the part
a small model fails at.

## Decision

### 1. The model selects, it does not compose

The deterministic layer produces at most **24 complete, valid,
requirement-satisfying, formality-consistent outfits**. The model returns
exactly three of them, each with one archetype identifier.

Request and response shape:

```text
request:  { clothingPreference, catalogVersion, dayVariant,
            requirements[], options: [{ optionId, garments[], digest }] }
response: { data: { picks: [ { optionId, archetypeId } x3 ] } }
```

The response JSON schema builds the `optionId` enum from the identifiers
supplied in that request, so a structurally invalid or invented outfit cannot be
generated. Zod and the domain invariants still validate the result afterwards.

`aiV1CandidateLimit`, `aiCandidateSchema`, `aiOutfitSchema`, and
`aiRecommendV1SuccessSchema` are replaced. The option limit is 24, which keeps
the candidate list under 30 and the request near 2 KB.

Mobile remains the owner of composition. The Worker validates membership,
count, distinctness, and archetype preconditions. Neither side gains a second
composition implementation.

### 2. Formality is a catalog property enforced before the model

Each of the 30 garment types gains `formality: 'casual' | 'smart' | 'formal'`.
The catalog version increments accordingly. An outfit's formality spread may be
at most one step, enforced while options are built, so the model never sees an
inconsistent outfit and formality stops being an AI responsibility.

### 3. Color harmony leaves the AI job

ADR 0005 section 4 is corrected: color harmony is removed from the AI job for
the MVP. A garment-type catalog has no color, and writing one into it would
invent data.

If color is wanted later, the mechanism is the archetype mechanism: a closed
colorway vocabulary from which the model picks one identifier per outfit, with
the interface rendering the palette. That keeps output structured and the
catalog clean. It is not in the MVP.

### 4. Shared result cache and day variant

The request contains no personal data, so one generation serves every user:

```text
cacheKey = hash( sorted requirement vector without reasonCodes,
                 clothingPreference, catalogVersion, dayVariant )
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
first one.

### 5. Closed archetype list

Titles come from a closed list of twelve archetypes. The model selects an
identifier, never text, so all user-visible copy stays in localization keys.

| Archetype id | Turkish | English | Code precondition |
|---|---|---|---|
| `everyday_easy` | Günlük Rahat | Easy Everyday | none |
| `smart_casual` | Şık Günlük | Smart Casual | formality at least `smart` |
| `office_ready` | Ofise Uygun | Office Ready | formality `formal` |
| `weekend_relaxed` | Hafta Sonu | Weekend Relaxed | formality `casual` |
| `layered_warmth` | Katmanlı Sıcaklık | Layered Warmth | mid layer and outer layer both present |
| `cold_shield` | Soğuğa Karşı | Cold Shield | outer layer thermal `high` |
| `rain_ready` | Yağmura Hazır | Rain Ready | water-protective outer layer |
| `snow_day` | Karlı Gün | Snow Day | footwear traction `enhanced` |
| `wind_guard` | Rüzgara Karşı | Wind Guard | a wind-resistant garment |
| `light_and_airy` | Hafif ve Ferah | Light and Airy | no outer layer, breathability `high` |
| `on_the_move` | Hareketli Gün | On the Move | footwear `sneakers` |
| `in_between` | Değişken Hava | In-Between | mid layer present, no outer layer |

Twelve is deliberate. A longer list lowers selection quality in a small model
and creates a precondition to write for every entry.

### 6. Verification split

| Rule | Enforced where |
|---|---|
| Body core, single footwear, layer uniqueness | Option construction |
| Mandatory weather requirements | Option construction |
| Formality spread at most one step | Option construction |
| `optionId` is in the supplied set, exactly three, distinct | Worker |
| `archetypeId` is in the closed list and the three differ | Worker |
| The three picks differ by body core or by at least two garments | Worker |
| Archetype precondition holds for its outfit | Worker |

A failed check rejects the whole response and advances to the next provider.
Partial repair remains forbidden.

### 7. Fallback assigns archetypes by rule

When every provider fails, the deterministic top three ship with archetypes
assigned by the same preconditions, first match in a fixed order. A
recommendation is never withheld.

## Consequences

- The model can no longer emit a structurally invalid outfit, because it no
  longer constructs one.
- The request drops from a measured 65,498-byte worst case to roughly 2 KB and
  the response to a few hundred bytes. Neuron cost per call must be measured and
  recorded rather than estimated.
- The catalog gains a field and a version increment, and every existing entry
  needs a formality value assigned by hand.
- Color harmony is absent from the MVP, so outfits are coherent in structure and
  formality but not in palette.
- Results are shared across all users by construction, which ADR 0005 already
  accepted.
- Outfits recur on a seven-day cycle for an unchanged weather bucket.
- The AI contract in `packages/contracts` breaks. Mobile and Worker change
  together in one step.

## Alternatives considered

- **Let the model compose from raw candidates.** Rejected because it is the
  failure mode of small models, requires the full 65 KB request, and pushes
  every structural invariant into post-hoc validation and retries.
- **Add `colorFamily` to catalog entries.** Rejected because a garment type has
  no color and the value would be fabricated.
- **Raw local day seed in the cache key.** Rejected because it ties quota
  consumption to daily bucket count under a 10,000-neuron free quota.
- **A new explicit weather bucket model.** Rejected because the requirement
  vector already is one, and a second scheme competes with it.
- **A KV namespace for the shared cache.** Deferred. The Cache API needs no
  binding and the user base is geographically concentrated.
- **Move composition into the Worker.** Rejected for the MVP because it
  duplicates or relocates working device code for no behavioral gain.

## Out of scope

- Colorways and any color model.
- Expanding the 30-type catalog.
- Wardrobe as a candidate source or a tie-breaker.
- Replacing the OpenRouter step, which stays in the chain before the
  deterministic fallback.
