---
name: platform-android-ui
description: Use when kuyara UI work touches shared code that must stay buildable on Android, when writing Material-side behavior, or when asked about Android parity, ripple, back behavior, monochrome icons, or elevation. Trigger on "Android", "Material 3", "emulator", "ripple", "back button", "adaptive icon", or any review of shared components for iOS-only assumptions.
---

# Android UI in kuyara

## Current honest state

Android source compatibility is preserved. **Android build, emulator, and visual
refinement are unverified and deferred** (`docs/design/design-system.md`, Implemented
and deferred). No Android validation command exists in this repository and none should
be invented.

Consequence for reporting: never write that something is verified on Android. Say the
shared code is Android-compatible by inspection, and that runtime verification is
outstanding.

## What this skill is actually for

Most Android work here is *not* writing Android UI. It is stopping iOS-only
assumptions from entering shared code. Flag and fix:

- `Platform.OS === 'ios'` guarding a behavior with no Android branch at all.
- iOS-only APIs (`expo-symbols`, Liquid Glass surfaces, `contentInsetAdjustmentBehavior`,
  `DynamicColorIOS`) reached from feature code instead of from a `components/ui`
  primitive that owns the platform split.
- Shadow styling authored as iOS `shadow*` properties without the paired `elevation`
  value. The two elevation levels, `elevation.raised` and `elevation.chrome`, are each
  a single cross-platform style object carrying both. Use them, do not hand-roll.
- Haptics called from `features/`. The wrapper exists precisely because Android cannot
  take the same calls.

## When actually writing Android-facing UI

- Follow current Material 3 and Material 3 Expressive guidance.
- Use platform-native navigation, back behavior, controls, motion, ripple, haptics and
  accessibility behavior.
- **Do not imitate Liquid Glass.** Express the same kuyara identity in Material
  semantics instead.
- Pixel-identical parity with iOS is a defect, not a goal. Identity and information
  architecture are shared; controls and interaction patterns are not.
- The app icon must keep a separable foreground and background for adaptive icons and a
  usable monochrome layer. Do not modify the Balanced Horizon V2 master geometry to get
  one.
