# The garment board composition rule

Status: **accepted**, 2026-09-04, by
[ADR 0025](../adr/0025-the-garment-board-composition-rule.md). That ADR records the
decision, its alternatives and its consequences; this file is the specification, and is
where the parameters and the silhouette set live.

[ADR 0026](../adr/0026-the-recommendation-detail-surface.md) adds a second parameter set
to it, in section 9, without changing the rule.

It answers the first consequence
[ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md) recorded against
itself: *"A composition rule has to be written that this ADR does not contain. Every
board in the spike is hand-placed per outfit. A rule that takes a slot list and
produces a placement, for two-piece, one-piece and five-piece looks, is unbuilt."*

Evidence lives in the Obsidian vault, not here: ten generated boards in light and
dark, a specimen of every drawing, a before/after on the sizing metric, and the audit
table.

## What it decides

Given a slot list of two to five pieces drawn from the six outfit slots in
`packages/contracts/src/ai-v1.ts` (`primary_top`, `bottom`, `one_piece`, `mid_layer`,
`outer_layer`, `footwear`), where each piece sits on the condition-tinted stage and how
large it is drawn.

The composer produces exactly five shapes of slot list: a body core that is either
`primary_top` plus `bottom` or a lone `one_piece`, an optional `mid_layer`, an optional
`outer_layer`, and a mandatory `footwear`. That is two to five pieces, and the rule
covers all of them.

**Units.** Every number below is a fraction of the stage's width. The stage's height is
derived, not given.

## 1. Size comes from the drawing's own bounds

ADR 0021 recorded that the spike's anchors were set to the same box width and still
did not read as a pair, because one path fills 53% of its viewBox and another 31%. That
is `g-long` at 0.531 and `g-trousers` at 0.312, measured.

Every piece of artwork declares its **drawn bounds**: the extent of the mark itself, not
its container. For an SVG silhouette that is `getBBox()`; for the shipped PNG glyphs it
is the alpha bounding box; for a future illustration, catalogue image or Closet
photograph it is the same measurement of the same kind. The composition consumes only
that box.

A piece's size is one number, its **metric**:

```
m = sqrt(drawnWidth × drawnHeight)
```

and its box follows from the metric and its own aspect:

```
w = m × sqrt(drawnWidth / drawnHeight)
h = m × sqrt(drawnHeight / drawnWidth)
```

**Why the bounding box and not the ink.** Ink area is the better proxy for perceived
weight, and it is the wrong metric here. ADR 0021 §1 makes the silhouette a replaceable
slot: the same slot may later hold a filled illustration or a photograph. A line drawing
replaced by a solid photograph gains roughly three times the ink at the same size, so an
ink-based metric would re-break every layout the first time the artwork improved. The
bounding box is invariant to art style. The cost is stated in *What was checked*.

## 2. The ladder

Slot weights, as multipliers on the core metric:

| slot | weight |
| --- | --- |
| `primary_top`, `bottom`, `one_piece` | 1.00 |
| `outer_layer` | 0.74 |
| `mid_layer` | 0.56 |

**Footwear is the exception and is sized on width**, at 0.58 of the core's drawn width.
Shoe aspect ratios span 2.86 for a sneaker to 0.94 for an ankle boot, and the metric
flatters a wide flat shape: under the metric a sandal would be drawn almost as wide as
the dress beside it. A shoe is recognised by the length of its profile, so width is what
the rule holds constant.

## 3. Two placement families, chosen by one predicate

> **Does the outfit carry a layer?** That is, is `mid_layer` or `outer_layer` present?

Footwear is always present and never makes a column on its own, so this predicate is the
only branch in the rule.

**Column and rail**, when a layer is present. The body core stacks on a left axis. The
layers stack on a right axis, outer above mid. Footwear stands on the baseline in the
rail column. Both columns are centred in a shared envelope, so in the common case where
they are the same height they share a top axis and a baseline.

Two devices stop it reading as a table, and both are borrowed from the spike's accepted
board rather than invented here:

