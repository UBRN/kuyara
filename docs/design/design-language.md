# kuyara design language

## What this document is

This document is the layer between [`visual-identity.md`](./visual-identity.md), which
states what kuyara should feel like, and [`design-system.md`](./design-system.md),
which implements tokens and primitives. Neither document tells a screen how much space
to leave between two sections, how many things may be emphasized at once, or when a
shadow is allowed to mean something. This document answers those questions, in
concrete, checkable rules.

The six approved brand hexes and the Balanced Horizon V2 master geometry are unchanged
and remain locked. Every new value introduced below is a derived semantic value, in the
same class as the existing derived neutrals `#E7EEED`, `#DDE8E7`, `#C5D5D6`, and
`#D0DDDC`. Nothing here is a new brand colour, a new geometry, or a new visual metaphor.

### The foundational finding

The light appearance has no contrast headroom left for depth. Measured:

| depth cue available to a light card | measured | 3:1 non-text threshold |
| --- | --- | --- |
| fill step, card `#FFFFFF` over ground `#D0DDDC` | 1.395:1 | fails |
| hairline, `borderSubtle` `#C5D5D6` on the white card | 1.515:1 | fails |
| shadow contact, `elevation.raised` opacity 0.10 over the ground | 1.218:1 | fails |

Three successive milestones attacked flatness through surfaces and moved the
ground/card step 1.023 -> 1.255 -> 1.395. That series is converging, not improving:
Soft Mist to pure white is only 1.085:1 of total headroom, and the six brand hexes are
locked. Surfaces physically cannot carry hierarchy in this palette.

The dark appearance is worse in one specific way: its shadow colour is `nightLayer`
`#0D191E`, which is also the dark `background`. A dark raised shadow falling on the
ground composites to `#0D191E` at every opacity from 0.04 to 0.12, contact contrast
**1.000:1**. The dark shadow tokens do literally nothing. That is a measured defect,
not a stylistic choice.

Therefore the central law of this language:

> **Hierarchy is carried by type and space, and only confirmed by surface. Never the
> reverse.**

This is the missing middle layer. It explains the whole symptom: token values were
correct, and every screen still used one body size, one card treatment, and asked
surfaces to produce a hierarchy that surfaces in this palette cannot produce.

## Law 1: the emphasis budget

A screen shows **at most three emphasis levels**, and **exactly one** hero.

| level | roles | colour | count per screen |
| --- | --- | --- | --- |
| 1, hero | `display` 40 or `titleLarge` 24/700 | `textPrimary` | exactly 1 |
| 2, anchor | `title` 24/600 or `bodyStrong` 17/600 | `textPrimary` | unbounded |
| 3, support | `body` 17/400, `caption` 13/400 | `textPrimary` or `textSecondary` | unbounded |

- `eyebrow` is **not** an emphasis level. It is a data caption, uppercase and tracked,
  and is allowed only on a numeric stat caption. At most 3 per screen (the wind /
  humidity / UV row is the canonical and currently only legal use).
