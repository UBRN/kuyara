# ADR 0031: Dress style is the formality signal, and birth date is a demographic fact

Status: Accepted (2026-09-08)

Implementation: complete; Simulator and Maestro acceptance remain with the orchestrator.

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

### 1. The profile has required `dressStyle`

`dressStyle` is one of `casual`, `smart`, or `formal`, the three formality levels the
catalogue already carries. It is a required onboarding step after gender and is
changeable in Settings' About you group. Storage uses nullable checked
`dress_style TEXT` so migration and reopened onboarding have a state to occupy. Every
reader treats null as `smart`, the neutral middle, so no product path handles an absent
value.

The question is about the user's clothes, not the user. Copy asks "How do you usually
dress?" and explains that suggestions lean that way first and exclude nothing. Options
reuse the product's formality vocabulary: Casual, Smart, Formal; Günlük, Şık, Resmî.

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

### 3. The AI input boundary carries `dressStyle`

The strict request schema accepts optional `dressStyle` so a Worker deployed ahead of
mobile remains compatible with older clients. An absent value resolves to `smart`. The
Worker prompt receives only the formality order derived from it. The shared cache key
includes dress style; it is one of three low-cardinality values and identifies no one.

The recommendation regenerates when dress style changes. Persisted recommendation
context carries dress style, and a legacy snapshot without that field reads as `smart`.
Birth date, birth year, and derived age values never enter the request or cache key and
never trigger recommendation generation.

### 4. Birth date is a demographic fact only

Birth date is optional and device-only. It is entered with the system date picker and
shown only as the locale-formatted date; no age category is user-facing. No product logic
reads it.

Approved analytics may derive `age_bucket` only at emit time. Its values are `under_18`,
`18_24`, `25_34`, `35_44`, `45_54`, `55_64`, `65_plus`, and `unknown` when the date is
null. The attachment rules live in [`analytics-taxonomy.md`](../analytics-taxonomy.md).
The date, the year, and the user's gender never appear in analytics, logs, AI requests,
or other network payloads. No bucket is stored. Do not derive an age band anywhere else.

### 5. Onboarding has five steps

Welcome, gender, dress style, birth date, and optional location selection. Gender and
dress style are required; birth date and location are skippable. The location step is
governed by [ADR 0016](0016-location-in-onboarding-and-an-honest-empty-state.md).
Settings' About you group has three rows in order: Gender, Dress style, Birth date. Its
footer explains what each fact is for.

### 6. Schema

Schema version 10 adds nullable checked `dress_style` and resets onboarding once so
existing installations answer the required question. The same migration preserves all
existing profile values and dependent data. A null value reads as `smart` until
onboarding is completed.

## Consequences

- **The Worker deploys before any mobile build that sends `dressStyle`.** The optional
  contract field preserves compatibility while deployments roll forward independently.
- A direct style question adds one onboarding step. This is accepted because it is the
  signal the recommendation needs and asks about clothes rather than using a proxy about
  the person.
- The three formality words appear in onboarding and Settings. They already belong to the
  product's recommendation-detail vocabulary, so no separate style vocabulary is needed.
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
