---
name: ui-verification
description: Use when finishing a kuyara UI change to run the exact repository checks and the greppable design-language checks, and to decide whether the manual accessibility pass applies. The manual pass (VoiceOver, focus order, Reduced Motion, largest text size) is risk-based, not routine. Trigger on "verify the UI", "run the checks", "accessibility check", "a11y", or before a commit that touches apps/mobile presentation code.
---

# UI verification gate

Accessibility is a product requirement in `AGENTS.md`. Routine UI work keeps it through
sections 1, 2 and 4 below: the greps, the automated suites, and one affected Simulator
run. Section 3 is the manual pass, and it is **not** routine. It runs only when:

- the task directly changes accessibility behavior (labels, roles, focus order,
  announcements, hit areas, colour-only signals);
- motion or animation behavior changes and Reduced Motion is affected;
- the work is the dedicated accessibility and polish milestone;
- the user asks for it.

A new screen alone does not trigger it. Dedicated screen-reader verification was already
deferred to that milestone; spreading it across every task is drift, not diligence.

## 1. Greppable design-language checks

Run the **How to check a screen** list at the end of `docs/design/design-language.md`.
Every item is decidable from a screenshot, a grep, or a computed contrast value. The
four that catch the most:

```bash
rg "spacing\.xl|spacing\['2xl'\]" apps/mobile/src/features
```

At most one `xl` per screen (hero to body only); `2xl` only as trailing scroll space.

```bash
rg -B4 "gap: (theme\.)?spacing\.lg" apps/mobile/src/features
```

`lg` is container inset, not a gap between groups, so a **vertical** hit is almost always
meant to be `md`. Read the context before changing one: Law 2 is a rule about vertical
space, and the three current hits are all `flexDirection: 'row'` gaps, which it does not
govern.

```bash
rg "@expo/ui|expo-haptics" apps/mobile/src/features
```

Must be empty. Only `components/ui` imports either; see ADR 0019 for `@expo/ui`.

```bash
rg "(fontSize|lineHeight):\s*-?\d" apps/mobile/src/features
```

Must be empty. That is the exact rule `theme.test.mjs` enforces: a **literal** number.
Reading a value off a role (`typography.body.fontSize`) is allowed and does occur, so
grepping the bare property names raises false alarms.

## 2. Automated checks

```bash
pnpm check
```

Lint, typecheck, every workspace Node suite, and the Worker bundle. The React Native
Testing Library suite is separate and is **not** in `pnpm check`:

```bash
pnpm --filter @kuyara/mobile test:components
```

Theme and token assertions alone:

```bash
pnpm --filter @kuyara/mobile test:theme
```

Focused suites, Expo Doctor, Worker dev, and `pnpm e2e:ios` are documented in
`docs/testing.md`. Run the smallest relevant check during implementation and one
consolidated pass at the end.

## 3. The manual pass (risk-based, see the top of this file)

When one of the four cases applies, pick the axes the change can plausibly break, not
the whole grid. When none applies, skip this section without listing its axes.

| Axis | What fails here |
| --- | --- |
| Turkish **and** English | Longer Turkish strings wrapping, truncating, or breaking a row's height |
| Light **and** dark | Contrast, and separators that only existed as a shadow (dark shadow contact is 1.000:1) |
| Larger text settings | Fixed line heights clipping, rows colliding, native tab labels (they do not scale, expected) |
| Screen reader | Missing labels, decorative icons still in the tree, focus order not following source order |
| Reduced Motion | Any ambient or repeating motion that does not short-circuit (repeating motion is permitted, ADR 0020, stopping here is not optional); press feedback must stay immediate |
| Touch targets | 44 points of actual area, reached by painted size or `hitSlop` |
| Colour alone | Every status needs ink **and** glyph **and** text |

## 4. Simulator

iOS changes need one affected build or Simulator run. Two things that waste an hour:

- Metro must be on **8081**; the dev client reads nothing else.
- `expo run:ios` can exit 0 while `pod install` failed under a non-UTF-8 locale. Export
  `LANG`/`LC_ALL` as UTF-8 and read the log, not the exit code.

Android has no verification path in this repository. Do not claim Android verified; see
the `platform-android-ui` skill.

## 5. Report honestly

State which commands ran and any failing output verbatim. If the manual pass ran, say
which axes it covered. If it did not run, one line saying so is enough; do not account
for each skipped axis. A check you did not run is not a check that passed.
