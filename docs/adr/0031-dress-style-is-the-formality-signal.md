# ADR 0031: Dress style is the formality signal, and birth date is a demographic fact

Status: Accepted (2026-09-08)

Implementation: complete (2026-09-08); Simulator and Maestro acceptance remain with the orchestrator.

Amends: [ADR 0015](0015-gender-and-age-band-in-the-profile.md) sections 3 to 7. The age
band no longer shapes recommendations and no longer crosses the network. The birth date is
kept, optional and device-only, as a demographic fact.
Amends: [ADR 0023](0023-behavioural-product-analytics-with-posthog.md): a coarse age
bucket derived at emit time is an allowed analytics property; the date and the year never are.

## Context

ADR 0015 made age shape the recommendation: a band derived from the birth year (under 30,
30 to 59, 60 and over) reordered formality preference among the precomposed options. The
maintainer questioned the model on 2026-09-08 before the first Worker deployment that
carried it: is "under 30 is young" a defensible line, and what is age actually for?

The evidence, gathered the same day and recorded in the session notes:

- Age is a weak predictor of how a person dresses. Research on older consumers finds that
  formal clothing preferences vary with age while casual preferences do not, and that fit
  and comfort drive their decisions more than fashion. Nothing supports "under 30 prefers
  casual"; a 25-year-old lawyer dresses smart and a 65-year-old retiree dresses casual.
- Life stage and occupation predict formality better than age. Alta, an AI stylist,
  asks for occupation, weekly activities and a style quiz and asks for no age at all. Zara
  asks for age only inside its size profile. H&M and ASOS use age as an invisible model
  feature or a marketing segment, never as a user-facing category.
- The 30 and 60 cut points had no evidence behind them. They happen to coincide with the
  2026 generation boundaries (Gen Z ends at 29), which drift a year every year.
- Age is still useful for something else: understanding who uses the product. Analytics
  platforms report age in standard coarse buckets (18 to 24, 25 to 34, 35 to 44, 45 to 54,
  55 to 64, 65 and over), and data-minimisation guidance prefers a range over a date.

So the signal the recommendation wants is the user's own answer about how they dress, and
the thing age is good for is measurement, not styling.

## Decision

### 1. The profile gains `dressStyle`, required

`dressStyle` is one of `casual`, `smart`, `formal`, the three formality levels the
catalogue already carries. It is asked in onboarding as its own step after gender,
prominently, and is required; it is changeable in Settings' About you group. Stored as
`dress_style TEXT` with a `CHECK` on the three values, nullable so that existing rows and
the reopened onboarding have a state to be in. Every reader treats null as `smart`, the
neutral middle, exactly as the former `adult` default worked, so no code path handles an
absent value.

The question is about the user's clothes, not the user. Copy asks "How do you usually
dress?" and explains that suggestions lean that way first and exclude nothing. Options are
labelled with the formality words the product already uses: Casual, Smart, Formal; Günlük,
Şık, Resmî.

### 2. Dress style selects the formality order

| Dress style | Order |
| --- | --- |
| `casual` | `casual`, `smart`, `formal` |
| `smart` | `smart`, `casual`, `formal` |
| `formal` | `formal`, `smart`, `casual` |

Each row is a permutation of all three levels. ADR 0015 section 4's load-bearing property
is unchanged: the order reorders and excludes nothing, so the candidate set is identical
for every answer and the three-option guarantee needs no re-measurement. The table lives
in `packages/contracts` as `formalityOrderByDressStyle`, because the Worker prompt and the
device-local fallback must apply the same table. `ageBands`, `ageBandSchema` and
`ageBandFormalityOrder` are removed from the contract.

### 3. The AI input boundary trades `ageBand` for `dressStyle`

`dressStyle` replaces `ageBand` in the strict request schema, optional for the same reason
ADR 0015 section 6 gave: the Worker deploys independently, and a required field would make
a new Worker reject every older client. An absent value is read as `smart`. The Worker
prompt receives only the formality order derived from it, as it did from the band. The
shared cache key gains the dress style in the band's place; it is one of three values and
identifies no one.

The recommendation regenerates when the dress style changes, in place of the band-change
trigger. The persisted recommendation context carries the dress style; snapshots written
with a band are read as `smart`. A birth date change triggers nothing anywhere.

### 4. Birth date stays, as a demographic fact only

The birth date remains optional, device-only, entered with the system date picker, shown
only as the locale-formatted date, with no age category ever user-facing (ADR 0015 as
amended on 2026-09-07). What changes is its purpose: no product logic reads it. It exists so
that, when behavioural analytics lands under ADR 0023, the product can be evaluated by who
uses it. At that point the only age value that may leave the device is a coarse bucket
derived at emit time from the year, in the standard buckets 18 to 24, 25 to 34, 35 to 44,
45 to 54, 55 to 64, 65 and over, plus unknown when the date is null. The date and the year
never appear in any payload, log or request. No bucket is stored.

### 5. Onboarding has four steps

Welcome, gender, dress style, birth date. Gender and dress style are required; the birth
date is skippable. Settings' About you group has three rows in that order: Gender, Dress
style, Birth date. Its footer says what each is for.

### 6. Schema

The unshipped version 10 migration from ADR 0015 phase 3 grows to add `dress_style` beside
its onboarding reset, so existing installations meet the new question the one time they are
returned to onboarding. No build carrying version 10 exists, so folding is safe; a second
version for one column would be ceremony.

## What this reverses

- ADR 0015 sections 3 to 6: the band is gone from the domain, the contract, the prompt, the
  cache key and the regeneration trigger. Section 2's containment rule for the date stands
  and is stronger: nothing derived from it crosses the network until analytics does, and
  then only a bucket.
- ADR 0015 section 7: three onboarding steps become four.
- ADR 0023's payload rules gain one explicit permission (a coarse age bucket) and one
  explicit prohibition (the date and the year).

## Consequences

- The Worker deployment prepared for the age band is superseded; the same deployment order
  holds. **The Worker deploys before any mobile build that sends `dressStyle`.** Nothing
  shipped sends `ageBand`, so removing it breaks no installed client.
- A direct question costs one more onboarding step. Accepted: it is the signal the
  recommendation actually needs, and it is about clothes rather than about the person.
- The three formality words become user-facing in a new place. They already exist in the
  recommendation detail copy, so no new vocabulary is introduced.
- Research on age and dress is thin; this decision does not claim the opposite finding. It
  claims that a user's own answer is a better signal than a proxy, which needs no study.

## Alternatives considered

**Keep the age band and tune the cut points.** Rejected. Moving 30 to 35 does not fix a
proxy that measures the wrong thing.

**Ask the system for an age range instead of a date.** iOS 26's Declared Age Range framework
returns a range for app-declared thresholds without revealing the birth date. Deferred, not
rejected: Android has no counterpart, the framework's stated purpose is age-appropriate
experiences and its use for measurement is unverified against Apple's guidelines, and once
age no longer drives recommendations the gain is small.

**Make dress style optional.** Rejected. The point of the question is to have the signal;
an optional question defaults most users to `smart`, which is the band model with a
different name.

**Drop the birth date entirely.** Rejected by the maintainer: the product needs to be
evaluated by who uses it, and a coarse bucket at analytics time costs the user nothing more
than what ADR 0015 already asks.

## Out of scope

- Analytics implementation, event schema and the bucket property itself (ADR 0023 and its
  milestones). This ADR only settles what age may look like when it gets there.
- Occupation, activities or occasion as further signals. Possible later; one question now.
- Age metadata on catalogue garments (still rejected, as in ADR 0015).
