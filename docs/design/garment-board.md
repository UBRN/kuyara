# The garment board composition rule

Status: **accepted**, 2026-09-04, by
[ADR 0025](../adr/0025-the-garment-board-composition-rule.md). That ADR records the
decision, its alternatives and its consequences; this file is the specification, and is
where the parameters and the silhouette set live. The renderer, the silhouettes and the
palette resolvers live in `apps/mobile/src/garment-art/`.

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

**A board draws its footwear as a pair**, the way a flat lay shows shoes. The width rule
sizes the single shoe; the pair is drawn in that shoe's box:

- each shoe is **0.86** of the single shoe;
- the near shoe is whole, its sole on the single shoe's baseline and its heel **0.04** of
  the single shoe's length behind the single shoe's heel;
- the far shoe lies behind it, **0.30** of a shoe's length toward the toe and raised so the
  pair stands exactly one single shoe tall.

So the pair is 0.86 × 1.30 = 1.118 single shoes wide and one tall: its footprint stays
near one shoe's. The composer reads the pair's drawn bounds (the union of both shoes), so
the centroid, the side minimum, the drawn extent Today's stage fits and every hit test see
the pair. Both shoes are one piece with one shadow, drawn far shoe first. A Closet tile,
the type grid, a candidate tile and a category glyph draw one shoe; only a composed board
draws the pair.

## 3. Placement: the worn board

The **clearance** is the clear space the rule keeps between neighbouring pieces, so that no
piece covers any part of another.

**Every board is the worn board** (the detail, Today's alternates, History and the share
card), except Today's primary stage, which lays the same board out as a flat lay (section 10).
The outfit is laid out flat in the order it is worn, so it reads as one combination, with
every piece drawn whole:

- the body core stands as one column on a left axis, the `bottom`'s waist standing 0.05 of
  the `primary_top`'s height under its hem;
- the footwear stands under the core's lowest piece, its heel a quarter of its length left of
  the core's axis and its opening 0.06 of the footwear's own height under that piece's hem;
- the layers stack on a right rail, outer above mid, 0.10 metric apart, each with its left
  edge 0.10 of the narrowest core piece's width clear of the core's side.

No drawn box touches another, so a collar, a waist, a sleeve and a sole are always whole.
Pieces are drawn in the **dressing order**, back to front: `primary_top`, `bottom`,
`one_piece`, `mid_layer`, `outer_layer`, `footwear`. At rest that order is invisible; it
decides which piece lies on top only while one is enlarged or travelling.

The board reads in the slot order `primary_top`, `bottom`, `one_piece`, `outer_layer`,
`mid_layer`, `footwear`, whatever order it stacks in; the detail names its pieces under the
board in the dressing order.

## 4. Vertical: one envelope, not one grid

The envelope is the taller of the two columns. The core column carries the footwear:

```
envelope = max(coreHeight + footHeight × (1 + footClearance), railHeight)
```

The envelope is centred in the stage. The core column is centred in the envelope; the layer
column is aligned to its top, so the outermost layer starts level with the envelope's top
edge. The core's internal step is the waist clearance and the two
layers are separated by 0.10 metric.

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
from 0.680 to 1.135. Today's primary stage replaces the insets with a fit to its band and
is the fitted flat lay plus its vertical margin, within the same clamp (section 10).
An envelope taller than the clamp's ceiling allows, which only Easier to see's larger caps
on the detail reach, is scaled down once, uniformly, until it fits, so no piece leaves the
stage; every board without Easier to see is untouched by it.
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
| solo width cap | 0.300 | a lone `one_piece` |
| rail width cap | 0.170 | the widest of the layers and the footwear; they share one scale |
| footwear pair | 0.86 / 0.30 / 0.04 | each shoe × the single shoe / the far shoe toward the toe / the near heel back, × a shoe's length (section 2) |
| clearance | 0.05 / 0.10 / 0.06 | the waist × the top's height / the rail × the narrowest core width / the footwear × its own height (section 3) |
| rail gap | 0.10 | × core metric |
| top / bottom inset | 0.045 / 0.055 | the tint's own edge; the stage holds nothing else (Today's primary stage fits instead, section 9) |
| stage height | 0.66 to 1.14 | derived, then clamped |
| ink centroid | 0.47 | where the composition lands |
| side minimum | 0.09 | no drawn edge closer to a stage edge |

