# ADR 0020: Rewriting the motion law

Status: Accepted (2026-09-03)

Implementation: Law 7 and its spatial-motion role are implemented in the design language
and theme. The ambient duration role remains to be implemented. The current work sequence lives in
[`current-status.md`](../current-status.md).

Defines: [`design-language.md`](../design/design-language.md) Law 7.

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

### The ambient duration role

None of the three durations describes ambient motion. A cloud that bobs over 1500 ms
is not a 320 ms transition. `weather-glyph.tsx` demonstrates the consequence today: it
hardcodes `BOB_DURATION_MS = 1500`, `DROP_DURATION_MS = 550` and
`DROP_STAGGER_MS = 350`, bypassing `theme.motion` entirely, because the token set has
no entry for what it is doing.

Ambient motion gets a duration role rather than literals in a feature file. Its value is
measured rather than guessed. A duration is a role in the sense of
[ADR 0009](0009-a-design-language-layer-and-its-deferral-carve-out.md)'s carve-out, so
it may be defined ahead of a second use.

### What does not become permitted

- Motion under a screen's hero value. [ADR 0018](0018-the-atmospheric-condition-band.md)
  and [ADR 0021](0021-direction-e-a-visual-first-design-language.md) keep the
  condition-tinted stage still because continuous movement beneath large text is where
  ambient motion measurably costs readability.
- Motion as the sole carrier of a state change.
- Motion that delays the user's decision, which `visual-identity.md` prohibits
  independently and this ADR does not touch.

## Consequences

- `weather-glyph.tsx` and `probe-loading-overlay.tsx` are permitted when they satisfy the
  conditional rule, and their durations belong on the ambient role.
- `design-language.md`'s Law 7 and its "How to check a screen" list require reviewers to
  confirm that any repeating animation
  supports atmosphere, state, hierarchy, feedback, or character; that it is not the
  only indication of a state change; and that it stops under Reduced Motion.
- The check is weaker as an audit, because "supports product character" is a judgment
  where "nothing repeats" was a grep. That is the accepted cost, so the three requirements
  in the Decision remain hard boundaries rather than part of that judgment.
- Law 8, non-visual feedback, is untouched. Haptics keep their two permitted reasons
  and their six sites, and `features/` still may not import `expo-haptics`.

## Validation boundary

Ambient motion that reads as attention-demanding must be changed. The conditional rule
remains binding unless native evidence shows that it cannot be enforced, in which case a
new decision is required.

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
one would repeat the mistake this ADR is correcting. The duration role added with the
token work is where a measured value will live.

## Out of scope

- Law 8 and the haptics policy.
- The motion durations `fast`, `normal` and `deliberate`, whose values are unchanged.
- Navigation transitions, which come from Expo Router and the platform.
