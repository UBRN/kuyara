# ADR 0026: The recommendation detail surface

Status: Accepted (2026-09-04)

Builds on: [ADR 0025](0025-the-garment-board-composition-rule.md), whose composition rule
this surface reuses unchanged.
Owns the recommendation detail surface named by
[ADR 0021](0021-direction-e-a-visual-first-design-language.md) section 7.

## Context

Direction E makes Today visual-first and keeps garment names, layer structure, per-piece
reasoning and weather reasoning on a recommendation detail surface reached from Today.

The recommendation engine has no per-slot substitution input. Manual editing (swapping,
taking a layer off, adding a layer or an accessory) and composing around chosen pieces are
separate interactions over catalog pieces and never change Today's outfit, the engine's
candidates or the AI request.

## Decision

### 1. Detail is a second parameter set, not a second layout

The board is [ADR 0025](0025-the-garment-board-composition-rule.md)'s `compose()`,
unchanged, run with a detail preset. Same algorithm, same worn layout, same dressing order,
the core on the left and the layers on the right, the footwear a pair at the core's foot.
The detail preset only draws it larger, at the runway preset's 1.25. Pieces stand apart,
none touching another; they travel in from exactly what Today's band drew, its flat lay at
the band's size, square and in the flat lay's stacking, the same composition with its gaps
closed. The preset is specified in [`design/garment-board.md`](../design/garment-board.md).

This is what makes the two screens share a composition rather than merely resemble each
other, and it is what the entry transition animates. It also leaves room for garment rows below the board.

### 2. The board sits on the page ground, not on the condition-tinted stage

Law 3 of [`design-language.md`](../design/design-language.md) states that the tinted
stage "carries no card, no secondary copy, and no bordered control". A detail surface includes secondary copy, so its board sits on the page ground.

The weather keeps a quiet tinted recap row at the foot instead: temperature, condition,
rain probability. The tint draining away between the two screens is not decoration; it is
the visible statement that the weather was the input and the outfit is now the subject.

### 3. Garment rows sit below the board

No text overlaps the drawings. Directly under the board a row of small buttons names the pieces in the order they are put on, wrapping at any text size; each label is centred in its button, the buttons of one line share one height, and each button carries one Closet marker after its label and no other decoration: a filled circled tick in the accent for a piece owned in its colour, a hanger for one owned only in another colour, a filled heart for a wanted one and an empty circle for one not in the Closet, the last three in the board's secondary icon ink. A tap on a name enlarges its piece exactly as a tap on the piece does. One line under them says a name or a piece is tapped and then swiped to change it, until the first change; while a piece is enlarged the candidate strip of decision 6 stands in the place of the names and the line. "Wore this today" sits directly under them. Below it, garment rows name each piece, its slot and its Closet state in board order; each row opens the piece's edit sheet for ownership, colour and optional photo, and carries the plain "Change" control of decision 6. Rows retain readable labels and 44-point targets at the largest standard text size, where Change moves under the row's text.

The rows follow the outfit's edits (decision 6). A layer the reader took off leaves its row in place as "No outer layer" / "Dış katman yok" ("No mid layer" / "Orta katman yok") on the empty-place tile, a `surfaceMuted` tile with the category's glyph faded, subtitle "You took it off" / "Sen çıkardın", with Change and nothing to open. When a layer slot is free an "Add a layer" / "Katman ekle" row follows the piece rows in the same anatomy, a plus tile and the subtitle "Mid or outer layer" / "Orta ya da dış katman". Under the piece rows, "Finishing touches" / "Son dokunuşlar" lists the accessories one row each with a trailing "Take off" / "Çıkar" and ends with an "Add an accessory" / "Aksesuar ekle" row; the heading shows even when kuyara chose none. Under "Wore this today", a result built around chosen pieces marks those rows "Your choice" / "Senin seçimin" with Change. Every added control is a text control or a row of the existing anatomy, drawn once, and a row that gains or loses its control keeps one accessible element for its text and one for its button, each speaking a whole sentence.

The slot label is used rather than `layerRole`, which would print "standalone" under a bottom.

### 4. Reasoning is organised by requirement, and names the pieces that answer it