## 8. The silhouette set

Thirty-four garment drawings, one 64×64 viewBox each, painted as rich fashion
illustrations in the manner of an illustrated fashion catalogue: each drawing is a list of
outlines filled with the piece's own palette colours and edged in one 1.9-point ink stroke,
with shade planes, folds, highlights, seams, stitches and hardware clipped inside them
(`silhouettes.ts`; `garment-paint.ts` paints them). The outlines are cut as the garment
falls: sloped, rounded shoulders, set-in or raglan sleeves that taper with a slight natural
bend into a cuff, curved hems, trouser legs that narrow to a slight break, a skirt or dress
that flares and drapes into folds whose valleys scallop the hem, shoes on a last with toe
spring, a heel, a welt and a sole, and hats whose brims sit in perspective. Each piece
carries the construction it really has: notched lapels with their collar, gorge and roll on
the blazer, coat and trench (the trench double-breasted, with gun flap, epaulettes, belt and
buckled cuff straps); a lined hood with a crown seam, eyelets and drawcords on the hoodie,
a fur ruff on the parka and a peaked brim on the rain jacket; baffles that bulge between
quilt seams on the puffer and vest; rib collars, cuffs and hem bands on the bomber, polo and
knits, with the turtleneck's folded roll neck; the biker jacket's diagonal zip, studded
lapels and belt; the jumpsuit's placket and tie belt; the Chelsea boot's gusset and pull
tab, the rain boot's lugged sole, the sandal's contoured cork footbed and buckled straps, the
ballet flat's bow; a beanie's converging rib and folded cuff, a fedora's dented crown and
band, a six-panel cap with its button and stitched peak, a balaclava's bound face opening,
a draped scarf with its fringe, a pair of gloves with points and fourchettes, and an
umbrella whose canopy sags between its rib tips above a wooden crook. The six category
glyphs share the same cut in a single colour and one or two construction lines. One light from the upper left
models every piece. Each plain surface is graded by a single gradient from a soft light
through the piece's colour to its deepest shade, with a soft bloom of the piece's own light
where the form turns toward it; inside every outline the form turns away at its edge in
nested bands of the deepest shade (eight on a body or a leg, five on a sleeve-sized part),
and the rim nearest the light catches a thin bright band. A piece laid over another (a collar, a lapel, a hood, a sole) casts a soft shadow onto
it, down and to the right. Seams and pocket edges carry a fine light line beside them, so
they read as sewn; buttons, rivets and pulls stand off the cloth on a small shadow; a quilt
seam pulls the fill into a soft valley with the light catching the baffle below it; leather,
nylon and rubber carry a crisp glint far lighter than the cloth. Folds are shade slivers at
elbows, armpits, knees and hems with soft highlights where the light catches, and the cloth
carries its own weave: stitch columns on knit, a light diagonal twill on denim, a fine twill
on suiting, a cross-weave on straw. Every tone is the piece's own (its light, shade, deepest
shade, highlight and glint, or its material's), and every translucent layer lies inside the
drawing over its own opaque fill, so nothing behind the garment shows through and no light
or shadow crosses the ink edge. A pattern or the multicolour family fill keeps its own paint
and takes the same modelling over it. Each drawing stays within 100 vector elements at full
detail (about 61 on average), so a Closet grid or a swap strip of many drawings stays
light. The drawn bounds the rule reads are measured from the outlines, which the modelling
never crosses. They cover all **41 outfit-eligible catalogue types**; seven
types share a drawing with another (`overshirt` with `shirt`; `sweatshirt`, `fleece` with
`sweater`; `long_skirt` with `skirt`; `track_pants` with `trousers`; `knit_dress` with
`dress`; `weather_boots` with `ankle_boots`). `polo_shirt`, `turtleneck`, `blouse`,
`bomber_jacket`, `leather_jacket`, `coat`, `loafers` and `rain_boots` have their own
Phase 6 drawings.

Thirteen entered with the Direction E spike. Nine entered with the MVP
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

