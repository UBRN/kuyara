# ADR 0027: The app shell and its three tabs

Status: Accepted (2026-09-04)

Implementation: the design is not implemented. Two defect fixes are **approved here and
are sequenced ahead of** the category-glyph redraw that
[ADR 0025](0025-the-garment-board-composition-rule.md) left open, because they are shell
foundation and every screen is drawn inside them.

Builds on: [ADR 0006](0006-three-tab-information-architecture.md), whose three-tab
structure is not reopened, and [ADR 0012](0012-adopting-expo-router-native-tabs.md), whose
Native Tabs decision is not reopened either.

## Context

Goal 3 of the redesign was to settle the shell every other screen is drawn inside, and to
record a content inset that goals 4 to 6 could design against. The design question was how
much chrome the tab bar can carry before the styling-first feeling degrades.

The design half was quick. The feasibility half, run as a read-only check against the
installed packages rather than against memory, found two defects in shipped code that
matter more than the mockup did, and both are recorded as decisions below.

## Decision

### 1. Three tabs, the labels the product already ships

Today, Weather and Profile, from `navigation.today`, `navigation.weather` and
`navigation.profile` (`apps/mobile/src/localization/messages.ts:374,760`). Turkish is
Bugün, Hava, Profil.

Measured at the bar's own size, the widest label is the English "Weather" at 42.5 points
in a 124 point tab, **34% of its tab**. Label length is not a constraint at the default
text size in either language, and English is longer than Turkish here, not the reverse.

### 2. The bar carries an icon and a label, and nothing else

Three settings were compared at the point where Today's garment composition meets the bar,
which is the only place on that screen where chrome and content compete.

- **Icons only** is rejected. The three destinations become a hut, a cloud and a person,
  and only one of those is unambiguous. It also buys nothing: the bar's height is the
  platform's, so dropping the words frees no vertical space at all. Cost without benefit.
- **Icon and label** is chosen.
- **Icon, label and badge** is rejected for now. A badge would be the only saturated fill
  on the screen, it would sit directly under the garments, and nothing the product
  currently produces needs counting. The capability exists and stays unused.

### 3. The selected tab must carry two non-colour signals of its own

**The defect.** `iconNames` maps all three tabs to filled SF Symbols, `house.fill`,
`sun.max.fill` and `person.fill` (`apps/mobile/src/components/ui/icon.tsx:15`), and
`primary-tabs.tsx` passes the one symbol for both states. The icon is therefore identical
whether or not its tab is selected.

**Corrected against the Simulator, 2026-09-04.** An earlier draft of this decision said the
selected state carried no non-colour signal at all. That was wrong, and the run that
verified the fix is what disproved it: on iOS 26 the OS draws a **selection capsule**
behind the selected item, which is a shape signal and was there before this change. So the
accurate statement is narrower and still worth fixing: **the application contributed no
signal of its own**, and Law 6's "fill carries state" was being ignored in the one place
every screen inherits. Colour was not the only signal, so this was a Law 6 failure rather
than a Law 4 one.

**Approved fix.** Two signals, neither of them colour:

1. **Icon shape.** Outline unselected, filled selected. Law 6 already states that fill
   carries state; the shell was simply not doing it. **On iOS only, as implemented.** The
   installed `AndroidSymbol` union has no filled counterpart for the weather glyph, only
   `home_filled` exists among the three, so pairing two tabs and not the third would read
   as a bug. Android keeps one symbol per tab and lets its Material active indicator carry
   the state.
2. **A second signal that differs by platform**, because the platforms disagree about what
   the right one is. On iOS the selected label goes to semibold. On Android it must not:
   see decision 6.

Both come from props the installed expo-router already exposes, and the package's own
documentation gives the first one as its worked example:

- `sf?: SFSymbol | { default?: SFSymbol; selected: SFSymbol }`, documented with the
  example `<Icon sf={{ default: "house", selected: "house.fill" }} />`
  (`elements.d.ts:64`), and `md: AndroidSymbol | { default?: AndroidSymbol; selected: AndroidSymbol }`,
  documented with `<Icon md={{ default: 'home', selected: 'home_filled' }} />`
  (`elements.d.ts:169`). In both object forms `selected` is required and `default` is
  optional, so the icon signal is available on both platforms.