Reasoning follows weather requirements. Each requirement names the garments that satisfy it; a garment may answer several requirements or none. This stays separate from the garment rows, and it is shown in one place, "Why this outfit" (decision 4a); there is no second list of met requirements.

Composition trade-offs stand under the weather rows of "Why this outfit", one line each in the warning glyph and ink, so the honest "but" of the outfit reads beside its reasons.

`OutfitRequirementEvaluation.suppliedByCandidateKeys` records which garment satisfies
which requirement. It is not persisted and does not need to be: the recommendation
snapshot stores only `{archetypeId, garments:[{slot, layerRole, candidateKey}]}` and
recomposes the outfit on read, so the evaluations are rebuilt on every load. Per-piece
reasoning requires no schema change, migration or contract change; it is a presentation
join over existing domain data.

### 4a. "Why this outfit" draws the weather to the pieces it caused

Above the garment rows, each kind of weather that put a piece in the outfit is one row: its glyph and word, a line, and the outermost one or two pieces that answer it, drawn on the garment tile with their names under the line. Rain, snow, cold, heat, wind and temperature swings are read from the reason codes of the met requirements in decision 4 and the pieces that supply them, so the section is a second presentation join over the same domain data, never AI output, and it is recomputed for a changed outfit. A requirement a whole layer stack answers, such as warmth, keeps the outermost two pieces, the ones the weather put on top. A trade-off is not a cause and draws no line; it reads under the rows as decision 4 says. Mild weather links nothing, and with no trade-off the section is absent.

The line is spatial motion: it grows from the weather toward the pieces on `springs.spatial`, once, staggered in reading order, when the section first comes into view, and rests drawn afterwards. Each row speaks one whole sentence that carries the same link, so nothing depends on the motion.

### 5. One edit sheet owns the piece's Closet record

The garment row opens the sheet; the board changes pieces (decision 6). It shows the piece, the user's owned or wanted record, the Closet palette and the optional private photo from the photo library. A match compares the piece's type and the colour family its Phase 6 palette swatch belongs to with the Closet record's family: the same family is "I own it" / "Bende var"; owned records of the type only in other families are "You have a similar one" / "Sende benzeri var" beside the user's piece and its colour. A record or a piece without a colour family matches on type alone. The matching is one pure domain function. Ownership appears on detail only, never Today. State is named in words and never carried by colour alone. Under the board every name button carries its state's marker (section 3), one table owning the marker and the spoken state together; the garment row names every tracked state in words, and the piece's adjustable element speaks "In your Closet" / "Gardırobunda var", "Similar one in your Closet" / "Benzeri Gardırobunda", "In your wanted pieces" / "İsteklerinde" or "Not in your Closet" / "Gardırobunda yok" after its value. None of it changes a recommendation.

The Closet palette contains 33 colours, including two purple swatches, the system colour picker on iOS, and 14 fixed two-colour or pattern options; there is no free second colour. Its fields are migration 20's. The similar piece's "Yours" draws the user's own piece in its saved colour or pattern and names its option; the board keeps the outfit's palette.

An empty Closet gets one shortcut here, "Add this to my Closet" / "Bunu Gardıroba ekle", at the head of the garment rows. Its tap asks once, in place rather than in a system alert, whether the pieces go in as owned or as wanted, with a way to cancel; the answer applies to every piece, so a new Closet starts without typing and without a question per piece, and each record stays one tap from the sheet that changes it. It adds every piece of the open outfit as one record with that ownership, its catalog type and the colour family it is drawn in, the fields the sheet saves for a new record, through the Closet's create path in one change that first reads the Closet again, so it never adds twice. The offer disappears once the Closet holds anything; a caption with a check names how many pieces went in.

### 6. Manual swaps sit outside recommendation selection

Detail permits a reader to swap any drawn piece for another catalog piece of the same
slot, in two equivalent ways. Each garment row's "Change" opens the slot's picker: every
catalog piece of the slot with the profile's gender applicability kept, the pieces that
keep kuyara's pick weather-suitable first and the rest under a short explanation, a piece
worn by another slot left out. Closet items never become candidates. Suitability is
the domain validator's verdict: the pieces' own hard requirements and every mandatory
weather requirement of the set, the same test a composed outfit passes; formality
consistency is not part of it.

