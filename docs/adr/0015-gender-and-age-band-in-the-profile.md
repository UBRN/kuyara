# ADR 0015: Gender and age band in the profile

Status: Accepted (2026-09-03)

Implementation: not started. This ADR records the decision and the reversals it
makes; the milestone that carries it out is listed in
[`current-status.md`](../current-status.md).

## Context

The profile has carried one recommendation-shaping input since the first schema:
a clothing preference valued `womens` or `mens`. Three separate files state, in
almost the same words, that this is deliberately not a sex or gender field:
`AGENTS.md`, [`product-decisions.md`](../product-decisions.md), and
[`clothing-taxonomy.md`](../clothing-taxonomy.md). No ADR derives the rule; it
was written once and repeated, and the only recorded reasoning appears in
[ADR 0013](0013-catalog-content-corrections-and-version-3.md), where `leggings`
was made available to both preferences precisely because the field gates catalog
applicability rather than identity, so one garment can belong to both without
contradiction.

The maintainer asked for four changes on 2026-09-03:

1. Onboarding should ask for gender directly rather than for a clothing preference.
2. Onboarding should also ask for age, and age should shape the recommendation.
3. The Settings control should be relabelled accordingly, with woman listed first.
4. Onboarding should stop asking for language and appearance, which should follow
   the device and remain changeable in Settings.