- **At most one accent-filled element per viewport.** If two things are filled with
  `brandAccent` at once, one of them is wrong. This matches the convention that [only
  one high-emphasis button belongs in a given context](https://polaris.shopify.com/components/page-actions).
- The hero must be a value the user opened the screen to get: the temperature on Today
  and Weather, the item count on Profile. A heading is never the hero.

Test: count on a screenshot. It is decidable without opening the code.

## Law 2: the rhythm

Vertical space is a four-step ladder and **each step has exactly one job**. The scale
in `theme.ts` does not change; what changes is that each token now means something.

| token | value | its only job |
| --- | --- | --- |
| `xs` | 4 | bind a label to its value, so the pair reads as one object |
| `sm` | 8 | separate siblings inside one group (list rows, bullets) |
| `md` | 12 | **the screen default.** Between groups, and between sections |
| `lg` | 16 | container inset: a card's edge to its content |

And the two exceptions, stated once so they cannot spread:

- `xl` 24, permitted **at most once per screen**, only to separate the hero block from
  the body beneath it.
- `2xl` 32, reserved for trailing space at the end of scrollable content. Never between
  two pieces of content.

- List row vertical padding is **12**, and the row's touch target is at least 44. One
  value. Not 9, not 13, not 14.

Test: a screen file containing more than one `spacing.xl` is a violation, and any
`spacing['2xl']` that is not the final element's trailing space is a violation. Both
are greppable.

Why this is stricter than the mockups: see [Relationship to the mockups](#relationship-to-the-mockups).

## Law 3: surfaces confirm, they do not separate

- **At most three planes on a screen**: ground, chrome, card. A card never sits on
  another card. A tinted row inside a card is not a fourth plane, it is a container
  fill.
- A plane change must coincide with a **change of information**. A plane is never
  introduced for decoration or for visual interest.
- The card is identified by **radius 20 plus a 16 inset plus the fill step, together**.
  No single one of those three is sufficient, and the language says so explicitly so
  that no future change tries to fix depth with one of them alone.
- **New measurable token: shadow contact contrast.** The composite of a shadow at its
  nominal opacity over the plane it falls on, against that plane.
  - `elevation.raised` must reach **>= 1.20:1**. Light currently measures 1.218 and
    passes, barely.
  - `elevation.chrome` must reach **>= 1.35:1**. Light at opacity 0.16 measures 1.372
    and passes.
  - **Dark fails both at 1.000:1 and cannot pass**, because the shadow colour equals
    the dark background. The language resolves this honestly rather than by tuning a
    number that cannot move: in the dark appearance the separator is the plane step
    (1.276:1) plus the hairline, and dark shadows are declared decorative. Dark
    elevation tokens stay as they are; the doc states that they contribute nothing on
    the ground plane and must never be the only separator. This matches [Ant Design's
    reasoning that an object close to the ground carries no shadow](https://ant.design/docs/spec/shadow),
    because the shadow overlaps completely with the object itself.

## Law 4: one accent, and a status band

**One accent.** `brandAccent` is the only non-neutral hue in ordinary UI.

**Status colours are approved and enter as a band, not as free hues.** Every status
ink is tuned so its contrast against its own appearance's `surface` lies within **±0.8**
of `brandAccent`'s. That is the rule that keeps a calm interface from becoming a
traffic light, and it is checkable with a number.

Reference: light `brandAccent` `#27606A` on `#FFFFFF` = **7.077**. Dark `brandAccent`
`#9FC9D5` on `#142F3B` = **7.862**.

### Approved new colour roles

| role | light | dark |
| --- | --- | --- |
| `successInk` | `#216048` | `#7FD3AE` |
| `successContainer` | `#DCEBE3` | `#0B2620` |
| `warningInk` | `#7A4F12` | `#EABB6E` |
| `warningContainer` | `#F2E6CE` | `#292010` |
| `dangerInk` | `#9B2C2C` | `#F2A6A2` |
| `dangerContainer` | `#F8E3E1` | `#301D1B` |
| `borderDefined` | `#5C7A83` | `#527E90` |

These are derived semantic values in the same class as the existing derived neutrals
`#E7EEED`, `#DDE8E7`, `#C5D5D6`, `#D0DDDC`. **They are not new brand colours.** The six
approved brand hexes and the Balanced Horizon V2 master geometry are untouched.

### Measured contrast, every value

Status ink against every plane it may sit on:

| ink | on `surface` | on `background` | band check vs accent |
| --- | --- | --- | --- |
| light `successInk` `#216048` | 7.42 | 5.32 | +0.34 |
| light `warningInk` `#7A4F12` | 7.11 | 5.10 | +0.03 |
| light `dangerInk` `#9B2C2C` | 7.53 | 5.40 | +0.45 |
| dark `successInk` `#7FD3AE` | 7.89 | 10.07 | +0.03 |
| dark `warningInk` `#EABB6E` | 7.89 | 10.08 | +0.03 |
| dark `dangerInk` `#F2A6A2` | 7.17 | 9.15 | −0.69 |

Every value clears 4.5:1 for text on both its planes, and every one lands inside the
±0.8 band.

Container tints, and the ink on them:

| container | vs its `surface` | ink on it |
| --- | --- | --- |
| light `successContainer` `#DCEBE3` | 1.233 | 6.02 |
| light `warningContainer` `#F2E6CE` | 1.236 | 5.75 |
| light `dangerContainer` `#F8E3E1` | 1.231 | 6.12 |
| dark `successContainer` `#0B2620` | 1.143 | 9.02 |
| dark `warningContainer` `#292010` | 1.146 | 9.04 |
| dark `dangerContainer` `#301D1B` | 1.138 | 8.16 |

Light containers are tuned to a uniform **1.23:1 ±0.01**; dark to **1.14:1 ±0.01**.
Deliberately quiet, and therefore **below the [3:1 non-text
threshold](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)**: the
container fill is decorative and is never the signal. The boundary that must be
perceivable is a 1px hairline in the status ink, which measures **6.02 to 9.04:1**
against its own container. The fill whispers; the hairline and the glyph carry the
meaning.

`borderDefined`, against every plane a control may sit on:

| | on `surface` | on `background` | on `backgroundElevated` |
| --- | --- | --- | --- |
| light `#5C7A83` | 4.60 | 3.30 | 4.24 |
| dark `#527E90` | 3.17 | 4.04 | 3.17 |

All six clear 3:1. Light `#5C7A83` at 4.60 on white stays visibly quieter than
`textSecondary`'s 7.08, so it reads as a boundary and not as text.

### No info colour

Info is `brandAccent`. A fourth hue would give the least urgent message its own voice.
Decided, not deferred.

### Colour is never the signal

Every status instance is **ink + glyph + text**, all three, matching [Carbon's status
pattern of pairing a specific colour with a specific
icon](https://carbondesignsystem.com/patterns/status-indicator-pattern/). `iconNames`
already carries `checkCircle`, `warning`, `error`, `info`. No new icon is required.

### Destructive variant, approved

Filled destructive button: fill `dangerInk`, label the appearance's on-brand colour.
Light `#FFFFFF` on `#9B2C2C` = **7.53**. Dark `#0D191E` on `#F2A6A2` = **9.15**. The
confirming Alert stays the platform's, as today.

### The role of `borderSubtle` narrows

`borderSubtle` is now for **decorative dividers inside a container**, where no
component is being identified and 1.4.11 does not apply. Every boundary that identifies
an interactive component moves to `borderDefined`. This closes a real current failure:
an unselected Wardrobe filter chip and an outline button are identified only by a
`#C5D5D6` border measuring **1.515:1** on the white card. That fails [WCAG
1.4.11](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html) today, in
the shipped product and in the mockups.

Cards keep `borderSubtle` or no border at all. A card is a container of legible text,
not a component identified by its boundary, so 1.4.11 does not require 3:1 there, and
outlining every card at 3:1 would read as a wireframe, the opposite of the identity.

## Law 5: typographic tone

- Sentence case everywhere. `eyebrow` uppercase only, only on numeric stat captions.
- One `display` per screen (this is the hero of Law 1, stated from the type side).
- **Any number that changes without the layout changing uses tabular figures**
  (`fontVariant: ['tabular-nums']`): temperature, times, counts, percentages. A digit
  that shifts width on refresh reads as instability, which is the precise opposite of
  the approved intent.
- Nothing renders below `caption` 13, except `eyebrow` 10.5, which is uppercase and
  tracked and therefore legible at that size.
- Never build a sentence from translated fragments (already an AGENTS.md rule; the
  language repeats it because it is a typography-visible rule in Turkish).

### Status copy, the tone rules

Applying the same restraint to words, because the status colours are new and their
copy will be written for the first time:

| state | structure | example (TR) | banned |
| --- | --- | --- | --- |
| success | state the fact | "Öneriler çalışıyor" | praise, exclamation marks, "Harika" |
| warning | what happened + what is happening about it | "Veri 42 dakika önce alındı. Yenileniyor." | alarm words, "Dikkat" |
| error | what happened + what to do | "Giysi türü seçilmedi. Listeden bir tür seç." | apologies, "Oops", blame |

No exclamation marks anywhere in status copy. The interface does not celebrate and does
not panic; both are forms of demanding attention, which the identity forbids.

## Law 6: iconography character

- **Two families, and no third.** `Icon` (system symbols through `expo-symbols`) and
  `GarmentSlotGlyph` (bundled monochrome artwork). A third family requires an ADR.
- **A single icon family is drawn in one idiom.** A set may not mix a platform symbol
  source with a bundled one: a set that is three-quarters one idiom and one-quarter the
  other reads as unfinished, even when the mixed-in glyphs are individually correct.
- Icon size is bound to the text it sits with, not chosen freely: 16 with `caption`, 20
  with `body`, 24 with `title`, 28 and above only standalone.
- **Fill carries state.** Outline = available or unselected; filled = selected or
  active. `circle`/`checkCircle` and `heart`/`heartFilled` already do this; it becomes a
  law so the next pair does it too.
- An icon never carries meaning alone: it has visible adjacent text, or an
  `accessibilityLabel`. Decorative icons stay hidden from the accessibility tree.

## Law 7: motion

Durations are already tokenized (`immediate` 0, `fast` 120, `normal` 200, `deliberate`
320, all 0 under Reduce Motion). The language adds which one to use:

- `fast` 120, content entering, press feedback.
- `normal` 200, a state change on something already on screen.
- `deliberate` 320, reserved for a full-screen or sheet transition. Nothing else.
- **Nothing repeats.** No looping, pulsing, or ambient animation, anywhere. This is the
  same restraint [calm technology asks for: technology should require the smallest
  possible amount of attention](https://calmtech.com/).
- Motion is never the only indication of a state change.

## Law 8: non-visual feedback

Haptics answer the same question motion does: how does the app respond to a touch. The
rule:

> **The app is confirming something the user cannot see, or a physical threshold was
> crossed under the user's finger.**

Everywhere else, silence.

| Site | Feedback | Reason |
| --- | --- | --- |
| Pull-to-refresh threshold crossed, Today and Weather | impact light | Finger is on the glass, a physical threshold |
| Refresh outcome, success or failure | notification success / error | The user may not be looking at the screen |
| Selection change: tab bar, theme, language, clothing preference, wardrobe owned/wanted filter and toggle | selection | State changes under the finger |
| Destructive confirmation | notification warning | Not reversible |
| Navigation, including tapping an outfit card to open detail | **none** | Ordinary navigation |
| Ordinary buttons and chevron rows | **none** | Same |

Roughly six sites, not a hundred. A repeated action must not punish the hand with
constant vibration, which matches Apple's own guidance and this identity's existing
avoidance of anything attention-demanding.

Every site above needs explicit code: every interactive surface here is a hand-built
`Pressable`, `RefreshControl`, or `Alert.alert` composition, not a system control, so
none of the platform automatic-haptic carve-outs (pickers, switches, sliders) apply.

**Android must not receive the same calls.** `expo-haptics`'s `impactAsync`,
`notificationAsync`, and `selectionAsync` fall back to Android's raw `Vibrator`, which
Android's own guidance calls "buzzy" and advises against: given the choice between buzzy
haptics and no haptics, choose no haptics. The Android path is
`performAndroidHapticsAsync` with the `AndroidHaptics` constants, which also respects
the system per-app haptic setting. The wrapper branches by platform; a single call
routed identically to both platforms is a defect.

**Structure.** Feature code never imports `expo-haptics`, exactly as it never imports a
brand primitive or a provider SDK. A single wrapper under `components/ui` consumes
semantic haptic tokens and is the only caller.

**No in-app toggle.** Deferred to the OS setting. iOS silently no-ops when the user has
disabled haptics, under Low Power Mode, while the Camera is active, and during
Dictation. An in-app switch would duplicate an OS setting and create a second source of
truth for the same state. Recorded tension, so this can be revisited on evidence:
Microsoft's Xbox Accessibility Guideline 110 argues for an in-app toggle and intensity
control, because haptics can be bothersome, distracting, or even painful for users with
sensory processing disorders or chronic pain. The OS setting is judged to cover this,
since a user for whom haptics are aversive will have disabled them system-wide.

## Law 9: the deferral carve-out

`design-system.md:126` requires "a current product use rather than speculative
completeness" before a new variant or primitive. That rule is **correct for components
and wrong for the language**, and keeping it applied to both is the documented cause of
this milestone.

The carve-out, and the test that decides which side a thing falls on:

> **If the thing is a _role_, a named slot in the system: a colour role, a typography
> role, a spacing meaning, an elevation meaning, a border meaning, a motion meaning, it
> belongs to the design language layer and may be defined ahead of any use.**
>
> **If the thing is a _variant or a primitive_, a concrete component API, the "current
> product use" requirement stands unchanged.**

A vocabulary that arrives one step behind the need cannot produce a coherent interface,
which is what the icon system (waited for ADR 0008), shadows and the divider (waited
for M6), and the status roles (waited until now) each demonstrated in turn.

Note that the deferral rule's own stated condition for status roles,
`design-system.md:34`, "deferred until the app has concrete informational, success,
warning, and error presentation", **was already satisfied and nobody noticed.** Six
such sites exist in the shipped app today:

1. `features/profile/presentation/ai-status-section.tsx:48-54,73-74`, info / ok /
   checking / error
2. `features/wardrobe/presentation/wardrobe-item-form-screen.tsx:444-450`, validation
   error
3. `features/weather/presentation/weather-screen.tsx:495-508`, stale data warning
4. `features/today/presentation/outfit-detail-screen.tsx:62`, informational notice
5. `features/today/presentation/outfit-suggestion-card.tsx:99`, informational notice
6. `features/today/presentation/today-screen.tsx:170-178`, generation mode

**All six render their icon in `theme.colors.iconSecondary`**, the same colour as a
clock glyph next to a timestamp. A form validation error and a "last updated" stamp are
today visually identical. That is the concrete product use the rule asked for, and the
rule still did not fire, because nobody re-read the condition.

## How to check a screen

Every item below is decidable from a screenshot, a grep, or a computed contrast value,
without reading the rest of this document.

- Count the emphasis levels on the screen. At most 3, exactly 1 hero (Law 1).
- Count `eyebrow` instances. At most 3, and each one sits on a numeric stat caption
  (Law 1).
- Count elements filled with `brandAccent` in the current viewport. At most 1 (Law 1).
- Grep the screen file for `spacing.xl`. At most one occurrence, and only between the
  hero block and the body (Law 2).
- Grep the screen file for `spacing['2xl']`. Only at the trailing edge of scrollable
  content, never between two pieces of content (Law 2).
- Check list row vertical padding. Exactly 12, touch target at least 44 (Law 2).
- Count planes stacked in one place. At most 3: ground, chrome, card. No card sits on
  another card (Law 3).
- For any card, confirm all three of radius 20, a 16 inset, and the fill step are
  present together, not just one of them (Law 3).
- For any shadow used as a separator, confirm the contact contrast meets its threshold
  (`elevation.raised` >= 1.20:1, `elevation.chrome` >= 1.35:1) in the light appearance,
  and confirm no dark screen relies on a shadow as its only separator (Law 3).
- For any status instance, confirm ink, glyph, and text are all three present, and that
  the ink's contrast against its own `surface` sits within ±0.8 of `brandAccent`'s (Law
  4).
- Confirm interactive component boundaries (chips, outline buttons) use `borderDefined`,
  not `borderSubtle` (Law 4).
- Confirm any number that can change without a layout change (temperature, time, count,
  percentage) uses tabular figures (Law 5).
- Confirm nothing renders below `caption` 13, except `eyebrow` 10.5 (Law 5).
- Confirm status copy has no exclamation marks and matches its state's structure: fact,
  or fact plus ongoing action, or fact plus next action (Law 5).
- Confirm every icon has adjacent visible text or an `accessibilityLabel`, and that
  purely decorative icons are hidden from the accessibility tree (Law 6).
- Confirm icon size matches its adjacent text size (16/caption, 20/body, 24/title, 28+
  standalone) (Law 6).
- Confirm no animation loops, pulses, or runs ambiently, and that no state change is
  indicated by motion alone (Law 7).
- Grep `features/` for `expo-haptics`. Zero matches: only the `components/ui` wrapper
  imports it (Law 8).

## Relationship to the mockups

The mockups were treated as the target for this milestone, per the brief. Reading them
as a *system* rather than borrowing pieces produced the finding that **they do not
contain one**:

| dimension | mockup values across the 7 screens | this language |
| --- | --- | --- |
| section gap | 12, 14, 16, 20 | 12, one value |
| card padding | 12, 14x16, 16, 0x16 | 16, one value |
| list row vertical padding | 9, 12, 13, 14 | 12, one value |

Five row treatments and four gap values across seven screens. The recorded memory that
"the mockup density is 12/16/12" was the value of its *tightest* screens, not a system.
Copying the mockups harder was never going to yield coherence; this is the strongest
single justification for the milestone's instruction to improve on them.

Deliberate departures, each with its measured reason:

1. **Ground stays `#D0DDDC`, not the mockups' `#F4F6F5`.** The mockups' own ground
   under a white card measures **1.085:1**. The shipped value measures **1.395:1**. The
   shipped product is already better than the mockup on the exact metric the mockups
   were consulted to fix. Adopting the mockup ground would undo M6 and M6.1.
2. **The mockup amber `#8A5A16` is retuned to `#7A4F12`.** The mockup value measures
   **4.236:1** on the shipped ground, below 4.5:1. It fails as text on the ground
   plane. It was drawn against the lighter mockup ground where it passed.
3. **The mockup green `#2E6B4F` is retuned to `#216048`.** The original passes at
   4.519:1 on the ground but sits outside the ±0.8 band, and is the loudest thing on
   any screen it appears on.
4. **The mockup red `#9B3B3B` is retuned to `#9B2C2C` / `#F2A6A2`.** The original
   measures **2.056:1** on the dark card, unusable in the dark appearance. It was only
   ever drawn in the light-appearance decision documents and never on a product screen,
   so its dark behaviour was never tested.
5. **Outline controls move to `borderDefined`.** The mockups' `#C5D5D6` control border
   measures 1.515:1 and fails WCAG 1.4.11. Inherited into the product as-is.
6. **The tab bar is drawn.** Every full-screen mockup renders a tab bar containing a
   single "Profil" stub, never the three tabs its own `canvas.json` documents. The
   mockups never actually depict the three-tab decision.
7. **One density system replaces four**, per the table above.
8. **"Wanted" gets no status colour.** The mockups give "owned" the green and leave
   "wanted" on the generic accent, so only one of two symmetric states reads as a
   status. Neither is a status: both are user-chosen record states, not system
   outcomes. Both stay on the accent, and the asymmetry is removed.

## What this layer does not cover

This document defines roles and their measured limits: what may be emphasized, how
space and planes carry hierarchy, which colours and icons exist and where they may sit,
and which durations apply to which interaction. It does not cover:

- Token names, primitive values, theme resolution, or component APIs. Those live in
  [`design-system.md`](./design-system.md).
- Brand foundation, the approved palette's six hexes, the master symbol geometry, the
  application icon, and splash screen treatment. Those are locked decisions in
  [`visual-identity.md`](./visual-identity.md).
- Concrete component variants and primitives (text input, selector, switch, modal
  frameworks, non-scrollable/keyboard screen APIs, platform-colour adapters). These
  stay governed by `design-system.md`'s "current product use, not speculative
  completeness" rule; the role-shaped carve-out in Law 9 does not reach them.
