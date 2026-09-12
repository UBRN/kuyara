# ADR 0020: Rewriting the motion law

Status: Accepted (2026-09-03)

Implementation: the conditional rule, the duration assignments and the spatial spring role
live in the design language and `theme.ts`. The arrival spring, the stagger role, the
ambient duration role and the moment are named here and take their measured values on the
Simulator as the surfaces that use them land. The work sequence lives in
[`current-status.md`](../current-status.md).

Defines: [`design-language.md`](../design/design-language.md) Law 7, and the
primary-action clause and the ownership site in Law 8.

## Context

A blanket prohibition on repetition conflicts with two accepted components:

- `features/today/presentation/weather-glyph.tsx` loops a cloud bob and a rain drop
  fall with `withRepeat`. It renders on Today and Weather.
- `features/profile/presentation/probe-loading-overlay.tsx` pulses its dots with
  `withRepeat`.

Both short-circuit on `theme.isReduceMotionEnabled`, so the accessibility requirement is
not in question. The design language needs to permit their useful ambient character while
retaining enforceable safety boundaries.

An absolute is easier to audit, but in this case it would delete the product's only piece
of ambient character on the two screens where weather is the subject without addressing a
user-visible problem.

Restraint is not the only thing motion owes the product. The interface has to feel alive
somewhere, and the places it belongs are the arrival of a screen's content and the
behaviour of the hero, the outfit, not the navigation layer and not a cast of characters.

## Decision

Law 7 permits continuous or repeating motion under this conditional rule, in the
maintainer's own terms:

> Continuous or repeating motion is not prohibited. Motion may be used where it
> supports the weather atmosphere, state, hierarchy, feedback, or product character.
> It must not demand attention unnecessarily, must not harm performance or
> readability, and must respect Reduced Motion.

Three requirements are binding.

1. **Motion is never the only indication of a state change.** This is an accessibility
   requirement rather than a restraint preference.
2. **Reduced Motion is honoured.** Tokenised durations already resolve to 0 under
   Reduce Motion, and any ambient animation must short-circuit as the two existing
   ones do.
3. **Use the duration assignments by role.** `fast` 120 for content entering and press
   feedback, `normal` 200 for a state change on something already on screen,
   `deliberate` 320 for a full-screen or sheet transition.

### Two spring roles

Spatial motion, anything that moves an element between positions or sizes, is specified as
a spring rather than a duration with a curve. `theme.springs.spatial` is the default and
settles without visible overshoot. `theme.springs.arrival` overshoots visibly and is used
only for garment pieces landing on a board, Today's board and the outfit detail board,
because the outfit is the product's hero and a hero that arrives flat reads as a list row.
The overshoot is a brand decision, so its damping value is measured frame by frame on the
Simulator the way the spatial role's was, and the law names the role rather than the
number. Only `components/ui` consumes either role.

### Content arrives in reading order

A screen's liveliness comes from content choreography. Content enters in reading order,
staggered by `theme.motion.stagger`, after the platform's transition has landed. The
transition itself stays the platform's: native push, native tabs, native sheets, with no
custom screen transitions.

### The ambient duration role

None of the three durations describes ambient motion. A cloud that bobs over 1500 ms
is not a 320 ms transition. `weather-glyph.tsx` demonstrates the consequence today: it
hardcodes `BOB_DURATION_MS = 1500`, `DROP_DURATION_MS = 550` and
`DROP_STAGGER_MS = 350`, bypassing `theme.motion` entirely, because the token set has
no entry for what it is doing.

Ambient motion gets the duration role `theme.motion.ambient` rather than literals in a
feature file, and the role's value follows the weather condition's intensity: a calm
condition moves more slowly than a violent one. Its values are measured rather than
guessed. A duration is a role in the sense of
[ADR 0009](0009-a-design-language-layer-and-its-deferral-carve-out.md)'s carve-out, so
it may be defined ahead of a second use. Ambient motion never runs under a screen's hero
value and stops under Reduce Motion.

