# ADR 0009: A design language layer, and its carve-out from the deferral rule

Status: Accepted (2026-09-02)

Implementation: Landed as a documentation-only change alongside this ADR.

## Context

The light appearance has no contrast headroom left for depth. Measured:

| depth cue available to a light card | measured | 3:1 non-text threshold |
| --- | --- | --- |
| fill step, card `#FFFFFF` over ground `#D0DDDC` | 1.395:1 | fails |
| hairline, `borderSubtle` `#C5D5D6` on the white card | 1.515:1 | fails |
| shadow contact, `elevation.raised` opacity 0.10 over the ground | 1.218:1 | fails |

Three successive milestones attacked flatness through surfaces and moved the
ground/card step 1.023 -> 1.255 -> 1.395. That series is converging, not
improving: Soft Mist to pure white is only 1.085:1 of total headroom, and the
six brand hexes are locked. Surfaces physically cannot carry hierarchy in this
palette.

The dark appearance is worse in one specific way: its shadow colour is
`nightLayer` `#0D191E`, which is also the dark `background`. A dark raised
shadow falling on the ground composites to `#0D191E` at every opacity from
0.04 to 0.12, contact contrast 1.000:1. The dark shadow tokens do literally
nothing. That is a measured defect, not a stylistic choice.

`design-system.md:126` requires "a current product use rather than
speculative completeness" before a new variant or primitive is added. Applied
to roles as well as to components, this rule is the documented cause of the
current incoherence. `design-system.md:34` deferred status roles specifically
"until the app has concrete informational, success, warning, and error
presentation." That condition was already satisfied, and the rule still did
not fire, because nobody re-read the condition. Six such sites exist in the
shipped app today:

1. `features/profile/presentation/ai-status-section.tsx:48-54,73-74`, info / ok / checking / error
2. `features/wardrobe/presentation/wardrobe-item-form-screen.tsx:444-450`, validation error
3. `features/weather/presentation/weather-screen.tsx:495-508`, stale data warning
4. `features/today/presentation/outfit-detail-screen.tsx:62`, informational notice
5. `features/today/presentation/outfit-suggestion-card.tsx:99`, informational notice
6. `features/today/presentation/today-screen.tsx:170-178`, generation mode

All six render their icon in the same `theme.colors.iconSecondary`. A form
validation error and a "last updated" timestamp are today visually identical.

## Decision

A design language layer exists as
[`docs/design/design-language.md`](../design/design-language.md), sitting
between `visual-identity.md` (intent) and `design-system.md` (mechanism).

The deferral rule at `design-system.md:126` gets a carve-out, quoted exactly:

> If the thing is a _role_, a named slot in the system: a colour role, a
> typography role, a spacing meaning, an elevation meaning, a border meaning,
> a motion meaning, it belongs to the design language layer and may be
> defined ahead of any use.
>
> If the thing is a _variant or a primitive_, a concrete component API, the
> "current product use" requirement stands unchanged.

## Consequences

- This ADR supersedes `design-system.md:126` for role-shaped additions only.
  Variant- and primitive-shaped additions keep the unchanged rule.
- The deferred set resolves as follows:

| deferred item | resolution |
| --- | --- |
| status tokens (`design-system.md:160`, ADR 0008) | Approved, see ADR 0010 |
| destructive button variant + colour (`:158`) | Approved, see ADR 0010 |
| new neutrals | Approved: `borderDefined` only. Nothing else was needed |
| info colour role | Decided against, permanently. Info is `brandAccent` |
| generic text-input / selector / switch / modal frameworks (`:157`) | Stays deferred. These are primitives, not roles; the carve-out does not reach them |
| non-scrollable / keyboard screen API (`:159`) | Stays deferred. Primitive |
| platform-colour adapters (`:161`) | Stays deferred. Primitive |
| Native Tabs migration (`:156`) | Stays deferred. Gated on the SDK, unrelated |

- The carve-out does not empty the deferral list. It moves exactly the
  role-shaped items off it and leaves every primitive-shaped item exactly
  where it was.

## Alternatives considered

- **Keep the rule as it is and add roles case by case.** Rejected: this is
  the documented cause of the incoherence. A vocabulary that arrives one step
  behind the need cannot produce a coherent interface, which is what the icon
  system (waited for ADR 0008), shadows and the divider (waited for M6), and
  the status roles (waited until now) each demonstrated in turn.
- **Drop the deferral rule entirely.** Rejected: it is correct for components,
  and every primitive-shaped item in the resolution table above stays
  deferred under it.

## Out of scope

- The specific status colour values, the destructive button variant, and
  `borderDefined`. These are recorded in [ADR 0010](0010-status-colours-destructive-variant-and-defined-borders.md).
- Any change to app code. This ADR is documentation-only.
