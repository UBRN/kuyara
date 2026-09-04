# ADR 0026: The recommendation detail surface

Status: Accepted (2026-09-04)

Implementation: not started. This records an approved design produced by a design
session. No production code, contract, or route was changed to reach it. The rendered
mockups, in English and Turkish and in both appearances, are kept outside the repository.

Builds on: [ADR 0025](0025-the-garment-board-composition-rule.md), whose composition rule
this surface reuses unchanged.
Answers: [ADR 0021](0021-direction-e-a-visual-first-design-language.md) section 7, which
named a recommendation detail surface as future work and did not design it.

## Context

Direction E made Today visual-first and took the garment names off it. ADR 0021 section 7
then deferred everything it displaced: "Garment names, layer structure, per-piece
reasoning, weather reasoning and substitutions belong to a recommendation detail surface
reached from Today."

The risk was specific. The shipped Direction D2 detail screen is a five-row list of
identical garment cards, and the redesign's first session recorded that uniformity as one
of the causes of flatness. Adding an illustration above that same list would not fix it.

Two of the five deferred items turned out not to exist in the product, which is recorded
in the decision rather than designed around.

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

**This costs nothing to build.** `OutfitRequirementEvaluation.suppliedByCandidateKeys`
already records which garment satisfies which requirement. It is not persisted and does
not need to be: the recommendation snapshot stores only `{archetypeId, garments:[{slot,
layerRole, candidateKey}]}` and recomposes the outfit on read, so the evaluations are
rebuilt on every load. Per-piece reasoning requires no schema change, no migration, and no
contract change. It is a presentation join over data the domain already produces and
currently discards.

### 5. Ownership state appears here and only here, and needs new copy

`AGENTS.md` already requires ownership state on outfit detail and nowhere else. Each
caption carries a marker and a word, and one summary line states the count. The marker is
a filled or hollow dot, so state is never carried by colour alone.

**Correction, 2026-09-04**, made the same day this ADR was accepted. The original text
here read that the product has no ownership state copy at all and that four new strings
were needed. That was wrong, and it was wrong because the search stopped at the `today`
namespace. English state copy already exists: `ownedLabel` "Owned" and `wantedLabel`
"Wanted", in both the `profile` and `wardrobe` namespaces
(`apps/mobile/src/localization/messages.ts:449,573`). The English captions reuse those and
no new English string is owed.

Turkish is the real gap. Its existing pair is "Sahip olduklarım" and "İstediklerim"
(`messages.ts:835,960`), which are collection labels, "the ones I own" and "the ones I
want". They are correct for a filter and wrong as a caption under a single garment. **One
new Turkish pair is approved: "Sende var" / "İstiyorsun"**, matching the register of the
existing action strings "Bende var" and "İstiyorum" rather than inventing a new one.

`ownershipOwnedAction` "I own it" and `ownershipWantedAction` "I want it" remain what they
are, actions, and are not reused as state. The new Turkish pair is specified rather than
added, and lands with the screen that consumes it, because unused localization keys are
the speculative infrastructure `AGENTS.md` forbids.

The control that *changes* ownership is deliberately not designed here and remains open.

### 6. Substitutions are out of the MVP, as a product decision rather than a design gap

ADR 0021 listed substitutions among the things detail would carry. Nothing in
`packages/contracts/src/ai-v1.ts`, the domain, or the persisted snapshot produces a
per-slot alternative: the composer emits three whole outfits and the AI returns only
`{optionId, archetypeId}` pairs. Designing a home for substitutions would have meant
inventing the feature.

Substitutions are therefore recorded as a future product possibility needing their own
decision, and this surface has no substitution affordance. ADR 0021 section 7 is amended
to that extent.

### 7. The entry transition

The two screens hold the same objects in the same order, so the transition is a re-layout
rather than a cross-fade between two pictures.

1. Each garment travels from its Today box to its detail box. Identity is the slot, so
   nothing swaps places and no piece appears or disappears.
2. The stage fades from the condition tint to the page ground over the same interval.
3. The captions arrive after the pieces settle, so the reader never tracks moving text.
4. The reasoning section rises as the ordinary push transition.
5. Under Reduced Motion there is no re-layout and no travel: both screens render
   statically and the push is the platform default. The tint difference remains, because
   it carries meaning rather than motion. This satisfies
   [ADR 0020](0020-rewriting-the-motion-law.md)'s rule that motion is never the only
   indication of a state change.

## Consequences

- **Every item Today gave up has a home, except the one that does not exist.** Garment
  names, layer structure, weather reasoning, per-piece reasoning, composition trade-offs,
  ownership state, formality, the weather recap and AI provenance are all placed.
  Substitutions are not, by decision 6.
- **Two pieces of existing data stop being discarded**: `suppliedByCandidateKeys` and
  `OutfitCandidate.formality`, neither of which the shipped detail screen reads.
- **One Turkish string pair is owed** when the screen is implemented. English reuses
  `ownedLabel` and `wantedLabel`. See the correction in decision 5.
- **Turkish role labels are the tightest text on the screen.** "ORTA KATMAN" wraps to two
  lines under the layer rail's caption cap. It does not collide at the default text size,
  and it is the case to check first under Dynamic Type.
- **The detail preset is now a second consumer of ADR 0025's parameters.** A change to the
  rule's ladder or caps has to be checked against both presets, not only Today.
- **The category-glyph redraw that ADR 0025 left open is unchanged and does not block
  this surface.** A fallback piece on this screen is captioned like any other.

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

**Adding the Turkish ownership state pair now.** Rejected as unused keys with no consumer.

## Out of scope

- The control that changes ownership state.
- Substitutions, per decision 6.
- The garment rendering architecture, unchanged from ADR 0021 and ADR 0025.
- Alternate outfits and how Today offers them, which is ADR 0021 section 6.
- Any production code change.
