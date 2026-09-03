# kuyara design system

## Status and relationship to the visual identity

This document is the implementation reference for kuyara's semantic design-token foundation and small adaptive UI primitive layer. The approved brand decisions remain canonical in [`visual-identity.md`](visual-identity.md). The implementation supports the application shell and near-term MVP presentation without defining final product screens or a broad component library.

Tokens and theme resolution live in `apps/mobile/src/theme/`; the shared primitive layer lives in `apps/mobile/src/components/ui/`. Primitive values feed authored semantic light and dark colors, which feed a typed application theme and shared presentation components:

```text
approved brand primitives
        ↓
semantic light and dark roles
        ↓
typed kuyara theme
        ↓
adaptive UI primitives
        ↓
Router shell and feature presentation
```

This file is the mechanism. [`design-language.md`](design-language.md) is the layer above it that decides which mechanism to use, translating the approved identity into concrete rules for density, hierarchy, surface and depth strategy, colour, typography, iconography, and motion. Shadow contact contrast, a new measurable rule for when a shadow may serve as a plane separator, is defined there; see [Elevation ladder](#elevation-ladder) below for its current values.

## Primitive and semantic colors

`brandColors` records the six approved palette values once: `deepAtmosphere`, `calmCurrent`, `quietSky`, `softMist`, `nightLayer`, and `cloudWhite`. Presentation code must not import or consume these primitive names. They are inputs to semantic roles, not UI instructions.

Both appearances expose the same semantic roles:

- Foundations: `background`, `backgroundElevated`, `surface`, `surfaceMuted`, `surfaceInteractive`
- Content: `textPrimary`, `textSecondary`, `textOnBrand`, `iconPrimary`, `iconSecondary`
- Identity and interaction: `brandPrimary`, `brandAccent`, `focusRing`
- Boundaries and overlays: `borderSubtle`, `borderStrong`, `borderDefined`, `scrim`
- Status: `successInk`, `successContainer`, `warningInk`, `warningContainer`, `dangerInk`, `dangerContainer`
- Atmosphere: a closed seven-state set (`neutral`, `clearDay`, `veiledDay`, `fallingDay`, `clearNight`, `veiledNight`, `fallingNight`), each supplying a tonal ground for the condition-tinted stage on Today and Weather. [ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md) changed the shape the atmosphere takes, from a full-width band above a stable ground to the tint of the surface the garment composition sits on, and moved the per-state values upward in luminance because the tint now sits behind ink and silhouettes rather than behind a hero number. The state set, the two-hex derivation rule and the contrast floors are unchanged. Every value is an sRGB interpolation between two approved brand hexes at a recorded ratio, and `neutral` is whatever `background` resolves to in each appearance, so every screen without an atmosphere is unchanged. See [ADR 0018](../adr/0018-the-atmospheric-condition-band.md) for the full table and its measurements.

[ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md) reallocates the light foundation and the supporting ink: the page ground rises to Soft Mist, which lifts `textPrimary` from 10.04:1 to 12.90:1, and supporting text becomes a derived neutral rather than Calm Current, leaving Calm Current as a selective accent. Settled 2026-09-04, this reallocation is app-wide: Profile, Closet and Settings adopt Direction E rather than keeping the white-card step. The values below describe the shipped build, which still uses the earlier allocation.

The light and dark sets are authored independently. Dark appearance is not an inversion. Light appearance uses the derived neutral `#D0DDDC` as the page foundation, pure white for card surfaces, Soft Mist for the navigation and chrome plane between them, and Deep Atmosphere for primary content and controls. Dark appearance uses Night Layer as the page foundation, Deep Atmosphere for elevated content, Cloud White for primary content, and Quiet Sky for secondary content, focus, and primary controls. A few restrained tonal surface and border values extend the approved palette for hierarchy; they are semantic UI values, not additional brand colors.

Status roles are approved, not deferred: the condition the earlier deferral named, concrete informational, success, warning, and error presentation, was already met by six sites in the shipped app before anyone re-read it (`ai-status-section.tsx`, `wardrobe-item-form-screen.tsx`, `weather-screen.tsx`, `outfit-detail-screen.tsx`, `outfit-suggestion-card.tsx`, `today-screen.tsx`). See [ADR 0010](../adr/0010-status-colours-destructive-variant-and-defined-borders.md) and [`design-language.md`](design-language.md#law-4-one-accent-and-a-status-band). Every status ink is tuned so its contrast against its own appearance's `surface` lies within ±0.8 of `brandAccent`'s, and status UI must always communicate state through ink, glyph, and text together, never color alone.

| role | light | dark |
| --- | --- | --- |
| `successInk` | `#216048` | `#7FD3AE` |
| `successContainer` | `#DCEBE3` | `#0B2620` |
| `warningInk` | `#7A4F12` | `#EABB6E` |
| `warningContainer` | `#F2E6CE` | `#292010` |
| `dangerInk` | `#9B2C2C` | `#F2A6A2` |
| `dangerContainer` | `#F8E3E1` | `#301D1B` |
| `borderDefined` | `#5C7A83` | `#527E90` |

These are derived semantic values in the same class as the existing derived neutrals `#E7EEED`, `#DDE8E7`, `#C5D5D6`, and `#D0DDDC`. They are not new brand colors; the six approved brand hexes and the Balanced Horizon V2 master geometry are unchanged. `borderDefined` identifies interactive components (chips, outline buttons); `borderSubtle` narrows to decorative dividers inside a container, where no component is being identified.

### Contrast evidence

Contrast was calculated with the WCAG relative-luminance formula. The measurements are evidence for these important pairs, not a claim that the complete application is formally WCAG conformant:

| Pair | Light | Dark |
| --- | ---: | ---: |
| Primary text on background | 12.90:1 | 16.09:1 |
| Secondary text on background | 6.52:1 | 10.03:1 |
| Text on brand-primary control | 12.61:1 | 10.03:1 |
| Focus ring on background | 6.52:1 | 10.03:1 |
| Primary text on the weather card | 11.51:1 | 13.80:1 |
| Eyebrow and accent text on the weather card | 5.81:1 | 8.61:1 |
| Accent-filled pill label on its fill | 6.37:1 | 10.03:1 |
| Photo placeholder label on its tint | 5.95:1 | 7.04:1 |
| Muted rain bar against the weather card | 3.15:1 | 4.97:1 |
| Success ink on surface | 7.42:1 | 7.89:1 |
| Success ink on background | 5.32:1 | 10.07:1 |
| Warning ink on surface | 7.11:1 | 7.89:1 |
| Warning ink on background | 5.10:1 | 10.08:1 |
| Danger ink on surface | 7.53:1 | 7.17:1 |
| Danger ink on background | 5.40:1 | 9.15:1 |
| Status ink on its own container | 6.02 to 6.12:1 | 8.16 to 9.04:1 |
| Status container tint on its surface (decorative, not the signal) | 1.23:1 ±0.01 | 1.14:1 ±0.01 |
| `borderDefined` on surface | 4.60:1 | 3.17:1 |
| `borderDefined` on background | 3.30:1 | 4.04:1 |
| `borderDefined` on backgroundElevated | 4.24:1 | 3.17:1 |
| Destructive button label on its `dangerInk` fill | 7.53:1 | 9.15:1 |

The first four rows are text pairs measured against the 4.5:1 threshold. The next non-status row is meaningful non-text content measured against the 3:1 threshold; rain probability is additionally encoded by bar height and repeated in the group's accessibility label, so it never depends on color alone. The weather card tint is `brandAccent` at 0.08 over `background`, and the photo placeholder tint is `brandAccent` at 0.05 over `surface`. The status ink rows are text pairs measured against 4.5:1 on both planes a status instance may sit on. The status container row is intentionally below the 3:1 non-text threshold: the container fill is decorative and is never the signal, while the ink on it stays at 6.02 to 9.04:1. The `borderDefined` rows are non-text pairs measured against 3:1 across every plane a control may sit on. These pairs are asserted in `theme.test.mjs`.

### Elevation ladder

Milestone 6 fixed the light appearance's flat ground-to-card contrast by moving the ground plane down rather than lifting the card. `background` moved to `#D0DDDC`; `surface` stayed Cloud White `#EFF4F3`; `backgroundElevated` moved to Soft Mist `#F4F6F5`. Measured, the light surface-over-background contrast went from 1.023:1 to 1.255:1, which matched the dark appearance's existing 1.276:1. `#D0DDDC` is a derived neutral of the same class as the pre-existing derived neutrals `#E7EEED`, `#DDE8E7`, and `#C5D5D6`; the six approved brand hexes are unchanged.

M6.1 moved the light `surface` value to `#FFFFFF` while `background` stayed `#D0DDDC`, per [ADR 0008](../adr/0008-expanding-the-visual-vocabulary-for-m6-1.md). That pairing measures 1.395:1, the strongest light card-over-ground contrast evaluated so far, up from 1.255:1.

This retires the M6-era invariant that `backgroundElevated` sat at or above `surface`. That assertion was authored when Cloud White was the card plane and Soft Mist sat above it; a white card plane is the highest light surface by construction, so the old ordering no longer holds. Light `backgroundElevated` stays Soft Mist `#F4F6F5` and is now the navigation-and-chrome plane, sitting between the ground and the card, which the design mockups agree with, with a Cloud White tab bar tint against pure-white cards. `theme.test.mjs` now asserts instead: `background` has the strictly lowest luminance in both appearances; `surface` over `background` is at least 1.2:1 in both; `backgroundElevated` sits between the two, inclusive. Dark still satisfies these, with `backgroundElevated` equal to `surface`.

Superseded 2026-09-04 for the light appearance. [ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md) and its amendment move the light page ground to Soft Mist on every screen and stop separation depending on a card fill step, so the 1.2:1 light assertion describes an allocation the product is leaving. It stands until the Direction E tokens land and is then replaced by whatever the new allocation actually relies on; the paragraph above stays as the record of why the M6-era ordering was retired. The contrast floors for text and non-text elements are not affected by any of this.

Light `elevation.raised` was also softened to suit the white card plane: offset `{0, 4}`, radius 12, opacity 0.1, and Android elevation 3. Dark `raised` and both `chrome` levels are unchanged.

The `display` typography role, previously defined but unused, was put to work as the one hero value per screen. It was 40pt when M6.1 first used it and is 56pt after [ADR 0017](../adr/0017-a-retuned-typography-scale.md). The rule is now **at most** one per screen: [ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md) makes Today's hero the garment composition, so Today carries no `display` at all and Weather keeps it.

## Scales

Spacing follows a restrained four-point rhythm: `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, and `2xl` 32. The separate `minimumTouchTarget` layout value is 44 points; it is not treated as spacing.

Typography uses platform system fonts and the semantic roles `display`, `titleLarge`, `title`, `eyebrow`, `body`, `bodyStrong`, `caption`, `label`, and `code`. The scale is `display` 56/56/700 at -1.5 tracking, `titleLarge` 34/41/700 at -0.6, `title` 22/28/600 at -0.2, `body` 17/24/400, `bodyStrong` 17/24/600, `label` 15/20/600, `caption` 13/18/400, `eyebrow` 10.5/14/700, and `code` 13/18/500. The three largest roles were retuned by [ADR 0017](../adr/0017-a-retuned-typography-scale.md): `title` and `titleLarge` were previously both 24, and nothing sat between 24 and 40, so Law 1's three emphasis levels were not expressible. `titleLarge` 34 matches the iOS large title metric. The `code` role selects the platform system monospace face. The `eyebrow` role is a small uppercase letter-spaced label reserved for compact data captions, notably the Weather screen's wind, humidity, and UV stat labels; it carries no color of its own and is normally paired with the `textSecondary` role. Section headings do not use it: three competing heading treatments, large bold, uppercase eyebrow, and plain, were unified to the single sentence-case `bodyStrong` role. React Native font scaling remains enabled; shared text does not set `allowFontScaling={false}` or cap the font-size multiplier. Turkish text is stored in localization files rather than token definitions.

Shape roles are `compact` 8, `control` 12, `card` 20, `sheet` 28, and `pill` 999. Border widths are `subtle` 1 and `strong` 2. Elevation is authored as exactly two levels: `elevation.raised` for content cards and `elevation.chrome` for navigation chrome such as the tab bar and the collapsing header. Each level is a single cross-platform style object carrying the iOS shadow properties and the Android `elevation` value together. The dark appearance uses markedly lower shadow opacity, because the dark surface step already carries the separation.

Interaction opacity is tokenized as `pressedOpacity` 0.72 and `disabledOpacity` 0.48. Presentation code uses these tokens rather than repeating the literal values.

Semantic haptic tokens live beside these existing `interaction` tokens in `theme.ts:138`, per [`design-language.md`](design-language.md#law-8-non-visual-feedback)'s feedback law. A single wrapper under `components/ui` is the only caller of `expo-haptics`; feature code never imports it directly, and `theme.test.mjs`'s existing repository-wide assertion is the enforcement point for that boundary.

`withAlpha(hexColor, alpha)` in `theme/color-alpha.ts` derives a translucent `rgba()` value from an already resolved semantic color. It is the only approved way to build a tinted surface, and it rejects anything other than a six-digit hex input. It never introduces a new hue: the input must be a semantic role read from the theme, never a brand primitive.

Motion durations are `immediate` 0 ms, `fast` 120 ms, `normal` 200 ms, and `deliberate` 320 ms. The theme provider reads `AccessibilityInfo.isReduceMotionEnabled()` and listens for `reduceMotionChanged`. With Reduce Motion enabled, all tokenized durations resolve to 0 and decorative entering animation is omitted. Content visibility and state never depend on animation.

## Theme resolution and access

`KuyaraThemeProvider` defaults to the `system` preference and resolves React Native's light, dark, null, and unspecified appearance states. The profile application provider now supplies the persisted `system | light | dark` value without changing token consumers.

Components read the typed theme with `useKuyaraTheme()`. Expo Router receives a matching React Navigation theme, the active semantic background is used across routes and tabs, and `expo-status-bar` selects light or dark content from the resolved appearance.

Use semantic meaning in presentation code:

```tsx
<Screen>
  <Surface>
    <AppText variant="title">...</AppText>
    <Button label={messages.action} onPress={handlePress} />
  </Surface>
</Screen>;
```

Do not import primitives or select a literal hue in feature code:

```tsx
// Incorrect: feature code couples itself to a palette value.
<View style={{ backgroundColor: brandColors.deepAtmosphere }} />
```

Static non-color scales may be imported for `StyleSheet.create` when that keeps shared styles stable. Theme-dependent colors remain on the resolved theme.

## Adaptive UI primitives

The canonical primitive entry point is `apps/mobile/src/components/ui/index.ts`. Primitives consume the theme on behalf of presentation code and provide narrow, typed defaults while still accepting the relevant React Native props and `style` escape hatch.

- `AppText` supports the existing `display`, `titleLarge`, `title`, `eyebrow`, `body`, `bodyStrong`, `caption`, `label`, and `code` typography roles plus typed semantic color roles. Font scaling is enabled by default, normal `Text` props are forwarded, and content is not truncated implicitly. At accessibility sizes it releases authored line heights so native text can grow without clipping. Feature compositions remain responsible for choosing a smaller semantic heading role when an oversized display treatment no longer fits.
- `Screen` is the shared Reanimated ScrollView page foundation used by checked-in routes. It applies the semantic application background, safe-area insets, page padding, and the current maximum content width while allowing feature screens to keep scroll events on the UI thread. iOS resolves the top safe area through `contentInsetAdjustmentBehavior`, which is also what `UIRefreshControl` measures a pull against; disabling it silently disables pull-to-refresh, so the primitive must not turn it off. The optional `contentTopClearance` prop takes the total space to reserve above the content, measured from the top of the screen and including the top safe area, and resolves the platform difference in one place so feature code performs no safe-area arithmetic. A non-scrollable or keyboard-specific screen API is deferred until a checked-in flow requires it.
- `Surface` provides only `default`, `muted`, `elevated`, and `interactive` semantic variants. It uses semantic surface and border roles with the approved card radius; `elevated` denotes hierarchy without inventing a shadow token.
- `Button` provides `primary`, `secondary`, and `quiet` variants. The required visible `label` keeps localized text at the call site. Loading preserves label width, blocks activation, shows progress, and exposes busy and disabled accessibility state.
- `IconButton` requires an `accessibilityLabel` at the type boundary, accepts an optional standard accessibility hint through React Native props, owns the 44-point target, and receives icon content as a render function with the resolved semantic icon color. It does not select an icon system or glyph.
- `Icon` (`apps/mobile/src/components/ui/icon.tsx`) wraps `expo-symbols` `SymbolView` behind a single frozen `iconNames` map from a semantic key to a `{ ios, android, web }` name triple, currently 25 entries with all three platforms present for each. It is decorative by default, hidden from the accessibility tree, and becomes a named element only when given an `accessibilityLabel`.
- `GarmentSlotGlyph` and `GarmentSlotTile` (`apps/mobile/src/components/ui/garment-slot-glyph.tsx`) render the four-slot garment iconography as bundled monochrome template artwork (`apps/mobile/assets/icons/garment/`, one image per structural category at 1x/2x/3x, authored as SVG and rasterised to transparent PNG) through React Native `Image` with `tintColor`, rather than through `Icon`'s `expo-symbols` mechanism. Still keyed by the same six-value structural category union. See [ADR 0008](../adr/0008-expanding-the-visual-vocabulary-for-m6-1.md) for why SF Symbols and Material Symbols cover none of the four slots; `react-native-svg` remains rejected as a native module that would invalidate the existing dev build.
- `SectionHeader` composes a heading, optional supporting text, and optional trailing action. It changes to a stacked layout at large text sizes so the action does not compress the heading.
- `Pill` is a small non-interactive label capsule with `accent-filled` and `bordered` tones resolved by `resolvePillColors`. It owns its own compact label scale, which is a primitive-level decision rather than a feature one, and it stays non-interactive: a caller that needs a tap wraps it in its own pressable and supplies the accessibility role, state, and target. It accepts an optional decorative leading icon, hidden from the accessibility tree, used for the sparkle on the generation-mode badge; a `Pill` with no icon renders exactly as before.
- `PhotoPlaceholder` fills a fixed photo area with a striped semantic tint while no image is available. It renders its label only at heights of 96 points and above, because a thumbnail-sized box clips text at accessibility sizes; at smaller sizes it is a silent swatch and the surrounding row supplies the accessible name.
- `StretchyHeader` is a feature-independent absolute presentation primitive used by loaded Today and the ready Wardrobe list. It consumes a Reanimated shared vertical offset, measures safe-area-inclusive compact clearance, and stretches only its semantic `surface` background upward with a bottom-anchored transform. Pull distance and bottom-corner interpolation clamp at the current top inset; header content is never transformed. Scroll containers, feature state, localized content, navigation, refresh, and item rendering remain owned by each feature.

The checked-in Today feature is the first product composition over the primitives. Its route uses `Screen`, `AppText`, `Surface`, and `SectionHeader`; feature-specific weather and outfit components own their product semantics rather than widening the generic primitive API. The approved three-tab primary bar is a navigation presentation component rather than a generic UI primitive. It uses the same semantic theme, minimum touch target, localized visible labels, a selection indicator, and selected accessibility state. It is migrating from a hand-built bar to a native tab bar; see [ADR 0012](../adr/0012-adopting-expo-router-native-tabs.md). Focused primitive tests preserve coverage for `Button` and `IconButton`.

Semantic tokens and primitives have different responsibilities. Tokens name visual roles and scales; primitives turn those roles into small accessibility and interaction contracts. Feature code remains responsible for localized content, layout composition, user intent, and domain-specific behavior. It may use raw React Native layout views where no semantic surface or control is intended.

Primitive APIs favor composition, a small variant union, and standard React Native props over arbitrary colors, numeric typography configuration, spacing props, or collections of styling booleans. New variants or primitives require a current product use rather than speculative completeness.

This requirement applies to variants and primitives, not to the design language layer. [ADR 0009](../adr/0009-a-design-language-layer-and-its-deferral-carve-out.md) carves out an explicit exception, with the test that decides which side a thing falls on, quoted from [`design-language.md`](design-language.md#law-9-the-deferral-carve-out):

> If the thing is a role, a named slot in the system: a colour role, a typography role, a spacing meaning, an elevation meaning, a border meaning, a motion meaning, it belongs to the design language layer and may be defined ahead of any use.
>
> If the thing is a variant or a primitive, a concrete component API, the "current product use" requirement stands unchanged.

## Platform and accessibility policy

Kuyara identity colors are authored explicitly, so uncontrolled platform colors do not replace them. `PlatformColor` and `DynamicColorIOS` are not currently needed. If a future native control or system surface benefits materially from a platform color, the value must be centralized behind a semantic role with a cross-platform fallback rather than scattered through feature code.

The current provider represents system appearance and Reduce Motion. `AppText` preserves Dynamic Type behavior. Buttons expose button role, accessible name, disabled state, and busy state; icon-only buttons require a label; section titles expose heading semantics; interactive primitives use at least a 44-point target and a semantic focus ring. Labels can wrap, loading does not collapse button width, and control state is conveyed through accessibility metadata in addition to visual feedback. The stretchy header remains a modest, clamped, finger-tracked response under Reduce Motion and adds no autonomous timing, spring, parallax, or information-bearing transition.

Feature code selects a typography role and does not author its own `fontSize` or `lineHeight`. Overriding the role's line height silently defeats the natural-line-height release `AppText` performs at accessibility text sizes, so a fixed line height in a feature style clips text rather than growing it. A repository-wide assertion in `theme.test.mjs` fails the suite when a file under `features/` declares either property. Primitives under `components/ui/` are exempt, because a primitive that owns a compact scale is a system decision rather than a per-screen one.

The 44-point minimum is a target requirement, not a painted-size requirement. A control may present a smaller visual body and reach 44 points through `hitSlop`, as the Today header's settings button does with a 30-point circle and a 7-point slop. A control must not fall below 44 points of actual touch area by either route.

Press feedback is an immediate opacity or semantic-background change, not a decorative animation, so it remains responsive with Reduce Motion enabled. Existing collapsible content omits its fade when Reduce Motion is on. VoiceOver focus order follows source order: section heading, localized expand/collapse button, then expanded content. Accessibility hints are left to call sites and should only be supplied when the action result is not clear from its label.

## Implemented and deferred

Current implementation and milestone status is maintained in [`../current-status.md`](../current-status.md).

The milestone 4 generation-mode indicator reuses the existing `Pill` with a text label and existing tokens (`brandAccent` for AI-assisted, `borderSubtle` for standard), and the Settings probe loading animation drives `theme.motion` durations with a static Reduced-Motion path. No status token or status component was added, so state is never signalled by colour alone.

Milestone 6 moved three items off the deferred list below:

- Shadows and elevation are now implemented, as exactly two levels and no more: `elevation.raised` for content cards and `elevation.chrome` for navigation chrome (tab bar, collapsing header). Each is a single cross-platform style object carrying the iOS shadow properties and the Android `elevation` value together, and the dark appearance uses markedly lower opacity because the dark surface step already carries the separation. The previous reason for deferring, until a real hierarchy requires them, is now satisfied: there is a ground plane, a card plane, and a chrome plane. See Elevation ladder above.
- Divider is now implemented as a `Divider` primitive in `apps/mobile/src/components/ui/divider.tsx`, with a full and an inset variant, hidden from the accessibility tree. The previous reason for deferring, that the current shell has no repeated separator need, is now satisfied by four repeated needs: the hourly forecast rows, the settings rows, the outfit piece rows, and the wardrobe rows.
- Status colors were considered for milestone 6 and deferred: green, red, and amber fall outside the approved blue and neutral palette and needed separate visual identity approval. That approval now exists: the design language overhaul approved seven new colour roles and a new `borderDefined` neutral (see Approved new colour roles above and [ADR 0010](../adr/0010-status-colours-destructive-variant-and-defined-borders.md)). The icon-plus-text fix made for milestone 6, in the AI status section and in the preference option control, remains correct: color is still never the only signal. The destructive button variant is also approved, filling with `dangerInk` rather than waiting further.

M6.1 implemented the icon system approved by [ADR 0008](../adr/0008-expanding-the-visual-vocabulary-for-m6-1.md): the `Icon` primitive extends the existing `expo-symbols` `SymbolView` mechanism, already used for the icon-plus-text pairs above, to the tab bar and header actions, rather than adding an icon dependency. Garment slot rows use the separate `GarmentSlotGlyph`/`GarmentSlotTile` primitives instead; a later polish round replaced their original plain-View drawing with bundled monochrome template artwork rendered through `Image` and `tintColor`, still keyed by the same structural categories. See [ADR 0008](../adr/0008-expanding-the-visual-vocabulary-for-m6-1.md) and the Adaptive UI primitives section above for why a symbol font remains unusable for these four slots.

A garment silhouette vocabulary is approved by [ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md) and not yet implemented. It is a superset of the existing `GarmentSlotGlyph` structural categories rather than a replacement: the six category glyphs remain the fallback when a catalogue type has no specific silhouette. Two implementation constraints are recorded there and are not solved: composition must size pieces by their drawn bounds rather than their container, because paths occupy different proportions of their viewBox, and a placement rule that takes a slot list and produces a composition does not exist.

Deferred intentionally:

- Non-scrollable and keyboard-specific screen behavior until a checked-in flow requires either
- Platform-color adapters until a concrete native integration needs them

The generic text-input, selector, switch, modal, and feedback frameworks left the deferred list with [ADR 0019](../adr/0019-adopting-expo-ui-at-the-control-layer.md), resolved by adopting `@expo/ui` rather than by writing them. `@expo/ui@~57.0.8` had been an unused dependency since the monorepo was scaffolded; its universal `FieldGroup`, `List`, `Picker`, `Switch`, `BottomSheet`, `Collapsible` and `TextInput` map one to one onto what feature code had hand-built three times over. `components/ui` is the only importer, exactly as it is the only importer of `expo-haptics`, and `rg "@expo/ui" apps/mobile/src/features` must return nothing. The accepted trade is that native grouped controls render in system colours rather than kuyara's palette, the same trade [ADR 0012](../adr/0012-adopting-expo-router-native-tabs.md) took for the tab bar.

The design language carve-out ([ADR 0009](../adr/0009-a-design-language-layer-and-its-deferral-carve-out.md)) moved the role-shaped items formerly on this list, status tokens and the destructive variant's color, off it; every primitive-shaped item above is untouched.

The three-tab information architecture is final: Today, Weather, and Profile. The Closet and wanted records live inside Profile, and Settings opens from the Profile header. The English label is Closet and the Turkish is Gardırop; that rename is decided and not yet implemented, since the shipped English strings still read "Wardrobe". The internal `wardrobe` domain name is unchanged either way. The current root uses a stable Expo Router Stack for the onboarding gate. The primary tab bar is migrating from Expo Router JavaScript Tabs to Expo Router Native Tabs; see [ADR 0012](../adr/0012-adopting-expo-router-native-tabs.md) for the accepted alpha risk and why its three documented limitations do not bind kuyara's three static tabs. Android source compatibility is preserved, but Android build, emulator, and visual refinement remain unverified and deferred.