- `labelStyle?: StyleProp<NativeTabsLabelStyle> | { default?, selected? }`
  (`types.d.ts:226`), where
  `NativeTabsLabelStyle = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'fontStyle' | 'fontWeight' | 'color'>`
  (`types.d.ts:216`). **It belongs on `<NativeTabs>` itself, not on each
  `<NativeTabs.Trigger.Label>`**, which exposes only `children`, `selectedStyle` and
  `hidden`. Attaching it to the wrong element silently no-ops the default half.

**No custom tab bar is involved and ADR 0012 is not reopened.**

Two implementation constraints that are not footnotes:

- **The outline variants get new `iconNames` entries; the existing three are not
  reshaped.** `iconNames.tabWeather` has a second consumer outside the tab bar:
  `weather-screen.tsx:465` renders `<Icon name="tabWeather">` as the glyph on each hourly
  forecast row. That path goes through `expo-symbols`' `SymbolView`, whose `name` prop has
  no `{ default, selected }` variant at all, so reshaping the entry in place would fail to
  typecheck there and would mean nothing at runtime. Adding outline entries and leaving
  `tabToday`, `tabWeather` and `tabProfile` pointing at the filled symbols keeps that call
  site untouched.
- **The theme has no font-weight token.** Weights are inlined per role inside `typography`
  (`theme.ts:86`), so the selected label's weight is taken from an existing role's
  `fontWeight` rather than from a semantic token. Introducing a weight token is a separate
  decision and is not made here.

A selection capsule was drafted as the second signal and withdrawn, correctly but for the
wrong reason. The installed package exposes no prop that draws one, so the application
cannot ask for it. It does not need to: iOS 26 draws one itself, which the Simulator run
confirmed.

### 4. The bottom inset is a rule, not a number

**The tab bar's height is not knowable from this codebase.** The installed expo-router
exposes no tab bar height anywhere in its type surface, and on iOS 26 the OS draws and
measures the bar. Nothing may hardcode it.

It does not need to. The platform already clears it, and the installed package documents
how: on iOS "the first scroll view nested inside a native tabs screen has automatic content
inset adjustment enabled", and on Android "the content of a native tabs screen is
automatically wrapped in a `SafeAreaView`, and the **bottom** inset is applied. Other
insets must be handled manually"
(`expo-router/build/native-tabs/types.d.ts:552`). The project sets
`disableAutomaticContentInsets` nowhere, so both defaults are in force, and `Screen`
already sets `contentInsetAdjustmentBehavior="automatic"` on iOS (`screen.tsx:61`).

The Android asymmetry matters: only the bottom inset is automatic there, which is exactly
the inset this decision is about, but it means Android's other edges stay the caller's
problem.

**The defect.** `Screen` computes `safeAreaInsets.bottom + spacing.md` and applies it as
`paddingBottom` (`apps/mobile/src/components/ui/screen.tsx:29,43,49`), but it merges the
caller's `contentContainerStyle` **last** (`screen.tsx:65`). A `paddingBottom` supplied by
a screen therefore *replaces* that inset instead of adding to it.

**Eight screens do exactly that**, each in a `content` style object whose only other
property is `gap: spacing.md`: Today (`today-screen.tsx:254`), Weather
(`weather-screen.tsx:537`), Profile (`profile-screen.tsx:230`), Onboarding
(`onboarding-screen.tsx:362`), Settings (`settings-screen.tsx:321`), the preference picker
(`preference-picker-screen.tsx:148`) and the wardrobe form
(`wardrobe-item-form-screen.tsx:726`) all pass `spacing['2xl']`, and the garment type
picker (`garment-type-picker-screen.tsx:149`) passes `spacing.lg`. That eighth one is
already recorded in `current-status.md` as a known inconsistency, without its cause being
identified. Only the wardrobe list adds the inset back by hand
(`wardrobe-list-screen.tsx:189`), and it is a `FlatList` rather than a `Screen`.