- the `mid_layer` steps 0.20 metric off the rail axis, so the right column is a zigzag
  and not a straight line;
- the footwear station stops 0.20 metric short of the core's baseline, so the two
  columns do not land on the same line.

**Stagger**, when no layer is present, so two or three pieces. The anchors descend: the second anchor
starts 0.60 of the first anchor's height below its top and sits a gutter to its right.
Footwear takes the counter-corner, on the second anchor's baseline under the first. With
a lone `one_piece` there is no second anchor and footwear simply sits to its lower right.

## 4. Vertical: one envelope, not one grid

The envelope is the taller of the two columns:

```
envelope = max(coreHeight, railHeight + footClear + footHeight + footRise)
```

Both columns are centred in it. The core's internal gap is 0.60 metric; the two layers
are separated by 0.45 metric.

## 5. Horizontal: placed by ink centroid

The finished composition is positioned once, so that its **ink centroid**, the
area-weighted centre of the drawn boxes, lands at 0.47 of the stage width, clamped so
no drawn edge comes within 0.09 of a stage edge.

Placing by the bounding box instead was tried and rejected on measurement: a two-piece
dress-and-sandals board then put 4.8% of its ink in the right half. Centroid placement
lifts that to 23.3%, because a light support column pulls the heavy core toward the
centre instead of leaving it pinned left.

## 6. The stage's height varies with the composition

A one-piece look and a five-piece look cannot fill the same box. A dress tall enough to
span a two-anchor core would be drawn 0.55 wide, which no width cap allows, so forcing a
fixed stage produces either a squashed dress or an empty band.

The stage height is therefore derived, insets plus the envelope, and clamped to
**0.66 to 1.14** times the stage width. Across the ten evidence boards it takes values
from 0.680 to 1.135. Today's primary stage replaces the insets with a fit to the stage and
is the fitted composition plus its vertical margin, within the same clamp (section 9).
Today's copy below the stage moves with it.

The two insets are the tint's own margin around the composition and are not board
geometry. The stage holds nothing but the board: the temperature and the condition symbol
sit in the title above it, so neither inset holds anything and both are the detail
preset's. Tint that neither supports the composition nor holds something is slack, and
the stage does not carry it.

This does not add a plane. Law 3 of [`design-language.md`](./design-language.md) already
states that the condition-tinted stage is not a fourth plane; a variable height does not
change that.

**The board's pieces are not icons.** Law 6's icon ladder (16/caption, 20/body,
24/title, 28+ standalone) governs iconography adjacent to text. The garment composition
is the screen's subject and is sized by this rule instead. At the five-piece board's
metric a `primary_top` is drawn about 82 points wide on a 349-point stage.

## 7. Parameters

Every value, in stage-width units unless marked otherwise.

| name | value | what it does |
| --- | --- | --- |
| anchor / outer / mid weight | 1.00 / 0.74 / 0.56 | the ladder, × core metric |
| footwear width | 0.58 | × the core's drawn width |
| core width cap | 0.235 | two-anchor core |
| solo width cap | 0.300 | a lone `one_piece`, or a stagger anchor |
| rail width cap | 0.170 | any layer or the footwear in the rail |
| core gap | 0.60 | × core metric |
| rail gap | 0.45 | × core metric |
| footwear clearance | 0.55 | × core metric, above the footwear station |
| mid inset | 0.20 | × core metric, off the rail axis |
| footwear rise | 0.20 | × core metric, above the core baseline |
| gutter | 0.095 | between the two columns |
| top / bottom inset | 0.045 / 0.055 | the tint's own edge; the stage holds nothing else (Today's primary stage fits instead, section 9) |
| stage height | 0.66 to 1.14 | derived, then clamped |
| ink centroid | 0.47 | where the composition lands |
| side minimum | 0.09 | no drawn edge closer to a stage edge |
| stagger drop | 0.60 | × the first anchor's height |

## 8. The silhouette set

