# ADR 0020: Rewriting the motion law

Status: Accepted (2026-09-03)

Implementation: documentation change here; the duration role it requires lands with the
redesign's token work. The phase numbering this ADR originally used was superseded by the
goal list in [`current-status.md`](../current-status.md).

Amends: [`design-language.md`](../design/design-language.md) Law 7.

## Context

Law 7 currently reads, in part, "**Nothing repeats.** No looping, pulsing, or ambient
animation, anywhere."

Two shipped components violate it, and both were found during the redesign's first
session rather than reported as defects:

- `features/today/presentation/weather-glyph.tsx` loops a cloud bob and a rain drop
  fall with `withRepeat`. It renders on Today and Weather.
- `features/profile/presentation/probe-loading-overlay.tsx` pulses its dots with
  `withRepeat`.

Both already short-circuit on `theme.isReduceMotionEnabled`, so the accessibility
requirement was never in question. What they violated was the design rule.

The rule was written as an absolute because absolutes are auditable. But it was
costing the product its only piece of ambient character on the two screens where the
weather is the subject, and enforcing it would have meant deleting the weather glyph's
animation to satisfy a sentence rather than a user-visible problem.

## Decision

Law 7's blanket prohibition on repetition is removed and replaced with a conditional
rule, in the maintainer's own terms:

> Continuous or repeating motion is not prohibited. Motion may be used where it
> supports the weather atmosphere, state, hierarchy, feedback, or product character.
> It must not demand attention unnecessarily, must not harm performance or
> readability, and must respect Reduced Motion.

Three things carry forward unchanged.

1. **Motion is never the only indication of a state change.** This was part of the old
   Law 7 and it is an accessibility requirement rather than a restraint preference.
   The new rule does not remove it and it is restated explicitly in the law.
2. **Reduced Motion is honoured.** Tokenised durations already resolve to 0 under
   Reduce Motion, and any ambient animation must short-circuit as the two existing
   ones do.
3. **The duration assignments stand.** `fast` 120 for content entering and press
   feedback, `normal` 200 for a state change on something already on screen,
   `deliberate` 320 for a full-screen or sheet transition.

### The gap this opens, and the role that closes it

None of the three durations describes ambient motion. A cloud that bobs over 1500 ms
is not a 320 ms transition. `weather-glyph.tsx` demonstrates the consequence today: it
hardcodes `BOB_DURATION_MS = 1500`, `DROP_DURATION_MS = 550` and
`DROP_STAGGER_MS = 350`, bypassing `theme.motion` entirely, because the token set has
no entry for what it is doing.

Ambient motion being legitimate, it gets a duration role rather than literals in a
feature file. The role is added with the redesign's token work and its value is measured
then, not guessed here. A duration is a role in the sense of
[ADR 0009](0009-a-design-language-layer-and-its-deferral-carve-out.md)'s carve-out, so
it may be defined ahead of a second use.

### What does not become permitted

- Motion under a screen's hero value. [ADR 0018](0018-the-atmospheric-condition-band.md)
  keeps the condition surface still for exactly this reason, and
  [ADR 0021](0021-direction-e-a-visual-first-design-language.md) carries the rule over to
  the tinted stage that replaced the band: continuous movement beneath
  large text is where ambient motion measurably costs readability.
- Motion as the sole carrier of a state change, per point 1 above.
- Motion that delays the user's decision, which `visual-identity.md` prohibits
  independently and this ADR does not touch.

## Consequences

- `weather-glyph.tsx` and `probe-loading-overlay.tsx` stop being violations. Neither is
  changed by this ADR beyond moving their hardcoded durations onto the new role.
- `design-language.md`'s Law 7 and its "How to check a screen" list are updated. The
  check changes from "confirm no animation loops" to "confirm any repeating animation
  supports atmosphere, state, hierarchy, feedback, or character; that it is not the
  only indication of a state change; and that it stops under Reduced Motion."
- The check is weaker as an audit, because "supports product character" is a judgment
  where "nothing repeats" was a grep. That is the accepted cost of the change, and it
  is why the three carry-forward clauses above are stated as hard requirements rather
  than folded into the judgment.
- Law 8, non-visual feedback, is untouched. Haptics keep their two permitted reasons
  and their six sites, and `features/` still may not import `expo-haptics`.

## Relationship to the visual design spike

The spike is where this rule gets its first real exercise, since motion is one of the
dimensions the directions will differ on. If the spike produces ambient motion that
reads as attention-demanding, the answer is to change the motion, not to re-tighten
the law by default; but the law may be amended if the spike shows the conditional
version is unenforceable in practice.

## Alternatives considered

**Keep the ban and delete both animations.** The original recommendation. Rejected by
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
