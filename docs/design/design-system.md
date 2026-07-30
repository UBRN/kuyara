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

- `AppText` supports the existing `display`, `titleLarge`, `title`, `body`, `bodyStrong`, `caption`, `label`, and `code` typography roles plus typed semantic color roles. Font scaling is enabled by default, normal `Text` props are forwarded, and content is not truncated implicitly. At accessibility sizes it releases authored line heights so native text can grow without clipping. Feature compositions remain responsible for choosing a smaller semantic heading role when an oversized display treatment no longer fits.
- `Screen` is the shared scrollable page foundation used by the checked-in route. It applies the semantic application background, safe-area insets, page padding, and the current maximum content width. A non-scrollable or keyboard-specific screen API is deferred until a checked-in flow requires it.
- `Surface` provides only `default`, `muted`, `elevated`, and `interactive` semantic variants. It uses semantic surface and border roles with the approved card radius; `elevated` denotes hierarchy without inventing a shadow token.
- `Button` provides `primary`, `secondary`, and `quiet` variants. The required visible `label` keeps localized text at the call site. Loading preserves label width, blocks activation, shows progress, and exposes busy and disabled accessibility state.
- `IconButton` requires an `accessibilityLabel` at the type boundary, accepts an optional standard accessibility hint through React Native props, owns the 44-point target, and receives icon content as a render function with the resolved semantic icon color. It does not select an icon system or glyph.
- `SectionHeader` composes a heading, optional supporting text, and optional trailing action. It changes to a stacked layout at large text sizes so the action does not compress the heading.

The checked-in Today feature is the first product composition over the primitives. Its route uses `Screen`, `AppText`, `Surface`, and `SectionHeader`; feature-specific weather and outfit components own their product semantics rather than widening the generic primitive API. The former Home and Explore demonstrations and their tab scaffold have been removed from the product route tree. Focused primitive tests preserve coverage for `Button` and `IconButton` even though Today intentionally has no interaction.

Semantic tokens and primitives have different responsibilities. Tokens name visual roles and scales; primitives turn those roles into small accessibility and interaction contracts. Feature code remains responsible for localized content, layout composition, user intent, and domain-specific behavior. It may use raw React Native layout views where no semantic surface or control is intended.

Primitive APIs favor composition, a small variant union, and standard React Native props over arbitrary colors, numeric typography configuration, spacing props, or collections of styling booleans. New variants or primitives require a current product use rather than speculative completeness.

## Platform and accessibility policy

Kuyara identity colors are authored explicitly, so uncontrolled platform colors do not replace them. `PlatformColor` and `DynamicColorIOS` are not currently needed. If a future native control or system surface benefits materially from a platform color, the value must be centralized behind a semantic role with a cross-platform fallback rather than scattered through feature code.

The current provider represents system appearance and Reduce Motion. `AppText` preserves Dynamic Type behavior. Buttons expose button role, accessible name, disabled state, and busy state; icon-only buttons require a label; section titles expose heading semantics; interactive primitives use at least a 44-point target and a semantic focus ring. Labels can wrap, loading does not collapse button width, and control state is conveyed through accessibility metadata in addition to visual feedback.

Press feedback is an immediate opacity or semantic-background change, not a decorative animation, so it remains responsive with Reduce Motion enabled. Existing collapsible content omits its fade when Reduce Motion is on. VoiceOver focus order follows source order: section heading, localized expand/collapse button, then expanded content. Accessibility hints are left to call sites and should only be supplied when the action result is not clear from its label.

## Implemented and deferred

Implemented now:

- Approved primitives and authored light/dark semantic colors
- Typed spacing, typography, radii, border, interaction, layout, and motion values
- System-default theme provider with an override-ready preference type
- Reduced-motion resolution and change observation
- Router/navigation and status-bar integration
- Typed adaptive UI primitives over the semantic tokens
- A single-screen Expo Router shell that can later be wrapped by final product navigation
- Device-language English/Turkish Today strings and locale-aware fixed-date formatting
- The deterministic Today loaded-state composition with a concise weather summary, immediate guidance, and exactly three vertically discoverable outfit cards
- Loading, unavailable, and stale-loaded Today presentation contracts
- Large-text reflow in weather metrics and outfit item rows, grouped screen-reader descriptions, and a motion-independent Today layout
- Focused token, primitive-contract, interaction, shell-context, localization, and source-boundary tests

Deferred intentionally:

- Persisted language or appearance settings
- Final tab navigation, onboarding, and Settings UI
- SQLite, Worker, WeatherKit, location, AI, wardrobe ownership, and deterministic recommendation-engine integration
- Text inputs, selectors, switches, modal or feedback frameworks, and product-specific components
- Divider, because the current shell has no repeated separator need
- Destructive button styling, because no checked-in flow justifies it
- Non-scrollable and keyboard-specific screen behavior until a checked-in flow requires either
- Status tokens and status components
- Platform-color adapters until a concrete native integration needs them
- Shadows or elevation until a real hierarchy requires them
- Android visual refinement and emulator validation; shared React Native code remains build-compatible, but Android was not validated in this task

The final product navigation decision remains separate. The current root uses a stable single-screen Expo Router Stack only to host Today; it does not add product tabs, placeholders, or a custom tab bar. Android source compatibility is preserved, but Android build, emulator, and visual refinement remain unverified and deferred.
