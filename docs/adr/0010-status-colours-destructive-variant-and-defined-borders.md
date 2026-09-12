# ADR 0010: Status colours, destructive variant, and defined borders

Status: Accepted (2026-09-02)

Implementation: complete. The seven colour roles, `borderDefined`, and the
`destructive` button variant live in `theme.ts` and `components/ui`.

## Context

[ADR 0009](0009-a-design-language-layer-and-its-deferral-carve-out.md) is the
enabling decision: it carves colour, typography, spacing, elevation, border,
and motion roles out from the "current product use" deferral rule, so they
may be defined ahead of any use.

Status colours and the destructive button variant are governed here rather than by
[ADR 0008](0008-expanding-the-visual-vocabulary-for-m6-1.md), whose scope is surfaces
and iconography. The status-role condition is satisfied by six shipped sites, and the
design language supplies measured, band-checked colour values for all seven roles.

## Decision

### The seven roles

| role | light | dark |
| --- | --- | --- |
| `successInk` | `#216048` | `#7FD3AE` |
| `successContainer` | `#DCEBE3` | `#0B2620` |
| `warningInk` | `#7A4F12` | `#EABB6E` |
| `warningContainer` | `#F2E6CE` | `#292010` |
| `dangerInk` | `#9B2C2C` | `#F2A6A2` |
| `dangerContainer` | `#F8E3E1` | `#301D1B` |
| `borderDefined` | `#5C7A83` | `#5E899A` |

The dark `borderDefined` value measures 3.68:1 on `surface`, 4.70:1 on
`background`, and 3.11:1 on `backgroundElevated` `#1F3B47`, so the boundary keeps
3:1 across every plane; see
[`design-language.md` Law 4](../design/design-language.md#law-4-one-accent-and-a-status-band).

### The band rule

Every status ink is tuned so its contrast against its own appearance's
`surface` lies within ±0.8 of `brandAccent`'s. Reference: light `brandAccent`
`#27606A` on `#FFFFFF` = 7.077. Dark `brandAccent` `#9FC9D5` on `#142F3B` =
7.862. That is the rule that keeps a calm interface from becoming a traffic
light, and it is checkable with a number.

### Measured contrast, every value

Status ink against every plane it may sit on:

| ink | on `surface` | on `background` | band check vs accent |
| --- | --- | --- | --- |
| light `successInk` `#216048` | 7.42 | 5.32 | +0.34 |
| light `warningInk` `#7A4F12` | 7.11 | 5.10 | +0.03 |
| light `dangerInk` `#9B2C2C` | 7.53 | 5.40 | +0.45 |
| dark `successInk` `#7FD3AE` | 7.89 | 10.07 | +0.03 |
| dark `warningInk` `#EABB6E` | 7.89 | 10.08 | +0.03 |
| dark `dangerInk` `#F2A6A2` | 7.17 | 9.15 | -0.69 |

Every value clears 4.5:1 for text on both its planes, and every one lands
inside the ±0.8 band.

Container tints, and the ink on them:

| container | vs its `surface` | ink on it |
| --- | --- | --- |
| light `successContainer` `#DCEBE3` | 1.233 | 6.02 |
| light `warningContainer` `#F2E6CE` | 1.236 | 5.75 |
| light `dangerContainer` `#F8E3E1` | 1.231 | 6.12 |
| dark `successContainer` `#0B2620` | 1.143 | 9.02 |
| dark `warningContainer` `#292010` | 1.146 | 9.04 |
| dark `dangerContainer` `#301D1B` | 1.138 | 8.16 |

Light containers are tuned to a uniform 1.23:1 ±0.01; dark to 1.14:1 ±0.01.
Deliberately quiet, and therefore below the 3:1 threshold: the container fill
is decorative and is never the signal. The boundary that must be perceivable
is a 1px hairline in the status ink, which measures 6.02 to 9.04:1 against its
own container. The fill whispers; the hairline and the glyph carry the
meaning.

`borderDefined`, against every plane a control may sit on:

| | on `surface` | on `background` | on `backgroundElevated` |
| --- | --- | --- | --- |
| light `#5C7A83` | 4.60 | 3.30 | 4.24 |
| dark `#5E899A` | 3.68 | 4.70 | 3.11 |

All six clear 3:1. Light `#5C7A83` at 4.60 on white stays visibly quieter than
`textSecondary`'s 7.08, so it reads as a boundary and not as text.

### Destructive variant, approved

Filled destructive button: fill `dangerInk`, label the appearance's on-brand
colour. Light `#FFFFFF` on `#9B2C2C` = 7.53. Dark `#0D191E` on `#F2A6A2` =
9.15. The confirming Alert stays the platform's, as today.

### No info colour

Info is `brandAccent`. A fourth hue would give the least urgent message its
own voice. Decided, not deferred.

### Colour is never the signal

Every status instance is ink + glyph + text, all three. `iconNames` already
carries `checkCircle`, `warning`, `error`, `info`. No new icon is required.

### The role of `borderSubtle` narrows

`borderSubtle` is now for decorative dividers inside a container, where no
component is being identified and 1.4.11 does not apply. Every boundary that
identifies an interactive component moves to `borderDefined`.

Using `#C5D5D6` for the unselected Closet filter chip or outline button would leave its
boundary at 1.515:1 on the white card, below WCAG 1.4.11. Interactive boundaries use
`borderDefined`.

Cards keep `borderSubtle` or no border at all. A card is a container of
legible text, not a component identified by its boundary, so 1.4.11 does not
require 3:1 there, and outlining every card at 3:1 would read as a wireframe,
the opposite of the identity.

## Consequences

- `theme.test.mjs` requires all seven roles in both appearances and verifies the status
  contrast band, container quietness, text contrast, and `borderDefined` across every
  plane.
- The raw-brand-hex guard keeps derived values in `theme.ts`; feature code reaches them
  only through semantic roles.
- The elevation contact-contrast guard and exact light `elevation.raised` assertion keep
  shadow behavior measurable.
- Interactive control boundaries use `borderDefined`. `borderSubtle` remains limited to
  decorative dividers and non-identifying container boundaries.

## Alternatives considered

- **Adopt the mockups' status hues unchanged.** Rejected, with the measured
  failures:
  - The mockup amber `#8A5A16` measures 4.236:1 on the shipped ground, below
    4.5:1. It fails as text on the ground plane. It was drawn against the
    lighter mockup ground where it passed.
  - The mockup green `#2E6B4F` passes at 4.519:1 on the ground but sits
    outside the ±0.8 band, and is the loudest thing on any screen it appears
    on.
  - The mockup red `#9B3B3B` measures 2.056:1 on the dark card, unusable in
    the dark appearance. It was only ever drawn in the light-appearance
    decision documents and never on a product screen, so its dark behaviour
    was never tested.
- **Add an info colour.** Rejected. Info is `brandAccent`; a fourth hue would
  give the least urgent message its own voice.
- **Outline every card at 3:1.** Rejected. A card is a container of legible
  text, not a component identified by its boundary, so 1.4.11 does not
  require 3:1 there, and outlining every card at 3:1 would read as a
  wireframe, the opposite of the identity.

## Out of scope

- Any change to the six approved brand hexes or the Balanced Horizon V2
  master geometry. Both are unchanged. The seven roles above are derived
  semantic values in the same class as the existing derived neutrals
  `#E7EEED`, `#DDE8E7`, `#C5D5D6`, `#D0DDDC`.
- Any change to app code in this ADR.