The parameters above are Today's worn board (its alternates). A second surface expresses a different density by
changing parameters, never by changing the algorithm, so both surfaces draw the same pieces
in the same reading order, the core on the left and the layers on the right, for a given
slot list. That is what lets a transition between them move the pieces rather than
cross-fade two pictures.

The detail preset, approved by
[ADR 0026](../adr/0026-the-recommendation-detail-surface.md), is the same worn board with
every width cap × 1.25, the runway preset's largest scale. Its names stand under the board
as buttons, never on it, and its pieces stand apart exactly as the worn board's do:

| parameter | Today | detail |
| --- | --- | --- |
| board | worn, no piece touching; primary stage: the flat lay (section 10) | worn, no piece touching |
| core / solo / rail width cap | 0.235 / 0.300 / 0.170 | × 1.25: 0.294 / 0.375 / 0.2125 |
| top / bottom inset | 0.045 / 0.055, alternates | 0.045 / 0.055 |
| fit to the stage | primary stage: the band, side 24 pt, vertical 52 pt, core at most 168 pt (section 10) | none |
| stage height | primary stage: fitted flat lay + 52 pt; alternates: insets + envelope; both 0.66 to 1.14 | insets + envelope, 0.66 to 1.14 |
| piece shadow | every board | every board |

The insets are the same on both surfaces: neither the tinted stage nor the detail plate
holds anything besides the board.

**Today's primary stage** takes neither preset's placement: it is the flat lay on its band,
section 10. The alternate tiles keep the plain preset with the insets above.

**Piece shadow.** Every piece on every board casts one soft shadow on the plane it lies
on: its own drawn shape, read from the painting's alpha, blurred and dropped down and
slightly to the right, so it follows any drawing that declares its drawn bounds. In units
of the board's scale (the stage width, or Today's fitted scale) it drops 0.0075 down and
0.0025 right with a blur of standard deviation 0.0065; on Today's band, its core 168 points
wide, that is about 5.4 points down and 4.6 points of blur. Its reach, the drop plus two
standard deviations, stays inside every board's lower margin. Its colour is the plane's own
colour moved in OKLCH lightness only, by -0.13, with hue and chroma kept: no new colour.
In the dark appearance every board stands on a light grey plate (the next paragraph), so it
takes the same light step; the -0.10 dark step remains only for the first-generation
runway's dark fields. Ink against the shadow at full strength clears 3:1 on every
atmosphere stage and garment plane in both appearances (lowest 3.13, light
`fallingNight`). On every worn board each shadow falls on the plate, never on another piece,
so the pieces read as lying on one surface; on Today's flat lay a piece's shadow also falls on
the piece it lies over, as on a table. Each shadow is drawn inside its piece's own
layer, so it rises, travels, grows and pages with its piece in every motion. The ink
outline, not the shadow, carries each piece's edge, and the shadow reads on every plate in
both appearances. The runway's dressed pieces cast theirs once their colour has poured.

**The dark appearance.** A garment never stands on the dark page. Every board, tile and
preview sits on a soft light grey plate (`theme.ts`, `darkPlateOf`): Today's stage takes its
condition's plate, the detail board, the alternates and tomorrow's board stand on
`garmentGround`, and tiles on `garmentTile`, both the neutral plate `#D5D8D9` in dark and
the page ground and `surfaceMuted` in light. A drawing that stands straight on the page or
a card in light (finishing touches, the Profile rack, the Closet form's ownership scenes,
choice tiles) gets a `garmentTile` plate in dark only (`DarkPlate`), and the runway's board
stands on the neutral plate inside its dark field. Inside a plate everything takes the light
appearance's roles (`plateTheme`, `OnPlate`, `PlateView`): the pieces keep their light
colours legalised against the plate, their Deep Atmosphere ink outline (9.8:1 on the
neutral plate) and their cast shadow; captions, badges and the hint on the
detail plate take the light text roles at AA. The light appearance is unchanged.

**Captions.** A caption is centred on its piece's own axis and sits 7 points below the
piece's drawn box. Its width is capped per column, **0.42** of the plate width for the
core column and **0.30** for the layer rail. The asymmetry is deliberate: the core column
holds the longest names, and capping both columns equally either wraps a core name
mid-token or lets the two columns' captions meet. The plate's height is the lowest caption
edge, not the lowest piece edge.

