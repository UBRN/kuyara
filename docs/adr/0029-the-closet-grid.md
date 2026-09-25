# ADR 0029: The Closet grid

Status: Accepted (2026-09-07)

Implementation: recorded in `current-status.md`.

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

### 1. Category pages with a grid

The Closet presents six categories side by side through a horizontal tab strip. Each
selected category scrolls vertically within its own page. Owned and wanted pieces are
sections on that page: "Owned" and its count, then, 24 below the owned tiles, a heart and
"Wanted" and its count, each a `bodyStrong` heading in `textSecondary`. The grid has three
columns of tiles in the 174.5 by 218 proportion (112 by 140 on the 393 point reference),
12 apart, reducing to two above `fontScale` 1.2, the largest standard text sizes. Category
and colour are carried by the picture, not by badges or dots.

A wanted tile has no stage fill: a 1.5 point dashed `borderDefined` frame, a heart badge
(28 points, `surface` with a `borderDefined` edge) and a dashed ink edge on the garment,
the same "dashed edge = wanted" rule as on Profile's rack. The section, the frame, the
badge and the spoken "Wanted" all carry the state, so colour is never the only signal.

Each tile draws the first rung it can, as in ADR 0028, through the shared
`GarmentTileArtwork`: the photo, cover-cropped; else the garment-type silhouette filled
with the piece's colour family, fitted by its drawn bounds into a 60% × 61% box and
centred; else the structural-category glyph. Under the tile,
4 below, a `label` 15 name in `textPrimary`, two lines then ellipsis: the user's name for
the piece when set, else the type, else the category. A `caption` 13 subline in
`textSecondary` carries the type under a user name, "Type not selected" under a legacy
row, and is otherwise absent.

Accessories take the silhouette rung like every other type: ADR 0025's seven per-type
accessory silhouettes are available here. The garment board's fixed geometry does not
draw accessories; the Closet can.

Sorting is newest first within each ownership section. No sort control is added.

### 2. Chrome and categories

- Native large title, "Closet" / "Gardırop", native back to Profile, and a plus bar
  button that opens the visual "Add a piece" form with owned/wanted visuals, garment-type selection and in-app camera capture. No kuyara-drawn bar-button primitive is added.
- The horizontal category tabs use catalogue order (tops, bottoms, one-piece, outerwear,
  shoes, accessories), always all six, and show counts derived from active items. A tab is
  a 40 point pill with 2 points of hit slop: the category glyph at 22, the name at
  `label`, the count in tabular figures, a `borderDefined` edge. The selected tab is the
  viewport's one accent fill. The strip bleeds off the right edge so more categories
  visibly exist, keeps the selected tab in view, and is read as a tab list with a selected
  state. Owned and wanted remain visible as two sections on the selected category page,
  without a state filter. Legacy rows with no garment type remain accessible through their
  structural category.
- The Closet opens on the category it is given (Profile's cells), else on the first
  category holding a piece. Profile's Wanted row opens the first category holding a
  wanted piece with its Wanted section in view. The plus button and an empty page's add
  button open the form with its type chooser on the current category.
- No haptic on category tabs or tiles.

### 3. The three tile states coexist by construction

A photo tile, a silhouette tile and a glyph tile share one frame, one stage fill, one
name line and one subline slot, so mixed rows do not stagger and legacy rows are never
drawn as broken. This is the acceptance criterion of goal 5 and it is met by the tile
contract rather than by a per-state layout.

### 4. States

- **Empty**, per category: a hanger glyph, the category's own sentence ("You have not
  added any shoes yet.") and a tonal "Add a piece" button, with no accent fill because the
  selected tab holds it. The empty copy never promises that the Closet feeds
  recommendations; ADR 0005 rules that out.
- **Loading**: the grid's stage fills without artwork.
- **Error**: a `dangerInk` glyph at 20, 8, a `bodyStrong` title, 4, a `body` line in
  `textSecondary`, 12, a retry button. The error state shows no category tabs.
- **Wanted**: a section below owned items on the selected category page.

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
- **The route gains an optional initial category**, shared with ADR 0028’s category cells.

## Alternatives considered

**Keeping the vertical list with a better dot.** Rejected: it keeps colour and category as
metadata beside the piece instead of in it, and Direction E's subject is the garment.

**A separate count table.** Rejected: active-item counts derive from the Closet records.

**A separate owned/wanted page.** Rejected: both states remain in sections of one category page.

## Out of scope

- Form details and the background cut-out, which is deferred.
- The photo pipeline.
- Accessory silhouettes on Today or the detail board; ADR 0025 keeps them off the board.
