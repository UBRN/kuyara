# ADR 0040: iOS scene-based life cycle

Status: Accepted (2026-09-23)

## Context

Apps built with the iOS 27 SDK must adopt the UIKit scene-based life cycle; UIKit asserts at launch
otherwise, before any JavaScript runs. Apple requires uploads built with the iOS 27 SDK from April
2027, and the only Xcode installed on the maintainer's machine is Xcode 27, so every local Simulator
build already hits the assertion. Expo SDK 57 ships `ExpoAppSceneDelegate` (Expo changelog PR
#46733) but its prebuild template still creates the window and starts React Native from the app
delegate and writes no scene manifest, so a plain prebuild of this project produces a binary that
cannot launch on the iOS 27 SDK.

## Decision

kuyara adopts the scene-based life cycle through one config plugin,
`apps/mobile/plugins/with-ios-scene-lifecycle.js`, registered in `app.json`. The plugin writes
`UIApplicationSceneManifest` into the generated Info.plist with a single window scene whose delegate
is Expo's `EXExpoAppSceneDelegate`, and it rewrites the generated `AppDelegate.swift` the way the
Expo SDK 58 template is written: the class conforms to `ExpoReactNativeFactoryProvider`, keeps
creating the React Native factory in `application(_:didFinishLaunchingWithOptions:)`, and no longer
creates the window or starts React Native there; the scene delegate does both when the scene
connects. The generated iOS project stays out of Git (continuous native generation); the plugin is
the only source of the change. Cold-start deep links and universal links reach JavaScript through
the scene delegate's launch-option rebuild, and the app delegate's `open url` and `continue
userActivity` overrides stay so running-app links keep reaching React Native.

## Red lines

- Never start React Native from both the app delegate and the scene delegate; one window, one start.
- Never commit the generated `ios/` project or hand-edit it; every native change goes through a
  config plugin or `app.json`.
- Never declare multiple scenes; kuyara is a single-window app on every platform.
- Android is untouched by this decision.

## Consequences

The plugin fails prebuild loudly when the Expo template changes shape, instead of silently producing
a binary that cannot launch; an Expo upgrade that adopts scenes in its own template retires the plugin.
This is native configuration shipped in a binary: it carries the independent read-only review, one
Simulator launch on the iOS 27 runtime, and a new app version before the next production build.
