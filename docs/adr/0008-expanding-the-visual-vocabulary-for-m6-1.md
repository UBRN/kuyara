# ADR 0008: Expanding the visual vocabulary for M6.1

Status: Accepted (2026-09-01)

Implementation: Landed in M6.1.

## Context

Milestone 6 fixed the structural problem: surfaces did not separate from the
ground, and the three-tab architecture landed (see [ADR 0006](0006-three-tab-information-architecture.md)).
M6 deliberately excluded an icon system and refused to introduce any color
outside the approved six brand hexes, because neither had visual identity
approval at the time.

The private design mockups, kept outside this repository, go further than M6
shipped. They solve surface separation with pure white cards plus a shadow,
and they use line icons throughout: on the tab bar, on each garment slot row,
on header actions, and on the AI badge. The design system's own notes had
already identified the icon system as the single biggest available visual
win.

Two questions therefore had to be settled before M6.1 could close the gap
between the shipped product and the mockups: whether white is an acceptable
light-theme surface value, and whether an icon system is approved at all.

## Decision

Both approved by the project owner on 2026-09-01:

### 1. `#FFFFFF` is permitted as a light-theme card and surface color

It is a neutral surface value, not a new brand hue. It does not alter the six
approved brand hexes or the Balanced Horizon V2 master geometry, both of
which remain locked, per [`visual-identity.md`](../design/visual-identity.md).

The following measurements were taken and must not be re-derived by the
implementing milestone:

- White over the mockup's own ground `#F4F6F5` measures only 1.085:1, weaker
  than the 1.255:1 that M6 already shipped. The mockups compensate with a
  shadow.
- White over M6's shipped ground `#D0DDDC` measures 1.395:1, the strongest of
  the options.
- Adopting the mockups' white cards therefore does not require giving back
  M6's ground. Mockup fidelity and contrast are not in conflict.
- Text on white: primary `#142F3B` at 14.0:1 and secondary `#27606A` at
  7.08:1, both comfortable.
- The dark theme step stays at 1.276:1 and is unchanged. White is a
  light-theme surface only.

### 2. An icon system is approved

For the tab bar and for feature surfaces such as garment slot rows and header
actions.

The repository already renders icons through `expo-symbols` `SymbolView` with
per-platform `ios`/`android`/`web` name maps. Extending that existing
mechanism is strongly preferred over adding an icon dependency.

## Consequences

- M6.1 moved the light card surface to `#FFFFFF` and extended `SymbolView`
  coverage to the tab bar and header actions through a new `Icon` primitive,
  without a further round of visual identity approval.
- Garment slot icons ship as bundled artwork instead of SF Symbols, Material
  Symbols, or a new `react-native-svg` dependency. At the then-pinned iOS 16.4
  deployment target there was no SF Symbol for the `bottom` slot at all, and
  every outerwear symbol was past the target (`jacket` and `coat` arrived in
  SF Symbols 6 / iOS 18, `hanger` in SF Symbols 5 / iOS 17), while Material
  Symbols has no glyph for any of the four slots; a partially present set
  would render blank rows on real devices. Adding `react-native-svg` was
  rejected because it is a native module, out of scope for a presentation
  milestone. What ships, after a later polish round replaced an original
  plain-View layered-stack drawing, is one bundled monochrome template image
  per structural category (`apps/mobile/assets/icons/garment/`, authored as
  SVG and rasterised to transparent PNG at 1x/2x/3x), keyed by the existing
  six-value structural category union (`top`, `bottom`, `one_piece`,
  `outerwear`, `footwear`, `accessory`) from
  `apps/mobile/src/features/catalog/domain/garment-taxonomy.ts`, rendered
  through React Native `Image` with `tintColor` so the artwork takes its
  colour from the semantic theme in both appearances. It ships as the
  `GarmentSlotGlyph`/`GarmentSlotTile` primitives.
- At a 26.0 minimum ([ADR 0011](0011-minimum-ios-26.md)), `hanger` (SF
  Symbols 5), `jacket`, and `coat` (SF Symbols 6) all become available. But a
  sweep of every SF Symbols version file from 1.0 through 7.0 found no
  `pants`, `trousers`, `jeans`, `shorts`, or `skirt` symbol at any version, so
  no deployment target makes the four-slot set native. This ADR's conclusion,
  bundled artwork for all six slots, is upheld for a narrowed reason: a set
  drawn in two visual idioms, three-quarters Apple's line style and
  one-quarter ours, reads as unfinished, which the design language's
  iconography law now forbids.
- Status colors and the destructive button variant remain deferred. This ADR
  does not approve them.

## Alternatives considered

- **Keep the card plane at Soft Mist and rely only on the M6 ground move.**
  Rejected because it leaves mockup fidelity behind for no contrast benefit:
  white over the shipped ground is the strongest option measured.
- **Move the ground back toward the mockup's `#F4F6F5` to match it exactly.**
  Rejected because it would give back the 1.255:1 step M6 already shipped in
  favor of a weaker 1.085:1 pairing.
- **Add a third-party icon library.** Rejected because the repository already
  has a working per-platform icon mechanism in `SymbolView`; adding a
  dependency for what it already does would be unjustified.

## Out of scope

- Status colors and the destructive button variant.
- Any change to the Balanced Horizon V2 master geometry or the six approved
  brand hexes.

The specific icon set, glyph choices, and the garment-slot glyph approach
were originally left open here and are now recorded above under
Consequences.
