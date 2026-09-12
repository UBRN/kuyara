# ADR 0015: Gender, dress style, and birth date in the profile

Status: Accepted (2026-09-03)

Implementation: complete. Profile storage and recommendation behavior, onboarding and
Settings, and the one-time schema version 10 onboarding reset are implemented. Simulator
and Maestro acceptance remain with the orchestrator; see
[`current-status.md`](../current-status.md).

The current formality signal and age policy are decided in
[ADR 0031](0031-dress-style-is-the-formality-signal.md): dress style orders formality,
while birth date is optional, device-only, and absent from product logic.

## Context

The profile needs a user-facing identity field while the catalog needs an applicability
vocabulary. Those are different concepts: the profile uses `woman` or `man`, while the
catalog uses `womens` or `mens`. A single explicit mapping connects them so a garment can
apply to both catalogs without making a statement about the garment's gender. This keeps
the reasoning in [ADR 0013](0013-catalog-content-corrections-and-version-3.md), where
`leggings` is available to both preferences.

The profile also needs a direct formality signal. Age is not that signal: it is a weak
proxy for how a person dresses, and the former cut points had no defensible basis.
Dress style asks about clothes directly. Birth date remains useful only as an optional
demographic fact for coarse product analytics.

The AI request is a strict, closed schema governed by the
[approved AI input privacy boundary](../product-decisions.md#approved-ai-input-privacy-boundary).
Profile changes must therefore say explicitly which derived values may cross the network
and which personal facts must remain on the device.

## Decision

### 1. The profile models gender; the catalog keeps its own vocabulary

The profile field is `gender`, valued `woman` or `man`, required and prominent in
onboarding. Woman is listed first. The catalog keeps `womens` and `mens` as its
applicability vocabulary, and one explicit mapping converts profile gender to catalog
applicability.

Keeping the vocabularies separate is deliberate. A garment belongs to a catalog; a
person has a gender. Do not rename catalog applicability to gender. The AI request field
stays named `clothingPreference`, because the model needs to know which catalog supplied
the options, not the user's gender.

### 2. Birth date is optional and never leaves the device

The profile has a nullable `birthDate`, stored as an ISO calendar date in the
`birth_date` column. It is asked once in onboarding, may be skipped, and can be set or
changed later in Settings through the system date picker. Wherever the personal fact is
shown, the interface renders the locale-formatted date itself. No age category is
user-facing.

The birth date and its year never leave the device, enter a recommendation request or
cache key, or appear in a log. No derived age value is persisted. The only permitted
derivation is the coarse `age_bucket` computed when an approved analytics event is
emitted; its closed values and attachment rules live in
[`analytics-taxonomy.md`](../analytics-taxonomy.md). Gender is not an analytics property.

### 3. No age band exists in product logic

Do not derive, store, display, or transmit an age band for recommendations. Age does not
filter catalog garments, order formality, enter the AI request, split the shared cache,
invalidate a recommendation snapshot, or trigger regeneration. A birth date change
triggers no product behavior. The analytics-only coarse bucket in section 2 is derived at
emit time and is not product logic. This boundary is owned by
[ADR 0031](0031-dress-style-is-the-formality-signal.md).

### 4. Dress style orders formality and excludes nothing

Dress style is the formality signal. Its three values, ordering table, shared Worker and
device-local fallback behavior, and neutral `smart` default are decided in
[ADR 0031](0031-dress-style-is-the-formality-signal.md). The order is always a
permutation of `casual`, `smart`, and `formal`: it reorders the same valid precomposed
options and excludes none, so the three-option guarantee remains intact.

### 5. Age metadata does not belong in the catalog

Garment records describe structural category, thermal level, water resistance,
breathability, and catalog applicability. Do not add age metadata or use age to make a
garment or outfit unreachable. Such metadata would require a separate product decision,
a catalog version bump, and a fresh measurement of the three-option guarantee.

### 6. The AI boundary carries dress style, not personal age data

The strict AI request accepts optional `dressStyle`; absence resolves to `smart` so a
Worker deployed ahead of mobile remains compatible with older clients. The Worker prompt
receives the formality order derived from dress style, and the shared cache key includes
dress style. Birth date, birth year, and any age band are forbidden. The contract and
deployment order are decided in [ADR 0031](0031-dress-style-is-the-formality-signal.md).

### 7. Onboarding and Settings

Onboarding has five steps: welcome, gender, dress style, birth date, and optional location
selection. Gender and dress style are required; birth date and location are skippable.
Language and appearance follow the device by default and remain changeable in Settings,
so onboarding does not ask for them.

Gender and dress style stay prominent in onboarding because they shape catalog selection
and formality order. Settings places Gender, Dress style, and Birth date in that order in
the final, deliberately unprominent About you group. Profile shows none of those personal
facts. The surfaces are decided in
[ADR 0028](0028-the-profile-tab-and-the-list-row-anatomy.md) and
[ADR 0030](0030-settings-as-a-native-grouped-list.md); the location step is decided in
[ADR 0016](0016-location-in-onboarding-and-an-honest-empty-state.md).

### 8. Migration and existing installations

Schema version 8 rebuilds the profile table because SQLite cannot alter a `CHECK`
constraint in place. It renames `clothing_preference` to `gender`, converts `womens` to
`woman` and `mens` to `man`, and adds nullable `birth_date` as ISO calendar-date text.
The database constrains its year to the static range 1900 to 2100; the domain validates a
real calendar date and rejects future dates against the local calendar before writing.

Schema version 10 adds nullable checked `dress_style` and resets
`onboarding_completed` to 0 once. Existing installations therefore enter onboarding once
to answer the new required question. Language, appearance, gender, birth date, other
profile fields, dependent rows, and cached snapshots are preserved, so onboarding opens
with existing answers rather than an empty form. Every reader treats a null dress style
as `smart` until the user completes onboarding.

## Consequences

- A user whose relationship to the two catalogs is not captured by two options must
  answer a question about themselves rather than about clothes. This is an accepted cost;
  the answer still only selects catalog applicability.
- The application stores an optional personal fact. It remains on the device, and
  deleting the application removes it in the accountless first release.
- Recommendations depend on gender-derived clothing preference and dress style, never on
  birth date or age.
- Schema version 8 owns the profile rebuild; schema version 10 owns the checked dress-style
  column and one-time onboarding reset. A schema version bump also moves the weather and
  recommendation persistence assertions that pin the current version.

## Alternatives considered

**Add age metadata to the catalog.** Rejected. It would require a per-garment decision,
a catalog version bump, and re-measurement of the three-option guarantee for every age
group and weather bucket. Any future proposal needs a separate product decision.

**Keep `clothingPreference` in the profile and change only the visible labels.** Rejected.
The product would ask one thing while the stored model recorded another.

**Rename catalog applicability to gender as well.** Rejected because it asserts that
garments have a gender, contradicts ADR 0013's reasoning, and spreads through the
contracts package, the Worker, and the taxonomy for no gain.

**Send age as a number, a birth year, or a band to recommendation services.** Rejected.
Dress style supplies the formality signal directly, while transmitting age would add
personal data and fragment the shared cache without product benefit.

**Let age filter the candidate set.** Rejected. It would make valid outfits unreachable
by age and put the three-option guarantee at risk where candidates are already scarce.

**Ask for age without deriving anything.** Rejected. Birth date is optional and retained
only for the specifically bounded analytics use in section 2.

## Out of scope

- Serving children and the App Store rating and children's-data obligations that follow.
- Age metadata on catalog garments.
- Any use of gender beyond catalogue applicability, and any product-logic use of birth
  date or age.
- A non-binary or unspecified gender option. The current decision has two required values;
  revisiting it is a separate product decision.
- Sending gender, birth date, birth year, or age to an AI provider. Only the derived
  catalog `clothingPreference` and `dressStyle` cross that boundary.
