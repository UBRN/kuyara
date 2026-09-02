# ADR 0012: Adopting Expo Router Native Tabs

Status: Accepted (2026-09-02)

Implementation: Not yet landed.

## Context

The current tab bar is a hand-built `View` at
`apps/mobile/src/navigation/primary-tab-bar.tsx`, wired through a custom
`tabBar` render prop at `apps/mobile/src/navigation/primary-tabs.tsx`, with a
background computed as `withAlpha(theme.colors.backgroundElevated, 0.92)`.

Native Tabs was previously deferred, and that deferral is recorded in four
places: `docs/architecture.md:158`, `docs/product-decisions.md:29`,
`docs/adr/0006-three-tab-information-architecture.md:64`, and
`docs/adr/0009-a-design-language-layer-and-its-deferral-carve-out.md:79`.
This ADR reverses that deferral.

## Decision

Adopt Expo Router Native Tabs, imported from
`expo-router/unstable-native-tabs`.

### The accessibility argument that decided it

A real `UITabBar` gets Liquid Glass drawn by the OS, and gets Reduce
Transparency, Increase Contrast, and Reduce Motion adaptation from the OS as
well. A hand-built glass surface gets none of that: the app must call
`AccessibilityInfo.isReduceTransparencyEnabled()` itself and swap to an
opaque background. This repo treats accessibility as a definition-of-done
requirement, so owning that adaptation by hand is the worse position.

Expo's own documentation states that on iOS 26 the system draws the tab bar
with Liquid Glass and that the tab bar background props have no effect on
iOS 26. A custom bar is therefore not merely more work, it is a losing
maintenance position against the OS.

Android is not an afterthought here: Native Tabs renders native Material
tabs on Android, which is closer to the Material 3 Expressive flexible
navigation bar than the current hand-built bar is, and satisfies the
standing rule against forcing one platform's conventions onto the other.

## Consequences

### The accepted alpha risk

Expo's own docs label the module alpha, with an API subject to change.
Documented limitations: a maximum of five tabs on Android, no nested native
tabs, and tabs must stay static. kuyara has exactly three static tabs and no
nesting, so none of the three limitations bind.

The migration is reversible: the custom `PrimaryTabBar` can be restored by
reinstating the `tabBar` render prop.

### What must be preserved through the migration

The three-tab information architecture is final per ADR 0006 and does not
change: Today at `/`, Weather at `/weather`, Profile at `/profile`, with
Wardrobe and Settings inside Profile. Localized visible labels, the selected
accessibility state, and the minimum touch target must survive. The known
issue that primary tab labels truncate at the largest accessibility text
size must be re-checked after migration, because label rendering moves from
JS to the platform.

### Android consequence

Native Tabs renders native Material tabs on Android in place of the current
hand-built bar, which is closer to the Material 3 Expressive flexible
navigation bar. Android rendering of the native tab bar is a separate
unverified item, consistent with the repo's existing Android posture.

## Alternatives considered

- **Hand-built glass with `expo-glass-effect`.** Rejected: the app would own
  Reduce Transparency adaptation itself, and there is no first-party
  guidance for that pattern.
- **Defer glass entirely.** Rejected by the owner; this is the deferral
  being reversed by this ADR.

## Related decisions

[ADR 0011](0011-minimum-ios-26.md), minimum iOS 26, is a related decision.

## Out of scope

- Any change to the three-tab information architecture itself, which stays
  governed by [ADR 0006](0006-three-tab-information-architecture.md).
- `expo-haptics` and haptic feedback on tab selection; that policy is
  recorded in the design language, not in an ADR.
