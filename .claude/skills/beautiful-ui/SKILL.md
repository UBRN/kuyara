---
name: beautiful-ui
description: Use before any kuyara UI, UX, layout, theme, token, component, copy-placement, icon, or motion change in apps/mobile. Loads the design-language laws that AGENTS.md points at but does not restate, and the measured facts that make screens look flat or noisy when ignored. Trigger on "redesign", "make this screen look better", "polish", "spacing", "hierarchy", "card", "shadow", "accent colour", "empty state", or any new screen or primitive.
---

# Beautiful UI in kuyara

This skill is workflow, not rules. The rules live in the docs below and in
`AGENTS.md`; those stay the single source. What this adds is the reading order and
the failures that keep recurring.

## Read before editing

1. `docs/design/visual-identity.md`: what kuyara should feel like. Locked: six brand
   hexes, Balanced Horizon V2 master geometry, typography.
2. `docs/design/design-language.md`: the nine laws. This is the layer that decides
   spacing, emphasis and when a surface is allowed to mean something.
3. `docs/design/design-system.md`: the tokens and primitives that implement both.

Read 2 in full for a new screen. For a targeted change, read the laws your diff
touches plus **How to check a screen** at the end of it.

## The central law

> Hierarchy is carried by type and space, and only confirmed by surface. Never the
> other way round.

This is a measurement, not taste. In the light appearance the card-over-ground fill
step is 1.395:1, the hairline 1.515:1, the raised shadow contact 1.218:1, all under
the 3:1 non-text threshold, with 1.085:1 of headroom left in the whole palette. In
dark, shadow contact is exactly 1.000:1 because the shadow colour is the background.

**Never propose a new card colour, a darker ground, or a heavier shadow to fix
flatness.** Three milestones already walked that ladder to its end. Fix flatness with
type scale, weight, and the spacing ladder.

## The laws, by name

| # | Law | The one thing agents get wrong |
| --- | --- | --- |
| 1 | Emphasis budget | 3 emphasis levels, exactly 1 hero, at most 1 `brandAccent` fill per viewport, at most 3 `eyebrow` |
| 2 | The rhythm | `md` 12 is the screen default. `lg` 16 is **container inset only**, not a gap between groups |
| 3 | Surfaces confirm | At most 3 planes (ground, chrome, card). No card on a card. A card needs radius 20 + 16 inset + fill step together |
| 4 | One accent, a status band | Status = ink + glyph + text, always all three. Colour is never the only signal |
| 5 | Typographic tone | Tabular figures for anything that changes without a layout change. Nothing below `caption` 13 except `eyebrow` 10.5 |
| 6 | Iconography | Icon size tracks adjacent text (16/caption, 20/body, 24/title, 28+ standalone) |
| 7 | Motion | Nothing loops, pulses, or runs ambiently. No state change signalled by motion alone |
| 8 | Non-visual feedback | Only `components/ui` may import `expo-haptics`. Zero matches under `features/` |
| 9 | Deferral carve-out | How a deferred item may return as a role rather than a primitive |

Law 2 is the one that silently rots: it was written and then not applied in sixteen
places, which made every screen a third too airy. Grep your diff for `gap: spacing.lg`
before you finish; it is almost always meant to be `md`.

## Token discipline

- Feature code selects a typography role. It never authors `fontSize` or `lineHeight`;
  a fixed line height clips text at accessibility sizes instead of growing it.
  `theme.test.mjs` fails the suite on either property under `features/`.
- Semantic roles only. No hardcoded brand values in feature UI.
- New brand colour, font, icon geometry, metaphor or motion style needs explicit
  approval. Deriving a new *semantic* value from the locked palette does not.

## Finish

Run the **How to check a screen** list at the end of `design-language.md`. Every item
is decidable from a screenshot, a grep, or a computed contrast value. Then hand off to
the `ui-verification` skill. Visual correctness is not done until it passes there.