Thirty-four garment drawings, one 64×64 viewBox each, painted as Phase 6 colour fashion
flats: each drawing is a list of outlines filled with the piece's own palette colours and
edged in one 1.9-point ink stroke, with shade planes, tone lines and stitches clipped inside
them (`silhouettes.ts`, `garment-painting.tsx`). The drawn bounds the rule reads are
measured from the outlines. They cover all **41 outfit-eligible catalogue types**; seven
types share a drawing with another (`overshirt` with `shirt`; `sweatshirt`, `fleece` with
`sweater`; `long_skirt` with `skirt`; `track_pants` with `trousers`; `knit_dress` with
`dress`; `weather_boots` with `ankle_boots`). `polo_shirt`, `turtleneck`, `blouse`,
`bomber_jacket`, `leather_jacket`, `coat`, `loafers` and `rain_boots` have their own
Phase 6 drawings.

Thirteen are carried unchanged from the Direction E spike. Nine entered with the MVP
vocabulary: `tank`, `tee`, `hoodie`, `puffer`, `shorts`, `leggings`, `dress`, `jumpsuit`,
`sandal`. Without `dress` and `jumpsuit` a one-piece look cannot be drawn at all, which is
why the set could not be left as it was. Four cover the enlarged catalogue: `parka`,
`blazer`, `vest`, `flat`.

The eight catalogue accessories (`beanie`, `brimmed_hat`, `cap`, `balaclava`, `scarf`,
`neck_gaiter`, `gloves`, `umbrella`) carry seven further drawings, `neck_gaiter` sharing
`scarf`'s. They appear on the Closet and Profile surfaces, the recommendation detail and
Today's finishing-touches caption. The garment board's fixed geometry does not draw them.
At that caption's 16 points each drawing is cropped to its own artwork and its stroke
scales with it, 1.9 × size / 28 or about 1.1 points, because a fixed 1.9 would fill a
16-point drawing solid.

**Fallback.** A garment with no silhouette falls back to its structural category and is
composed by the identical rule, with its drawn bounds measured from the artwork's alpha
instead of a path. The board degrades; it does not break.

## 9. Presets: Today and detail

The parameters above are Today's. A second surface expresses a different density by
changing parameters, never by changing the algorithm, so both surfaces produce the same
family, the same relative arrangement and the same reading order for a given slot list.
That is what lets a transition between them move the pieces rather than cross-fade two
pictures.

The detail preset, approved by
[ADR 0026](../adr/0026-the-recommendation-detail-surface.md), opens the composition up so
a two-line caption fits under every piece:

| parameter | Today | detail |
| --- | --- | --- |
| core gap | 0.60 | 1.35 |
| rail gap | 0.45 | 1.15 |
| footwear clearance | 0.55 | 1.10 |
| footwear rise | 0.20 | 0.10 |
| core width cap | 0.235 | 0.215 |
| rail width cap | 0.170 | 0.150 |
| gutter | 0.095 | 0.135 |
| mid inset | 0.20 | 0.16 |
| top / bottom inset | 0.045 / 0.055, alternates | 0.045 / 0.055 |
| fit to the stage | primary stage: runway preset, side 28 pt, vertical 24 pt, scale cap 1.25 × width | none |
| stage height | primary stage: fitted composition + 24 pt; alternates: insets + envelope; both 0.66 to 1.14 | insets + envelope, 0.60 to 1.45 |
| contact shade | primary stage only | none |

The insets are the same on both surfaces: neither the tinted stage nor the detail plate
holds anything besides the board.

**Today's primary stage.** The composition is trimmed to its drawn extent and scaled once,
uniformly, with the runway preset: 28 points off each side, 24 points of vertical margin,
and never more than 1.25 times the plain Today preset's size, centred on the extent. The
stage is then exactly as tall as the fitted composition plus the 24 points, clamped to
0.66 to 1.14 of its width. The cap binds on the reference boards, so their pieces are drawn
a quarter larger than the plain preset draws them, and the height depends on the outfit
and the width alone:
the provenance badge, a wrapped title or a larger text size above the stage never moves
it. On a 339-point stage the three reference boards measure 286.5 points (warm casual),
317.2 (rainy smart) and 305.7 (cold formal). The ladder, the caps and the placement
families are unchanged; only the one scale is. The alternate tiles keep the plain preset
with the insets above.

