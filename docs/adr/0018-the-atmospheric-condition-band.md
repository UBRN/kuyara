# ADR 0018: The atmospheric condition band

Status: Accepted (2026-09-03)

Implementation: not started.

Amended by [ADR 0021](0021-direction-e-a-visual-first-design-language.md). Sections 2
through 5 stand: the closed seven-state set, the derivation of every value as a blend of
two approved brand hexes, the contrast floors, the no-regression test, and the narrowing
of the gradient prohibition. Section 1's structural conclusion does not. The atmosphere is
no longer a full-width band above a stable ground; it tints the surface the garment
composition sits on, and the per-state values move upward in luminance because the tint
now sits behind ink and silhouettes rather than behind a hero number. The measured reason
is recorded in ADR 0021: below roughly 110 points of height a two-stop tonal field stops
being perceptible, and in the dark appearance a band and an elevated stage collapse to the
same value because section 4 caps the band at the card plane's own luminance.

Amends: [`visual-identity.md`](../design/visual-identity.md)'s prohibition on
gradients, narrowed below rather than removed.

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

### 1. The atmosphere is a band, not a page

A single **condition band** at the top of Today and Weather carries the weather. The
page ground beneath it stays `neutral`, which is today's `background` value exactly.
Only `textPrimary` and icons in `iconPrimary` are permitted inside the band; no
secondary copy, no bordered control, and no card sits on it.

Confining it this way changes the arithmetic completely:

| constraint on the light condition band | implied bound |
| --- | --- |
| ceiling, unchanged | L <= 0.70290 |
| `textPrimary` `#142F3B` must clear 4.5:1 | L >= 0.28739 |

**L 0.28739 to 0.70290, seventy-two of 255 grey levels**, against nine for the page.
The band is eight times wider than the page ground could ever be.

This is also the correct reading of the identity rather than a workaround. The
approved master symbol's upper layer represents environmental conditions and its
lower layer the clothing-and-preference foundation. A weather-bearing band above a
stable ground is the brand geometry, not a decoration applied to it.

### 2. Seven states, closed, deterministic

The band resolves one of seven states from the weather snapshot's condition enum and
the local daypart. The mapping is a total function over the condition enum in the
same style as `weatherkit-raw.ts`'s 34-case table, and an unmapped input resolves to
`neutral` rather than throwing.

`neutral`, `clearDay`, `veiledDay`, `fallingDay`, `clearNight`, `veiledNight`,
`fallingNight`.

`neutral` is the state for "no weather yet", for every screen other than Today and
Weather, and for any condition the mapping does not cover. **`neutral` is today's
`background` value in both appearances**, so nothing outside the two weather screens
changes and every existing measurement stays valid as the baseline.

### 3. Every value is a blend of two approved brand hexes

No atmosphere value is authored freehand. Each is an sRGB interpolation between two
of the six approved brand hexes at a stated ratio, which makes "these are not new
brand colours" provable rather than asserted.

Light appearance, two stops per state, top stop deeper than the bottom because the
sky is deeper overhead than at the horizon:

| state | top | bottom | derivation |
| --- | --- | --- | --- |
| `neutral` | `#D0DDDC` | `#D0DDDC` | today's ground, unchanged |
| `clearDay` | `#BAD8DF` | `#C5DDE3` | Quiet Sky to Cloud White, t 0.337 / 0.469 |
| `veiledDay` | `#BDCED0` | `#C8D6D8` | Calm Current to Soft Mist, t 0.730 / 0.788 |
| `fallingDay` | `#99C4CF` | `#9FC9D5` | Calm Current to Quiet Sky, t 0.948 / 1.000 |
| `clearNight` | `#88B0BC` | `#95BDC9` | Deep Atmosphere to Quiet Sky, t 0.834 / 0.925 |
| `veiledNight` | `#A6B1B4` | `#B3BDBF` | Deep Atmosphere to Soft Mist, t 0.653 / 0.711 |
| `fallingNight` | `#769CA8` | `#83ABB7` | Deep Atmosphere to Quiet Sky, t 0.705 / 0.802 |

Dark appearance. Here the ordering inverts: night is the baseline and daylight lifts
the band, because nothing in the palette is darker than Night Layer.

| state | top | bottom | derivation |
| --- | --- | --- | --- |
| `neutral` | `#0D191E` | `#0D191E` | today's ground, unchanged |
| `fallingNight` | `#0D191E` | `#0E1C21` | Night Layer to Deep Atmosphere, t 0.000 / 0.114 |
| `clearNight` | `#0E1C22` | `#0F1F27` | Night Layer to Deep Atmosphere, t 0.121 / 0.295 |
| `veiledNight` | `#0F1F25` | `#102129` | Night Layer to Deep Atmosphere, t 0.250 / 0.386 |
| `fallingDay` | `#102328` | `#12252B` | Night Layer to Calm Current, t 0.134 / 0.176 |
| `veiledDay` | `#112730` | `#132A35` | Night Layer to Deep Atmosphere, t 0.614 / 0.795 |
| `clearDay` | `#142C32` | `#152E35` | Night Layer to Calm Current, t 0.261 / 0.303 |