Any change to the ladder or the caps in the table above has to be checked against both
presets.

## 10. Today's primary stage: the flat lay

Today's primary stage is a cornerless band of the condition's tint that reaches both screen
edges; in the dark appearance it is the condition's light grey plate, edge to edge. The board
on it is a **flat lay**: the worn board of section 3, every piece at the worn board's size,
with the gaps closed and the pieces crossing as they would on a table. Only this stage takes
it. The detail, the alternates, History, the share card, onboarding and every other board
keep the worn board, piece for piece. Opening the detail from the band, the pieces leave from
exactly what the band drew, at the band's size, square and in the flat lay's stacking until they
rest, and travel to the worn board, apart.

**Stacking**, back to front: `outer_layer`, `mid_layer`, `bottom`, `primary_top` or
`one_piece`, `footwear`. The layers lie under the outfit, the top over the bottom's waist and
the footwear over every hem. The board reads in the slot order of section 3.

**The crossings.** Each starts from the worn board's place, where it touches nothing, and moves
in a straight line toward where it ends:

| crossing | where it ends |
| --- | --- |
| bottom, with a layer | its waist closed up under the top's hem |
| bottom, with no layer | beside the top: its left edge 0.26 of its width under the top's right edge, its waist 0.52 of the top's height down |
| layers | the outer layer (or a lone mid layer) 0.30 of its width under the top's right edge, its top 0.08 × core metric under the top's; the mid layer moves with it |
| mid layer under outer | centred under the outer layer, its top 0.30 of its own height over that hem |
| footwear | 0.30 of its width over the lowest hem's edge, standing 0.90 of its height above it: on the right, or on the bottom's left when the bottom lies beside the top |

The crossings run in that order. Each is tried at whole twentieths from full to none and stops
at the first that keeps both limits over every piece placed so far:

- **Cover.** The pieces in front of a piece cover at most **0.30** of its drawn box.
- **Structure points.** No piece in front covers a collar, a waist or a sleeve end, so a collar,
  a waist, a sleeve and a sole stay whole where the outfit is read by them. The collar is the
  top of the outline within 0.10 of the drawing's width from its centre; the waist is the same
  point on a bottom, the top of its waistband; a sleeve ends at the outline's lowest point in
  the outer 0.15 of the drawing's width on each side (a one-piece's within its upper half, so a
  flared hem is not taken for a sleeve). The footwear lies in front of every piece, so a sole is
  never covered.

Drawn boxes stand in for the ink in both limits. For the structure points that is exact: a
point no box in front covers, no ink in front covers. The cover limit is measured on boxes
only: at most 0.30 of a piece's drawn box lies under the boxes in front of it, and the share
of its ink that ink in front actually hides may be more or less than that. With no crossing a piece stands where the worn board puts it, so every outfit has a flat
lay.

**The band.** The flat lay is trimmed to its drawn extent and scaled once, uniformly: 24 points
off each screen edge, 26 above and below, and the core's widest piece never wider than
**168 points**, × 1.3 with Easier to see, whose caps grow the composition by the same ratio.
The band is the fitted flat lay plus 52 points, clamped to 0.66 to 1.14 of its width, so a
board too tall for the ceiling is drawn smaller and still fits. On a 393-point screen the
README boards measure 391 points (warm casual), 441 (rainy smart), 435 (cold formal), 279 (hot
casual), 298 (night out) and 448 (snow casual, at the ceiling); the 168-point core binds on all
but the last. The piece shadow's reach stays inside the 26-point margin.

**What was checked.** The six README boards, the ten evidence slot lists and a summer tee,
shorts and sneakers, and every outfit the recommender composes across a sweep of temperatures,
conditions, both catalogues and every day variant (120 outfits), with Easier to see off and on,
on bands 375 to 440 points wide: the most covered piece 29.95% against the 30% limit, no
structure point covered, nothing clipped, and every core within its cap.

## What was checked

Ten slot lists, covering every shape the composer can emit, each rendered in both
appearances and audited geometrically.

| check | result |
| --- | --- |
| overlap | 0 for every board except Today's primary, which has its own family and limits (section 10) |
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
