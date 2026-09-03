# ADR 0019: Adopting @expo/ui at the control layer

Status: Accepted (2026-09-03)

Implementation: not started. It lands with the redesign's implementation work; the
phase numbering this ADR originally used was superseded by the goal list in
[`current-status.md`](../current-status.md). The mount check has run, and its result is
recorded there and below.

Resolves: the "generic text-input, selector, switch, modal, or feedback frameworks"
entry on [`design-system.md`](../design/design-system.md)'s deferred list.

## Context

`@expo/ui@~57.0.8` has been a dependency since the monorepo was scaffolded
(`9867e08`) and **has never been imported anywhere in the repository.** So has
`expo-glass-effect@~57.0.1`.

Meanwhile the primitive layer stops at `Surface`. There is no `Row`, `ListSection`,
`Field`, `Segmented`, or `Sheet`, and `design-system.md` deferred exactly those under
the "current product use rather than speculative completeness" rule. The measured
cost of that deferral, taken from the current tree:

- `wardrobe-item-form-screen.tsx` is 824 lines; `weather-screen.tsx` is 637.
- The owned/wanted control exists three times, as `PreferenceOption`, as
  `WardrobeOption`, and as an ad hoc pair of `Button`s on outfit detail.
- A segmented control exists twice, with no shared component.
- A disclosure exists twice, independently implemented.
- The `fontScale > 1.5` stacking branch is re-implemented in six files.

The deferral rule was correct in principle and produced drift in practice, because
the condition it waited for, a repeated use, arrived several times without anyone
re-reading the rule. That is the same failure [ADR 0009](0009-a-design-language-layer-and-its-deferral-carve-out.md)
recorded for the status colours.

`@expo/ui`'s universal components map one to one onto what was hand-built:
`FieldGroup`, `List` and `ListItem`, `Picker`, `Switch`, `BottomSheet`, `Collapsible`,
`TextInput`. They render real SwiftUI on iOS and real Jetpack Compose on Android.

## Decision

### 1. Adopt @expo/ui for the control layer

Settings, the preference pickers, the garment-type picker, the wardrobe item form,
and Weather's location selection are rebuilt on `@expo/ui` universal components. The
deferred entry is resolved by using a dependency that is already installed rather than
by writing the primitives it names.

### 2. Feature code never imports it

`components/ui` wraps every `@expo/ui` component and is the only importer, exactly as
`components/ui/haptics.ts` is the only importer of `expo-haptics`. The boundary is
greppable and becomes an assertion:

```
rg "@expo/ui" apps/mobile/src/features
```

must return nothing.

### 3. The trade is accepted explicitly

**Native grouped controls render in system colours, not in kuyara's palette.** A
native `List` on iOS is an iOS list. This is the same trade
[ADR 0012](0012-adopting-expo-router-native-tabs.md) already accepted for the tab bar:
the operating system draws the control and supplies its own accessibility adaptation,
and in exchange the control stops being ours to style.

It is accepted for the same reason and it is bounded the same way. The control layer
is Settings, pickers, forms and sheets. kuyara's identity lives in Today, Weather,
Profile and onboarding, where the atmosphere band, the typography scale and the
three-band composition do the work. Concentrating identity there and letting the
system own the controls is the shape the redesign chose anyway.

### 4. expo-glass-effect stays unused

[ADR 0012](0012-adopting-expo-router-native-tabs.md) rejected hand-built glass and
that is unchanged. Liquid Glass remains something the OS draws on navigation and
control layers. The dependency is not removed in this ADR, but nothing may import it
without a new decision.

## Consequences

- Android gains real Material 3 controls from the same source, which is the closest
  this repository has come to satisfying `AGENTS.md`'s Material 3 requirement. It
  remains **unverified**: there is still no Android verification path here, and no
  report may claim otherwise.
- Three toggle components collapse to one, two segmented controls to one, two
  disclosures to one, and the six copies of the large-text stacking branch to one
  shared hook.
- The wardrobe form and the Weather location block shrink substantially. Line count is
  not the goal; a single idiom for a repeated control is.
- `@expo/ui` components render native views, which do not mount under the Jest
  environment. Component tests for the wrapped primitives are written against mocked
  modules, exactly as `primary-tabs.tsx`'s test was rewritten during Milestone B.
- The mount check ran during the visual design spike. The universal components **do
  mount** in the existing dev build, so no rebuild is required, but three findings
  qualify the adoption: `Host matchContents` collapses to zero height inside a
  `ScrollView` and renders nothing, an explicit height works; `Host` follows the device
  appearance rather than kuyara's resolved theme, which `Host colorScheme` fixes; and one
  component in the universal set terminates the app with no crash report, narrowed to the
  `List` / `Button` import group and not isolated further. Isolating that crash is a
  prerequisite for adopting those two components. `FieldGroup`, `ListItem` and `Switch`
  are clear.
- Accessibility for these controls comes from the platform, as it does for the tab
  bar. The manual matrix still runs; what changes is that the adaptation is not ours
  to implement.

## Relationship to the visual design spike

The spike prototypes Today, Weather and Profile, which are not control-layer screens,
so it does not gate this decision. It may, however, change how much of the identity
has to survive on Settings, and if it concludes that a native grouped list is too far
from the product's character, this ADR is amended rather than quietly ignored.

## Alternatives considered

**Write the primitives by hand.** Full control over tokens and appearance. Rejected:
it is the path that produced 824-line screens and three copies of one control, it
costs a large amount of work to reach a worse accessibility result than the platform
gives free, and it leaves Android's Material 3 requirement unaddressed.

**Adopt @expo/ui everywhere, including Today and Weather.** Rejected: it would put the
product's identity screens in system chrome and leave the atmosphere band and the
typography scale with nowhere to act.

**Remove @expo/ui from the dependency list instead.** Considered seriously, since an
unused dependency is a liability. Rejected because the components it provides are
precisely the deferred list, and deleting it would mean hand-writing them.

## Out of scope

- `expo-glass-effect`, which stays unused and unimported.
- The `Icon` primitive and `GarmentSlotGlyph`, which
  [ADR 0008](0008-expanding-the-visual-vocabulary-for-m6-1.md) governs and this does
  not touch.
- Navigation, which [ADR 0006](0006-three-tab-information-architecture.md) and
  [ADR 0012](0012-adopting-expo-router-native-tabs.md) govern.
