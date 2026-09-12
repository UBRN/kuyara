# ADR 0027: The app shell and its three tabs

Status: Accepted (2026-09-04)

Implementation: complete. The selected-state signals, the single-owner bottom inset and
the Simulator measurements in section 5 are implemented; Android rendering of the bar
remains unverified.

Builds on: [ADR 0006](0006-three-tab-information-architecture.md), whose three-tab
structure is not reopened, and [ADR 0012](0012-adopting-expo-router-native-tabs.md), whose
Native Tabs decision is not reopened either.

## Context

Goal 3 of the redesign was to settle the shell every other screen is drawn inside, and to
record a content inset that goals 4 to 6 could design against. The design question was how
much chrome the tab bar can carry before the styling-first feeling degrades.

The design half was quick. The feasibility half, run as a read-only check against the
installed packages rather than against memory, found two shell defects that mattered more
than the mockup did: the application contributed no selected-state signal of its own, and
feature screens were overwriting the bottom inset. Decisions 3 and 4 are their
corrections; both are shell foundation, and every screen is drawn inside them.

## Decision

### 1. Three tabs, the labels the product already ships

Today, Weather and Profile, from `navigation.today`, `navigation.weather` and
`navigation.profile` in `apps/mobile/src/localization/messages.ts`. Turkish is Bugün,
Hava, Profil.

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

### 3. The selected tab carries two non-colour signals of its own

On iOS 26 the OS draws a **selection capsule** behind the selected item, a shape signal
the application neither requests nor can request. It is not enough on its own: Law 6 says
fill carries state, and the shell is the one place every screen inherits, so the
application contributes two signals of its own, neither of them colour. Colour is not the
only signal, so this is a Law 6 matter rather than a Law 4 one.

1. **Icon shape.** Outline unselected, filled selected. **On iOS only.** The installed
   `AndroidSymbol` union has no filled counterpart for the weather glyph, only
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

- **The outline variants are their own `iconNames` entries** (`tabTodayOutline`,
  `tabWeatherOutline`, `tabProfileOutline`); `tabToday`, `tabWeather` and `tabProfile`
  keep pointing at the filled symbols. Do not reshape the filled entries into
  `{ default, selected }` objects: `Icon` renders through `expo-symbols`' `SymbolView`,
  whose `name` prop has no such variant, so any consumer of a filled entry outside the
  tab bar would fail to typecheck and the object would mean nothing at runtime.
- **The theme has no font-weight token.** Weights are inlined per role inside `typography`
  in `theme.ts`, so the selected label's weight is taken from an existing role's
  `fontWeight` rather than from a semantic token. Introducing a weight token is a separate
  decision and is not made here.

A selection capsule drawn by the application is not a third signal and is not wanted: the
installed package exposes no prop that draws one, and iOS 26 draws one itself.

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
sets `contentInsetAdjustmentBehavior="automatic"` on iOS
(`apps/mobile/src/components/ui/screen.tsx`).

The Android asymmetry matters: only the bottom inset is automatic there, which is exactly
the inset this decision is about, but it means Android's other edges stay the caller's
problem.

**The rule goals 4 to 6 design against:**

> A feature screen never sets `paddingBottom` on `Screen`. `Screen` owns the bottom inset.
> Trailing space at the end of scrollable content belongs inside the content.

How `Screen` owns it:

- **On iOS the automatic content inset is the whole clearance.** A 300-point probe on the
  Simulator put the last element exactly 300 points above the tab bar's frame, so `Screen`
  pads `spacing.md` only, mirroring what it does for the top edge. Do not add
  `safeAreaInsets.bottom` to the container on iOS; the bar is already inside the
  automatic inset, and adding the safe-area term again double counts it.
- **On Android `Screen` pads `safeAreaInsets.bottom + spacing.md`**, because Android has
  no equivalent automatic inset for a scroll view's content.
- **The content container does not grow to the scroll view's frame by default.** That
  frame includes the area under the bar, so a `flexGrow: 1` container leaves visible
  slack above the bar when content is scrolled to its end. The container grows only when
  a screen opts in with `fill` to centre or bottom-align short content.

