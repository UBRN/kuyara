# ADR 0029: The Closet grid

Status: Accepted (2026-09-07)

Implementation: complete. The grid, the state filter, the category chips, section 5's
silhouette rung and colour-family fill are implemented; the segmented control's tint
applies on Android only, because the installed `@expo/ui` control ignores `tintColor` on
iOS. The rendered target sheet, in English and Turkish, both appearances, three tile
states, four screen states and three text sizes, is kept outside the repository; its
"target, in numbers" table is the implementation target.

Builds on: [ADR 0005](0005-catalog-only-recommendation-candidates.md), which the empty
state finally agrees with; [ADR 0021](0021-direction-e-a-visual-first-design-language.md);
[ADR 0025](0025-the-garment-board-composition-rule.md), whose silhouettes the tiles reuse;
and [ADR 0028](0028-the-profile-tab-and-the-list-row-anatomy.md), whose tile ladder and
row anatomy it inherits unchanged.

## Context

Design goal 5 asked how a list behaves when some entries carry a user photograph, some
carry only a catalogue type, and legacy rows carry neither. It is the first place the
silhouette's replaceability is tested against real user data rather than a catalogue.

The list this grid replaces was a vertical card list with a colour dot, a faked
leading-icon button built from spacing arithmetic and absolute positioning, and an
empty-state sentence that promised the Closet feeds future outfit choices, which ADR 0005
rules out. This design retires all three.

## Decision

### 1. A grid, not a list

The Closet is a two-column grid of the rail's tile: 174.5 × 218, radius 14, on the stage
fill, gap 12, inset 16. Category and colour are carried by the picture, not by badges or
dots. Above `fontScale` 1.5 the grid is one column of 361 × 280 tiles.

Each tile draws the first rung it can, as in ADR 0028, through the shared
`GarmentTileArtwork`: the photo, cover-cropped; else the garment-type silhouette filled
with the piece's colour family, fitted by its drawn bounds into a 60% × 61% box and
centred; else the structural-category glyph. Under the tile,
4 below, a `label` 15 name in `textPrimary`, two lines then ellipsis: the user's name for
the piece when set, else the type, else the category. A `caption` 13 subline in
`textSecondary` carries the type under a user name, "Type not selected" under a legacy
row, and is otherwise absent.

Accessories take the silhouette rung like every other type: ADR 0025's five per-type
accessory silhouettes are drawn on the Closet and Profile surfaces only, because the
recommendation contract has no accessory slot and the board can never show one. The
Closet can.

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

- **Empty**, per filter: Profile's sentence and "Add a piece" button, reused. The empty
  copy never promises that the Closet feeds recommendations; ADR 0005 rules that out.
- **Loading**: the grid's stage fills without artwork.
- **Error**: a `dangerInk` glyph at 20, 8, a `bodyStrong` title, 4, a `body` line in
  `textSecondary`, 12, a retry button. The error state shows no chips.
- **Wanted**: the same grid under the other segment.

### 5. The colour-family fill

Approved with ADR 0028 section 6. The per-family fill table is a content table, tuned per
appearance, and is the only mapper from colour family to fill; never pass the enum value
itself as a colour. `multicolor` keeps its own treatment rather than borrowing
`brandAccent`.

### 6. Rows

The Closet has no list rows of its own. Where a later addition needs one, it takes
ADR 0028 section 2 unchanged.

## Consequences

- **Three things the grid rules out**: a faked leading-icon button in place of the native
  bar button, an enum value used as a CSS colour, and empty copy that contradicts ADR 0005.
- **The silhouette rung and the colour fill are ADR 0025's drawings**, shared with
  Profile through `GarmentTileArtwork`. The glyph rung is reached only by legacy rows
  with no type, so a Closet made of typed pieces has no glyph tiles.
- **Accessory silhouettes exist for the Closet and Profile only.** They never enter an
  outfit board; the Closet is where they are seen.
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
- Accessory silhouettes on Today or the detail board; ADR 0025 keeps them off the board.
