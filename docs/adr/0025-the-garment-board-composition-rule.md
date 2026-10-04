# ADR 0025: The garment board composition rule

Status: Accepted (2026-09-04)

Implementation: the rule and both parameter presets live in
`apps/mobile/src/components/ui/garment-board/`; Today and recommendation detail render
their respective presets. The rule's parameters, reference implementation and rendered
evidence are described in
[`design/garment-board.md`](../design/garment-board.md); this ADR records the decision
and its consequences.

Provides the slot-list-to-placement rule required by
[ADR 0021](0021-direction-e-a-visual-first-design-language.md).

Defines the garment-board boundaries in
[`design-language.md`](../design/design-language.md) Law 6.

## Context

ADR 0021 made the garment composition Today's hero and then recorded, against itself,
that it did not contain the rule that produces one: *"Every board in the spike is
hand-placed per outfit. A rule that takes a slot list and produces a placement, for
two-piece, one-piece and five-piece looks, is unbuilt."* The spike had exactly one
board, five hand-tuned percentages, repeated unchanged on every screen it appeared on.

It recorded a second obstacle in the same list. Equal layout boxes do not produce equal
perceived size, because silhouette paths fill different proportions of their viewBox:
one fills 53% of its width and another 31%. Measured on the spike's own symbols, those
are `g-long` at 0.531 and `g-trousers` at 0.312. The spike's two anchors were set to the
same container width and did not read as a pair.

The recommendation composer emits five shapes of slot list, and no others: a body core
that is either `primary_top` plus `bottom` or a lone `one_piece`, an optional
`mid_layer`, an optional `outer_layer`, and a mandatory `footwear`. Two pieces to five.

The board draws those five and nothing else. An outfit may also be finished with a hat, a
scarf, gloves or an umbrella; the geometry here is fixed to the body, and a sixth anchor
for a piece that hangs off none of the others would reopen every measurement below. Those
accessories appear as their own row on the recommendation detail and as caption-sized
badges under the Today card instead.

## Decision

Adopt the composition rule specified in
[`design/garment-board.md`](../design/garment-board.md). Its load-bearing choices:

### 1. Artwork is sized by its own drawn bounds, never by its container

Every asset declares the extent of the mark itself: `getBBox()` for a silhouette, the
alpha bounding box for the shipped category glyphs, the same measurement for any future
illustration, catalogue image or Closet photograph. A piece's size is one number, the
geometric mean of that box, and its width and height follow from the number and the
artwork's own aspect ratio.

The metric is the **bounding box and not the ink**, deliberately. ADR 0021 §1 makes the
silhouette a replaceable slot, and a line drawing replaced by a photograph gains roughly
three times the ink at the same size. An ink-based metric would re-break every layout the
first time the artwork improved. The cost is that the rule does not equalise perceived
ink exactly; the residual is recorded in the consequences.

### 2. A four-step ladder, with footwear as a stated exception

Anchors 1.00, `outer_layer` 0.74, `mid_layer` 0.56, as multipliers on the core metric.
**Footwear is sized on width**, at 0.58 of the core's drawn width, because shoe aspect
ratios span 2.86 for a sneaker to 0.94 for an ankle boot and the metric flatters a wide
flat shape. A shoe is recognised by the length of its profile.

**A board draws its footwear as a pair**, the way a flat lay shows shoes: the near shoe
whole, the far one behind it, 0.30 of a shoe's length toward the toe and raised so the pair
stands exactly one shoe tall, each shoe 0.86 of the single shoe the width rule sizes, with
the near heel 0.04 of a shoe behind the single shoe's. The pair is about 1.12 single shoes
wide and one tall, so its footprint stays near one shoe's. The composer reads the pair's
drawn bounds, so its centroid, side margins, drawn extent and stage see the pair; both shoes
share one shadow. A Closet tile, the type grid and a category glyph draw one shoe.

### 3. Every board lays the outfit out as worn

One parameter, the **clearance**, decides how close the pieces lie: the clear space kept
between neighbouring pieces, so that no piece covers any part of another.

**Every board but Today's primary stage is the worn board, with no piece touching another**,
so an outfit reads as one
combination laid out flat, with every piece drawn whole. The body core is one column, the
bottom's waist just under the top's hem; the footwear stands just under the core's lowest
hem; the layers stack on a right rail, outer above mid, just clear of the core's side. The
pieces are drawn in the order the outfit is put on: top, bottom, one-piece, mid layer, outer
layer, footwear. Because no piece overlaps another, a collar, a waist, a sleeve and a sole
are always in view.

