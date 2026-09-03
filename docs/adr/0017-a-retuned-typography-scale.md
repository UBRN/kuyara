# ADR 0017: A retuned typography scale

Status: Accepted (2026-09-03)

Implementation: not started.

Amended by [ADR 0021](0021-direction-e-a-visual-first-design-language.md). The scale
itself stands. What changed is which role is Today's hero: the spike made the garment
composition the hero, so Today carries no `display` at all and the archetype name sits at
`title`. `display` survives on Weather, where the hero really is a number. The reasoning
below for *why* the scale needed three separated steps is unaffected.

## Context

The interface redesign's first session diagnosed why the screens still read as flat
after Milestone A applied [`design-language.md`](../design/design-language.md) in
full. Surfaces were ruled out years of measurement ago: the light appearance has
1.085:1 of total headroom and every depth cue already fails the 3:1 non-text
threshold. The language's answer was that hierarchy must be carried by type and
space. The type half of that answer was never actually available.

Measured against the shipped `theme.ts`:

| role | size / line / weight | tracking |
| --- | --- | --- |
| `display` | 40 / 48 / 600 | none |
| `titleLarge` | 24 / 30 / 700 | none |
| `title` | 24 / 32 / 600 | none |
| `body` | 17 / 24 / 400 | none |

Three problems follow from that table.

1. **`title` and `titleLarge` are the same size.** They differ only in weight and
   line height, so the scale has one heading step, not two.
2. **There is no step between 24 and 40.** A screen jumps from its heading straight
   to its hero, which means the space in between, where an anchor level would live,
   does not exist. Law 1 asks for three emphasis levels; the scale supplies two.
3. **No role carries negative tracking.** At 40 points the system face needs it.
   Without it `display` reads as a large label rather than a hero, which is exactly
   how the temperature on Today reads today.

The practical consequence is that most of any kuyara screen is rendered at 17 or 13
points, with one 24-point heading and one 40-point number. That is the flatness, and
it is a typography defect rather than a surface defect.

## Decision

Retune three roles. Six roles are unchanged.

| role | before | after | reason |
| --- | --- | --- | --- |
| `display` | 40 / 48 / 600 | **56 / 56 / 700, letterSpacing -1.5** | a hero value, not a large label |
| `titleLarge` | 24 / 30 / 700 | **34 / 41 / 700, letterSpacing -0.6** | matches the iOS large title metric, so a hand-drawn heading and a native large title agree |
| `title` | 24 / 32 / 600 | **22 / 28 / 600, letterSpacing -0.2** | stops colliding with `titleLarge` |
| `body` | 17 / 24 / 400 | unchanged | |
| `bodyStrong` | 17 / 24 / 600 | unchanged | |
| `label` | 15 / 20 / 600 | unchanged | |
| `caption` | 13 / 18 / 400 | unchanged | |
| `eyebrow` | 10.5 / 14 / 700 | unchanged | |
| `code` | 13 / 18 / 500 | unchanged | |

The resulting scale is **56 / 34 / 22 / 17 / 15 / 13 / 10.5**, with successive ratios
of 1.65, 1.55, 1.29, 1.13, 1.15 and 1.24. The 24-to-40 gap closes, the two heading
roles separate, and Law 1's three emphasis levels become expressible for the first
time.

`titleLarge` is set to 34 rather than a rounder 32 deliberately. iOS draws its large
title at 34 points, and the redesign's diagnosis was that `headerShown: false` everywhere
leaves the OS drawing none of iOS 26's chrome outside the tab bar. Whether stack headers
become native is settled by the app shell goal in
[`current-status.md`](../current-status.md), not here; the metric is chosen so that a
custom heading one screen away from a native large title is the same size as it either
way.

This is a role change, not a variant or primitive change, so
[ADR 0009](0009-a-design-language-layer-and-its-deferral-carve-out.md)'s carve-out
applies and no prior product use is required.

## Consequences

- `design-system.md`'s role table and `design-language.md`'s Law 1 and Law 5 quote
  these numbers and are updated with this ADR.
- Test friction is low. `primitives.test.mjs` asserts that `resolveAppTextStyle`
  returns the `typography[variant]` object by reference, not its values, and
  `theme.test.mjs`'s typography guard is the repository-wide ban on literal
  `fontSize` and `lineHeight` under `features/`. Neither pins a size.
- **`display` at 56 is the real risk.** At the largest Dynamic Type settings it grows
  aggressively. Two existing mechanisms must hold and are now load-bearing rather
  than incidental: `AppText` releases the authored line height above a font scale of
  1.5 so text grows instead of clipping, and Today's hero already switches to a
  stacked column at that same threshold. Both are verified at the largest
  accessibility size, in Turkish and English, before the phase is called done.
- Turkish strings are longer than their English equivalents at every size, so the
  heading roles are checked in both languages rather than in English alone.
- Nothing below `caption` 13 is introduced. Law 5's floor is unchanged.

## Relationship to the visual design spike

The redesign's next step is a visual design spike that prototypes two or three
directions on the Simulator for review. That spike may find that 56 is too large or
that `titleLarge` wants a different value once it sits beside a real native large
title. If it does, this ADR is amended rather than worked around. The scale's
*shape*, two separated heading steps plus a genuine hero and negative tracking at the
top, is the decision; the exact points are the part the spike may move.

## Alternatives considered

**Leave the scale and fix hierarchy with weight and space alone.** Cheaper and it
uses what already exists. Rejected as insufficient on its own: with one heading step
and no tracking, weight has to carry a job that three roles should share, and the
24-to-40 gap stays unusable.

**Adopt the full iOS text style set** (largeTitle, title1, title2, title3, headline,
body, callout, subheadline, footnote, caption1, caption2). Rejected: eleven roles
where nine already go underused would make the drift worse, and it would discard the
semantic names the codebase and its tests are written against.

**Add a new role between `title` and `display` instead of moving existing values.**
Rejected: it leaves `title` and `titleLarge` colliding at 24, which is the defect
that makes the scale read as having one heading step.

## Out of scope

- A custom application font. `visual-identity.md` keeps platform system fonts for the
  MVP and this ADR does not revisit that.
- The `eyebrow` role's restriction to numeric stat captions, which Law 1 owns.
- Colour roles, spacing, and elevation, which are untouched.
