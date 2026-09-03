# ADR 0021: Direction E, a visual-first design language

Status: Accepted (2026-09-03)

Implementation: not started. This records an approved design direction produced by a
throwaway HTML spike. No production code, contract, or route was changed to reach it.

Amends: [`visual-identity.md`](../design/visual-identity.md)'s prohibition on literal
clothing illustration, and its palette allocation guidance.
Amends: [`design-language.md`](../design/design-language.md) Law 1, Law 3 and Law 5.
Amends: [ADR 0017](0017-a-retuned-typography-scale.md) on which role is Today's hero.
Amends: [ADR 0018](0018-the-atmospheric-condition-band.md) on the band's structure.

## Context

Four milestones of interface work ended with screens that measured correctly and still
read as flat. The redesign's first session diagnosed four structural causes and produced
ADRs 0017 to 0020. A visual design spike then ran five directions on the iOS Simulator
and in disposable HTML, and it found something none of those four ADRs anticipated.

The diagnosis had been that hierarchy was carried by colour lightness and that the type
scale was too shallow to carry it instead. That was true and it was not the whole
problem. Directions A through D2 all fixed the type and the ink allocation, and all of
them still read as a well-set document about clothing rather than as a styling product.
Measured on the shipped Direction D2 build: the light appearance put more than half its
text mass at 5.07:1 in a hue-adjacent teal while primary sat at 10.04:1, and dark did not
have the problem at all, at 10.03:1 against 16.09:1. Reallocating ink and adding a weight
step fixed the faintness. It did not make the product feel like it was about clothes.

The reference study settled it. In a mature styling product the middle of the home screen
is garment imagery and the interface is nearly achromatic, so the clothes carry all the
colour and the typography carries almost nothing. kuyara had ruled out clothing imagery
and was therefore asking its type scale to do a job that type cannot do.

## Decision

Adopt Direction E as kuyara's design language. It is a language, not a frozen screen.

### 1. Garment illustration is permitted and is the visual subject

`visual-identity.md` asked for calm structure "rather than literal weather or clothing
illustrations". The clothing half of that sentence is withdrawn. The weather half stands:
no literal sky photography, no illustrated weather scenes.

For the MVP a small set of simple line silhouettes covers the common garment types.
Complete per-type artwork is not required and is not to be built speculatively. A garment
with no specific silhouette falls back to its structural category, so a composition
degrades to six shapes rather than breaking.

The silhouette is a **slot in the composition, not an asset the composition depends on**.
A later version may render the same slot as richer illustration, catalogue artwork, a
product image, or the user's own Closet photograph, without redesigning the information
hierarchy. That replaceability is part of the decision; the rendering architecture that
delivers it is not designed here.

### 2. Today is visual-first

The comprehension sequence is: **see the outfit, understand the look, read the short
rationale, optionally open details.**

The primary recommendation is a compact editorial garment board. Composition principles,
not coordinates:

- The primary upper piece and the bottom generally form the two visual anchors, at equal
  size. Outerwear and footwear are supporting and smaller. Accessories, when the contract
  eventually carries them, are small accents.
- Scale communicates visual prominence, not physical size. A shoe does not occupy half
  the board because a shoe is large.
- The composition is compact and asymmetric, and pieces sit on a small number of shared
  axes rather than each having its own.
- No anatomical or body-position diagram. No equal-size icon grid. No arbitrary scatter.
  No overlap unless it genuinely improves the composition.

Today does not carry the garment names. The five-row name list of the earlier directions
is withdrawn; a concise archetype name and one short rationale are enough on the overview.

### 3. The weather tints the stage rather than occupying a band

[ADR 0018](0018-the-atmospheric-condition-band.md) decided "a band, not a page": a
full-width strip above a stable ground. Direction E dissolves the strip. The condition
tints the surface the garments lie on and puts one temperature and one condition glyph in
that surface's corner, so the sky colours the ground under today's clothes and the two
halves of the product become one object.