**Today's primary stage is a flat lay**, the second layout family, on a cornerless band that
reaches both screen edges. It is the worn board with the gaps closed: every piece keeps its
ladder size and the pieces cross as on a table, stacked outer layer, mid layer, bottom, top,
footwear. Each crossing closes only as far as two limits allow: the pieces in front of a piece
cover at most 30% of its drawn box, and none covers a collar, a waist or a sleeve end, so a
collar, a waist, a sleeve and a sole stay whole in this family too. One scale fits the flat lay
to the band, the core's widest piece at most 168 points. The geometry is
[`garment-board.md`](../design/garment-board.md) section 10.

The detail draws the worn board at the runway preset's 1.25; a piece leaving Today's band for
the detail starts where the band drew it, at the band's size and in the flat lay's stacking,
and travels to its place apart. No name
is drawn on a board: the detail names its pieces in a row of buttons under the board
([ADR 0026](0026-the-recommendation-detail-surface.md) section 2).

Every piece on every board casts a soft shadow on its plane: its own drawn shape, blurred
and dropped down, in the plane's colour moved down in OKLCH lightness. It reads only the
painting's alpha, so it follows any drawing that declares its drawn bounds. On a worn board it
falls on the plane, never on another piece; on Today's flat lay it also falls on the piece
under it. The parameters are in
[`garment-board.md`](../design/garment-board.md) section 9.

### 4. The stage's height is derived from the composition

A one-piece look and a five-piece look cannot fill the same box. A dress tall enough to
span a two-anchor core would be drawn 0.55 of the stage width, which no width cap allows,
so a fixed stage yields either a squashed one-piece or an empty band. The stage height is
therefore insets plus the composition's envelope, clamped to 0.66 to 1.14 times the stage
width; an envelope too tall for the ceiling is scaled down once, uniformly, to fit it.
Today's primary stage fits its flat lay, trimmed to its drawn extent, to its band and is the
fitted flat lay plus 52 points, within the same clamp
([`garment-board.md`](../design/garment-board.md) section 10).

This is accepted **for now, and is the rule's most reversible part**. It means Today's
copy sits at a different vertical position depending on how many pieces the outfit has.
If native validation shows the jump between outfits is distracting, this is the decision
to revisit; nothing else in the rule depends on the height varying.

It adds no plane. Law 3 already states the condition-tinted stage is not a fourth plane,
and a variable height does not change that.

### 5. The composition is placed by its ink centroid

The finished group is positioned once, so its area-weighted centre lands at 0.47 of the
stage width, clamped away from the edges. Placing by bounding box was tried and rejected
on measurement: a two-piece dress-and-sandals board then put 4.8% of its ink in the right
half, against 23.3% under centroid placement.

### 6. The silhouette vocabulary covers the catalogue

The outfit-eligible set includes `tank`, `tee`, `hoodie`, `puffer`, `shorts`, `leggings`,
`dress`, `jumpsuit` and `sandal` alongside the thirteen silhouettes established by the
spike, and `parka`, `blazer`, `vest` and `flat` for the enlarged catalogue. With the eight
Phase 6 drawings for `polo_shirt`, `turtleneck`, `blouse`, `bomber_jacket`,
`leather_jacket`, `coat`, `loafers` and `rain_boots`, those thirty-four drawings cover all
**41 outfit-eligible catalogue types**, with seven types sharing a drawing with another.
`dress` and `jumpsuit` are required because a one-piece look cannot otherwise be drawn.

`sandal` is the weakest of the nine and is explicitly accepted as redrawable during a
later visual iteration rather than treated as a blocker.