On the board a tap enlarges a piece in place. Where pieces overlap, a tap goes to the piece drawn on top there, as the eye sees it, and an enlarged piece is drawn over every other, so an overlapped piece comes fully into view. It grows about its centre to twice its
composed size, less where the board holds less but never under 1.6 times, shifted only as
far as the stage needs; the other pieces step back to 0.9 in full colour, and the name buttons
leave until the pieces rest again. Under the stage a strip names the
piece and its place ("Coat 3 / 12") beside "Done", over the slot's candidates in the
picker's order as 44-point tiles 8 points apart, as many a row as the column holds and at
most seven (seven in a 390-point phone's 358-point column, six in a 375-point phone's 343),
in as many rows as the slot needs, never a sideways scroller. No slot offers more than 14
candidates today, two rows of seven; the 13-candidate top takes three rows of six on a
375-point phone, and a test fails before a catalog change needs more. A 1-point hairline in `borderSubtle` stands before the first piece
that makes the outfit unusual, and a `focusRing` marker rings the current tile. The piece
changes while it stays large: a horizontal swipe on it, or a tile. A swipe pages the
enlarged piece inside its own window, clipped so it never covers a stepped-back piece,
the leaving piece fading on `motion.fast` as it goes; a release past half a step or a 500 pt/s flick commits, both ends resist like a
rubber band, the order never wraps, and 8 points of vertical travel first hand the press
to the page scroll. A pressed tile, and a swipe past half a step, name the landing piece in
the header before it commits. Each piece is one adjustable accessibility element whose
increment and decrement walk the same order, and the enlarged one reads as expanded; a tile
or a swipe announces the new piece and its place, in the same announcement as the unusual
note when the change makes the outfit unusual. A tap on the enlarged piece, on empty board,
on "Done" or anywhere else on the page settles the enlargement, as does VoiceOver's escape;
a tap on a stepped-back piece moves it. Settled from the board, "Done" or the escape,
VoiceOver's focus returns to the piece. The strip lies outside the board's gesture, so a
tile, "Done" or a gap between tiles never reaches the board, and it takes no touch or focus
until it fades in. "Done" is a plain button, 56 points with Easier to see, and "Done" and
the tiles take the strong edge while higher contrast applies.

The enlarged piece is drawn once more at its grow size and handed over to its resting
drawing on `motion.fast`, fading in from the tap and back once a quarter of the settle is
travelled, so its outline is 1.9 points (2.8 with Easier to see) at both ends and never an
upscaled raster. The stage keeps the height of the slot's tallest candidate for the whole
enlargement, so a change never moves a tile under a finger. The held stage and the strip fit between the
navigation bar and the tab bar with `spacing.md` above, between and under them: where they
would not, the whole board composes narrower for the enlargement, centred, just enough to fit,
and the piece grows in that board; it never narrows so far that the enlarged piece draws under
its resting size, and past that the page scrolls. An enlargement scrolls the page by the least
that shows the strip, never so far that the enlarged piece comes within `spacing.md` of the
navigation bar. Each neighbour waits wholly
behind its side of the window, a step being its own grown width from there, so a wider
neighbour never shows when a drag begins; a paged piece still sliding when the enlargement
settles finishes its slide in the window it had. The first enlargement a profile ever makes shows that
the piece pages, once: when the growth has landed (one `springs.spatial` duration), the piece
and the next candidate, or the previous one at the end of the order, move 32 points the way a
swipe to it would and come back, both on `springs.spatial`, so the neighbour's edge shows
past the window and then waits behind it again, clipped by the same window as a drag, so it
never covers a stepped-back piece. The profile's `swap_hint_shown` flag
(migration 23) is stored as the motion starts, so no later enlargement, visit or launch plays
it; a settle, a moved enlargement, a grab or leaving the screen before then cancels it
unplayed and unstored. It moves no VoiceOver focus and announces nothing, and a finger that
grabs the piece mid-hint takes it over. One height carries the stage
and the hint or the strip on the spatial spring, so the content under the board moves once
when a piece is enlarged and once when it settles; text enters once its space is nine
tenths open and leaves before it closes, and the unusual note, "Back to kuyara's pick" and
"Changed from" do the same.

