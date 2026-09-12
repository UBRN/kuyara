# ADR 0026: The recommendation detail surface

Status: Accepted (2026-09-04)

Implementation: decisions 1 to 7 are implemented.

Builds on: [ADR 0025](0025-the-garment-board-composition-rule.md), whose composition rule
this surface reuses unchanged.
Owns the recommendation detail surface named by
[ADR 0021](0021-direction-e-a-visual-first-design-language.md) section 7.

## Context

Direction E makes Today visual-first and keeps garment names, layer structure, per-piece
reasoning and weather reasoning on a recommendation detail surface reached from Today.

The risk was specific. The evaluated Direction D2 detail screen was a five-row list of
identical garment cards, and the redesign's first session recorded that uniformity as one
of the causes of flatness. Adding an illustration above that same list would not fix it.

The product has no per-slot substitution input, so the surface must not invent one.

## Decision

### 1. Detail is a second parameter set, not a second layout

The board is [ADR 0025](0025-the-garment-board-composition-rule.md)'s `compose()`,
unchanged, run with a detail preset. Same algorithm, same family selection, same relative
arrangement, same reading order. Only the gaps, the width caps and the insets differ. The
preset is specified in [`design/garment-board.md`](../design/garment-board.md).

This is what makes the two screens share a composition rather than merely resemble each
other, and it is what the entry transition animates. It also means detail spends on
captions exactly the space the composition already reserved as margin and gutter.

### 2. The board sits on the page ground, not on the condition-tinted stage

Law 3 of [`design-language.md`](../design/design-language.md) states that the tinted
stage "carries no card, no secondary copy, and no bordered control". A detail surface is
entirely secondary copy, so the captions cannot go on the stage and the stage therefore
has no job here.

The weather keeps a quiet tinted recap row at the foot instead: temperature, condition,
rain probability. The tint draining away between the two screens is not decoration; it is
the visible statement that the weather was the input and the outfit is now the subject.

### 3. Each piece is captioned in place, with its slot label

Two lines under each garment: its catalogue name at `bodyStrong`, then its slot label.
Captions are centred on their piece's own axis and are capped per column, wider for the
core column than for the layer rail, so the two columns' captions cannot meet.

At or below `fontScale` 1.5, captions remain in place. Above that shared threshold, they
render as a single list directly under the board, in board order, with each row retaining
the same accessible element and content; the plate is then exactly the board. This avoids
the character breaks and overlap with adjacent captions and footwear observed at the
largest accessibility text sizes.

**The slot label is used, not `layerRole`.** The slot names already carry the layer
structure, because they read "Mid layer" and "Outer layer". `layerRole` would print
"standalone" under a pair of jeans, which is a layering concept that says nothing about a
bottom.

### 4. Reasoning is organised by requirement, and names the pieces that answer it

This is the device that stops the screen regressing into the five-row list. Instead of one
row per garment each carrying a reason, there is one row per weather requirement, and each
row names the garments that satisfy it. A five-piece outfit produces four or five reasoning
rows rather than five garment rows plus a separate reasons block, and each garment can
appear in several rows or in none.

Composition trade-offs join the same list, marked as trade-offs rather than reasons.

`OutfitRequirementEvaluation.suppliedByCandidateKeys` records which garment satisfies
which requirement. It is not persisted and does not need to be: the recommendation
snapshot stores only `{archetypeId, garments:[{slot, layerRole, candidateKey}]}` and
recomposes the outfit on read, so the evaluations are rebuilt on every load. Per-piece
reasoning requires no schema change, migration or contract change; it is a presentation
join over existing domain data.

### 5. The caption is the ownership control, here and only here

`AGENTS.md` requires ownership state on outfit detail and nowhere else. Each caption is
one accessible button named with the item, slot and spoken ownership state, with a
localized hint that it changes whether the piece is in the Closet. It carries a filled or
hollow marker and a word, so state never depends on colour alone, and one summary line
states the count.

English captions reuse `ownedLabel` "Owned" and `wantedLabel` "Wanted" from the `profile`
and `wardrobe` namespaces. Turkish captions use the single-item state pair "Sende var" /
"İstiyorsun"; the collection labels "Sahip olduklarım" / "İstediklerim" are not valid
under one garment. `ownershipOwnedAction` "I own it" and `ownershipWantedAction` "I want
it" remain actions and are not reused as state.

Every caption ends with a 16-point menu indicator in secondary ink. Pressing it opens the
platform menu with "I own it" and "I want it"; the current state has a checkmark,
selecting it again does nothing, and a different selection updates the marker and word
with selection haptics. The visible caption does not grow for the control. `hitSlop`
supplies the 44-point target. Above `fontScale` 1.5, decision 3's caption list uses the
same control.