**Two other screens are not part of this defect** and must not be swept into it. The Today
feedback state (`today-screen.tsx:333`) and the bootstrap screen (`bootstrap-screen.tsx:49`)
pass `paddingVertical: spacing.lg`. Yoga resolves the bottom edge by specificity, so
`Screen`'s own `paddingBottom` still wins there and the inset survives. They are a
readability question, not this bug.

On a home-indicator device the intended clearance is 34 + 12 = 46 points and those screens
render 32, or 16 in the garment type picker's case, so their last row sits 14 or 30 points
further into the home indicator area than the primitive intended. Law 2 is not what is broken here: `2xl` as trailing space at the end of
scrollable content is exactly what Law 2 permits. What is broken is that it is being spent
as padding that overwrites an inset.

**Approved fix, and the rule goals 4 to 6 design against:**

> A feature screen never sets `paddingBottom` on `Screen`. `Screen` owns the bottom inset.
> Trailing space at the end of scrollable content belongs inside the content.

**No test asserts `paddingBottom` for `Screen` or for any of the eight**, which is why this
shipped unnoticed. The component tests that flatten `contentContainerStyle` assert
`paddingTop` only. A regression test for the bottom edge does not exist and should land
with the fix.

Whether the fix is to remove the seven `paddingBottom` values or to make `Screen` merge
them additively is an implementation decision, not this ADR's. The rule holds either way.

### 5. Dynamic Type, verified and closed

[ADR 0012](0012-adopting-expo-router-native-tabs.md) recorded that primary tab labels
truncate at the largest accessibility text size, and required a re-check after the
migration because label rendering moved from JS to the platform. **The repository never
recorded the answer**, and `current-status.md` still carries the question.

The arithmetic makes the risk concrete: the widest label uses 34% of its tab, so it reaches
the tab edge at about 2.9 times, and iOS accessibility sizes scale body text to roughly
3.1 times. If the bar scales its labels, the widest one truncates at the largest size and
only there.

The API can express a fixed size if one is needed, because `NativeTabsLabelStyle` includes
`fontSize`. Whether one *is* needed is native behaviour, invisible to the type
definitions, to the JS source and to an HTML mockup.

**Verified on the Simulator, 2026-09-04, and now closed.** With
`xcrun simctl ui <udid> content_size accessibility-extra-extra-extra-large`, the page
content scales dramatically, the Weather title fills a third of the screen and the body
copy wraps to one or two words per line, while **the three tab labels stay at their normal
size and do not truncate**. The tab bar is visually unchanged at the largest accessibility
size.

So UIKit does not apply Dynamic Type to tab bar labels, and the truncation ADR 0012
recorded was a property of the hand-built bar that the migration removed. No `fontSize` is
needed in `labelStyle`, and the arithmetic above describes a risk that cannot be reached.

This is the answer ADR 0012 asked for and the repository never wrote down. It also means
the tab labels do **not** grow for a user who needs larger text, which is the platform's
behaviour rather than ours, and is the reason the labels are not the only affordance:
every tab also carries an icon and an `accessibilityLabel`.

### 6. Android gets no Liquid Glass, and does not want one

**There is no Android counterpart to Liquid Glass, and this ADR does not invent one.**

What Android actually renders: `NativeTabs` resolves to `react-native-screens`'
`Tabs.Host` (`expo-router/build/native-tabs/NativeTabsView.android.js:9`), whose tab bar is
`CustomBottomNavigationView`, a subclass of Google's Material
`com.google.android.material.bottomnavigation.BottomNavigationView`. Its background is set
to the Material 3 attribute `colorSurfaceContainer`, a **solid tonal colour**. There is no
blur, frost or refraction anywhere in that path.

That is not a gap in the library, it is Material's design. Material 3 replaced alpha-blended
elevation overlays with the tonal `colorSurfaceContainer` family and a flat elevation value,
and it defines no translucent or refractive material for the navigation bar at all. Material
3 Expressive's changes to the bottom navigation bar are height, padding, colour role and
layout: 80dp to 64dp, item padding 12/16 to 6/6, active indicator 64dp to 56dp, the active
label moving from on-surface-variant to secondary, and a horizontal item layout on windows
at least 600dp wide. None of them touch translucency.

