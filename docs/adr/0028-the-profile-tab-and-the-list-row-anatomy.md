# ADR 0028: The Profile tab and the list-row anatomy

Status: Accepted (2026-09-07)

Builds on: [ADR 0006](0006-three-tab-information-architecture.md), whose three tabs and
Closet-inside-Profile placement are not reopened; [ADR 0019](0019-adopting-expo-ui-at-the-control-layer.md),
whose control-layer boundary this respects; [ADR 0021](0021-direction-e-a-visual-first-design-language.md),
whose Direction E it applies to the third tab; [ADR 0025](0025-the-garment-board-composition-rule.md),
whose silhouettes the rack reuses; and [ADR 0027](0027-the-app-shell-and-its-three-tabs.md),
whose inset rule every screen here obeys.

## Context

Design goal 4 asked what Profile is for once it is neither a dashboard nor a menu. Every
direction in the visual spike left the screen a third empty, and none answered it.

The shipped Profile is an inventory dashboard for a record that
[ADR 0005](0005-catalog-only-recommendation-candidates.md) removed from recommendations:
an owned count as a 40 point hero, a category grid of zeros, a location card that
duplicates Weather, and a status row that is Today's job and the seventh status site
Law 9 never named. Profile's own subject is the Closet, its wanted items and the
reader's recorded outfit history; Weather owns the place.

The approved direction is "the Closet is the subject." Its target sheet follows an
eight-check list-row reference: grouped inset rows, one group per section; a leading
monochrome icon tile with an alpha fill from a semantic role; the separator starting at
the text edge; a secondary trailing value then a chevron, stacking above `fontScale`
1.5; kuyara's sentence-case headings outside any native group; one accent fill per
viewport; the platform's own tab bar; and motion classified as spatial (the spring role)
or effects (a duration token). Checks 1 to 5 define the anatomy in section 2 below.

## Decision

### 1. The Closet is the subject

Top to bottom, the populated screen is:

1. A native large title, "Profile" / "Profil", with the Settings gear as the bar button.
   That is the only chrome. Settings is not a row.
2. A **Closet heading row**: the word at `title` 22, the total count trailing at `body`
   17 in `textSecondary` with tabular figures, then a chevron. The whole row opens the
   list. It is a heading, not a list row, and does not take the anatomy in section 2.
3. **The illustrated Closet, the hero**: an open clothes rack, full content width at a
   361 by 240 proportion, drawn in `textPrimary` ink with one outline and flat fills
   (`surface` on the top bar, the shelf and the castors), no carcass, no doors and no
   body. Each category has its own zone: accessories on eight hooks under the top bar;
   outerwear, one-piece and tops on the upper rail, long pieces first; bottoms on clip
   hangers on the lower rail; shoes on the bottom shelf. While a rail has room every piece
   hangs face-out with up to two empty hangers after it; when it fills, its newest one to
   three owned pieces face out and every other piece hangs side-on as a slice in its own
   colour, owned grouped by category and run dark to light, wanted last with a dashed edge.
   A zone past its slice minimum ends in a "+N" tag at `caption`. Pieces draw their
   garment-type silhouette in their colour family, or their category glyph when they have
   no type; a photo never enters the drawing. The rack is one button that opens the Closet;
   its label names the heading, the total and the count per category.
   Under it, 12 below, **six category cells** in three columns (two at the largest
   standard text sizes), 12 apart: a 64 point `surfaceMuted` tile, radius 14, holding the
   category's newest owned piece drawn in its colour (the category glyph in
   `textSecondary` when the category is empty) and its count at `title` in tabular
   figures, then the category name at `caption` in `textSecondary`, 4 below. All six
   always show; counts are owned plus wanted, derived from the records. Each cell is a
   button, "Tops, 7 pieces, 1 wanted.", that opens the Closet on its category.
4. `spacing.xl` 24, the one permitted `xl` on the screen.
5. One inset group holding a **Wanted** row (heart tile, count, chevron; opens the list on
   the wanted sections) and a **History** row (calendar/list of outfits worn, with optional
   mirror photos). Location selection lives only on Weather.
6. A trailing `spacing['2xl']` 32 inside the content. `Screen` owns the inset
   (ADR 0027 section 4).

The rack keeps its place in every state. The empty Closet shows the heading, the rack with
bare hangers waiting on both rails, one sentence at `body` in `textPrimary`, and an "Add a
piece" / "Parça ekle" button (the screen's only accent fill, present only in this state),
with no category cells. Loading draws the bare rack, hooks and rails without hangers,
then the six cell tiles without drawings or counts, spoken as loading. An error draws the
bare rack, then a `dangerInk` glyph at 20, a `bodyStrong` title, a `body` line and a
tonal "Try again" button. The Wanted row is hidden while nothing exists in either state.
The History row sits in the group under Closet.

There are no cards. The planes are ground and chrome plus the illustrated Closet stage. Emphasis levels
are three: the rack; `title` and `bodyStrong`; `body` and `caption`. No `display`, no
`eyebrow`, no motion, no haptic.

### 2. The list-row anatomy, decided once

This is the anatomy goals 5 and 6 inherit unchanged, and the answer to checks 1 to 5 of
the list-row reference. It applies to every kuyara-drawn list row, and to the native rows
of [ADR 0030](0030-settings-as-a-native-grouped-list.md) wherever the value is kuyara's to
set.