Do not add a separate per-garment ownership action list. It repeats every garment and can
place up to five accent fills in one viewport against Law 1. An untracked garment draws no
marker and no state word while its accessible name speaks the untracked state; the menu
indicator is present on tracked and untracked captions alike.

### 6. Substitutions are out of the MVP, as a product decision rather than a design gap

ADR 0021 listed substitutions among the things detail would carry. Nothing in
`packages/contracts/src/ai-v1.ts`, the domain, or the persisted snapshot produces a
per-slot alternative: the composer emits three whole outfits and the AI returns only
`{optionId, archetypeId}` pairs. Designing a home for substitutions would have meant
inventing the feature.

Substitutions are a future product possibility needing their own decision, and this
surface has no substitution affordance.
[ADR 0021](0021-direction-e-a-visual-first-design-language.md) section 7 points to this
decision.

### 7. The entry transition

The two screens hold the same objects in the same order, so the transition is a re-layout
rather than a cross-fade between two pictures.

1. Each garment travels from its Today box to its detail box. Identity is the slot, so
   nothing swaps places and no piece appears or disappears. This spatial motion uses the
   design language's spring role, never authored spring parameters in feature code.
2. The stage fades from the condition tint to the page ground on an effects-duration
   token that ends no later than the pieces settle.
3. The captions arrive after the pieces settle, using the spatial spring role, so the
   reader never tracks moving text.
4. The reasoning section rises as the ordinary push transition.
5. Under Reduced Motion there is no re-layout and no travel: both screens render
   statically and the push is the platform default. The tint difference remains, because
   it carries meaning rather than motion. This satisfies
   [ADR 0020](0020-rewriting-the-motion-law.md)'s rule that motion is never the only
   indication of a state change.

The push remains the platform's. Garment travel is an in-screen re-layout from the Today
preset to the detail preset, not a shared-element transition, on the spatial role
`theme.springs.spatial`. Each piece travels as a plain view with a native transform,
because Reanimated cannot drive react-native-svg's `transform` or `fill` on the new
architecture; the fill fades by draining a tinted copy of the artwork over the resting
one. Simulator verification covers the animated sequence with Reduce Motion off and the
static end state from the first frame with it on.

## Consequences

- **The detail surface places every supported item.** Garment names, layer structure,
  weather reasoning, per-piece reasoning, composition trade-offs, ownership state,
  formality, the weather recap and AI provenance are all placed. Substitutions are absent
  by decision 6.
- **The screen uses two existing pieces of data**: `suppliedByCandidateKeys` and
  `OutfitCandidate.formality`.
- **Ownership captions reuse English state labels and use a dedicated Turkish pair**,
  "Sende var" / "İstiyorsun", as decision 5 specifies.
- **Turkish role labels are the tightest text on the screen.** "ORTA KATMAN" wraps to two
  lines under the layer rail's caption cap. It does not collide at the default text size,
  and it is the case to check first under Dynamic Type.
- **The detail preset is a second consumer of ADR 0025's parameters.** A change to the
  rule's ladder or caps has to be checked against both presets, not only Today.
- **A structural-category fallback is captioned like any other piece.** Its presence does
  not change this surface's behavior.

## Alternatives considered

**A board above the existing five-row list.** The obvious shape, and the one the shipped
screen would become. Rejected: it keeps the uniform row list that the redesign diagnosed
as a cause of flatness, and it states every garment twice, once as a drawing and once as a
row.

**Captions on the tinted stage.** Would have kept Today's surface identity across the
transition. Rejected on Law 3, which forbids secondary copy on that stage.

**One reasoning row per garment.** Simpler to build and it reads as a list again. It also
misrepresents the domain: a requirement is satisfied by a set of garments, and a garment
often satisfies none, so per-garment rows would either invent reasons or leave blanks.

**Printing `layerRole` under each piece.** Rejected on decision 3: it prints "standalone"
under a pair of jeans.

**Using the Turkish collection labels as single-item captions.** Rejected because their
grammar describes collections rather than the garment under the caption.

**Keeping the interim per-garment ownership action list.** Rejected because it stated
every garment twice and placed up to five accent fills in one viewport against Law 1.
The in-place caption menu preserves the state marker and word without adding another
visual block.

## Out of scope

- Substitutions, per decision 6.
- The garment rendering architecture, unchanged from ADR 0021 and ADR 0025.
- Alternate outfits and how Today offers them, which is ADR 0021 section 6.
- Any production code change.