`AGENTS.md` and the `platform-android-ui` skill already say the right thing: do not imitate
Liquid Glass, express the same identity in Material semantics. **The iOS material is drawn
by the OS and the Android surface is a Material tonal colour, and the two are supposed to
look different.** `blurEffect`, `shadowColor` and `minimizeBehavior` are all tagged
iOS-only in the installed package and are no-ops on Android; nothing should be set to
compensate.

**This splits decision 3's second signal.** Material 3 Expressive states plainly that the
bottom navigation bar's "label text is no longer bolded when selected", so applying a
semibold selected label on Android would force an iOS convention onto Material, which
`AGENTS.md` forbids. Android has its own second non-colour signal that iOS does not have:
the **active indicator**, the pill behind the selected item, 56dp in Expressive and present
by default. The installed package exposes `disableIndicator` and `indicatorColor` as
Android-only props.

So the two non-colour signals are per platform, and each is the platform's own:

| platform | drawn by the OS | contributed by the app |
| --- | --- | --- |
| iOS | the selection capsule | outline icon to filled, and the selected label at semibold |
| Android | the Material active indicator | nothing; see below |

Android ends with one non-colour signal, the indicator, and it is the OS's rather than
ours. The icon pair is unavailable there because the installed `AndroidSymbol` union
contains no filled weather glyph, and the label weight is ruled out by Material 3
Expressive. That is an accepted limitation of an unverified platform, recorded rather than
worked around.

`labelStyle` is not iOS-only, so the weight must be applied per platform rather than
globally, and `disableIndicator` must never be set.

**Android system bars are unconfigured and stay that way here.** `app.json` sets no
`androidNavigationBar`, no `statusBar` block and no edge-to-edge flag, and although
`expo-system-ui` is installed it is referenced nowhere in the app. Edge-to-edge is enforced
on Android 15 and above for apps targeting SDK 35, and Material's `BottomNavigationView`
handles its own insets, which is consistent with decision 4's rule. Android rendering of
the tab bar remains unverified at runtime, exactly as
[ADR 0012](0012-adopting-expo-router-native-tabs.md) and `current-status.md` already record;
this ADR does not close that.


### 7. Sequencing

The two fixes in decisions 3 and 4 are shell foundation and come **before** the
structural-category glyph redraw that ADR 0025 left open. Every screen is drawn inside the
shell; no screen depends on the fallback glyphs.

## Consequences

- **The acceptance criterion is met by the fix, not by the shipped code.** Three tabs and
  correct labels in both languages were already true; two non-colour signals were not.
- **Goals 4 to 6 have their inset.** It is a rule about ownership rather than a number, and
  it is the same rule on both platforms.
- **Two shipped defects are now recorded rather than latent.** Both were found by checking
  the feasibility question against the installed packages, not by designing.
- **The Dynamic Type verification is still owed** and remains an open item in
  `current-status.md`.
- **Neither fix breaks a test, and that is the problem.** Nothing asserts `iconNames`'
  shape or frozenness, and nothing asserts `paddingBottom` anywhere. The only compile-time
  surface either fix touches is `weather-screen.tsx:465`, which the chosen approach avoids.
  Both fixes should arrive with the assertions that would have caught them.
- **The repository still has no touch-target measurement for the tab bar.** ADR 0012
  required the minimum target to survive the migration and recorded no number. The bar is
  OS-drawn and the component test mocks the native tabs module entirely, so Jest cannot
  supply one; only a Simulator or device check can.

## Alternatives considered

**A custom tab bar, to get a selection capsule or any other treatment the OS does not
offer.** Rejected: it reopens ADR 0012, and it gives up the accessibility adaptation and
the platform material that decision was taken to obtain. The two approved signals need no
custom bar.

**Hardcoding a tab bar height so screens can reserve space.** Rejected: the height is not
exposed, it is the OS's on iOS 26, and the platform already clears it. A hardcoded number
would be wrong on the first device that disagreed.

**Closing the Dynamic Type item on the strength of the earlier Simulator observation.**
Rejected: it is not in the repository and was not re-verified.

## Out of scope

- Navigation code. ADR 0012's decision is untouched.
- The three-tab structure, which is ADR 0006's.
- Profile, the Closet and Settings, which are goals 4 to 6.
- Any production code change; the two fixes are approved here and implemented separately.
