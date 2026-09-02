# ADR 0011: Minimum iOS becomes 26.0

Status: Accepted (2026-09-02)

Implementation: Not yet landed.

## Context

### What 16.4 actually was

16.4 was not a decision. It is Expo SDK 57's hard floor: `Expo.podspec` pins
`:ios => '16.4'`, and `expo-modules-autolinking`'s installer carries the
literal message about `ExpoModulesCore` having a 16.4 minimum. React Native
0.86.2 alone would allow 15.1. The value entered the repo in the first
scaffold commit `9867e08`, and no ADR ever treated it as a choice. Every doc
that mentions it states it as a pass-through fact of the SDK.

## Decision

Minimum iOS becomes **26.0**. Single edit point: `apps/mobile/app.json:17`
(`deploymentTarget`). There is no `expo-build-properties` plugin, and the four
generated `ios/` artifacts (`Podfile`, `Podfile.properties.json`, and four
`IPHONEOS_DEPLOYMENT_TARGET` entries in `project.pbxproj`) are gitignored
Continuous Native Generation output that regenerates from `app.json`.

## Consequences

### The cost, stated plainly

iPhone XR, XS, and XS Max are permanently excluded. By Apple's own
measurement of 2026-06-07, iOS 26 was on 79% of all active iPhones and 86% of
iPhones introduced in the last four years, so roughly 21% of the active base
is excluded (14% of the recent base). TelemetryDeck's 2026-08-31 sample,
which skews toward small independent US and EU apps, puts the excluded share
nearer 8 to 10%.

The cost is materially lower than those figures suggest for this app
specifically, because kuyara has **no public App Store release**: build
1.0.0 (2) is on TestFlight internal testing only. There is no installed base
to drop.

### What it buys

1. Every conditional "does this OS support it" branch disappears. There is
   no pre-Liquid-Glass appearance to design, no `isGlassEffectAPIAvailable()`
   guard to write, no second visual language to maintain. For a
   maintainer-funded project this is the decisive gain.
2. SF Symbols 7.0 is fully available.

### What this does not buy

Liquid Glass never required it. A real `UITabBar` compiled against the iOS 26
SDK renders Liquid Glass on iOS 26+ and the previous appearance below it,
from the same binary, with no app-side branching. Raising the floor removes
the older appearance from existence; it does not enable the newer one.

### Migration cost

Nothing in app code breaks. A repo-wide search for `Platform.Version`,
`Platform.constants`, `osVersion`, and `systemVersion` in `apps/mobile/src`
returned zero matches; the only `Platform.select` uses
(`apps/mobile/src/components/ui/app-text.tsx:33`,
`apps/mobile/src/components/ui/screen.tsx:40`) branch on platform, not OS
version, so there is no dead guard to remove. A fresh native build is
required before the change takes effect, and the existing TestFlight build
stays valid for whoever installed it until a resubmission.

Apple's separate requirement, unchanged by this: since 2026-04-28 all new App
Store Connect uploads must be built with Xcode 26 and the iOS 26 SDK. That is
a build SDK requirement and never forced the deployment target.

### Garment icons stay bundled artwork

ADR 0008's conclusion survives the target change, for a narrowed reason.

At iOS 26, `hanger` (SF Symbols 5), `jacket` and `coat` (SF Symbols 6) all
become available. `bottom` does not: a sweep of every SF Symbols version file
from 1.0 through 7.0 found no `pants`, `trousers`, `jeans`, `shorts`, or
`skirt` symbol at any version. No deployment target makes the four-slot set
native.

So the choice is a set that is three-quarters Apple's line style and
one-quarter ours, or a set that is coherently ours. ADR 0008 rejected a
partial set because it would render blank; the reason is now different but
the conclusion is the same, and the new reason is stronger: a set drawn in
two visual idioms reads as unfinished, which the design language's
iconography law already forbids.

The real defect is drawing quality, not symbol availability. Inspected
directly at `apps/mobile/assets/icons/garment/`: `top` and `outerwear` are
near identical at UI size (both a torso garment, distinguished only by an
open front), and `accessory` is ambiguous between a hat and a bag. `bottom`,
`one_piece`, and `footwear` read clearly. Redraw `outerwear` and `accessory`;
leave the other four.

This narrows but upholds ADR 0008's conclusion.

## Alternatives considered

- **Stay at 16.4.** This was the researched recommendation: nothing the
  owner asked for required raising it, and it costs users. Rejected by the
  owner after being shown the costs above.
- **Raise to 18.0.** Buys `hanger`, `jacket`, and `coat`, with roughly 6 to
  7% of the base excluded, and still no `bottom` symbol. Rejected by the
  owner.

The owner chose 26.0 after being shown these costs. The reason: it removes
every OS-version conditional branch, which is the decisive gain for a
maintainer-funded project.

## Out of scope

- Any change to the Balanced Horizon V2 master geometry or the six approved
  brand hexes.
- The redraw of the `outerwear` and `accessory` garment icons themselves;
  this ADR records that they must be redrawn, not the new artwork.