The ADR's arithmetic survives intact and is what makes this legal: the seven-state closed
set, the derivation of every value as a blend of two approved brand hexes, the contrast
floors, and the rule that no state may make contrast worse than `neutral`. What is
withdrawn is the structural conclusion that the atmosphere must be a discrete band. The
per-state values move upward in luminance, because the tint now sits behind ink and
silhouettes rather than behind a hero number.

The spike measured why a shrunken band fails: below roughly 110 points of height a
two-stop tonal field has no vertical room to be perceived and reads as a flat utility
strip, and in the dark appearance a band and an elevated stage collapse to the same
value because ADR 0018 caps the band at the card plane's own luminance.

### 4. Contrast and colour allocation

- The light page ground moves up to Soft Mist `#F4F6F5`. `textPrimary` on it measures
  **12.90:1** against 10.04:1 on the previous `#D0DDDC`. The previous ground existed to
  buy a 1.395:1 white-card step, and Direction E's Today has no white cards.
- Supporting text is a derived neutral rather than Calm Current. Calm Current becomes an
  accent used in a small number of placements per screen, not the default supporting ink.
- These are derived semantic values from the locked palette. No new brand colour is
  introduced and the six approved hexes are unchanged.

### 5. Typography supports the image

[ADR 0017](0017-a-retuned-typography-scale.md)'s scale stands. What changes is which role
is the hero. That ADR assumed the hero was a type role and named the temperature. In
Direction E **the garment composition is Today's hero and no `display` appears on Today at
all**; the archetype name sits at `title` scale beside it. The `display` role survives on
Weather, where a number genuinely is the subject.

### 6. Alternatives are a glimpse, not a miniature

An alternate outfit preview shows its two anchors, its name, and a restrained disclosure
affordance. It does not render the full board in miniature, and it implies no ranking.
The recommendation contract produces three meaningfully different options, not a ranked
list, and the presentation must not claim otherwise.

### 7. Progressive disclosure

Garment names, layer structure, per-piece reasoning, weather reasoning and substitutions
belong to a recommendation detail surface reached from Today. That surface is named here
as future work and is not designed by this ADR.

### 8. AI provenance sits with the recommendation

Provenance belongs next to the thing it describes, not in a page footer. When AI
materially contributed the interface may show a restrained treatment, for example a small
spark glyph in the brand accent beside "AI-assisted", with freshness in the same quiet
metadata line. Provenance stays secondary to the outfit, the outfit name, and the
rationale.

**Green is not used to mean AI.** Green carries success semantics in this palette
([ADR 0010](0010-status-colours-destructive-variant-and-defined-borders.md)) and an AI
generation is not a success state. When a recommendation is deterministic no badge is
added: the absence of the mark is the signal, and a redundant "Standard" badge is not
introduced to fill the space.

### 9. Weather keeps its accepted direction

Insight before measurement. The screen leads with what the conditions mean for a clothing
decision, and raw measurements sit in one quiet row. The hourly forecast is a
**horizontal scrollable rail**, scanned left to right, with the temperature series drawn
behind it on the same scale. A vertically stacked hourly table is withdrawn.

### 10. Motion

Gentle entrance of the garment pieces, a subtle transition between suggestions, and
weather-state glyph transitions are the sanctioned uses. All of it remains subject to
[ADR 0020](0020-rewriting-the-motion-law.md), including its carried-forward requirement
that motion is never the only indication of a state change, and Reduced Motion must have
a calm static equivalent.

## Amendment, 2026-09-04: the direction applies to every screen

Section 4 moved the light page ground to Soft Mist on the strength of Today, which has
no white card. That left an unanswered question about Profile, Closet and Settings,
where white cards do exist and where the step would fall to 1.085:1.

Answered: **Direction E is adopted across Profile, Closet and Settings rather than
preserving the old card-over-ground invariant.** The light page ground is Soft Mist
`#F4F6F5` app-wide, and those screens are designed so that separation comes from type,
space and the language's other devices rather than from a card fill step.

