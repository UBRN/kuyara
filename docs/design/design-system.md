# kuyara design system

## Status and relationship to the visual identity

This document is the implementation reference for kuyara's current semantic design-token foundation. The approved brand decisions remain canonical in [`visual-identity.md`](visual-identity.md). This foundation is intentionally small: it supports the application shell and near-term MVP presentation without defining a component library or final product screens.

The implementation lives in `apps/mobile/src/theme/`. Primitive values feed authored semantic light and dark colors, which feed a typed application theme and the shared presentation components:

```text
approved brand primitives
        ↓
semantic light and dark roles
        ↓
typed kuyara theme
        ↓
Router shell and shared UI
```

## Primitive and semantic colors

`brandColors` records the six approved palette values once: `deepAtmosphere`, `calmCurrent`, `quietSky`, `softMist`, `nightLayer`, and `cloudWhite`. Presentation code must not import or consume these primitive names. They are inputs to semantic roles, not UI instructions.

Both appearances expose the same semantic roles:

- Foundations: `background`, `backgroundElevated`, `surface`, `surfaceMuted`, `surfaceInteractive`
- Content: `textPrimary`, `textSecondary`, `textOnBrand`, `iconPrimary`, `iconSecondary`
- Identity and interaction: `brandPrimary`, `brandAccent`, `focusRing`
- Boundaries and overlays: `borderSubtle`, `borderStrong`, `scrim`

The light and dark sets are authored independently. Dark appearance is not an inversion. Light appearance uses Soft Mist as the page foundation, Cloud White for elevated content, and Deep Atmosphere for primary content and controls. Dark appearance uses Night Layer as the page foundation, Deep Atmosphere for elevated content, Cloud White for primary content, and Quiet Sky for secondary content, focus, and primary controls. A few restrained tonal surface and border values extend the approved palette for hierarchy; they are semantic UI values, not additional brand colors.

Status roles are intentionally deferred until the app has concrete informational, success, warning, and error presentation. Adding indistinguishable or unused status colors now would be speculative. Future status UI must not communicate state by color alone.

### Contrast evidence

Contrast was calculated with the WCAG relative-luminance formula. The measurements are evidence for these important pairs, not a claim that the complete application is formally WCAG conformant:

| Pair | Light | Dark |
| --- | ---: | ---: |
| Primary text on background | 12.90:1 | 16.09:1 |
| Secondary text on background | 6.52:1 | 10.03:1 |
| Text on brand-primary control | 12.61:1 | 10.03:1 |
| Focus ring on background | 6.52:1 | 10.03:1 |

## Scales

Spacing follows a restrained four-point rhythm: `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, and `2xl` 32. The separate `minimumTouchTarget` layout value is 44 points; it is not treated as spacing.

Typography uses platform system fonts and the semantic roles `display`, `titleLarge`, `title`, `body`, `bodyStrong`, `caption`, `label`, and `code`. The `code` role selects the platform system monospace face. React Native font scaling remains enabled; shared text does not set `allowFontScaling={false}` or cap the font-size multiplier. Turkish text is stored in localization files rather than token definitions.

Shape roles are `compact` 8, `control` 12, `card` 20, `sheet` 28, and `pill` 999. Border widths are `subtle` 1 and `strong` 2. The system does not define shadows or elevation because the current shell does not need them.

Motion durations are `immediate` 0 ms, `fast` 120 ms, `normal` 200 ms, and `deliberate` 320 ms. The theme provider reads `AccessibilityInfo.isReduceMotionEnabled()` and listens for `reduceMotionChanged`. With Reduce Motion enabled, all tokenized durations resolve to 0 and decorative entering animation is omitted. Content visibility and state never depend on animation.

## Theme resolution and access

`KuyaraThemeProvider` defaults to the `system` preference and resolves React Native's light, dark, null, and unspecified appearance states. It already accepts `system | light | dark`, so a future persisted Settings value can be supplied without changing token consumers; persistence is not implemented here.

Components read the typed theme with `useKuyaraTheme()`. Expo Router receives a matching React Navigation theme, the active semantic background is used across routes and tabs, and `expo-status-bar` selects light or dark content from the resolved appearance.

Use semantic meaning in presentation code:

```tsx
const theme = useKuyaraTheme();

<View style={{ backgroundColor: theme.colors.surface }}>
  <Text style={{ color: theme.colors.textPrimary }}>...</Text>
</View>;
```

Do not import primitives or select a literal hue in feature code:

```tsx
// Incorrect: feature code couples itself to a palette value.
<View style={{ backgroundColor: brandColors.deepAtmosphere }} />
```

Static non-color scales may be imported for `StyleSheet.create` when that keeps shared styles stable. Theme-dependent colors remain on the resolved theme.

## Platform and accessibility policy

Kuyara identity colors are authored explicitly, so uncontrolled platform colors do not replace them. `PlatformColor` and `DynamicColorIOS` are not currently needed. If a future native control or system surface benefits materially from a platform color, the value must be centralized behind a semantic role with a cross-platform fallback rather than scattered through feature code.

The current provider represents system appearance and Reduce Motion. Shared text preserves Dynamic Type behavior, current pressable headings meet the 44-point minimum target, and collapsibles expose button role, label, and expanded state. Important UI still requires screen-reader, focus-order, large-text, and contrast review as real product screens are implemented.

## Implemented and deferred

Implemented now:

- Approved primitives and authored light/dark semantic colors
- Typed spacing, typography, radii, border, interaction, layout, and motion values
- System-default theme provider with an override-ready preference type
- Reduced-motion resolution and change observation
- Router/navigation and status-bar integration
- Current shared shell and starter screens consuming semantic tokens
- Device-language English/Turkish shell strings
- Focused token, resolver, shell-context, localization, and source-boundary tests

Deferred intentionally:

- Persisted language or appearance settings
- Product-screen components and a component library
- Status tokens and status components
- Platform-color adapters until a concrete native integration needs them
- Shadows or elevation until a real hierarchy requires them
- Android visual refinement and emulator validation; shared React Native code remains build-compatible, but Android was not validated in this task