Seven accessory silhouettes, `beanie`, `brimmed_hat`, `cap`, `balaclava`, `scarf`, `gloves`
and `umbrella`, serve the eight catalogue accessories (`neck_gaiter` shares `scarf`'s) and
bring the implemented vocabulary to 41 drawings covering all 49 catalogue types. They are
drawn on the Closet and Profile surfaces, the recommendation detail (its finishing-touch rows
and the "Add an accessory" picker, [ADR 0026](0026-the-recommendation-detail-surface.md)
section 6) and Today badges. The garment board itself does not draw them, so taking an
accessory off or adding one never changes the board.

### 7. Law 6 boundaries for board artwork

**The garment board is exempt from the icon size ladder.** Law 6 binds icon size to
adjacent text at 16/20/24/28. The board's pieces are the screen's subject, not
iconography, and are sized by this rule instead; at the five-piece metric a
`primary_top` is drawn roughly 82 points wide on a 349-point stage. Without this
carve-out the ladder reads as governing the hero.

**The `GarmentSlotGlyph` family includes per-type granularity.** The per-type silhouettes
are not a third icon family; they are the same bundled-artwork family at finer granularity,
with the six structural categories as its fallback tier. Both tiers use the silhouette
idiom. The small raster class carries an optical stroke for 20-to-28-point use, while the
large raster class uses the idiom-pure stroke above 32 points.

The approved Phase 6 vocabulary adds polo, turtleneck, blouse, bomber, leather jacket, coat, loafer and rain boot drawings. Every drawing is a rich fashion illustration inside its single ink-edge outline, cut as the garment falls (rounded shoulders, tapering sleeves with a slight bend, curved hems, trouser legs with a slight break, skirts and dresses that flare into draped folds, notched lapels, hoods with depth, quilted baffles, shoes on a last with toe spring, a heel, a welt and a sole, and brims in perspective) and built with the construction each garment really has and modelled by one light from the upper left: a graded surface, a form that turns at every edge, the rim that catches the light, the shadow each overlying part casts, sewn seams, standing hardware, quilt valleys, the glint of leather, nylon and rubber, folds and the cloth's weave, every tone derived from the garment's own colour. Each drawing declares the drawn bounds of its outlines, which this rule reads and the modelling never crosses, and the four-step sizing ladder is retained. A runway board preset fits the composition to the free space while keeping that ladder and the worn placement.

## Consequences

- **A slot list is now sufficient to draw a board.** Ten slot lists covering every shape
  the composer can emit were generated and audited. Clipping 0 and overlap 0 on all ten
  worn boards (Today's flat lay keeps its own limits, garment-board.md section 10);
  anchor parity by drawn area 1.000 on all ten, against 1.654 for the same board sized by
  container width; weakest half 0.144 ink coverage, strongest 0.357.
- **The ink-parity residual is the price of a style-invariant metric.** Within the
  silhouette set the two anchors' ink differs by 1.00 to 1.42×, against 1.403× for the
  container-sized board. The magnitude of the imbalance falls and its sign flips: the
  rule leaves the bottom slightly inkier than the top where container sizing left the top
  40% inkier than the bottom.
- **The six structural-category glyphs use the silhouette idiom.** Their 64-unit viewBox,
  1.9 stroke and round caps and joins put every glyph inside the silhouette set's ink
  range at 192 px; the worst pair among the six is 1.40× coverage and 1.37× box density.
  Repository PNGs at 24/48/72 px use an optical stroke of 3.75/64, about 1.4 px at 24 px,
  because the idiom-pure stroke renders at 0.6 pt at their 20-to-28-point display size.
  `assets/icons/garment/large/` provides 72/144/216 px rasters with the idiom-pure stroke
  for the Profile rail and Closet grid above 32 points. The canonical SVGs, `g-cat-*`
  generator symbols, export script and measurements remain with the composition-rule
  material outside the repository.
- **Six structural categories cannot separate `primary_top` from `mid_layer`.** Both fall
  back to `top`, so an all-fallback board draws the same shape twice at two sizes. This is
  a gap in the fallback tier's vocabulary, and it is not fixed by redrawing the six.
- **Today's vertical rhythm is a function of the outfit.** The app shell's content inset
  has to hold across the full 0.66 to 1.14 stage-height range.
- **The Balanced Horizon geometry remains unrepresented on Today.** ADR 0021 records this
  as an open problem with two attempts already spent. This rule does not solve it and
  deliberately leaves no room for an abstract mark inside the stage, which narrows the
  remaining options rather than widening them.

## Alternatives considered

**Size by ink area instead of the bounding box.** It is the better proxy for perceived
weight and would have driven the anchor ink residual toward 1.00. Rejected because it
couples the layout to the art style and breaks ADR 0021 §1's replaceability: the slot is
meant to accept richer illustration, catalogue artwork or a user photograph without a
redesign, and each of those changes the ink dramatically at identical size.

**An open board on the detail, with a caption under every piece.** Rejected: it drew the
same outfit two ways, separate pieces in boxes on the detail and a worn combination on
Today, and needed two placement families (column and rail, and a stagger for an outfit
without layers) because an open rail holding one small shoe read as an empty column. The
names moved under the board instead.

**Names on the board joined to their pieces by leader lines.** Rejected: they crowd on a
narrow screen and at large text sizes.

**A single shoe on the boards, or a pair standing side by side.** Rejected: one shoe does
not read as a flat lay, and an aligned pair reads as a catalogue and takes more room.

**A fixed stage height.** Rejected on the arithmetic in decision 4, and revisitable there
if native validation disagrees.

**Keep hand-placing boards.** The status quo. Rejected because it does not survive
contact with the composer: it produces one outfit's coordinates, and the composer emits
five shapes of slot list from a 41-type catalogue.

## Out of scope

- The garment rendering architecture. ADR 0021 puts it out of scope and it stays out.
- Per-type production artwork. These are MVP silhouettes.
- Everything on Today outside the stage: the archetype name, the rationale, provenance,
  the alternates row.
- Motion. ADR 0021 §10 sanctions a gentle entrance of the pieces; this rule fixes where
  they come to rest, not how they arrive.
- Whether the board is reachable by assistive technology as one image or as parts.
- Any production code change.