Consequently the M6.1 invariant recorded in
[`design-system.md`](../design/design-system.md#elevation-ladder) is superseded:
`theme.test.mjs`'s assertion that light `surface` clears `background` by 1.2:1 describes
the old allocation and does not survive the ground move. It is replaced when the tokens
land, with whatever the new allocation actually relies on; the no-regression rule that
matters is [ADR 0018](0018-the-atmospheric-condition-band.md)'s, that no atmosphere state
may make contrast worse than `neutral`. Text and non-text contrast floors are unchanged
and still binding.

This amendment settles scope and the invariant. It does not decide what Profile, Closet
or Settings look like; that is design goals 4, 5 and 6 in
[`current-status.md`](../current-status.md).

## Consequences

- **A composition rule has to be written that this ADR does not contain.** Every board in
  the spike is hand-placed per outfit. A rule that takes a slot list and produces a
  placement, for two-piece, one-piece and five-piece looks, is unbuilt.
- **Equal layout boxes do not produce equal perceived size.** The spike's anchors were set
  to the same box width and still did not read as a pair, because silhouette paths occupy
  different proportions of their viewBox: one fills 53% of its width, another 31%.
  Composition logic must size by drawn bounds, not container dimensions. This is recorded
  as an implementation constraint, not solved here.
- **The Balanced Horizon geometry is currently unrepresented on Today.** With garments as
  the subject, an abstract layer mark competes with them rather than supporting them. This
  is an open problem, not a resolved decision. Two attempts are already spent, and neither
  should be repeated blind: one mark per garment row read as a column of bullet dashes,
  because a 64 point row pitch is too far apart for the marks to group into a figure, and
  drawing the stack once at figure scale beside the outfit name (slab widths 1.000 / 0.818
  / 0.895 at offsets 0.000 / 0.287 / 0.046, measured from the approved master's path
  extents) belonged to a direction that was not chosen.
- **The shape vocabulary limits differentiation.** A blouse and a shirt map to the same
  silhouette, so two alternate looks can open with the same drawing. That is the clearest
  argument in the spike for richer per-type illustration, and it is a cost of the MVP
  fallback rather than a layout defect.
- **The accessory role is designed and unfillable.** The recommendation contract's six
  outfit slots contain no accessory, so catalogue scarves, gloves, hats and umbrellas keep
  weather properties that nothing can read. Unchanged by this ADR and flagged for product
  discussion.
- **The HTML spike proves visual direction, not native correctness.** Dynamic Type,
  Turkish and English, genuine dark mode, VoiceOver, Reduced Motion, touch targets, safe
  areas, the bottom tab bar, contrast, silhouette legibility at small sizes, horizontal
  scrolling on Weather, and progressive-disclosure accessibility all require validation in
  a real Expo spike before any of this ships.

## Alternatives considered

**Keep polishing Direction D2.** It was measurably improving: promoting the guidance
sentence to primary ink, setting garment names at `bodyStrong`, and giving the outfit a
lighter stage lifted primary contrast 28% locally without touching a token. Rejected
because every remaining problem was a variation of the same one, that the screen was a
document, and no amount of ink reallocation changes what a screen is about.

**Adopt garment photography.** It is what the reference product does and it is the
shortest route to a styling feel. Rejected for the MVP: kuyara has no product imagery,
`visual-identity.md` forbids photorealistic clothing, and building or licensing a
per-type image set is an asset pipeline this milestone cannot carry. The silhouette slot
is designed so this remains available later without a redesign.

**Keep the atmospheric band and add the garment board beneath it.** Tried in the spike.
Rejected on measurement: at the height a band needs in order to leave room for the board,
its two-stop field stops being perceptible, and in dark the band and the board's stage
resolve to the same value.

**Keep `display` as Today's hero on the temperature.** Rejected: it puts the largest
element on the screen on the product's *input*. `visual-identity.md` states that weather
is an input and the outcome is deciding what to wear.

## Out of scope

- The recommendation contract, its six outfit slots, and the absence of an accessory slot.
- The garment rendering architecture that would later swap silhouettes for artwork.
- The recommendation detail surface, Profile, Closet and Settings designs.
- Navigation implementation. The three-tab structure is unchanged and remains
  [ADR 0006](0006-three-tab-information-architecture.md)'s.
- Any production code change.
