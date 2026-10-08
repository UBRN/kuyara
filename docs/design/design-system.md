# kuyara design system

## Status and relationship to the visual identity

This document is the implementation reference for kuyara's semantic design-token foundation and small adaptive UI primitive layer. The approved brand decisions remain canonical in [`visual-identity.md`](visual-identity.md). The implementation supports the application shell and near-term MVP presentation without defining final product screens or a broad component library.

Tokens and theme resolution live in `apps/mobile/src/theme/`; the shared primitive layer lives in `apps/mobile/src/components/ui/`, and the garment art that draws feature vocabulary (silhouettes, boards, the Closet palette's swatches) lives in `apps/mobile/src/garment-art/`. Primitive values feed authored semantic light and dark colors, which feed a typed application theme and shared presentation components:

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

- Foundations: `background`, `backgroundElevated`, `surface`, `surfaceMuted`, `surfaceInteractive`, `stage`
- Content: `textPrimary`, `textSecondary`, `textGated`, `textOnBrand`, `textOnPrimaryFill`, `iconPrimary`, `iconSecondary`
- Identity and interaction: `brandPrimary`, `brandAccent`, `primaryFill`, `primaryFillPressed`, `surfaceInteractivePressed`, `controlTonalRaised`, `focusRing`
- Boundaries and overlays: `borderSubtle`, `borderStrong`, `borderDefined`, `scrim`
- Status: `successInk`, `successContainer`, `warningInk`, `warningContainer`, `dangerInk`, `dangerContainer`, `dangerContainerPressed`
- Provenance: `provenanceInk`, `provenanceContainer`, a controlled role pair for the Worker AI badge, not a status verdict. It sits in the same accent band as the status pairs and is not used for a control, border or chrome.
- The on-device provenance badge pairs Apple Intelligence words with the system's rendering of the `apple.intelligence` SF Symbol in a non-purple badge. The Worker badge pairs “Chosen with AI” with the SF Symbol `sparkles` as an animated vivid multicolour layer in violet, fuchsia and gold. Deterministic fallback has no provenance badge. See [ADR 0034](../adr/0034-on-device-ai-selection-through-apple-foundation-models.md).
- Atmosphere: a closed seven-state set (`neutral`, `clearDay`, `veiledDay`, `fallingDay`, `clearNight`, `veiledNight`, `fallingNight`), each supplying a tonal ground for the condition-tinted stage on Today and Weather. Under [ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md) the atmosphere tints the surface behind the garment composition. Condition states use sRGB interpolation between approved brand hexes at recorded ratios; `neutral` resolves to `stage` in each appearance. See [ADR 0018](../adr/0018-the-atmospheric-condition-band.md) for the state table and contrast measurements.
- Piece shadow: no token. Every garment board derives it from the plane it draws on, the plane's colour moved in OKLCH lightness only, -0.13 light and -0.10 dark, through `theme/color-oklch.ts` ([`garment-board.md`](garment-board.md) section 9); `textPrimary` clears 3:1 on every value.
- Runway: four condition-hued fields per appearance (`clear`, `cloudy`, `rain`, `snow`; light `#F1DDA8`, `#C7D0DD`, `#7FB1CC`, `#D5E5EE`, dark `#1B3350`, `#1C2B37`, `#0E3A52`, `#193344`), roadmap item O1. Only the first-generation runway reads `theme.runway`, and `runway-palette.test.mjs` fails on any other consumer or any other file spelling the values. `textPrimary` clears 4.5:1, and the drafts' `iconSecondary` outline 3:1, on all eight.
- Condition: a closed 15-role ink set, listed below, consumed only by condition glyphs and hourly condition icons. It is content colour selected by weather data, never an accent or status colour, and is always rendered at full opacity.
- Temperature: two seven-stop ramps per appearance, `temperature.standard` and `temperature.strong`, one colour per stop of the fixed Celsius scale in `features/weather/domain/temperature-scale.ts` (-5, 5, 12, 18, 23, 28, 35), listed below. `strong` is read while `useVisibility().higherContrast` holds. `weather/presentation/temperature-gradient.ts` looks a Celsius value up on a ramp with `mixOklch` (`theme/color-oklch.ts`) and turns a low-to-high pair, or the hourly axis, into SVG stops at both ends and every whole degree. Only the Weather daily outlook and hourly rail read the ramps, and `temperature-gradient.test.mjs` fails on any other reader, any other file spelling the values, or a half degree under its contrast floor ([`design-language.md`](design-language.md#temperature-colour-is-content-data)).

[ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md) reallocates the light foundation and the supporting ink: the page ground rises to Soft Mist, which lifts `textPrimary` from 10.04:1 to 12.90:1, and supporting text becomes a derived neutral rather than Calm Current, leaving Calm Current as a selective accent. This reallocation is app-wide: Profile, Closet and Settings adopt Direction E rather than keeping a white-card step. Light `background` is Soft Mist, `textSecondary` and `iconSecondary` are the derived neutral `#2F4650` (dark `#B0C0C5`), `borderSubtle` is `#CCD2D4` (dark `#26393F`), and a new `stage` role, `#D7DCDD` light and the light grey plate `#D5D8D9` dark, is the condition-tinted stage in its neutral state; `garmentGround` (light `background`) and `garmentTile` (light `surfaceMuted`) are the planes a garment drawing stands on elsewhere, both the neutral plate in dark, where everything on a plate takes the light roles (`plateTheme`). The per-condition states carry ADR 0018's values at ADR 0021's raised luminance.

The light and dark sets are authored independently. Dark appearance is not an inversion. Light appearance uses Soft Mist `#F4F6F5` as the page foundation and the chrome plane, pure white for the remaining card surfaces (a 1.085:1 step that no longer carries separation), and Deep Atmosphere for primary content and controls. Dark appearance uses Night Layer as the page foundation, Deep Atmosphere for plain surfaces, `#1F3B47` for elevated content, Cloud White for primary content, `#B0C0C5` for secondary content, and Quiet Sky for focus and native controls. Filled primary buttons use `primaryFill`: Deep Atmosphere in light and the derived `#39707A` in dark, with `textOnPrimaryFill` resolving to Cloud White in both appearances. A few restrained tonal surface and border values extend the approved palette for hierarchy; they are semantic UI values, not additional brand colors.

Status ink and container roles follow [ADR 0010](../adr/0010-status-colours-destructive-variant-and-defined-borders.md) and [`design-language.md`](design-language.md#law-4-one-accent-and-a-controlled-role-band). Every status ink is tuned so its contrast against its appearance's `surface` lies within ±0.8 of `brandAccent`'s. Status UI communicates state through ink, glyph and text together, never color alone.

| role | light | dark |
| --- | --- | --- |
| `successInk` | `#216048` | `#7FD3AE` |
| `successContainer` | `#DCEBE3` | `#0B2620` |
| `warningInk` | `#7A4F12` | `#EABB6E` |
| `warningContainer` | `#F2E6CE` | `#292010` |
| `dangerInk` | `#9B2C2C` | `#F2A6A2` |
| `dangerContainer` | `#F8E3E1` | `#301D1B` |
| `borderDefined` | `#5C7A83` | `#5E899A` |
| `provenanceInk` | `#57518F` | `#C3BDEE` |
| `provenanceContainer` | `#E9E6F6` | `#2C1A38` |
| `textGated` | `textSecondary` blended 20% toward `background` | `textSecondary` blended 15% toward `background` |

`textGated` is the ink of a members-only row that a person who is not signed in sees ([ADR 0041](../adr/0041-optional-accounts.md) section 5): the secondary ink stepped toward the page, lighter than `textSecondary` yet muted but legible, never the disabled look. It clears 4.5:1 as text on `surface`, `background` and `backgroundElevated` in both appearances (5.29:1 on the light page, 4.77:1 on the dark group) and 3:1 as a glyph on the list-row tile fill over those grounds; `theme.test.mjs` holds both ratios.

These are derived semantic values in the same class as the existing derived neutrals `#E7EEED`, `#DDE8E7`, `#CCD2D4`, and `#D0DDDC`. They are not new brand colors; the six approved brand hexes and the Balanced Horizon V2 master geometry are unchanged. `borderDefined` identifies interactive components (chips, outline buttons); `borderSubtle` narrows to decorative dividers inside a container, where no component is being identified. `borderStrong` is the "Easier to see" boundary ink: the `textSecondary` value (`#2F4650` light, `#B0C0C5` dark) drawn as a `strong` 2-point edge on kuyara-drawn controls, only while that switch or iOS Increase Contrast is on ([ADR 0030](../adr/0030-settings-as-a-native-grouped-list.md) section 5).

| condition role | light | dark |
| --- | --- | --- |
| `clearDay` | `#90650E` | `#D3A445` |
| `mostlyClearDay` | `#AE5713` | `#DC9C6A` |
| `clearNight` | `#434F89` | `#A3ABD2` |
| `mostlyClearNight` | `#59419F` | `#B2A4DA` |
| `partlyCloudyDay` | `#206F6C` | `#4DCBC7` |
| `partlyCloudyNight` | `#743974` | `#CE9CCE` |
| `cloudy` | `#315272` | `#8DADCE` |
| `fog` | `#2A5546` | `#6FB89E` |
| `drizzle` | `#134853` | `#45BCD3` |
| `rain` | `#12466E` | `#77B2DF` |
| `heavyRain` | `#1A3F89` | `#8FACE5` |
| `sleet` | `#3F3597` | `#AAA4DF` |
| `snow` | `#2D4653` | `#8BAFC1` |
| `thunderstorm` | `#5B2D7B` | `#C29EDB` |
| `neutral` | `textPrimary` | `textPrimary` |

| temperature stop | light standard | light strong | dark standard | dark strong |
| --- | --- | --- | --- | --- |
| -5 °C | `#5C86D6` | `#3F68B5` | `#7BA1E6` | `#ACC9FE` |
| 5 °C | `#1893AE` | `#1B7489` | `#37AFCB` | `#72D5EF` |
| 12 °C | `#039894` | `#107773` | `#2CB2AD` | `#6DD9D4` |
| 18 °C | `#249870` | `#0A7957` | `#50B38C` | `#82D9B4` |
| 23 °C | `#AB8023` | `#8A640D` | `#C49B4A` | `#E9C27B` |
| 28 °C | `#C77137` | `#A65312` | `#DA8F61` | `#FFB98E` |
| 35 °C | `#CF6963` | `#AE4C47` | `#E18982` | `#FCB8B1` |

### Contrast evidence

Contrast was calculated with the WCAG relative-luminance formula. The measurements are evidence for these important pairs, not a claim that the complete application is formally WCAG conformant:

| Pair | Light | Dark |
| --- | ---: | ---: |
| Primary text on background | 12.90:1 | 16.09:1 |
| Secondary text on background | 9.16:1 | 9.53:1 |
| Primary button label on `primaryFill` | 12.61:1 | 5.01:1 |
| Focus ring on background | 6.52:1 | 10.03:1 |
| Primary text on the weather card | 11.51:1 | 13.80:1 |
| Eyebrow and accent text on the weather card | 5.81:1 | 8.61:1 |
| Accent-filled pill label on its fill | 6.37:1 | 10.03:1 |
| Photo placeholder label on its strongest stripe tint | 7.38:1 | 4.81:1 |
| Muted rain bar against the weather card | 3.15:1 | 4.97:1 |
| Success ink on surface | 7.42:1 | 7.89:1 |
| Success ink on background | 6.83:1 | 10.07:1 |
| Warning ink on surface | 7.11:1 | 7.89:1 |
| Warning ink on background | 6.55:1 | 10.07:1 |
| Danger ink on surface | 7.53:1 | 7.17:1 |
| Danger ink on background | 6.93:1 | 9.15:1 |
| Status ink on its own container | 5.75 to 6.12:1 | 8.16 to 9.04:1 |
| Provenance ink on its container | 5.75:1 | 9.02:1 |
| Status container tint on its surface (decorative, not the signal) | 1.23 to 1.24:1 | 1.14 to 1.15:1 |
| `borderDefined` on surface | 4.60:1 | 3.68:1 |
| `borderDefined` on background | 4.24:1 | 4.70:1 |
| `borderDefined` on backgroundElevated | 4.24:1 | 3.11:1 |
| Destructive tonal button label on `dangerContainer` | 6.12:1 | 8.16:1 |

The approved light supporting ink `#2F4650` measures 9.16:1 on Soft Mist (`#F4F6F5`), 7.18:1 on the stage (`#D7DCDD`), and 8.45:1 on the muted surface (`#E7EEED`).

Text pairs are measured against the 4.5:1 threshold. The muted rain bar is meaningful non-text content measured against 3:1; rain probability is also encoded by bar height and repeated in the group's accessibility label. The weather card tint is `brandAccent` at 0.08 over `background`. The photo placeholder starts with `brandAccent` at 0.05 over `surface` and overlays stripes at 0.15. Status containers are decorative; ink, glyph and text carry the signal. `borderDefined` identifies controls on each listed plane and clears the 3:1 non-text threshold. The theme tests enforce contrast floors; the measurements above use the current theme tokens.

### Elevation ladder

In the light appearance the page ground is Soft Mist `#F4F6F5` on every screen, `surface` is `#FFFFFF`, and type and space carry separation; the card step is 1.085:1. Light `backgroundElevated` equals `background`. In dark, `backgroundElevated` is the derived `#1F3B47`: 1.51:1 over Night Layer and 1.18:1 over `surface`. Cloud White reads at 10.65:1 and `textSecondary` at 6.31:1 on that plane. The theme test enforces these floors: `background` has the lowest luminance; the plate's `textPrimary` on `stage` clears 4.5:1; every `condition.*` ink at full opacity clears 3:1 on its allowed atmosphere planes and the Weather card; `textSecondary` on `background` and dark `backgroundElevated` clears 4.5:1.

Light `elevation.raised` is offset `{0, 4}`, radius 12, opacity 0.1, Android elevation 3; dark `raised` and both `chrome` levels are lower-opacity because the dark surface step already carries the separation. The shadow contact contrast rule and its measured values are in [`design-language.md`](design-language.md#law-3-surfaces-confirm-they-do-not-separate).

The allocation rationale is recorded in [ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md) and in [`design-language.md`](design-language.md#the-foundational-finding): light hierarchy relies on type and space rather than an enforced 1.2:1 card step. The derived neutrals `#E7EEED`, `#DDE8E7`, `#CCD2D4` and `#D0DDDC` remain in the palette class and the six brand hexes are unchanged.

The `display` typography role is the one hero value per screen, **at most** one: [ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md) makes Today's hero the garment composition, so Today carries no `display` at all and Weather keeps it. The role is 56pt, [ADR 0017](../adr/0017-a-retuned-typography-scale.md)'s scale.

## Scales

Spacing follows a restrained four-point rhythm: `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, and `2xl` 32. The separate `minimumTouchTarget` layout value is 44 points; it is not treated as spacing.

Typography uses platform system fonts and the semantic roles `display`, `titleLarge`, `title`, `eyebrow`, `body`, `bodyStrong`, `caption`, `label`, and `code`. The scale is `display` 56/56/700 at -1.5 tracking, `titleLarge` 34/41/700 at -0.6, `title` 22/28/600 at -0.2, `body` 17/24/400, `bodyStrong` 17/24/600, `label` 15/20/600, `caption` 13/18/400, `eyebrow` 10.5/14/700, and `code` 13/18/500. The three largest roles follow [ADR 0017](../adr/0017-a-retuned-typography-scale.md), which spaces them so Law 1's three emphasis levels are expressible; `titleLarge` 34 matches the iOS large title metric. The `code` role selects the platform system monospace face. The `eyebrow` role is a small uppercase letter-spaced label reserved for compact data captions, notably the Weather screen's wind, humidity, and UV stat labels; it carries no color of its own and is normally paired with the `textSecondary` role, except on Weather's current-conditions stage, where every line takes `textPrimary`, the one text role measured at AA on every atmosphere plane. Section headings do not use it: three competing heading treatments, large bold, uppercase eyebrow, and plain, were unified to the single sentence-case `bodyStrong` role. React Native font scaling remains enabled; shared text does not set `allowFontScaling={false}` or cap the font-size multiplier. Turkish text is stored in localization files rather than token definitions.

Shape roles are `compact` 8, `control` 12, `imageTile` 14, `card` 20, `stage` 26, `sheet` 28, and `pill` 999. `imageTile` is a garment picture's tile: the Closet grid, the type picker, History, Today's alternates and empty places. `stage` rounds the weather-coloured plane Weather's current conditions sit on, Today's loading stage and the detail's board plate; Today's outfit stands on the same tint as a cornerless band reaching both screen edges. Border widths are `subtle` 1 and `strong` 2. Elevation is authored as exactly two levels: `elevation.raised` for content cards and `elevation.chrome` for navigation chrome such as the tab bar and the collapsing header. Each level is a single cross-platform style object carrying the iOS shadow properties and the Android `elevation` value together. The dark appearance uses markedly lower shadow opacity, because the dark surface step already carries the separation.

Interaction opacity is tokenized as `pressedOpacity` 0.72 and `disabledOpacity` 0.48 for rows, tiles and chips. Presentation code uses these tokens rather than repeating the literal values. Buttons never use them: a pressed button steps its fill (`primaryFillPressed`, `surfaceInteractivePressed`, `dangerContainerPressed`), a disabled one takes the `surfaceMuted` fill with `borderDefined` ink, and a tonal control on a sheet takes `controlTonalRaised`.

Semantic haptic tokens live beside these existing `interaction` tokens in `theme.ts:138`, per [`design-language.md`](design-language.md#law-8-non-visual-feedback)'s feedback law. A single wrapper under `components/ui` is the only caller of `expo-haptics`; feature code never imports it directly, and `theme.test.mjs`'s existing repository-wide assertion is the enforcement point for that boundary.

`withAlpha(hexColor, alpha)` in `theme/color-alpha.ts` derives a translucent `rgba()` value from an already resolved semantic color. It is the only approved way to build a tinted surface, and it rejects anything other than a six-digit hex input. It never introduces a new hue: the input must be a semantic role read from the theme, never a brand primitive.

Motion durations are `immediate` 0 ms, `fast` 120 ms, `normal` 200 ms, `deliberate` 320 ms, and `launch` 400 ms, which only the launch curtain consumes. Motion tokens and ambient loops do not read the OS motion preference; animations play at their authored durations. Content visibility and state never depend on animation. The app makes no motion-adaptation claim.

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

The canonical primitive entry point is `apps/mobile/src/components/ui/index.ts`; the garment art's is `apps/mobile/src/garment-art/index.ts`. Production code under `components/` imports no `features/*` module, which `architecture-invariants.test.mjs` holds. Primitives consume the theme on behalf of presentation code and provide narrow, typed defaults while still accepting the relevant React Native props and `style` escape hatch.

- `AppText` supports the existing `display`, `titleLarge`, `title`, `eyebrow`, `body`, `bodyStrong`, `caption`, `label`, and `code` typography roles plus typed semantic color roles. Font scaling is enabled by default, normal `Text` props are forwarded, and content is not truncated implicitly. At accessibility sizes it releases authored line heights so native text can grow without clipping. Feature compositions remain responsible for choosing a smaller semantic heading role when an oversized display treatment no longer fits.
- `Screen` is the shared Reanimated ScrollView page foundation used by checked-in routes. It applies the semantic application background, safe-area insets, page padding, and the current maximum content width while allowing feature screens to keep scroll events on the UI thread. iOS resolves the top safe area through `contentInsetAdjustmentBehavior`, which is also what `UIRefreshControl` measures a pull against; disabling it silently disables pull-to-refresh, so the primitive must not turn it off. The optional `contentTopClearance` prop takes the total space to reserve above the content, measured from the top of the screen and including the top safe area, and resolves the platform difference in one place so feature code performs no safe-area arithmetic. The content container does not grow to the scroll view's frame by default, because that frame includes the area under the native tab bar and a grown container leaves slack above the bar at the end of a scroll; a screen that centres or bottom-aligns short content opts in with `fill`. A non-scrollable or keyboard-specific screen API is deferred until a checked-in flow requires it.
- `Surface` provides only `default`, `muted`, `elevated`, and `interactive` semantic variants. It uses semantic surface and border roles with the approved card radius; `elevated` denotes hierarchy without inventing a shadow token.
- `Button` is a capsule in four roles, `prominent`, `tonal`, `plain` and `destructive`, and three sizes, `large` 50, `medium` 44 and `small` 36 drawn with a 44-point target through hit slop. It takes at most one leading `icon`. The required visible `label` keeps localized text at the call site and wraps rather than truncates. Loading turns the leading slot into the progress indicator, keeps the label, blocks activation, and exposes busy and disabled accessibility state. While "Easier to see" is on every size is at least 56 points tall with no slop, and every role but `prominent` takes the `borderStrong` edge while higher contrast applies. `ButtonPair` places two buttons side by side and stacks them, stronger action first, above text factor 1.2 or when its caller asks.
- `TextButton` is a quiet secondary action drawn as caption text in the secondary ink, such as an offer's dismissal beside its button. It is a button for assistive technology, with its label, disabled state and focus ring, and its box is at least 44 points tall and wide (56 tall while "Easier to see" is on); it takes no fill and no strong edge.
- `IconButton` requires an `accessibilityLabel` at the type boundary, accepts an optional standard accessibility hint through React Native props, and draws one `Icon` name as a 44-point circle on the tonal fill. With `selected` and `selectedIcon` it is a toggle instead: the `borderDefined` edge (the `borderStrong` edge while higher contrast applies) on a transparent fill at rest, the filled glyph and the neutral `surfaceInteractive` fill when selected, never `brandAccent`; the state is also the selected trait, a press steps the fill to `surfaceInteractivePressed`, and it fires no haptic. Outfit detail's like and dislike use it.
- `ToggleChip` keeps one choice on or off as a capsule at least 44 points tall (48 with Easier to see) whose label is its name and which gains a leading check when selected. It carries the `borderDefined` edge (the `borderStrong` edge while higher contrast applies), the transparent fill at rest and the neutral `surfaceInteractive` fill when selected, never `brandAccent`, so it spends no accent budget; the state is also the selected trait, and a press steps the fill to `surfaceInteractivePressed`. It fires no haptic. Outfit detail's dislike reasons use it. The icon-only form is `IconButton` with `selected`.
- `GlassButton` is the one place a system glass control is drawn: `back` and `close` are `@expo/ui` SwiftUI buttons in the iOS 26 `.glass` style, and `bar` is the glyph a native header item frames in glass. Android maps them onto a plain text button, a tonal icon button and a plain header glyph. Feature presentation code draws a raw `Pressable` only for a listed row, tile, chip or link; `architecture-invariants.test.mjs` holds the list.
- `Icon` (`apps/mobile/src/components/ui/icon.tsx`) wraps `expo-symbols` `SymbolView` behind a frozen `iconNames` map of 91 semantic keys, each with iOS, Android and web names. It is decorative by default, hidden from the accessibility tree, and becomes a named element only when given an `accessibilityLabel`.
- `GarmentSlotGlyph` and `GarmentSlotTile` (`apps/mobile/src/garment-art/garment-slot-glyph.tsx`) render six structural categories through bundled monochrome PNG template artwork in standard and large sets (`apps/mobile/assets/icons/garment/`), with 1x, 2x and 3x densities. React Native `Image` applies `tintColor`; `Icon` remains the platform-symbol wrapper. See [ADR 0008](../adr/0008-expanding-the-visual-vocabulary-for-m6-1.md) for the garment-specific icon rationale.
- `SectionHeader` composes a heading, optional supporting text, and optional trailing action. It changes to a stacked layout at large text sizes so the action does not compress the heading.
- `Pill` is a small non-interactive label capsule with `accent-filled`, `bordered`, `provenance` and `muted` tones resolved by `resolvePillColors`. The Worker AI badge uses `provenanceContainer` and `provenanceInk`; the on-device badge uses the neutral `muted` tone. Its label uses the bold `caption` role. A caller that needs a tap supplies its own pressable, accessibility role, state and target. Its optional leading icon is decorative and hidden from the accessibility tree. Today pairs the on-device words with the system-rendered `apple.intelligence` symbol and the Worker words with the animated multicolour `sparkles` layer. Settled deterministic fallback has no badge ([ADR 0034](../adr/0034-on-device-ai-selection-through-apple-foundation-models.md) section 4).
- `PhotoPlaceholder` fills a fixed photo area with a striped semantic tint while no image is available. It renders its label only at heights of 96 points and above, because a thumbnail-sized box clips text at accessibility sizes; at smaller sizes it is a silent swatch and the surrounding row supplies the accessible name.
- `ListRow`, `ListRowGroup`, and `ListRowTile` (`apps/mobile/src/components/ui/list-row.tsx` and `list-row-tile.tsx`) implement [ADR 0028](../adr/0028-the-profile-tab-and-the-list-row-anatomy.md) section 2's list-row anatomy once, for Profile, the Closet, and Settings to adopt. `ListRow` takes a leading glyph render function, a label, an optional trailing value and supporting caption, and an optional `onPress`; a pressable row is a button whose accessible name defaults to the label rather than a label-plus-value sentence assembled from fragments, and a caller that needs the two joined supplies an explicit `accessibilityLabel`. `gated` is the members-only press style (ADR 0041 section 5): the label, glyph and chevron take `textGated`, the row stays a full button and never takes the `disabled` or dimmed trait, and `chip` adds a short muted `Pill` tag after the label ("Members" / "Üyelere özel"), spoken after the label. `ListRowGroup` renders the appearance-dependent group container, no fill plus a `borderDefined` hairline in light, the Night Layer surface step with no border in dark, both at the Law 3 card radius, and inserts a `borderSubtle` separator between rows at the text edge. `ListRowTile` is exported standalone so [ADR 0030](../adr/0030-settings-as-a-native-grouped-list.md)'s native Settings rows can host the same 28-by-28, radius-7 tile inside an `@expo/ui` `ListItem`'s `leading` slot through an `RNHostView`; the tile fill is always the row's own ink at a low `withAlpha` opacity, never a coloured tile. The tile, its glyph, and the chevron scale together by the shared `useTextScaling` hook's capped `controlScale`, and the trailing value stacks under the label above `fontScale` 1.5 while the chevron stays on the label line.
- `CheckRow` (`apps/mobile/src/components/ui/check-row.tsx`) is one choice of a multi-choice list on a sheet: a decorative leading picture, the label with optional supporting text and a trailing circle that fills with a check in `brandAccent` when chosen, so the state is shape and colour together. The whole row is one `checkbox` element and a 44-point target (60 with Easier to see); `unavailable` keeps its words, says why in the hint and ignores a press without hiding the row. The compose sheet uses it.
- `ColorSwatch` (`apps/mobile/src/garment-art/color-swatch.tsx`) is one round palette option, a 44-point radio with a 2-point `brandAccent` selection ring and a check on the chosen disc; the Closet palette and `ClosetSolidStrip` both draw it. `ClosetSolidStrip` (`closet-solid-strip.tsx`) is the 33 Closet solids in one row that scrolls sideways, in the Closet palette's order, opening with the chosen solid in view; a tap on the chosen one gives the colour back. It is one `radiogroup` named once for its piece, and the compose sheet shows one under each ticked piece.
- `NativePickerRow` is a direct native-list child for the four Settings preferences. On iOS it is a menu-style SwiftUI `Picker` with string tags, a plain label, and the row's SF Symbol through `systemImage`; on other platforms it keeps the existing native list-row anatomy and opens a local React Native alert with the same choices. The primitive owns the one selection haptic and never uses SwiftUI's `navigationLink` picker style, which crashes inside the react-native-screens stack.
- `NativeToggle` wraps the platform switch, and `NativeMenu` wraps the platform menu while keeping React Native trigger content behind the `components/ui` boundary. `NativeMenu` requires an explicit width and height because a native `Host` using content matching collapses inside a `ScrollView`.
- `NativeColorWell` wraps SwiftUI's `ColorPicker` as the Closet palette's system colour well (O8): a 44-point explicit `Host`, labels hidden, no opacity, the `brandAccent` selection ring the swatches use and the selected trait, reporting an uppercase `#RRGGBB`. Android draws no well. The wrapper draws no face: the Closet palette passes `ColorWellFace` (`garment-art`) as its child, the empty multicolour ring or the chosen colour's disc, and `ClosetColorDisc` draws a palette option, custom colour or pattern as a decorative round swatch.
- `GarmentSwapBoard` (`apps/mobile/src/garment-art/garment-swap-board.tsx`) is the outfit detail's editable board (Phase 7 and 7b). The feature hands it pieces, the palette, each slot's candidate order with its suitability, the enlarged slot, the hint, strings and a step callback; the primitive owns the tap and pan gestures, their thresholds, the enlargement (grow scale, step-back, held stage, paging window), the composition re-layout on `springs.spatial`, the one block height under the board, and one adjustable accessibility element per piece. `GarmentSwapStrip` (`garment-swap-strip.tsx`) is the enlarged piece's header with Done, for a mid or outer layer a plain "Take off" text button beside it, and its grid of `GarmentCandidateTile`s, the tile the row picker shares, with the hairline in `borderSubtle` and the marker in `focusRing`. `Presence` (`apps/mobile/src/components/ui/presence.tsx`) is a block that appears or leaves in place, its height on `springs.spatial` and its fade on `motion.fast`, the text entering after nine tenths of the height and leaving before it closes, and is out of the reading order while hidden.
- `Crossfade` (`apps/mobile/src/components/ui/crossfade.tsx`) replaces content that changes in place: the old content leaves on `motion.fast` over the new, which arrives on `motion.normal`; content present on mount is drawn at rest and the leaving layer is out of the reading order. Today's title, captions and day line and the outfit detail title use it.
- `RollingText` (`apps/mobile/src/components/ui/rolling-text.tsx`) is a value that rolls when it changes: only its changed characters travel one line (the whole value when its length changes), up for a rise and down for a fall, on `motion.normal`, once, over a resting plain text that holds the layout and is the one the screen reader meets. The new text is measured first, and the value's footprint then eases from the old width to the new one with the roll, so the label beside it moves with it and is never drawn over; a value that shrank to fit rolls at its fitted size; a value present on mount is drawn at rest. Weather's current temperature uses it.
- `GarmentPreviewBoard` (`apps/mobile/src/garment-art/garment-preview-board.tsx`) is a decorative board whose pieces answer a choice: a piece the change replaces or recolours slides out on `motion.fast` as its successor slides in on `springs.spatial`, a stagger step apart in reading order, a kept piece glides to its new place, and the stage holds the height it is given. Onboarding's preview board uses it from the welcome to the dress style step.
- `ScrollDepth` (`apps/mobile/src/components/ui/scroll-depth.tsx`) lets a header with no native large title recede as the content scrolls over it: driven by the scroll offset on the UI thread, it fades over its own height, travels at a quarter of the scroll's speed and shrinks to 0.97, at rest at the top and in a pull past it. Weather's title row and Today's place row, greeting and title use it.
- `CoachMarkLayer` (`apps/mobile/src/components/ui/coach-mark-layer.tsx`) draws the walkthrough's dimmed window, lit control and breathing ring above native tabs and sheets; the walkthrough feature owns its nine-step sequence and one-time gate.
- `NativeSheet` (`apps/mobile/src/components/ui/native-sheet.tsx`) wraps the platform bottom sheet and is the only importer of `@expo/ui`'s sheet. Its API is one boolean and one dismissal callback: the primitive owns presentation, the grabber, the scrim, gesture dismissal, and the detents, while the caller owns only the content, which stays ordinary React Native on both platforms. It builds on `@expo/ui/community/bottom-sheet`, the one sheet entry point that hosts React Native children itself, through SwiftUI `presentationDetents` on iOS and a Material 3 `ModalBottomSheet` on Android; the `swift-ui`, `jetpack-compose`, and universal sheets all expect native children instead. The medium detent is dropped above the shared `useTextScaling` threshold, where half a screen shows barely one row.
- `useTextScaling` (`apps/mobile/src/components/ui/use-text-scaling.ts`) is the one shared text-scaling hook [ADR 0019](../adr/0019-adopting-expo-ui-at-the-control-layer.md) calls for, returning the raw `fontScale`, the `usesStackedLayout` boolean above `fontScale` 1.5, and the `controlScale` capped at 1.5. `AppText` and `SectionHeader` read it instead of each computing their own inline threshold.

The checked-in Today feature is the first product composition over the primitives. Its route uses `Screen`, `AppText`, `Surface`, and `SectionHeader`; feature-specific weather and outfit components own their product semantics rather than widening the generic primitive API. The approved three-tab primary bar is the platform's native tab bar, declared once in `navigation/primary-tabs.tsx` with localized labels, symbol names from the frozen icon map and the `brandPrimary` tint; the OS supplies the selection capsule, touch targets and accessibility state. See [ADR 0012](../adr/0012-adopting-expo-router-native-tabs.md). Focused primitive tests preserve coverage for `Button` and `IconButton`.

Semantic tokens and primitives have different responsibilities. Tokens name visual roles and scales; primitives turn those roles into small accessibility and interaction contracts. Feature code remains responsible for localized content, layout composition, user intent, and domain-specific behavior. It may use raw React Native layout views where no semantic surface or control is intended.

Primitive APIs favor composition, a small variant union, and standard React Native props over arbitrary colors, numeric typography configuration, spacing props, or collections of styling booleans. New variants or primitives require a current product use rather than speculative completeness.

This requirement applies to variants and primitives, not to the design language layer. [ADR 0009](../adr/0009-a-design-language-layer-and-its-deferral-carve-out.md) carves out an explicit exception, with the test that decides which side a thing falls on, quoted from [`design-language.md`](design-language.md#law-9-the-deferral-carve-out):

> If the thing is a role, a named slot in the system: a colour role, a typography role, a spacing meaning, an elevation meaning, a border meaning, a motion meaning, it belongs to the design language layer and may be defined ahead of any use.
>
> If the thing is a variant or a primitive, a concrete component API, the "current product use" requirement stands unchanged.

## Platform and accessibility policy

Kuyara identity colors are authored explicitly, so uncontrolled platform colors do not replace them. `PlatformColor` and `DynamicColorIOS` are not currently needed. If a future native control or system surface benefits materially from a platform color, the value must be centralized behind a semantic role with a cross-platform fallback rather than scattered through feature code.

The current provider represents system appearance. `AppText` preserves Dynamic Type behavior. Buttons expose button role, accessible name, disabled state, and busy state; icon-only buttons require a label; section titles expose heading semantics; interactive primitives use at least a 44-point target and a semantic focus ring. Labels can wrap, loading does not collapse button width, and control state is conveyed through accessibility metadata in addition to visual feedback.

Feature code selects a typography role and does not author its own `fontSize` or `lineHeight`. Overriding the role's line height silently defeats the natural-line-height release `AppText` performs at accessibility text sizes, so a fixed line height in a feature style clips text rather than growing it. A repository-wide assertion in `theme.test.mjs` fails the suite when a file under `features/` declares either property. Primitives under `components/ui/` are exempt, because a primitive that owns a compact scale is a system decision rather than a per-screen one.

The 44-point minimum is a target requirement, not a painted-size requirement. A control may present a smaller visual body and reach 44 points through `hitSlop`, as the Today header's settings button does with a 30-point circle and a 7-point slop. A control must not fall below 44 points of actual touch area by either route.

Press feedback is an immediate opacity or semantic-background change, so it remains responsive. Existing collapsible content keeps its authored fade. VoiceOver focus order follows source order: section heading, localized expand/collapse button, then expanded content. Accessibility hints are left to call sites and should only be supplied when the action result is not clear from its label.

## Implemented and deferred

Current implementation and milestone status is maintained in [`../current-status.md`](../current-status.md).

The generation-mode indicator reuses the existing `Pill` with a text label and existing tokens (`brandAccent` for AI-assisted, `borderSubtle` for standard), and the Settings probe loading animation drives `theme.motion` durations. State is never signalled by colour alone.

Implemented and in use:

- Elevation, as exactly two levels and no more: `elevation.raised` for content cards and `elevation.chrome` for navigation chrome. Each is a single cross-platform style object carrying the iOS shadow properties and the Android `elevation` value together; the dark appearance uses markedly lower opacity because the dark surface step already carries the separation. See Elevation ladder above.
- `Divider` (`apps/mobile/src/components/ui/divider.tsx`), hidden from the accessibility tree; a caller insets it with `style`.
- The status colour roles, the `borderDefined` neutral and the destructive button variant approved by [ADR 0010](../adr/0010-status-colours-destructive-variant-and-defined-borders.md) (see Approved new colour roles above); every status site renders ink, glyph and text together.
- The icon system approved by [ADR 0008](../adr/0008-expanding-the-visual-vocabulary-for-m6-1.md): the `Icon` primitive wraps `expo-symbols` `SymbolView` behind one frozen map from semantic key to platform symbol names, decorative by default and named only when given an `accessibilityLabel`. Garment slot rows use the separate `GarmentSlotGlyph`/`GarmentSlotTile` primitives, drawn as bundled monochrome template artwork rendered through `Image` and `tintColor` and keyed by the structural categories, with a large raster class above 32 points. See ADR 0008 and the Adaptive UI primitives section above for why a symbol font remains unusable for these slots.

The garment silhouette vocabulary approved by [ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md) and [ADR 0025](../adr/0025-the-garment-board-composition-rule.md) is implemented as Phase 6 colour fashion flats: 41 drawings cover all 49 catalogue types, 34 of them the 41 outfit-eligible types and seven of them accessories, and the shared board renderer composes pieces by their drawn bounds using Today and detail presets. The renderer can animate an entrance from Today's fitted primary stage on the spatial spring role and reports settle to its caller. `GarmentTileArtwork` supplies the Closet grid's photo, silhouette, category glyph ladder, including unreadable-photo fallback, and draws a wanted piece's ink edge dashed. `ClosetRack` (`components/ui/garment-board/closet-rack.tsx`) draws Profile's open rack from the same silhouettes, never a photo, through the pure fill rule in `closet-rack-layout.ts`; it is memoised on its pieces and appearance and caps the full drawings at three face-out pieces per rail, one per hook and one row of shoes, drawing every other piece as a one-path slice. These tiles fit drawn bounds uniformly into a centred 60% × 61% box and retain the existing `GarmentSlotGlyph` for legacy null-type rows. Their appearance-specific colour-family fills are approved content colour for the rack and grid only (ADR 0028 section 6 and ADR 0029 section 5), not semantic theme roles; absent colour uses the neutral derived from the page ground. Multicolour pieces use a two-stop diagonal gradient per tile in the Closet grid and a shared two-stop diagonal gradient on the Profile rack. Every outfit, on Today's board, its alternate tiles, the detail, the runway and the finishing-touch badges, takes its colours from the Phase 6 palette (`garment-palette.ts`), made legible on the plane it stands on; the palette is resolved once per outfit and plane and memoised, and each drawing is memoised on its colours, size and level of detail. Accessories use their own seven silhouettes on the Profile rack, Closet grid, recommendation detail and Today badges ([ADR 0025](../adr/0025-the-garment-board-composition-rule.md)); the board renderer never places them inside an outfit board.

Deferred intentionally:

- Non-scrollable and keyboard-specific screen behavior until a checked-in flow requires either
- Platform-color adapters until a concrete native integration needs them

The generic text-input, selector, switch, modal, and feedback frameworks left the deferred list with [ADR 0019](../adr/0019-adopting-expo-ui-at-the-control-layer.md), resolved by adopting `@expo/ui` rather than by writing them. `@expo/ui@~57.0.8` had been an unused dependency since the monorepo was scaffolded; its universal `FieldGroup`, `List`, `Picker`, `Switch`, `BottomSheet`, `Collapsible` and `TextInput` map one to one onto what feature code had hand-built three times over. `components/ui` is the only importer, exactly as it is the only importer of `expo-haptics`, and `rg "@expo/ui|expo-haptics" apps/mobile/src/features --glob '!*.test.*'` must return nothing (test files may mock the package). The accepted trade is that native grouped controls render in system colours rather than kuyara's palette, the same trade [ADR 0012](../adr/0012-adopting-expo-router-native-tabs.md) took for the tab bar.

The design language carve-out ([ADR 0009](../adr/0009-a-design-language-layer-and-its-deferral-carve-out.md)) moved the role-shaped items formerly on this list, status tokens and the destructive variant's color, off it; every primitive-shaped item above is untouched.

The three-tab information architecture is final: Today, Weather, and Profile. The Closet and wanted records live inside Profile, and Settings opens from the Profile header. The English label is Closet and the Turkish is Gardırop; the internal `wardrobe` domain name is unchanged. The root uses a stable Expo Router Stack for the onboarding gate, and the primary tab bar is Expo Router Native Tabs; see [ADR 0012](../adr/0012-adopting-expo-router-native-tabs.md) for the accepted alpha risk and why its three documented limitations do not bind kuyara's three static tabs. Android source compatibility is preserved, but Android build, emulator, and visual refinement remain unverified and deferred.