| Part | Value |
| --- | --- |
| Group | one inset group per section, 16 from the screen edge, radius 20 (the Law 3 container radius; image tiles stay at 14). Light: no fill and a 1 point `borderDefined` hairline, because ADR 0021 removed the light card step. Dark: the Night Layer surface step, no border. A native group keeps the system's own fill and radius |
| Row | padding 12 vertical, 16 horizontal, minimum height 44 |
| Leading tile | 28 × 28, radius 7, a monochrome glyph at 20 beside `body` (Law 6), glyph in `textPrimary`, fill derived through `withAlpha` from the same ink at 8% in light and 12% in dark. Never a coloured tile; that is what keeps Law 1's one accent fill per viewport |
| Separator | starts at the text edge, 16 inset + tile + 12 gap, which is 56 at the default text size; runs to the group's right edge; `borderSubtle` |
| Trailing value | `body` 17 in `textSecondary`, tabular when numeric, then a chevron at 20, on one line |
| Section heading | kuyara's, when a section has one: sentence case, `bodyStrong` 17, `textSecondary`, drawn outside any group, 12 below it before the group (Law 2 `md`), 24 between groups |

The measured reference (a 393 point screen at 3x) agreed within a few points: group inset
16 and width 361, separator 54 from the group edge, row pitch 54, sentence-case headings
outside the group, and a centred secondary version line last. Where it differs, kuyara's
rule is deliberate: Night Layer replaces black, one accent fill per viewport replaces the
reference's three, and section headings use `textSecondary`.

### 3. Text scaling

- The rack scales with the content width, never with the text. The category cells go
  from three columns to two above `fontScale` 1.2, the largest standard text sizes, and
  their tile and drawing scale by `min(fontScale, 1.2)`, so the title-sized count still
  fits beside the drawing.
- In a kuyara-drawn row the leading tile, its glyph and the chevron scale by
  `min(fontScale, 1.5)`, so at the largest accessibility size they are 42, 30 and 30 and
  the separator moves to 70. Without the cap the chevron reached 62 points and pushed the
  label into a mid-word break; with it the label column keeps 209 points and "Wanted"
  (183) and "İstekler" (174) stay on one line.
- Above `fontScale` 1.5 the trailing value stacks under the label and the chevron stays on
  the label line, through the one shared hook ADR 0019 calls for.
- A single word wider than the label column still breaks by character at the largest
  sizes, exactly as the native list breaks "Notifications"; a long trailing value with
  a comma can leave the comma on its own line. This is the platform's behaviour and is not worked
  around.

### 4. Personal facts stay in Settings

Display name, gender, dress style, style aesthetics and birth date are edited in Settings.
An optional name personalizes the Closet heading as "{name}'s Closet" or "Gardırop · {name}".
The heading uses the existing copy when no name is stored. No other personal facts are
shown on Profile; Turkish adds no possessive suffix to a name.

### 5. Strings

The Wanted row is "Wanted" / "İstekler". The shorter Turkish word replaces the sheet's
first choice, "İstediklerim", because at `fontScale` 3.118 the twelve-letter word cannot
fit the label column and broke mid-word. The same key serves the Closet's wanted state,
so the two screens cannot drift. New strings use the informal register of ADR 0026's
"Sende var"; the app-wide register inconsistency stays recorded in `current-status.md`
and is not settled here.

### 6. The colour-family fill is approved

Filling a garment-type silhouette with the piece's colour family, a muted tint tuned per
appearance, is approved by the sheet approval. It is content colour, not an interface
token, and it applies to the Profile rack and the Closet grid and to the garment board as
the source of its hue anchors. Its
per-family fill table doubles as the mapper that the shipped list lacks, where a stored
enum currently reaches a style by the coincidence that every family name is a CSS colour
keyword.

### 7. Sequencing

1. ADR 0027's bottom-inset rule and the English Closet label are prerequisites for this
   screen.
2. The rack draws the garment-type silhouette, else the category glyph, and never a
   photo; photos stay on the Closet's tiles. It shares ADR 0025's garment drawings,
   accessories included.
3. The Wanted row opens the Closet with the wanted sections in view.
4. Profile has no location row or location-status row; selection lives on Weather.

## Consequences

- **Profile stops competing with Weather and Today.** The location card, location row
  and status row leave; Weather owns location selection.
- **One row primitive, three screens.** The anatomy in section 2 is the contract for
  goals 5 and 6 and for any later list. ADR 0019 measured what happens when the same
  control is written three times; this is the reason it is written here once.
- **The light appearance has two group treatments.** A kuyara-drawn group is a hairline
  outline; a native group keeps its system fill. That is the trade ADR 0030 names as
  visible rather than hidden, and it is accepted knowingly.
- **A new dependency on the silhouette vocabulary.** The rack and the colour-family fill
  both depend on ADR 0025's drawings.
- **Strings and routing follow the same contract.** The empty-state copy agrees with
  ADR 0005, and the Wanted row opens the Closet's wanted sections.

## Alternatives considered

**Rows only, or a native grouped list, for the whole screen.** Rejected in plan mode: both
left the screen a third empty, and the native list contradicts ADR 0019 section 3, which
names Profile as an identity screen rather than a control-layer one.

**A Settings row instead of the gear.** Rejected: ADR 0027 keeps Settings as the header's
bar button, and a row would make the Closet share its screen with a menu again.

**Copying the reference's card fill in light.** Rejected: ADR 0021 requires no light
card step, and the hairline outline carries the group without reintroducing a plane.

**Uncapped scaling of the row controls.** Rejected by measurement; see section 3.

## Out of scope

- The Closet screen and the Settings screen, which are ADR 0029 and ADR 0030.
- The add and edit form and the photo pipeline.
- Accessory silhouettes on the outfit board; ADR 0025 keeps them on Closet and Profile only.
- Any production code change.