Watch for the merge order: `Screen` merges the caller's `contentContainerStyle` last, so
a `paddingBottom` supplied by a screen *replaces* the inset instead of adding to it. That
is why the rule is a prohibition on the feature side rather than arithmetic on the
primitive's side. `2xl` as trailing space at the end of scrollable content is exactly
what Law 2 permits; spending it as `paddingBottom` on `Screen` is what the rule forbids.
`paddingVertical` on a screen does not trip it, because Yoga resolves the bottom edge by
specificity and `Screen`'s own `paddingBottom` still wins.

The component tests assert `Screen`'s `paddingBottom` on both platforms, so a regression
on either edge fails a test rather than shipping unnoticed.

### 5. Dynamic Type and touch targets, measured

[ADR 0012](0012-adopting-expo-router-native-tabs.md) recorded that primary tab labels
truncated at the largest accessibility text size in the hand-built bar, and required a
re-check after the migration because label rendering moved from JS to the platform.

The arithmetic makes the risk concrete: the widest label uses 34% of its tab, so it reaches
the tab edge at about 2.9 times, and iOS accessibility sizes scale body text to roughly
3.1 times. If the bar scaled its labels, the widest one would truncate at the largest size
and only there.

It does not. With `xcrun simctl ui <udid> content_size accessibility-extra-extra-extra-large`
the page content scales dramatically, the Weather title fills a third of the screen and
the body copy wraps to one or two words per line, while **the three tab labels stay at
their normal size and do not truncate**. The tab bar is visually unchanged at the largest
accessibility size.

So UIKit does not apply Dynamic Type to tab bar labels, and the truncation ADR 0012
recorded was a property of the hand-built bar that the migration removed. No `fontSize` is
needed in `labelStyle`, although `NativeTabsLabelStyle` could express one, and the
arithmetic above describes a risk that cannot be reached.

It also means the tab labels do **not** grow for a user who needs larger text, which is
the platform's behaviour rather than ours, and is the reason the labels are not the only
affordance: every tab also carries an icon and an `accessibilityLabel`.

Each tab item measures 94 by 54 points on the Simulator, above the 44-point minimum
target ADR 0012 required to survive the migration. The bar is OS-drawn and the component
test mocks the native tabs module entirely, so Jest cannot supply this number; only a
Simulator or device check can, and any re-measurement happens there.

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

## Consequences

- **The acceptance criterion is met by decisions 3 and 4, not by three tabs alone.** Three
  tabs and correct labels in both languages were never in question; two non-colour
  signals and a single-owner inset are what the shell adds.
- **Goals 4 to 6 have their inset.** It is a rule about ownership rather than a number, and
  it is the same rule on both platforms.
- **The shell comes first.** Every screen is drawn inside it, and no screen depends on the
  category glyphs, so shell corrections are sequenced ahead of artwork work.
- **The Dynamic Type and touch-target questions ADR 0012 left open are answered in
  section 5**, with the numbers recorded here rather than in `current-status.md`.
- **Both signals and the inset are asserted by tests.** The primary tabs component test
  asserts that every tab's `sf` default differs from its selected symbol and that the
  semibold label style is iOS-only, and the `Screen` component tests assert
  `paddingBottom` per platform, because neither the icon shape nor the inset has a
  compile-time surface that would catch a regression otherwise.

## Alternatives considered

**A custom tab bar, to get a selection capsule or any other treatment the OS does not
offer.** Rejected: it reopens ADR 0012, and it gives up the accessibility adaptation and
the platform material that decision was taken to obtain. The two approved signals need no
custom bar.

**Hardcoding a tab bar height so screens can reserve space.** Rejected: the height is not
exposed, it is the OS's on iOS 26, and the platform already clears it. A hardcoded number
would be wrong on the first device that disagreed.

**Closing the Dynamic Type item on the strength of an unrecorded Simulator observation.**
Rejected: a finding that is not in the repository is not a finding. Section 5 records a
fresh check with its command and its result.

## Out of scope

- Navigation code. ADR 0012's decision is untouched.
- The three-tab structure, which is ADR 0006's.
- Profile, the Closet and Settings, which are goals 4 to 6.
