# ADR 0018: The atmospheric condition band

Status: Accepted (2026-09-03)

Implementation: the condition-tinted stage, seven-state light appearance and neutral dark
appearance are implemented with Today's garment board.

[ADR 0021](0021-direction-e-a-visual-first-design-language.md) owns the stage structure.
This ADR owns its closed state set, approved-palette derivation, contrast floors,
no-regression test and rendering rules. [`visual-identity.md`](../design/visual-identity.md)
permits the bounded tonal interpolation defined here while prohibiting every other
gradient treatment.

## Context

kuyara renders the most visually expressive data source there is, the sky, as text
inside a white card on a fixed grey ground. The application looks identical at seven
in the morning in the rain and at two in the afternoon in the sun. The redesign's
chosen direction makes the ground carry the weather.

The obvious implementation, tinting the whole page ground, was measured and does not
work. Two independent ceilings squeeze it:

| constraint on the light page ground | implied luminance bound |
| --- | --- |
| card `#FFFFFF` over ground must stay at today's 1.3946:1 | L <= 0.70290 |
| `textSecondary` `#27606A` on the ground must clear 4.5:1 | L >= 0.61770 |
| `borderDefined` `#5C7A83` on the ground must clear 3:1 | L >= 0.63499 |

The usable band is **L 0.63499 to 0.70290, nine of 255 grey levels.** At that
luminance there is almost no chroma room either, because a saturated hue cannot reach
L 0.69 without a channel clipping. A whole-page atmosphere in the light appearance is
not a design choice that was rejected; it is arithmetically unavailable.

The binding floors, however, come from roles that do not have to be there.
`textSecondary` and `borderDefined` are secondary copy and control boundaries. They
sit on the page ground, not on the hero.

## Decision

### 1. The atmosphere is a stage, not a page

The condition tints the surface the garment composition sits on and places one
temperature and one condition glyph in its corner. Only `textPrimary` and
`iconPrimary` are permitted on the stage; no supporting copy, bordered control or card
sits on it. The page ground remains stable, and the stage adds no fourth plane under Law
3 of [`design-language.md`](../design/design-language.md).

Do not reintroduce a full-width condition strip. Below roughly 110 points of height a
two-stop tonal field has no vertical room to be perceived, and in the dark appearance a
strip and an elevated stage collapse to the same value under the luminance ceiling.

### 2. Seven states, closed, deterministic

The stage resolves one of seven states from the weather snapshot's condition enum and
local daypart: `neutral`, `clearDay`, `veiledDay`, `fallingDay`, `clearNight`,
`veiledNight`, `fallingNight`. The mapping is a total function over the condition enum in
the same style as `weatherkit-raw.ts`'s 34-case table. An invalid or unmapped input
resolves to `neutral` rather than throwing.

Until the contract carries daylight, daypart is the local hour of the snapshot's
`fetchedAt` in its `timeZone`: 06:00 through 19:59 is day, and 20:00 through 05:59 is
night.
`neutral` is also the state for no weather yet.

### 3. Every value is a blend of two approved brand hexes

No atmosphere value is authored freehand. Each light value is one sRGB interpolation
between two of the six approved brand hexes at a stated ratio. `neutral` is the current
stage `#D7DCDD`. The falling-day ratio is `0.943`; `0.939` rounds to `#98C3CE`, not the
chosen and measured `#98C3CF`.

| state | pair | t | hex |
| --- | --- | ---: | --- |
| `neutral` | current stage | — | `#D7DCDD` |
| `clearDay` | Quiet Sky to Cloud White | 0.549 | `#CBE1E5` |
| `veiledDay` | Calm Current to Soft Mist | 0.756 | `#C2D1D3` |
| `fallingDay` | Calm Current to Quiet Sky | 0.943 | `#98C3CF` |
| `clearNight` | Deep Atmosphere to Quiet Sky | 0.888 | `#8FB8C4` |
| `veiledNight` | Deep Atmosphere to Soft Mist | 0.645 | `#A4AFB3` |
| `fallingNight` | Deep Atmosphere to Quiet Sky | 0.758 | `#7DA4B0` |

In the dark appearance, Deep Atmosphere's luminance, 0.02498, is the ceiling so the sky
never out-lightens the card plane. The dark stage `#122A35` is already at 0.0204; every
compliant state lands only 3 to 8 RGB levels from it, inside the imperceptible range.
Every dark atmosphere state therefore equals the neutral stage. Lifting the cap requires
a separate decision.