The fourth is already consistent with the recorded rules and needs no decision
here. The first two change recorded decisions, and the second also crosses the
[approved AI input privacy boundary](../product-decisions.md#approved-ai-input-privacy-boundary),
whose whole design is a closed list: the request schema is `.strict()`, so a
field that is not enumerated has no representation and is rejected rather than
filtered. Adding age to what the AI receives is therefore not an implementation
detail. It is an amendment to that list.

Nothing in the repository modelled age before this decision. There is no type,
column, migration, contract field, or copy string for it.

## Decision

### 1. The profile models gender; the catalog keeps its own vocabulary

The profile field becomes `gender`, valued `woman` or `man`, required and
prominent in onboarding. The catalog keeps `womens` and `mens` as its
applicability vocabulary, unchanged, and a single explicit mapping converts one
to the other.

Keeping the two vocabularies separate is the point rather than an accident. A
garment belongs to a catalog; a person has a gender; these are different
statements, and ADR 0013's reasoning about `leggings` only holds while the
catalog side keeps its own words. Renaming catalog applicability to gender would
assert that a pair of leggings has a gender, which is both wrong and would
reopen a decision this ADR does not touch.

The AI request field stays named `clothingPreference`. What the model needs to
know is which catalog the supplied options were drawn from, not who the user is.

### 2. Birth year is optional and never leaves the device

The profile gains a nullable `birthYear`. It is asked once in onboarding, may be
skipped, and can be set or changed later in Settings.

Birth year is stored on the device and is never sent anywhere. Only the band
derived from it crosses the network. This is deliberate: the maintainer chose to
collect a birth year rather than a band so the value does not go stale, and the
privacy cost of that precision is contained by never transmitting it.

### 3. Age bands

The band is derived from the local calendar year minus the birth year. Day and
month are not collected, and a band does not need them.

| Band | Age |
| --- | --- |
| `young` | under 30 |
| `adult` | 30 to 59 |
| `older` | 60 and over |

A null birth year yields `adult`. That is the neutral band rather than a claim
about the user, and it keeps every downstream rule total: no code path has to
handle an absent band.

There is no `child` band. The maintainer's first framing included one, but the
band is derived from a birth year and the application is for adults, so a child
band would be written, tested, and never reached. Serving children is a separate
product question that carries App Store age rating and children's data
obligations, and it is out of scope here.

### 4. The band shifts formality preference and excludes nothing

A composed outfit option carries one formality: `casual`, `smart`, or `formal`.
The band selects a preference order over those three:

| Band | Order |
| --- | --- |
| `young` | `casual`, `smart`, `formal` |
| `adult` | `smart`, `casual`, `formal` |
| `older` | `smart`, `formal`, `casual` |

Each row is a permutation of all three levels, never a subset. This is the
load-bearing property. The deterministic layer composes at most 24 complete,
valid, requirement-satisfying, formality-consistent options, and
[ADR 0007](0007-ai-selects-precomposed-outfits.md) then has the AI choose exactly
three of them. Because the band only reorders preference and removes nothing, the
candidate set is identical for every band, so the guarantee that at least three
distinct options exist is unaffected and needs no re-measurement per band. A rule
that filtered instead would have to re-establish that guarantee for every band in
every weather bucket.

The same table is used by the Worker's AI prompt and by the device-local
deterministic fallback, so behaviour does not change when AI is unavailable. It
lives in one place for that reason, and because it is the kind of value that
gets tuned.

An age-to-style mapping is a generalization. It is recorded here as a default
preference, not as a claim about people of any age, and it is expressed as a
reordering rather than a restriction so that no outfit becomes unreachable
because of the user's age.

### 5. What the band cannot do, given the current catalog

A garment type in the bundled catalog records its structural category, thermal
level, water resistance, breathability, and catalog applicability. It records
nothing about age. Formality is the only style dimension a composed option
carries.

The consequence is that this decision shifts which of the same garments are
preferred, and cannot propose materially different clothing per band. Genuinely
age-specific garments would require age metadata on every catalog entry, a
catalog version bump, and re-measurement of the three-option guarantee for each
band. That was considered and rejected for this milestone; see Alternatives.

### 6. The AI input privacy boundary gains one field

`ageBand` is added to the AI request schema and to the approved boundary. It
carries one of three values and no more.

The field is optional in the request schema rather than required, and an
absent band is read as `adult`. The Worker deploys independently of the
application, so a required field would have the new Worker reject every request
from an installed older build, silently demoting those users to the deterministic
fallback. An absent band and a null birth year therefore resolve the same way,
which is the rule this ADR already states rather than a second one.

The band vocabulary and the formality order table live in `packages/contracts`,
because the Worker's prompt and the device-local fallback must apply the same
table and a second copy would drift. The derivation from birth year stays on the
device, since the Worker never receives a birth year.

The Worker's shared AI cache key gains the band as well. The cache is shared
across users because the request contains no personal data, and a three-valued
coarse band does not change that: it splits the key space at most threefold and
identifies no one. The band, not the birth year, is what enters the key.

The rule that a recommendation is regenerated when the clothing preference
changes now reads as gender, and gains one condition: a change of age band. The
trigger is the band, not the birth year. Correcting a mistyped year that leaves
the user in the same band changes nothing the recommendation depends on, and
should not discard a valid snapshot or spend a generation.

### 7. Onboarding and Settings

Onboarding keeps three steps: welcome, gender, birth year. The language and
appearance step is removed. Both continue to default to the device setting and
remain changeable in Settings, which is what the localization rules already
required; onboarding was asking for a choice the system had already made.

Gender stays required and prominent, which preserves
[ADR 0006](0006-three-tab-information-architecture.md)'s rule. Its Settings
control stays last and deliberately unprominent, with woman listed before man.
Birth year sits beside it.

### 8. Migration and existing installations

Schema version 8 rebuilds the profile table, because SQLite cannot alter a
`CHECK` constraint in place. It renames `clothing_preference` to `gender`,
converts `womens` to `woman` and `mens` to `man`, and adds a nullable
`birth_year`.

The column's `CHECK` constraint uses a static lower and upper bound rather than
the current year, because SQLite requires a `CHECK` expression to be
deterministic and a constraint written against the current year would change
meaning as time passes and would fail to re-validate on a later table rebuild.
The bound that has to move with the calendar, rejecting a birth year in the
future, belongs to the domain layer, which already validates before writing.

The same migration sets `onboarding_completed` back to 0. Existing installations
therefore see onboarding again, which is how they are offered the birth year they
never had a chance to give. Their language, appearance, and gender selections are
preserved, so onboarding opens with their existing answers rather than an empty
form. This is the aggressive option and was chosen knowingly: the installed base
is a small internal TestFlight group, and the alternative of a separate one-time
prompt screen is more code for a population that does not need it.

## What this reverses

- The rule that the preference is not a sex or gender field, in `AGENTS.md`,
  `product-decisions.md`, and `clothing-taxonomy.md`. The profile now does model
  gender. The catalog side of that rule survives unchanged: catalog applicability
  is still not a sex field, and ADR 0013's reasoning still holds.
- The closed AI input list, which gains `ageBand`.
- ADR 0006's onboarding content, which no longer includes language and
  appearance. Its three-tab decision and its rule about the clothing control's
  prominence are untouched.

## Consequences

- A user whose relationship to the two catalogs is not captured by two options
  must now answer a question about themselves rather than about clothes. This is
  a real cost of the change and is accepted rather than solved. The mechanism
  underneath is unchanged: the answer still only selects a catalog.
- The application now stores a piece of personal data it did not store before.
  It stays on the device, it is optional, and deleting the application removes
  it, consistent with the accountless MVP.
- Recommendations become sensitive to a field the user may leave empty. The null
  case is not an error state; it is `adult`.
- Every existing installation is returned to onboarding once.
- Schema version 8 lands, which by precedent also disturbs the weather and
  recommendation persistence assertions that pin the current version.

## Alternatives considered

**Add age metadata to the catalog.** This is what would let the application
propose genuinely different clothing per band rather than reordering the same
options. It was rejected for this milestone, not permanently: it needs a
per-garment decision across the whole catalog, a catalog version bump, and
re-measurement of the three-option guarantee for every band in every weather
bucket. It is a milestone of its own and it depends on this one landing first.

**Keep `clothingPreference` in code and change only the visible labels.**
Smallest change, and rejected. The product would ask one thing while the code
recorded another, and the next reader would have to discover the gap.

**Rename catalog applicability to gender as well.** Rejected because it asserts
that garments have a gender, contradicts ADR 0013's reasoning, and spreads
through the contracts package, the Worker, and the taxonomy for no gain.

**Send age as a number, or send a birth year.** Rejected. The recommendation
needs three buckets. Sending anything finer would put a more identifying value
on the network and fragment the shared cache for no product benefit.

**Let the band filter the candidate set instead of ranking it.** Rejected. It
would make some valid outfits unreachable by age, and it would put the
three-option guarantee at risk in exactly the weather buckets where candidates
are already scarce.

**Ask age only, and derive nothing.** Rejected as it does not answer the request:
the maintainer asked for age to change what is recommended.

## Out of scope

- Serving children, and everything that follows from it.
- Age metadata on catalog garments.
- Any use of gender or age beyond catalog selection and formality ordering.
- A non-binary or unspecified gender option. The current decision is two required
  values; revisiting that is a separate product decision.
- Sending either value to any provider other than as the three-valued band
  described above.
