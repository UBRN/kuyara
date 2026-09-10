# ADR 0028: The Profile tab and the list-row anatomy

Status: Accepted (2026-09-07)

Implementation: landed 2026-09-07 (the `ListRow` anatomy and the Profile tab) and
2026-09-09 (section 6's silhouette rung and colour-family fill). The five accessory
silhouettes remain unapproved. This records an approved design produced by two design
sessions, on 2026-09-04 and 2026-09-07. No production code, contract, schema or route was
changed to reach it. The rendered target sheet, in English and Turkish, both appearances
and three text sizes, is kept outside the repository; its "target, in numbers" table is
the implementation target, and the numbers that matter are repeated here so the decision
can be read without it.

Builds on: [ADR 0006](0006-three-tab-information-architecture.md), whose three tabs and
Closet-inside-Profile placement are not reopened; [ADR 0019](0019-adopting-expo-ui-at-the-control-layer.md),
whose control-layer boundary this respects; [ADR 0021](0021-direction-e-a-visual-first-design-language.md),
whose Direction E it applies to the third tab; [ADR 0025](0025-the-garment-board-composition-rule.md),
whose silhouettes the rail reuses; and [ADR 0027](0027-the-app-shell-and-its-three-tabs.md),
whose inset rule every screen here obeys.

Amends: [ADR 0015](0015-gender-and-age-band-in-the-profile.md) section 2, together with
[ADR 0030](0030-settings-as-a-native-grouped-list.md). The amendment is recorded in ADR 0015
itself.

## Context

Design goal 4 asked what Profile is for once it is neither a dashboard nor a menu. Every
direction in the visual spike left the screen a third empty, and none answered it.

The shipped Profile is an inventory dashboard for a record that
[ADR 0005](0005-catalog-only-recommendation-candidates.md) removed from recommendations:
an owned count as a 40 point hero, a category grid of zeros, a location card that
duplicates Weather, and a status row that is Today's job and the seventh status site
Law 9 never named. Only three facts on it are Profile's own: the Closet, the wanted
list and the place.

The direction chosen in plan mode on 2026-09-04, "the Closet is the subject", was drawn
as a target sheet the same day. On 2026-09-07 a third-party settings screen was studied
and reduced to an eight-check list-row reference; the sheet was then measured against it,
failed four checks, and was corrected. The maintainer approved the corrected sheet the
same day. The eight checks, recorded here since the status document no longer carries
them (2026-09-09): grouped inset rows, one group per section; a leading monochrome icon
tile with an alpha fill from a semantic role; the separator starting at the text edge;
a secondary trailing value then a chevron, stacking above `fontScale` 1.5; kuyara's
sentence-case headings outside any native group; one accent fill per viewport; the
platform's own tab bar; and motion classified as spatial (the spring role) or effects
(a duration token). Checks 1 to 5 became the anatomy in section 2 below.

## Decision

### 1. The Closet is the subject

Top to bottom, the populated screen is:

1. A native large title, "Profile" / "Profil", with the Settings gear as the bar button.
   That is the only chrome. Settings is not a row.
2. A **Closet heading row**: the word at `title` 22, the total count trailing at `body`
   17 in `textSecondary` with tabular figures, then a chevron. The whole row opens the
   list. It is a heading, not a list row, and does not take the anatomy in section 2.
3. **The rail, the hero**: the eight newest owned pieces as 136 × 170 tiles on the stage
   fill, radius 14, gap 12, bleeding off the right edge, with one "All pieces" tile past
   eight. Each tile draws the first rung of the ladder it can: the user's photo, else the
   garment-type silhouette from ADR 0025 filled with the piece's colour family, else the
   structural-category glyph. A `caption` 13 line sits 4 under each tile: the type name in
   `textSecondary`, or the user's own name for the piece in `textPrimary`.
4. `spacing.xl` 24, the one permitted `xl` on the screen.
5. One inset group holding a **Wanted** row (heart tile, count, chevron; opens the list on
   the wanted filter) and a **Location** row (pin tile, the place at `bodyStrong`, an
   "Approximate location" caption, chevron; opens Weather).
6. A trailing `spacing['2xl']` 32 inside the content. `Screen` owns the inset
   (ADR 0027 section 4).

The empty Closet shows the heading, one sentence at `body` in `textSecondary`, an
"Add a piece" / "Parça ekle" button (the screen's only accent fill, present only in this
state), then the Location row alone in its group. The Wanted row is hidden while nothing
exists in either state and returns the moment something does.

There are no cards. The planes are ground and chrome plus the tile stage. Emphasis levels
are three: the rail; `title` and `bodyStrong`; `body` and `caption`. No `display`, no
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
| Section heading | kuyara's, when a section has one: sentence case, `bodyStrong` 17, `textSecondary`, drawn outside any group, 12 below it before the group (Law 2 `md`), 24 between groups. Amended 2026-09-07: was `textPrimary` at acceptance; the maintainer measured the byAir reference again and changed the heading ink to `textSecondary` |

The measured reference (a 393 point screen at 3x) agreed within a few points: group inset
16 and width 361, separator 54 from the group edge, row pitch 54, sentence-case headings
outside the group, and a centred secondary version line last. Where it differed, the
difference is kuyara's rule rather than an oversight, with one exception the maintainer
corrected the same day: a Night Layer ground rather than black, and one accent fill per
viewport where the reference showed three. Section headings were first recorded as
`textPrimary` rather than grey; amended 2026-09-07 to `textSecondary`, so this row is no
longer one of kuyara's deliberate differences from the reference.

### 3. Text scaling

- Rail tiles scale by `min(fontScale, 2)` above 1.5, so the artwork grows with its
  caption and the caption fits its longest word; below 1.5 only the caption scales.
- In a kuyara-drawn row the leading tile, its glyph and the chevron scale by
  `min(fontScale, 1.5)`, so at the largest accessibility size they are 42, 30 and 30 and
  the separator moves to 70. Without the cap the chevron reached 62 points and pushed the
  label into a mid-word break; with it the label column keeps 209 points and "Wanted"
  (183) and "İstekler" (174) stay on one line.
- Above `fontScale` 1.5 the trailing value stacks under the label and the chevron stays on
  the label line, through the one shared hook ADR 0019 calls for.
- A single word wider than the label column still breaks by character at the largest
  sizes, exactly as the native list breaks "Notifications"; a place name with a comma can
  leave the comma on its own line. This is the platform's behaviour and is not worked
  around.

### 4. Gender and birth date stay in Settings

The sheet drew a variant with two personal-fact rows after Location. It is not adopted.
[ADR 0015](0015-gender-and-age-band-in-the-profile.md) section 7 and ADR 0006 place the
Settings control last and unprominent; Profile is an identity screen only in the sense
that the Closet is the user's, and it shows no personal facts.

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
token, and it applies to the Profile rail and the Closet grid and to nothing else. Its
per-family fill table doubles as the mapper that the shipped list lacks, where a stored
enum currently reaches a style by the coincidence that every family name is a CSS colour
keyword.

### 7. Sequencing

1. ADR 0027's bottom-inset fix and the English Closet label land before or with this
   screen.
2. The rail ships with the photo and glyph rungs at once. The silhouette rung waits for
   Today's board implementation, because the twenty-two drawings live only outside the
   repository and the six shipped category glyphs were drawn 1.86× too heavy until the redraw of
   2026-09-07 closed ADR 0025's open item.
3. The route to the list gains an optional initial filter so the Wanted row can open on
   the wanted state. The Profile "wanted" row's inability to do so today is a recorded
   known issue.
4. The seventh status site, the location status row, is deleted with the screen it sat on.

## Consequences

- **Profile stops competing with Weather and Today.** The location card and the status
  row leave; the place is one row that links to Weather.
- **One row primitive, three screens.** The anatomy in section 2 is the contract for
  goals 5 and 6 and for any later list. ADR 0019 measured what happens when the same
  control is written three times; this is the reason it is written here once.
- **The light appearance has two group treatments.** A kuyara-drawn group is a hairline
  outline; a native group keeps its system fill. That is the trade ADR 0030 names as
  visible rather than hidden, and it is accepted knowingly.
- **A new dependency on the silhouette vocabulary.** The rail's middle rung and the
  colour-family fill both depend on ADR 0025's drawings entering the app.
- **Two strings and one route change are owed with the screen**, and one known issue
  (the Closet empty copy that contradicts ADR 0005) is retired by the empty state here.

## Alternatives considered

**Rows only, or a native grouped list, for the whole screen.** Rejected in plan mode: both
left the screen a third empty, and the native list contradicts ADR 0019 section 3, which
names Profile as an identity screen rather than a control-layer one.

**A Settings row instead of the gear.** Rejected: ADR 0027 keeps Settings as the header's
bar button, and a row would make the Closet share its screen with a menu again.

**Copying the reference's card fill in light.** Rejected: ADR 0021's amendment removed
that step from the light appearance, and the hairline outline carries the group without
reintroducing a plane.

**Uncapped scaling of the row controls.** Rejected by measurement; see section 3.

## Out of scope

- The Closet screen and the Settings screen, which are ADR 0029 and ADR 0030.
- The add and edit form and the photo pipeline.
- Accessory silhouettes; ADR 0025 drew none and the rail falls to the category glyph.
- Any production code change.
