# ADR 0029: The Closet grid

Status: Accepted (2026-09-07)

Implementation: landed 2026-09-07 (the grid, filter and chips) and 2026-09-09 (section
5's silhouette rung and colour-family fill); the segmented control's iOS tint is still
Android-only because the installed `@expo/ui` control ignores `tintColor` on iOS. This
records an approved design produced by the 2026-09-04 design session and corrected on
2026-09-07 against the list-row reference. No production
code, contract, schema or route was changed to reach it. The rendered target sheet, in
English and Turkish, both appearances, three tile states, four screen states and three
text sizes, is kept outside the repository; its "target, in numbers" table is the
implementation target.

Builds on: [ADR 0005](0005-catalog-only-recommendation-candidates.md), which the empty
state finally agrees with; [ADR 0021](0021-direction-e-a-visual-first-design-language.md);
[ADR 0025](0025-the-garment-board-composition-rule.md), whose silhouettes the tiles reuse;
and [ADR 0028](0028-the-profile-tab-and-the-list-row-anatomy.md), whose tile ladder and
row anatomy it inherits unchanged.

## Context

Design goal 5 asked how a list behaves when some entries carry a user photograph, some
carry only a catalogue type, and legacy rows carry neither. It is the first place the
silhouette's replaceability is tested against real user data rather than a catalogue.

The shipped list is a vertical card list with a colour dot, a faked leading-icon button
built from spacing arithmetic and absolute positioning, and an empty-state sentence that
promises the Closet feeds future outfit choices, which ADR 0005 rules out. All three are
recorded known issues; this design retires them.

## Decision

### 1. A grid, not a list

The Closet is a two-column grid of the rail's tile: 174.5 × 218, radius 14, on the stage
fill, gap 12, inset 16. Category and colour are carried by the picture, not by badges or
dots. Above `fontScale` 1.5 the grid is one column of 361 × 280 tiles.

Each tile draws the first rung it can, as in ADR 0028: the photo, cover-cropped; else the
garment-type silhouette filled with the piece's colour family, fitted by its drawn bounds
into a 60% × 61% box and centred; else the structural-category glyph. Under the tile,
4 below, a `label` 15 name in `textPrimary`, two lines then ellipsis: the user's name for
the piece when set, else the type, else the category. A `caption` 13 subline in
`textSecondary` carries the type under a user name, "Type not selected" under a legacy
row, and is otherwise absent.

Accessories fall to the category glyph, because ADR 0025 drew silhouettes only for the 27
outfit-eligible types and the board can never show an accessory. The Closet can. Five
accessory drawings are wanted and are not approved here.

Sorting is newest first, the rail's order. No sort control is added.

### 2. Chrome and filters

- Native large title, "Closet" / "Gardırop", native back to Profile, and a plus bar
  button that replaces the faked icon button. No kuyara-drawn primitive is added for it.
- The owned / wanted state filter is the native segmented control, full width, 4 above and
  12 below, without counts drawn in the segments. Each segment's accessibility value may
  still carry its count. Changing state fires the selection haptic Law 8 already names.
- **Category chips** sit under the segmented control: "All", then only the categories
  present in the current state, in catalogue order (tops, bottoms, one-piece, outerwear,
  shoes, accessories). They are kuyara-drawn: `label` 15 at weight 600, 40 tall with 2
  points of vertical hit slop for a 44 target, a 1 point `borderDefined` outline, and the
  selected chip is the screen's one accent fill. State is the segmented control; category
  is scope. Chip labels are new plural strings in both languages; the catalogue's
  singular attribute labels stay for the type picker and tile sublines.
- No haptic on chips or tiles.

### 3. The three tile states coexist by construction

A photo tile, a silhouette tile and a glyph tile share one frame, one stage fill, one
name line and one subline slot, so mixed rows do not stagger and legacy rows are never
drawn as broken. This is the acceptance criterion of goal 5 and it is met by the tile
contract rather than by a per-state layout.

### 4. States

- **Empty**, per filter: Profile's sentence and "Add a piece" button, reused. The shipped
  `wardrobe.emptyBody` copy, which promised recommendation use, is retired.
- **Loading**: the grid's stage fills without artwork.
- **Error**: a `dangerInk` glyph at 20, 8, a `bodyStrong` title, 4, a `body` line in
  `textSecondary`, 12, a retry button. The error state shows no chips.
- **Wanted**: the same grid under the other segment.

### 5. The colour-family fill

Approved with ADR 0028 section 6. The per-family fill table is a content table, tuned per
appearance, and is the mapper that replaces the shipped `backgroundColor: item.colorFamily`
coincidence. `multicolor` keeps its own treatment rather than borrowing `brandAccent`.

### 6. Rows

The Closet has no list rows of its own. Where a later addition needs one, it takes
ADR 0028 section 2 unchanged.

## Consequences

- **Three known issues close with the screen**: the faked leading-icon button, the
  enum-as-CSS-colour swatch, and the ADR 0005 contradiction in the empty copy.
- **The silhouette rung and the colour fill wait on ADR 0025's drawings entering the
  app**, as on Profile. The photo and glyph rungs can ship first, and the grid does not
  look broken without the middle rung; it looks like a Closet with more glyph tiles.
- **Accessories are the one category with no drawing.** Until five are approved, an
  accessories tile is always a glyph tile.
- **The route gains an optional initial filter**, shared with ADR 0028's Wanted row.

## Alternatives considered

**Keeping the vertical list with a better dot.** Rejected: it keeps colour and category as
metadata beside the piece instead of in it, and Direction E's subject is the garment.

**Counts in the segments.** Rejected as drawn; kept as accessibility values so the number
is available without competing with the grid.

**A category filter as a second segmented control.** Rejected: the categories present
vary by state, and a native segmented control cannot drop segments per state gracefully.

## Out of scope

- The add and edit form; ADR 0019 already moves it to native grouped sections.
- The photo pipeline.
- Accessory silhouettes, five, awaiting approval.
- Any production code change.
