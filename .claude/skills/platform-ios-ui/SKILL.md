---
name: platform-ios-ui
description: Use for kuyara iOS-facing UI work: navigation, tab bar, headers, sheets, gestures, SF Symbols, Liquid Glass, haptics, safe-area insets, scroll behavior, or anything under apps/mobile that renders differently on iOS. Trigger on "tab bar", "native tabs", "SF Symbol", "icon", "header", "sheet", "pull to refresh", "safe area", "haptic", "iOS 26", or a Simulator screenshot that looks wrong at the top or bottom edge.
---

# iOS UI in kuyara

`AGENTS.md` and `docs/design/visual-identity.md` carry the rules. This skill carries
the platform facts a fresh agent otherwise rediscovers the hard way.

## Baseline

- **Minimum iOS is 26.0**, a recorded decision ([ADR 0011](../../../docs/adr/0011-minimum-ios-26.md)),
  not the floor the Expo SDK happens to allow. There is no older appearance to keep
  working, so no Liquid Glass fallback branch is needed.
- The three primary tabs are drawn by **Expo Router Native Tabs**
  ([ADR 0012](../../../docs/adr/0012-adopting-expo-router-native-tabs.md)). The OS
  renders Liquid Glass and supplies its own accessibility adaptation.
- Liquid Glass is **system-drawn on navigation and control layers**. Do not turn
  content cards into glass, and do not hand-roll a glass effect.

## Traps, all of them measured

- **`UITabBar` ignores Dynamic Type.** Native tab labels do not scale. Do not file it
  as a bug or try to force it; the migration to Native Tabs is what closed the earlier
  label-clipping problem.
- **The screen owns the top inset.** Disabling `contentInsetAdjustmentBehavior` to fix
  a spacing problem silently kills pull-to-refresh. Fix the inset in the screen, not by
  turning the behavior off.
- **`bottom` does not exist as an SF Symbol in any release.** Garment slot glyphs are
  bundled monochrome artwork rendered through `Image` + `tintColor`
  (`GarmentSlotGlyph`/`GarmentSlotTile`), not symbols, and they stay that way
  ([ADR 0008](../../../docs/adr/0008-expanding-the-visual-vocabulary-for-m6-1.md)).
  Everything else goes through the `Icon` primitive over `expo-symbols`.
- **`expo run:ios` can exit 0 while `pod install` fails** under a non-UTF-8 locale.
  Export `LANG`/`LC_ALL` as UTF-8 before native builds, and read the log rather than
  trusting the exit code.
- **The dev client only reads `localhost:8081`.** Metro on another port leaves the app
  unable to connect and deep links not working.

## Haptics

Two permitted reasons only: confirming something the user cannot see, and crossing a
physical threshold. Six sites exist and the design language names them. Only
`components/ui` imports `expo-haptics`; `features/` must have zero matches. Android
cannot take the same calls, so the wrapper is where the platform difference lives.

## Before claiming iOS work done

One affected Simulator run or iOS build, per `AGENTS.md`; commands are in
`docs/testing.md`. That run checks the change itself. It is not a VoiceOver, Reduced
Motion or largest-text-size tour; those follow the risk rule in `AGENTS.md`.
