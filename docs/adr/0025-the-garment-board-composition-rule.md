# ADR 0025: The garment board composition rule

Status: Accepted (2026-09-04)

Implementation: not started. This records an approved design rule produced by a design
session. No production code, contract, or route was changed to reach it. The rule's
parameters, its reference implementation and its rendered evidence are described in
[`design/garment-board.md`](../design/garment-board.md); this ADR records the decision
and its consequences.

Answers: [ADR 0021](0021-direction-e-a-visual-first-design-language.md)'s first recorded
consequence, that a rule taking a slot list to a placement was unbuilt.

Amends: [`design-language.md`](../design/design-language.md) Law 6, in two ways stated
in the decision below.

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

### 3. Two placement families, chosen by one predicate

The predicate is whether the outfit carries a layer at all. Footwear is always present
and never earns a column of its own, so this is the rule's only branch.

**Column and rail** when a layer is present: the body core stacks on a left axis, the
layers on a right axis with outer above mid, and footwear stands on the baseline in the
rail column. **Stagger** when no layer is present: the anchors descend diagonally and
footwear takes the counter-corner.

Two devices keep the first family from reading as a table, both carried from the spike's
accepted board rather than invented: the mid layer steps off the rail axis, and the
footwear station stops short of the core's baseline so the two columns do not land on
one line.

### 4. The stage's height is derived from the composition

A one-piece look and a five-piece look cannot fill the same box. A dress tall enough to
span a two-anchor core would be drawn 0.55 of the stage width, which no width cap allows,
so a fixed stage yields either a squashed one-piece or an empty band. The stage height is
therefore insets plus the composition's envelope, clamped to 0.80 to 1.16 times the stage
width.

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

### 6. Nine silhouettes are added to the vocabulary

`tank`, `tee`, `hoodie`, `puffer`, `shorts`, `leggings`, `dress`, `jumpsuit`, `sandal`,
joining the thirteen carried from the spike. Twenty-two drawings now cover all
**27 outfit-eligible catalogue types**, with five types sharing a drawing with another.
`dress` and `jumpsuit` are not optional: without them a one-piece look cannot be drawn at
all, which is why the set could not be left as ADR 0021 found it.

`sandal` is the weakest of the nine and is explicitly accepted as redrawable during a
later visual iteration rather than treated as a blocker.

The five catalogue accessories are not drawn, because the recommendation contract has no
accessory slot and they can never appear in an outfit. ADR 0021 already flags that gap.

### 7. Law 6 is amended twice

**The garment board is exempt from the icon size ladder.** Law 6 binds icon size to
adjacent text at 16/20/24/28. The board's pieces are the screen's subject, not
iconography, and are sized by this rule instead; at the five-piece metric a
`primary_top` is drawn roughly 82 points wide on a 349-point stage. Without this
carve-out the ladder reads as governing the hero.

**The `GarmentSlotGlyph` family is extended to per-type granularity, and currently fails
Law 6's one-idiom bullet.** The per-type silhouettes are not a third icon family; they
are the same bundled-artwork family at finer granularity, with the six structural
categories as its fallback tier. But that family is now measurably drawn in two idioms:
the shipped category glyphs are far heavier than the silhouettes. This ADR records the
failure rather than waiving the law, and the redraw is sequenced as separate follow-up
work.

## Consequences

- **A slot list is now sufficient to draw a board.** Ten slot lists covering every shape
  the composer can emit were generated and audited. Overlap 0 and clipping 0 on all ten;
  anchor parity by drawn area 1.000 on all ten, against 1.654 for the same board sized by
  container width; weakest half 0.144 ink coverage, strongest 0.357.
- **The ink-parity residual is the price of a style-invariant metric.** Within the
  silhouette set the two anchors' ink differs by 1.00 to 1.42×, against 1.403× for the
  container-sized board. The magnitude of the imbalance falls and its sign flips: the
  rule leaves the bottom slightly inkier than the top where container sizing left the top
  40% inkier than the bottom.
- **The six shipped structural-category glyphs must be redrawn.** In an all-fallback
  board the two anchors' ink differs by 1.86×, and in a mixed board the fallback piece
  visibly dominates the silhouettes around it. This is a Law 6 violation, not a
  preference. No change to the composition rule addresses it; the rule composes the
  category glyphs correctly and they still look wrong beside a silhouette.
- **Six structural categories cannot separate `primary_top` from `mid_layer`.** Both fall
  back to `top`, so an all-fallback board draws the same shape twice at two sizes. This is
  a gap in the fallback tier's vocabulary, and it is not fixed by redrawing the six.
- **Today's vertical rhythm is now a function of the outfit.** Goals 2 and 3 design
  against a stage that changes height, and the app shell's content inset has to hold for
  the full 0.80 to 1.16 range.
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

**One layout family instead of two.** Attempted. A single column-and-rail structure
applied to a two-piece or a layerless three-piece outfit leaves the rail holding one
small shoe, which measured as an all but empty column. Forcing the stagger onto
five-piece outfits produced overlap. The predicate is a real fork in the input, not a
failure to generalise.

**A fixed stage height.** Rejected on the arithmetic in decision 4, and revisitable there
if native validation disagrees.

**Keep hand-placing boards.** The status quo. Rejected because it does not survive
contact with the composer: it produces one outfit's coordinates, and the composer emits
five shapes of slot list from a 27-type catalogue.

## Out of scope

- The garment rendering architecture. ADR 0021 puts it out of scope and it stays out.
- Per-type production artwork. These are MVP silhouettes.
- Everything on Today outside the stage: the archetype name, the rationale, provenance,
  the alternates row.
- Motion. ADR 0021 §10 sanctions a gentle entrance of the pieces; this rule fixes where
  they come to rest, not how they arrive.
- Whether the board is reachable by assistive technology as one image or as parts.
- Any production code change.
