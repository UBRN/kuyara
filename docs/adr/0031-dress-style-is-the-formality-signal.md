# ADR 0031: Dress style is the formality signal, and birth date is a demographic fact

Status: Accepted (2026-09-08)

This ADR owns the current formality and age policy for the profile described in
[ADR 0015](0015-gender-and-age-band-in-the-profile.md). Dress style shapes
recommendations. Birth date is optional and device-only, and only an approved coarse
analytics bucket may be derived from it at emit time under
[ADR 0023](0023-behavioural-product-analytics-with-posthog.md).

## Context

Age is a weak predictor of how a person dresses. Research on older consumers finds that
formal clothing preferences vary with age while casual preferences do not, and that fit
and comfort drive decisions more than fashion. Nothing supports a rule that people under
30 prefer casual clothing; occupation, activities, and the user's own style are stronger
signals.

Consumer styling products reflect that distinction. Alta asks for occupation, weekly
activities, and a style quiz without asking for age. Zara uses age inside its size
profile. H&M and ASOS use age as an invisible model feature or marketing segment, not a
user-facing style category. Fixed cut points such as 30 and 60 have no evidentiary basis
and drift when they are tied to generational labels.

Age remains useful for understanding who uses the product. Analytics platforms report it
in coarse buckets, and data-minimisation guidance prefers a range over a date. The
recommendation therefore asks how the user dresses directly, while analytics receives at
most a bounded demographic bucket.

## Decision

### 1. Persistent formality, aesthetics and optional name

`dressStyle` remains required as one of `casual`, `smart` or `formal`, the profile's persistent default formality. Onboarding asks after gender, and Settings > Profile can change it. A null stored value reads as `smart` for migration compatibility. Copy asks how the user usually dresses and explains that suggestions lean that way first and exclude nothing.

The profile also stores up to three `styleAesthetics` chosen from `minimal`, `classic`, `sporty`, `streetwear`, `relaxed`. They reorder already-valid options as a soft tie-break and never exclude. The optional `displayName` is 2 to 30 characters, asked after welcome with "Not now" and editable in Settings. It remains device-only and outside AI, analytics, telemetry and providers; [ADR 0036](0036-display-name-and-one-time-prompt-gate.md) owns its one-time prompt.

### 2. Dress style selects the formality order

| Dress style | Order |
| --- | --- |
| `casual` | `casual`, `smart`, `formal` |
| `smart` | `smart`, `casual`, `formal` |
| `formal` | `formal`, `smart`, `casual` |

Each row is a permutation of all three levels. The order reorders and excludes nothing,
so the candidate set is identical for every answer and the three-option guarantee needs
no per-style re-measurement. The table lives in `packages/contracts` as
`formalityOrderByDressStyle`, because the Worker prompt and device-local fallback must
apply the same rule. Do not introduce age-band schemas or age-band formality tables.

### 3. The day's resolved formality and sorted aesthetics cross the AI boundary

A daily answer overrides `dressStyle` for its dressing-day key only and uses the same three-value permutation table in section 2. An unanswered day resolves to the persistent default, unless the user explicitly chooses to continue without a choice. The strict request keeps `dressStyle` optional for older clients and defaults an absent value to `smart`. Aesthetics cross only as a closed sorted identifier list; they add one low-cardinality field to the Worker cache key and are applied by the deterministic fallback too.

Recommendation context carries the day's resolved formality and aesthetics. Changing the profile default, the aesthetic choices or the day's answer regenerates the recommendation. Birth date, birth year, display name and derived age never enter the request or cache key and never trigger generation. [ADR 0037](0037-daily-formality-and-style-aesthetics.md) owns the sheet, chip row and plan-tomorrow interaction.

### 4. Birth date is a demographic fact only

Birth date is optional and device-only. It is entered with the system date picker and
shown only as the locale-formatted date; no age category is user-facing. No product logic
reads it.

Approved analytics may derive `age_bucket` only at emit time. Its values are `under_18`,
`18_24`, `25_34`, `35_44`, `45_54`, `55_64`, `65_plus`, and `unknown` when the date is
null. The attachment rules live in [`analytics-taxonomy.md`](../analytics-taxonomy.md).
The date, the year, and the user's gender never appear in analytics, logs, AI requests,
or other network payloads. No bucket is stored. Do not derive an age band anywhere else.

### 5. Onboarding and Settings

Onboarding asks welcome, optional display name, required gender, required dress style, optional birth date and optional location. The location step remains governed by [ADR 0016](0016-location-in-onboarding-and-an-honest-empty-state.md). Settings > Profile edits name, gender, dress style, style aesthetics and birth date. Its birth-date helper footer is removed.

### 6. Schema

Schema version 10's nullable checked `dress_style` remains the existing default field. The Phase 3 migration adds `display_name` and `name_prompt_version`; the Phase 4 migration adds `style_aesthetics`, `morning_sheet_enabled` and `dressing_day_choices`. Numbers are assigned in ship order, and phases shipped in one binary share one migration. Each additive migration preserves all rows and needs the independent review and device-database replay required for a user-device migration. Daily answers are keyed by dressing day. No age-band schema or new formality enum is added. See [ADR 0037](0037-daily-formality-and-style-aesthetics.md).

## Consequences

- **The Worker deploys before any mobile build that sends `dressStyle`.** The optional
  contract field preserves compatibility while deployments roll forward independently.
- A direct style question adds one onboarding step. This is accepted because it is the
  signal the recommendation needs and asks about clothes rather than using a proxy about
  the person.
- The three formality values remain the only wire values; daily copy can be more expressive without changing the enum.
- Research on age and dress is thin. The decision does not claim a universal age effect;
  it relies on the user's own answer rather than an unsupported proxy.

## Alternatives considered

**Keep an age band and tune the cut points.** Rejected. Moving a boundary does not fix a
proxy that measures the wrong thing.

**Ask the system for an age range instead of a date.** iOS 26's Declared Age Range
framework returns a range for app-declared thresholds without revealing the birth date.
Deferred: Android has no counterpart, the framework's stated purpose is age-appropriate
experiences, its use for measurement is unverified against Apple's guidelines, and the
gain is small while age drives no recommendation behavior.

**Make dress style optional.** Rejected. An optional question defaults most users to
`smart` and fails to collect the direct signal the recommendation needs.

**Drop birth date entirely.** Rejected. The product needs the approved coarse analytics
bucket to evaluate who uses it, and deriving that bucket at emit time keeps the stored
date inside the device boundary.

## Out of scope

- Analytics event implementation and attachment rules, governed by ADR 0023 and
  `analytics-taxonomy.md`.
- Occupation, activities, or occasion as further recommendation signals.
- Age metadata on catalogue garments.
