# ADR 0021: Direction E, a visual-first design language

Status: Accepted (2026-09-03)

Defines the accepted visual direction within
[`visual-identity.md`](../design/visual-identity.md),
[`design-language.md`](../design/design-language.md) Laws 1, 3 and 5,
[ADR 0017](0017-a-retuned-typography-scale.md), and
[ADR 0018](0018-the-atmospheric-condition-band.md).

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

Simple garment illustration is permitted and is the visual subject of Today. Literal
weather imagery remains prohibited: no sky photography and no illustrated weather scenes.

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
- No anatomical or body-position diagram, and no dressed avatar, mannequin or character
  wearing the outfit: the pieces lie on the stage, not on a body. No equal-size icon grid.
  No arbitrary scatter. No overlap unless it genuinely improves the composition.

Today does not carry garment names or a five-row name list. The top row places the
location opposite the localized date. The title below combines Today, temperature in
the device locale's unit, an animated condition symbol, and condition. A small day-type
pill at the title's right opens the day-type selection, and a small archetype label sits
below. The card does not repeat the weather line. Two primary-ink body insight sentences
replace the overview rationale.

### 3. The weather tints the stage rather than occupying a band

[ADR 0018](0018-the-atmospheric-condition-band.md) defines a condition tint on the
surface the garments lie on. Temperature and the animated condition symbol sit in the
title, outside the garment card. The sky colours the ground under today's clothes and
the two halves of the product become one object. Do not add a separate full-width atmosphere strip.

ADR 0018 owns the seven-state closed set, the derivation of every value as a blend of two
approved brand hexes, the contrast floors, and the rule that no state may make contrast
worse than `neutral`. Its values sit behind ink and silhouettes rather than behind a hero
number.

The spike measured why a shrunken band fails: below roughly 110 points of height a
two-stop tonal field has no vertical room to be perceived and reads as a flat utility
strip, and in the dark appearance a band and an elevated stage collapse to the same
value because ADR 0018 caps the band at the card plane's own luminance.

### 4. Contrast and colour allocation

- The light page ground is Soft Mist `#F4F6F5` on every screen, including Profile,
  Closet and Settings. `textPrimary` on it measures **12.90:1**. A white surface over
  that ground measures only 1.085:1, so separation comes from type, space and the
  language's other devices rather than from a card fill step.
- Supporting text is a derived neutral rather than Calm Current. Calm Current becomes an
  accent used in a small number of placements per screen, not the default supporting ink.
- These are derived semantic values from the locked palette. No new brand colour is
  introduced and the six approved hexes are unchanged.
- `theme.test.mjs` records the 1.085:1 light surface step but does not enforce a 1.2:1
  minimum. Text and non-text contrast floors remain binding, as does ADR 0018's rule that
  no atmosphere state may make contrast worse than `neutral`.

### 5. Typography supports the image

[ADR 0017](0017-a-retuned-typography-scale.md) owns the type scale. In Direction E **the
garment composition is Today's hero and no `display` appears on Today at all**; the
one-line Today title uses `title` with weight 700, while the archetype becomes a small
label below. Supporting insights use `body` and `textPrimary`; only metadata such as
last updated uses `textSecondary`. The `display` role remains on Weather,
where a number genuinely is the subject.

### 6. Alternatives use the full composition without implying rank

An alternate preview renders the full composition at its column width with the Today
preset. The approved target set draws it this way, and
[the composition specification](../design/garment-board.md#9-presets-today-and-detail)'s
section 9 argument applies: one composition family at different sizes keeps the same
reading order across surfaces, and a Today-preset board at about 158 points still draws a
two-anchor core near 37 points.
The recommendation contract produces three meaningfully different options, not a ranked
list: use two equal columns, no position labels, and no emphasis pill.

### 7. Progressive disclosure

Garment names, layer structure, per-piece reasoning and weather reasoning belong to the
recommendation detail surface reached from Today. The surface and its ownership control
are decided in [ADR 0026](0026-the-recommendation-detail-surface.md). Manual catalog-piece
swaps live on detail outside the recommendation engine, with a quiet warning when the
engine's rules would reject the look.

### 8. AI provenance sits with the recommendation

Provenance belongs next to the thing it describes, not in a page footer. When AI materially
contributed, the interface shows a prominent filled badge in the controlled `provenance` role
directly under Today's title. The on-device badge pairs its Apple Intelligence words with
the multicolor original `apple.intelligence` SF Symbol in a non-purple badge. The Worker
badge pairs "Chosen with AI" with a colorful AI symbol in the purple family. The badge
is a record, not a control: it is not touchable, it never stands on the tinted stage, and what it means is
explained on Settings > Service providers. Freshness keeps its own quiet metadata line.
The reader first sees that AI chose the look, then reads the insight.

**Green is not used to mean AI.** Green carries success semantics in this palette
([ADR 0010](0010-status-colours-destructive-variant-and-defined-borders.md)) and an AI
generation is not a success state. When a recommendation is deterministic no badge is
added: the absence of the mark is the signal, and a redundant "Standard" badge is not
introduced to fill the space.

### 9. Weather keeps its accepted direction

Insight before measurement. The screen leads with what the conditions mean for a clothing
decision, and raw measurements sit in one quiet row. The first block after the title is
the current-conditions card with the display temperature, and the location control sits
below it. The hourly forecast is a **horizontal scrollable rail**, scanned left to right,
with the temperature series drawn behind it on the same scale. Do not use a vertically
stacked hourly table.

### 10. Motion

Gentle entrance of the garment pieces, a subtle transition between suggestions, and
weather-state glyph transitions are the sanctioned uses. The first recommendation of
a dressing day uses a full-screen runway with the day's atmosphere colour, falling or
drifting weather particles, and garment silhouettes gliding onto the board one by one.
Only garment silhouettes enter the board; there is no mannequin, avatar or mascot.
[ADR 0020](0020-rewriting-the-motion-law.md) requires words to carry state alongside motion.

## Consequences

- **The composition rule is owned by ADR 0025.** It takes a slot list to a placement for
  two-piece, one-piece and five-piece looks, and sizes artwork by drawn bounds rather than
  container dimensions. Equal boxes do not produce equal perceived size because one
  silhouette can fill 53% of its viewBox while another fills 31%.
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
  weather properties that nothing can read. This remains a product discussion, not a
  rendering gap.
- **Native validation remains the acceptance surface.** Dynamic Type, Turkish and
  English, genuine dark mode, touch targets, safe areas, the
  bottom tab bar, contrast, silhouette legibility at small sizes, horizontal scrolling
  on Weather, and progressive-disclosure accessibility are validated in Expo rather than
  inferred from HTML.

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
- The recommendation detail surface, owned by ADR 0026, and Profile, Closet and Settings,
  owned by ADRs 0028 to 0030.
- Navigation implementation. The three-tab structure is unchanged and remains
  [ADR 0006](0006-three-tab-information-architecture.md)'s.
- Any production code change.