### 4. Measured, every stop

Twenty-six values, both appearances, both stops. Light is measured against
`textPrimary` `#142F3B`; dark against `textPrimary` `#EFF4F3` and `iconSecondary`
`#9FC9D5`.

| appearance | worst text contrast in the set | worst icon contrast | band respected |
| --- | ---: | ---: | --- |
| light | 4.73:1 (`fallingNight` top `#769CA8`) | 4.73:1 | all stops within L 0.28739 to 0.70290 |
| dark | 12.82:1 (`clearDay` bottom `#152E35`) | 8.00:1 | all stops within L 0.00875 to 0.02498 |

Every stop clears 4.5:1 for text and 3:1 for icons, in both appearances. The dark
band's ceiling is Deep Atmosphere's own luminance, so the sky never out-lightens the
card plane.

### 5. The prohibition is narrowed, not reinterpreted

`visual-identity.md` prohibits "neon cyan, glow, glassy gradients, rainbow gradients,
and highly saturated technology colors". A two-stop tonal field between two approved
brand hexes is none of those, but the sentence as written does not distinguish them,
and reading it loosely would be exactly the silent reinterpretation the repository's
rules forbid. The prohibition is therefore amended in that document to permit a
two-stop tonal interpolation between approved palette values in the condition band,
and to keep every other gradient prohibited, glass and glow and rainbow and
saturation included.

### 6. No new dependency

A gradient is a core React Native style prop on 0.86.2, so no dependency is added and
`expo-linear-gradient` is still not needed.

Corrected 2026-09-03 by the phase 0 probe, which ran during the visual design spike.
The prop this section originally named, `backgroundImage: 'linear-gradient(...)'`,
**silently no-ops in the dev build in both its string and its object form**, with no
warning and no type error. The working prop on React Native 0.86.2 is
`experimental_backgroundImage`, verified on device by a throwaway spike route that is
deliberately not committed. Any implementation of this ADR uses that prop. The fallback recorded here still applies if
it regresses: a flat per-state colour using the bottom stop, which costs the two-stop
reading and nothing else.

## Consequences

- `background` stops being a single value on Today and Weather. Everywhere else it is
  literally unchanged, because `neutral` is the current value.
- `theme.test.mjs` gains the assertion that makes this safe: **no atmosphere state may
  make contrast worse than today.** Every stop, in both appearances, is checked
  against the card floor, the text floor, and the icon floor. A state that fails is
  not shipped; the band falls back to `neutral`.
- The light appearance's nine-level page band is recorded here as a measured fact so
  that no future milestone attempts a whole-page tint again. This is the fourth
  successive attempt to find depth in the light palette, and the first to establish an
  arithmetic bound rather than another incremental value.
- Law 3 is satisfied rather than bent: the plane change coincides with a change of
  information, the weather, so the band is not decoration. The band is not a fourth
  plane; it replaces the ground beneath the hero.
- The band does not animate between states. It changes when the data changes, at
  `normal` 200, and never drifts on its own. See
  [ADR 0020](0020-rewriting-the-motion-law.md) for what motion is permitted elsewhere.
- Weather condition is already in the snapshot and daypart is derivable on-device from
  the snapshot's local time. Nothing new crosses the network, nothing new is persisted,
  and no coordinate is involved.

## Relationship to the visual design spike

The spike runs before this is implemented and will show these values on a Simulator
for the first time. It is the most likely of the four redesign ADRs to be amended,
because twenty-six colours that measure correctly can still look wrong together. The
*mechanism* is the decision: a band rather than a page, a closed state set, values
derived as brand-hex blends, and a test that forbids regression. The specific hexes
are the part the spike may move, within the measured bounds above.

## Alternatives considered

**Tint the whole page ground.** The original intent. Rejected on measurement: nine
grey levels, and almost no chroma at that luminance.

**Keep the whole page and lower `textSecondary` and `borderDefined` to open the
floor.** Rejected: both are global roles used on every screen, so widening the ground's
range would degrade contrast everywhere else to gain it on two screens.

**Photographic or illustrated sky.** Rejected: `visual-identity.md` forbids
resembling a conventional weather application and asks for calm structure rather than
literal weather imagery, and it would add an asset pipeline for a per-condition
artwork set.

**Animate the band continuously, so the sky drifts.** Rejected here even though
[ADR 0020](0020-rewriting-the-motion-law.md) now permits ambient motion generally: the
band sits directly beneath the screen's hero value, and continuous movement under
text is the one place ambient motion measurably costs readability.

## Out of scope

- Sunrise and sunset times. Daypart is derived from the snapshot's local time; the
  weather contract carries no solar times and this ADR does not add them.
- Any change to what crosses the Worker boundary or reaches SQLite.
- The Profile and onboarding grounds, which stay `neutral`.