### 4. Measured, every state

Light values are measured against `textPrimary` `#142F3B` and the non-text glyph at 0.70
alpha.

| state | L | `textPrimary` | glyph at 0.70 | vs ground | levels off ground |
| --- | ---: | ---: | ---: | ---: | ---: |
| `clearDay` | 0.7220 | 10.30:1 | 4.59:1 | 1.253:1 | 41 |
| `veiledDay` | 0.6177 | 8.91:1 | 4.26:1 | 1.449:1 | 50 |
| `fallingDay` | 0.5021 | 7.36:1 | 3.81:1 | 1.752:1 | 92 |
| `clearNight` | 0.4411 | 6.55:1 | 3.56:1 | 1.970:1 | 101 |
| `veiledNight` | 0.4181 | 6.24:1 | 3.48:1 | 2.067:1 | 80 |
| `fallingNight` | 0.3405 | 5.21:1 | 3.10:1 | 2.478:1 | 119 |

Every light state keeps full `textPrimary` at or above 4.5:1, the 0.70-alpha non-text
glyph at or above 3:1, and at least 15 RGB levels of separation from the Soft Mist page
ground. Clearing the contrast floors is not enough: values within roughly 8 levels of the
ground are imperceptible on-device, so future values must also be checked for perceptible
separation on a device. The stage carries no supporting ink; Today's condition caption
and both captions in outfit detail's weather recap use full `textPrimary`.

### 5. The gradient permission is narrow

`visual-identity.md` permits a two-stop tonal interpolation between two approved palette
values where a ground carries the current weather. Every other gradient remains
prohibited, including glass, glow, rainbow and saturated technology treatments. The
current stage uses one flat derived colour per state.

### 6. No new dependency

The stage renders one flat state colour, so no gradient dependency is needed.
`GarmentBoard` fills its closed silhouette paths with that same colour so cut-outs
disappear into the stage; a gradient would expose each path as a flat patch. The tint
applies to Today's primary and alternate stages and to outfit detail's weather recap. The
Weather screen, contracts, Worker and persistence are outside this rendering change.

## Consequences

- `background` remains the stable page value. The stage resolves the atmosphere, and
  `neutral` is its fallback.
- `theme.test.mjs` asserts that **no atmosphere state may make contrast worse than
  `neutral`.** Every state in both appearances is checked against the text and icon
  floors. A state that fails is not shipped; the stage falls back to `neutral`.
- The light appearance's nine-level page band is recorded here as a measured fact so
  that no future milestone attempts a whole-page tint again.
- Law 3 is satisfied rather than bent: the plane change coincides with a change of
  information, the weather, so the stage is not decoration or a fourth plane.
- The stage does not animate continuously. It changes when the data changes, at
  `normal` 200, and never drifts on its own. See
  [ADR 0020](0020-rewriting-the-motion-law.md) for what motion is permitted elsewhere.
- Weather condition, `fetchedAt` and time zone are already in the snapshot, and daypart
  is derived on-device from them. Nothing new crosses the network, nothing new is
  persisted, and no coordinate is involved.

## Validation boundary

The mechanism is a stage rather than a page tint, a closed state set, values derived as
brand-hex blends, and a test that forbids regression. The specific hexes must satisfy the
measured bounds above and remain perceptible together on a Simulator. Any future value
change requires a new decision backed by those checks.

## Alternatives considered

**Tint the whole page ground.** Rejected on measurement: nine grey levels, and almost no
chroma at that luminance.

**Keep the whole page and lower `textSecondary` and `borderDefined` to open the
floor.** Rejected: both are global roles used on every screen, so widening the ground's
range would degrade contrast everywhere else to gain it on two screens.

**Photographic or illustrated sky.** Rejected: `visual-identity.md` forbids
resembling a conventional weather application and asks for calm structure rather than
literal weather imagery, and it would add an asset pipeline for a per-condition
artwork set.

**Animate the stage continuously, so the sky drifts.** Rejected here even though
[ADR 0020](0020-rewriting-the-motion-law.md) permits ambient motion generally: the
stage sits directly beneath the screen's hero value, and continuous movement under
text is the one place ambient motion measurably costs readability.

## Out of scope

- Sunrise and sunset times. Daypart is derived from the snapshot's local time; the
  weather contract carries no solar times and this ADR does not add them.
- Any change to what crosses the Worker boundary or reaches SQLite.
- The Profile and onboarding grounds, which remain the stable page background.
