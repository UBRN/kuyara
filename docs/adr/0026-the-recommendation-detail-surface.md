# ADR 0026: The recommendation detail surface

Status: Accepted (2026-09-04)

Builds on: [ADR 0025](0025-the-garment-board-composition-rule.md), whose composition rule
this surface reuses unchanged.
Owns the recommendation detail surface named by
[ADR 0021](0021-direction-e-a-visual-first-design-language.md) section 7.

## Context

Direction E makes Today visual-first and keeps garment names, layer structure, per-piece
reasoning and weather reasoning on a recommendation detail surface reached from Today.

The recommendation engine has no per-slot substitution input. Manual swapping is a
separate interaction over catalog pieces and never changes the engine's candidates.

## Decision

### 1. Detail is a second parameter set, not a second layout

The board is [ADR 0025](0025-the-garment-board-composition-rule.md)'s `compose()`,
unchanged, run with a detail preset. Same algorithm, same family selection, same relative
arrangement, same reading order. Only the gaps, the width caps and the insets differ. The
preset is specified in [`design/garment-board.md`](../design/garment-board.md).

This is what makes the two screens share a composition rather than merely resemble each
other, and it is what the entry transition animates. It also leaves room for garment rows below the board.

### 2. The board sits on the page ground, not on the condition-tinted stage

Law 3 of [`design-language.md`](../design/design-language.md) states that the tinted
stage "carries no card, no secondary copy, and no bordered control". A detail surface includes secondary copy, so its board sits on the page ground.

The weather keeps a quiet tinted recap row at the foot instead: temperature, condition,
rain probability. The tint draining away between the two screens is not decoration; it is
the visible statement that the weather was the input and the outfit is now the subject.

### 3. Garment rows sit below the board

The board keeps the detail preset and no text overlaps the drawings. One line under the board says the pieces open the edit sheet, and "Wore this today" sits directly under it. Below it, garment rows name each piece, its slot and its Closet state in board order. A board garment, its caption or its row opens the same edit sheet for ownership, colour and optional photo. Rows retain readable labels and 44-point targets at the largest standard text size; above `fontScale` 1.5 the board captions leave and the rows alone name the pieces.

The slot label is used rather than `layerRole`, which would print "standalone" under a bottom.

### 4. Reasoning is organised by requirement, and names the pieces that answer it

Reasoning follows weather requirements. Each requirement names the garments that satisfy it; a garment may answer several requirements or none. This stays separate from the garment rows.

Composition trade-offs join the same list, marked as trade-offs rather than reasons.

`OutfitRequirementEvaluation.suppliedByCandidateKeys` records which garment satisfies
which requirement. It is not persisted and does not need to be: the recommendation
snapshot stores only `{archetypeId, garments:[{slot, layerRole, candidateKey}]}` and
recomposes the outfit on read, so the evaluations are rebuilt on every load. Per-piece
reasoning requires no schema change, migration or contract change; it is a presentation
join over existing domain data.

### 5. One edit sheet owns garment changes

The board garment and its row open one sheet. It shows the piece, the user's owned or wanted record, the 13 closed colour families and the optional private photo from the photo library. A match compares the piece's type and the colour family its Phase 6 palette swatch belongs to with the Closet record's family: the same family is "I own it" / "Bende var"; owned records of the type only in other families are "You have a similar one" / "Sende benzeri var" beside the user's piece and its colour. A record or a piece without a colour family matches on type alone. The matching is one pure domain function. Ownership appears on detail only, never Today. State is named in words and never carried by colour alone.

The approved wide palette contains 33 colours, a system colour picker, a second colour and 14 two-colour or pattern options, including two purple swatches. It requires new Closet fields in migration 20, with independent review, an upgrade test and device-database replay, and ships in build 16. The installed schema is version 19.

### 6. Manual swaps sit outside recommendation selection

Detail permits a reader to swap any piece for another catalog piece. Closet items do
not become candidates. The whole look rerenders on the garment board. The manual
combination is not blocked when weather or composition rules would reject it; a quiet
"Unusual for this weather" note explains the departure. Nothing is saved until the
reader chooses "Wore this today". **Risk accepted:** manual mode can present a look
the deterministic recommendation engine would reject.

A new record starts on the colour family the outfit draws the piece in, without sending Closet data to AI.

### 7. The entry transition

The two screens hold the same objects in the same order, so the transition is a re-layout
rather than a cross-fade between two pictures.

1. Each garment travels from its Today box to its detail box. Identity is the slot, so
   nothing swaps places and no piece appears or disappears. This spatial motion uses the
   design language's spring role, never authored spring parameters in feature code.
2. The stage fades from the condition tint to the page ground on an effects-duration
   token that ends no later than the pieces settle.
3. The garment rows arrive after the pieces settle, so the reader never tracks moving text.
4. The reasoning section rises as the ordinary push transition.
5. The OS motion preference does not suppress the re-layout or garment travel.
   The tint difference remains, because it carries meaning rather than motion.

The push remains the platform's. Garment travel is an in-screen re-layout from the boxes
Today's fitted primary stage draws to the detail preset, not a shared-element transition,
on the spatial role
`theme.springs.spatial`. Each piece travels as a plain view with a native transform,
because Reanimated cannot drive react-native-svg's `transform` or `fill` on the new
architecture; the fill fades by draining a tinted copy of the artwork over the resting
one. Simulator verification covers the animated sequence.

## Consequences

- **The detail surface places every supported item.** Garment names, layer structure,
  weather reasoning, composition trade-offs, ownership state,
  formality, the weather recap and AI provenance are all placed. Manual swaps are
  explicitly outside engine selection by decision 6.
- **The screen uses two existing pieces of data**: `suppliedByCandidateKeys` and
  `OutfitCandidate.formality`.
- **One edit sheet owns the actions.** Garment rows and board thumbnails open it without duplicating controls.
- **The detail preset is a second consumer of ADR 0025's parameters.** A change to the rule's ladder or caps is checked against both presets.
- **A structural-category fallback remains readable and editable.** A legacy null-type record does not break this surface.
- **History titles are dates.** The history entry title names the date, with its recorded outfit and optional mirror photo below.

## Alternatives considered

**A duplicate ownership action list.** Rejected: the garment rows already open the edit sheet, so another action list repeats the controls.

**Captions on the tinted stage.** Would have kept Today's surface identity across the
transition. Rejected on Law 3, which forbids secondary copy on that stage.

**One reasoning row per garment.** Simpler to build and it reads as a list again. It also
misrepresents the domain: a requirement is satisfied by a set of garments, and a garment
often satisfies none, so per-garment rows would either invent reasons or leave blanks.

**Printing `layerRole` under each piece.** Rejected on decision 3: it prints "standalone"
under a pair of jeans.

## Out of scope

- Engine-generated per-slot substitutions, per decision 6.
- The garment rendering architecture, unchanged from ADR 0021 and ADR 0025.
- Alternate outfits and how Today offers them, which is ADR 0021 section 6.