### A moment

A moment is a single settle plus its haptic, fired once per user action that completes
something. There are no particles, characters, mascots or sounds. One site carries a
moment: marking the last piece of an outfit as owned on the outfit detail board, where
the pieces settle once with the arrival spring and the success notification of Law 8
fires.

### Law 8 gains a press and a site

Law 8's rule and its platform split stand: haptics confirm something the user cannot see
or a physical threshold crossed under the finger, and the iOS impact call is never made on
Android. Two clauses belong to this decision. A primary action confirms the press itself
with a light impact, which means the `Button` primary variant alone; icon buttons, list
rows, chips, the tab bar and pickers fire nothing on press. And outfit ownership completed
on the detail board fires a success notification, the moment's haptic, because it confirms
a state the user set and crosses a real threshold.

### What does not become permitted

- Motion under a screen's hero value. [ADR 0018](0018-the-atmospheric-condition-band.md)
  and [ADR 0021](0021-direction-e-a-visual-first-design-language.md) keep the
  condition-tinted stage still because continuous movement beneath large text is where
  ambient motion measurably costs readability.
- Motion as the sole carrier of a state change.
- Motion that delays the user's decision, which `visual-identity.md` prohibits
  independently.

## Consequences

- `weather-glyph.tsx` and `probe-loading-overlay.tsx` are permitted when they satisfy the
  conditional rule, and their durations belong on the ambient role.
- `design-language.md`'s Law 7 and its "How to check a screen" list require reviewers to
  confirm that any repeating animation
  supports atmosphere, state, hierarchy, feedback, or character; that it is not the
  only indication of a state change; and that it stops under Reduced Motion. The list
  also asks where a screen's content arrival and its spring role come from.
- The check is weaker as an audit, because "supports product character" is a judgment
  where "nothing repeats" was a grep. That is the accepted cost, so the three requirements
  in the Decision remain hard boundaries rather than part of that judgment.
- Feature code still may not author `withSpring`, `dampingRatio` or `stiffness`, and still
  may not import `expo-haptics`. Both spring roles and both haptic clauses are consumed by
  the `components/ui` wrappers alone.

## Validation boundary

Ambient motion that reads as attention-demanding must be changed. The arrival overshoot
and the ambient values are accepted against a Simulator recording rather than a number in
this document, and the overshoot needs a design review because it is a brand decision. The
conditional rule remains binding unless native evidence shows that it cannot be enforced,
in which case a new decision is required.

## Alternatives considered

**Keep the ban and delete both animations.** Rejected by
the maintainer: the rule was removing product character to satisfy a sentence, and both
components already respected Reduced Motion, which is the part that actually protects
users.

**Keep the ban and grant the weather glyph a named exception.** Rejected: an absolute
with a carve-out for the one case that violates it is not an absolute, and the next
legitimate case would need its own exception.

**Permit ambient motion with a fixed maximum duration or amplitude.** Considered.
Rejected as premature: no measurement supports a specific number yet, and inventing
one would repeat the mistake this ADR is correcting. `theme.motion.ambient` is where a
measured value lives.

**Custom navigation transitions.** Rejected: the liveliness the product wants lives in
content arrival, and the transition stays the platform's, where it is familiar, free, and
already correct under the system's accessibility settings.

**A mascot, particles, or sound.** Rejected: a character system and confetti are a
[`visual-identity.md`](../design/visual-identity.md) red line, and sound is not part of
this product's vocabulary. Haptics carry the non-visual role, which is why a moment is one
settle plus one haptic.

## Out of scope

- The rest of Law 8: its other sites, the absence of an in-app toggle, and the wrapper's
  structure.
- The motion durations `fast`, `normal` and `deliberate`, and their values.
- The implementation of navigation transitions, which comes from Expo Router and the
  platform.