Every change lays the whole look out again with ADR 0025's composition rule, and the
pieces glide to their new boxes on the spatial spring; the incoming piece enters from the
side its order gives and the outgoing one leaves the other way, paged inside the window
while the slot is enlarged and crossfading otherwise. The change is a dressing: the outgoing
piece lifts `spacing.lg` as it fades on `motion.fast`, and the incoming one is hung on from
`spacing.lg` above and lands on the arrival spring, its shadow with it; a piece a swipe has
already carried into place catches its weight with the moment's settle instead. A changed piece is
coloured afresh, and every piece that is still kuyara's pick keeps the colour the
original outfit gave it, passed to the palette resolver as a recorded swatch; nothing is
stored. The manual combination is not blocked when weather or composition rules would
reject it; "Unusual for this weather" under the board, in the warning glyph and ink,
explains the departure. The title becomes "Your outfit" in place at the change, and
"Changed from" the archetype opens under it once no piece is enlarged, moving with the strip
as it closes, the reasons are recomputed for the pieces worn, the source sentence names the
change, and "Back to kuyara's pick" returns the recommendation. The change lives only as
long as detail is open: nothing is saved until the reader chooses "Wore this today",
which records a `manual` outfit (ADR 0038); recording it settles the board once with the
success notification, the design language's moment. A swipe that crosses half a step toward a
candidate fires the selection feedback once per crossing, a threshold under the finger; a
tile, the picker and an adjustable step fire none. **Risk accepted:** manual mode can present an
outfit the deterministic recommendation engine would reject.

Removal and addition belong to the layers and the finishing touches only. A `mid_layer` or
`outer_layer` can be taken off; the top, bottom, one-piece and footwear never can. While such
a piece is enlarged, the strip header shows its name, "n / total", a plain text "Take off" /
"Çıkar" and "Done" / "Bitti"; no mark sits on a piece, which section 3's rejection of corner
glyphs keeps. Taking it off lays the board out again with ADR 0025's rule without the piece:
the piece lifts `spacing.lg` as it fades on `motion.fast`, with no sideways exit, the
remaining pieces glide to their boxes, and the focused slot clears in the same render so no
enlargement outlives its piece. The row becomes the empty-place row of section 3, and the
slot's picker, opened from that row, starts with "Wear without an outer layer" / "Dış katman
olmadan giy" ("Wear without a mid layer" / "Orta katman olmadan giy"), fixed first outside the
score order, marked current while the layer is off. The strip never offers "none" and a swipe
never reaches it, so no candidate list holds an empty entry. An "Add a layer" row opens the
picker for the free layer slot, behind a segmented "Mid layer" / "Orta katman" and "Outer
layer" / "Dış katman" when both are free; the added piece is hung on from above, starting
transparent, and its row reads "Added" / "Eklendi". A layer taken off never changes an
accessory on its own. Whether the weather allows the outfit without the layer is the domain
validator's verdict, shown as the unusual note; nothing blocks it.

The finishing touches are editable the same way. Each accessory row carries "Take off"; a
taken-off accessory leaves the list and one closing line, "You took off 2 finishing
touches" / "2 son dokunuşu çıkardın", a whole sentence for each count in each language,
carries "Put back" / "Geri koy", which restores them all. "Add an accessory" opens a picker
grouped Head, Neck, Hands and Carry over the eight catalogue accessories, "Fits today's
weather" first only when the domain says an accessory answers a requirement; an added
accessory reads "<slot> · Added" with "Take off", one accessory fills one accessory slot, and
an accessory the day does not ask for never makes the outfit unusual, because accessories never
count. The board still draws none of them (ADR 0025).