**Contact shade.** Each piece on the primary stage stands on one flat, opaque ellipse,
0.80 of the piece's drawn width wide and 0.07 of it tall, held to 3 to 6 points, centred
under the piece with its centre on the drawn bottom edge, so only its lower half shows.
Every shade is drawn before any piece. Its colour is the stage colour moved in OKLCH
lightness only, by -0.060 in light and -0.045 in dark, with hue and chroma kept: no blur,
no alpha, no glow and no new colour. The ink outline, not the shade, carries each piece's
edge, so the measured floor is ink against shade, at least 3:1 on every atmosphere stage
in both appearances (4.15 to 15.26). The shade steps 1.21 to 1.26 off the light stages
and 1.14 off the dark stage, where it is decorative, as Law 3 declares dark shadows. The
alternates, the detail plate, the runway and the Closet draw no shade.

**Captions.** A caption is centred on its piece's own axis and sits 7 points below the
piece's drawn box. Its width is capped per column, **0.42** of the plate width for the
core column and **0.30** for the layer rail. The asymmetry is deliberate: the core column
holds the longest names, and capping both columns equally either wraps a core name
mid-token or lets the two columns' captions meet. The plate's height is the lowest caption
edge, not the lowest piece edge.

Any change to the ladder or the caps in the table above has to be checked against both
presets.

## What was checked

Ten slot lists, covering every shape the composer can emit, each rendered in both
appearances and audited geometrically.

| check | result |
| --- | --- |
| overlap | 0 on all ten |
| clipping | 0 on all ten |
| anchor parity, drawn-box area | 1.000 on all ten, against 1.654 for the same board sized by container width |
| anchor parity, ink area | 1.00 to 1.42 within the silhouette set, against 1.403 for the container-sized board |
| weakest half, ink coverage | 0.144 (four pieces, one layer); strongest 0.357 |
| fallback exercised | one board drawn entirely from the shipped category glyphs, one mixed |

The ink-parity residual is the cost of choosing a style-invariant metric, named in §1.
The rule leaves the bottom slightly inkier than the top where container sizing left the
top 40% inkier than the bottom; the magnitude of the imbalance falls, the sign flips.

## What this does not decide

- The rendering architecture. ADR 0021 puts it out of scope and it stays out.
- Per-type production artwork. These are MVP silhouettes.
- Anything on Today outside the stage: the archetype name, the rationale, provenance,
  the alternates row.
- Motion. ADR 0021 §10 sanctions a gentle entrance of the pieces; this rule fixes where
  they come to rest, not how they arrive.
- Whether the board is reachable by assistive technology as one image or as parts.

## Open items this surfaced

1. **The shipped structural-category glyphs are drawn too heavy to sit beside the
   silhouettes.** (Redrawn 2026-09-07; see ADR 0025's consequences.) In the all-fallback board the two anchors' ink differed by 1.86×, and
   in a mixed board the fallback piece visibly dominates the three silhouettes around
   it. The fix is to redraw the six category glyphs at the silhouette's stroke weight;
   no change to the composition rule addresses it.
2. **Six structural categories cannot separate `primary_top` from `mid_layer`.** Both
   fall back to `top`, so an all-fallback board draws the same shape twice at two sizes.
3. **The nine new silhouettes need approval**, and the `sandal` is the weakest of them.
   (Approved with the rest of the twenty-two by ADR 0025's acceptance on 2026-09-04;
   only the five accessory drawings remain unapproved.)
4. **The Balanced Horizon geometry is still unrepresented on Today.** ADR 0021 records
   this as an open problem with two attempts already spent. This rule does not address
   it and deliberately leaves no room for a mark inside the stage.