Composing around chosen pieces answers "What do you want to wear today?" without changing the
engine's selection. A row under "Wore this today", for a signed-in member once accounts open
(ADR 0041 section 5), opens a sheet over the outfit's pieces and "Choose another piece", which
turns the sheet to the catalog by slot and back (a sweater is listed as a top and as a mid
layer). The reader ticks at most three, one for each slot; a later tick replaces the piece it
conflicts with, so a one-piece tick clears the top and bottom ticks and the reverse. Each
ticked piece may be coloured from
the Closet's 33 solid colours, which only paints the drawing through the recorded swatch and
never enters selection. The domain adds the pins as a predicate on the full valid outfit set
before ordering, diversity and accessories, deterministically, with no AI request, no allowance
and no Worker call; Closet records are never pins. A result is up to three outfits stepped
through by "1 / 3" and "Show another" / "Başka göster" in the hint slot below the name
buttons, wrapping from the last to the first, fewer when the pins leave fewer, read honestly
as "1 / 2" or "1 / 1" (no button at one); the title reads "Your outfit" with the subtitle
"Built from the pieces you chose" / "Seçtiğin parçalarla kuruldu". Pins that fit no valid outfit for the weather are
composed with the largest satisfiable subset and the rest are swapped into the best pick,
under the same unusual note. The result lives like a manual change: it is never a snapshot,
never replaces Today and records as `manual` through "Wore this today". **Risk accepted:**
making the row members only, for a feature that needs no identity, may draw App Review
guideline 5.1.1(v).

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

The push remains the platform's. Only an outfit opened from Today's primary board starts from
the band: its garment travel is an in-screen re-layout from the boxes Today's band draws (its
flat lay at the band's width, centred on the detail board, stacked as the band stacks it until
the pieces rest, on a cornerless tint that first stands the band's height and settles to the
board's with the pieces) to the detail preset. An outfit the band never drew, opened from the
Tomorrow strip or a tile under the band, starts from Today's fitted stage at the board's own
width, with the stage's corners and the board's height, stacked in the dressing order. Neither
is a shared-element transition; both travel on the arrival role `theme.springs.arrival`, the
spring for garment pieces landing on a board. Each piece travels as a plain view with a native transform,
because Reanimated cannot drive react-native-svg's `transform` or `fill` on the new
architecture; the fill fades by draining a tinted copy of the artwork over the resting
one. Simulator verification covers the animated sequence.

## Consequences

- **The detail surface places every supported item.** Garment names, layer structure,
  weather reasoning, composition trade-offs, ownership state,
  formality, the weather recap and AI provenance are all placed. Manual swaps are
  explicitly outside engine selection by decision 6, as are taking pieces off and adding them
  and composing around chosen pieces.
- **The screen uses two existing pieces of data**: `suppliedByCandidateKeys` and
  `OutfitCandidate.formality`.
- **One edit sheet owns the Closet actions.** The garment rows open it; the board and the rows' Change control change pieces, so no control is duplicated.
- **The detail preset is a second consumer of ADR 0025's parameters.** A change to the rule's ladder or caps is checked against both presets.
- **A structural-category fallback remains readable and editable.** A legacy null-type record does not break this surface.
- **History titles are dates.** The history entry title names the date, with its recorded outfit and optional mirror photo below.

## Alternatives considered

**A duplicate ownership action list.** Rejected: the garment rows already open the edit sheet, so another action list repeats the controls.

**Captions on the tinted stage.** Would have kept Today's surface identity across the
transition. Rejected on Law 3, which forbids secondary copy on that stage.

**A caption under every piece on an open board.** Rejected: it kept the detail's pieces
apart so a name could fit under each, which drew the outfit differently from Today, and a
glyph disc at a piece's corner would cover a neighbour once the pieces overlap.

**A mark on each piece, or an edit mode with minus and plus badges.** Rejected on section 3's
no-glyph-on-a-piece rule and on the board drawing five pieces and nothing else (ADR 0025): the
control lives in the enlarged piece's strip header and in the rows.

**Swiping to an empty candidate.** Rejected: the board's lookups assume a piece for every
focused slot, and taking a layer off is a decision, not a step in an order.

**One reasoning row per garment.** Simpler to build and it reads as a list again. It also
misrepresents the domain: a requirement is satisfied by a set of garments, and a garment
often satisfies none, so per-garment rows would either invent reasons or leave blanks.

**Printing `layerRole` under each piece.** Rejected on decision 3: it prints "standalone"
under a pair of jeans.

## Out of scope

- Engine-generated per-slot substitutions, per decision 6. Composing around chosen pieces is
  the reader's own pin on the deterministic composer, not an engine substitution, and never
  uses AI.
- Taking off or adding a top, a bottom, a one-piece or footwear.
- The garment rendering architecture, unchanged from ADR 0021 and ADR 0025.
- Alternate outfits and how Today offers them, which is ADR 0021 section 6.
