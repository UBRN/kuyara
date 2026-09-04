# kuyara visual identity

## Status and scope

This document is the canonical reference for kuyara branding and the visual intent of product UI and UX. Read it before changing themes, icons, illustrations, animation, splash screens, branded surfaces, or other presentation decisions.

The decisions below are approved constraints. They describe design intent and acceptance criteria; they do not imply that semantic design tokens, components, or every platform asset have been implemented. When implementation and this document conflict, report the conflict instead of silently choosing or redefining the identity.

The current implementation details for semantic tokens and theme consumption are documented in [`design-system.md`](design-system.md). [`design-language.md`](design-language.md) sits between the two: this document states intent, `design-language.md` turns that intent into concrete rules for density, hierarchy, colour, iconography, and motion, and `design-system.md` implements those rules as tokens and primitives.

## Brand foundation

### Name

The official spelling is always lowercase: `kuyara`. Preserve the lowercase spelling in prose, headings, asset descriptions, and UI references unless an external platform requires another format.

### Product role

kuyara is a calm, practical, weather-aware outfit guide. Weather is an input; the primary user-facing outcome is deciding what to wear.

The product should reduce the mental effort required to interpret weather conditions and assemble an outfit. It must not require fashion expertise or position itself as a fashion critic.

### Core feeling

- Calm confidence
- Natural and tranquil
- Modern
- Practical
- Minimal
- Friendly and supportive
- Age-independent and universal

### Communication character

Write as a friendly guide: clear, warm, brief, helpful, and non-judgmental. The voice must not be childish, overly familiar, critical of the user's fashion choices, or written like a technical AI assistant.

### Primary experience difference

kuyara turns complicated weather and clothing choices into a calm, simple, low-effort daily decision.

### Avoided impressions

The product must not resemble:

- A conventional weather application
- An AI assistant product or technology startup
- Enterprise, corporate banking, crypto, fintech, cloud, or database software
- A luxury fashion label
- A wellness or healthcare application
- An environmental organization
- A children's application
- A fantasy game or folkloric product
- A futuristic neon interface

## Brand story: layers and harmony

The central visual idea is **layers and harmony**. It connects:

- Atmospheric layers
- Clothing layers
- Harmony among outfit pieces
- Adaptation to changing conditions
- Personal preferences meeting environmental conditions
- Several inputs becoming one simple recommendation

Visual work should communicate this idea through calm structure, relationships, and rhythm rather than literal weather illustration.

The clothing half of that restriction was withdrawn by [ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md). Simple garment illustration is now part of the language and is the visual subject of Today: the user should see the outfit before reading it. The weather half stands, and there is no literal sky photography or illustrated weather scene.

## Mythological influence

The identity may contain a subtle contemporary influence from ancient Turkic ideas of sky, cosmic order, balance, rhythm, or layered structure. This influence must remain respectful, modern, universal, and understandable without knowing the backstory.

It must not:

- Copy a historical tamga or other symbol
- Claim historical authenticity
- Appear religious, political, or nationalist
- Use traditional ornament as decoration
- Look folkloric, touristic, or like fantasy game artwork

## Approved master symbol

The approved symbol is **Balanced Horizon — V2: Unified Gap System**, developed from the Purposeful Asymmetry direction. Its three related layers resolve into one calm, coordinated structure.

The geometry has these approved properties:

- Exactly three primary solid pieces
- A coherent negative-space gap system separating the pieces
- A structurally necessary center piece that is intentionally right-shifted
- Purposeful but restrained asymmetry
- Small-size and monochrome clarity
- A compact, balanced relationship among all three pieces

The upper layer represents environmental conditions, the center reconciles multiple inputs into a decision, and the lower layer represents the clothing-and-preference foundation. The form must remain abstract and must not be reinterpreted as literal weather or clothing imagery.

The approved path coordinates, path ordering, viewBox, and optical position must not be silently altered, redrawn, normalized, centered, or replaced. Any proposed geometry change requires explicit design approval and must be treated as a new review, not a routine export adjustment.

The permanent editable repository master is:

`apps/mobile/assets/brand/kuyara-symbol-master.svg`

## Approved palette

| Color | Value | Intended role |
| --- | --- | --- |
| Deep Atmosphere | `#142F3B` | Core deep navy; primary identity anchor and light-icon gradient endpoint |
| Calm Current | `#27606A` | Soft petrol; secondary identity anchor and gradient endpoint |
| Quiet Sky | `#9FC9D5` | Restrained cool accent and selected dark-appearance foreground direction |
| Soft Mist | `#F4F6F5` | Primary light neutral and light-surface direction |
| Night Layer | `#0D191E` | Primary dark surface and dark-background direction |
| Cloud White | `#EFF4F3` | Softened light foreground and high-contrast symbol direction |

Deep Atmosphere and Calm Current form the main navy-to-petrol identity. Quiet Sky is an accent, not a dominant technology blue. Soft Mist, Night Layer, and Cloud White provide calm light and dark foundations without relying on pure black or harsh white.

Neon cyan, glow, glassy gradients, rainbow gradients, and highly saturated technology colors are prohibited. Feature UI consumes the existing semantic tokens and must not scatter hardcoded brand values through components.

This prohibition was narrowed once, by [ADR 0018](../adr/0018-the-atmospheric-condition-band.md). A **two-stop tonal interpolation between two approved palette values** is permitted where the ground carries the current weather on Today and Weather. [ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md) later moved that ground from a full-width band at the top of the screen to the tint of the surface the garment composition sits on; the permission and its bounds are unchanged, only the shape. Every other gradient remains prohibited, glass, glow, rainbow and saturated technology gradients included, and the permitted band is bounded by recorded contrast measurements rather than by taste. The narrowing exists because a whole-page weather tint was measured to be arithmetically unavailable in the light appearance: the usable ground band there is nine of 255 grey levels, squeezed between the card above it and secondary text and control borders below it.

`#FFFFFF` is permitted as a light-theme surface and card color, approved in [ADR 0008](../adr/0008-expanding-the-visual-vocabulary-for-m6-1.md). It is a neutral surface value, not a new brand hue: the six approved brand hexes above and the Balanced Horizon V2 master geometry remain locked and unchanged.

The palette was further extended with derived semantic status values, success, warning, and danger ink and container pairs plus a `borderDefined` neutral, approved in [ADR 0010](../adr/0010-status-colours-destructive-variant-and-defined-borders.md) and detailed in [`design-language.md`](design-language.md#law-4-one-accent-and-a-status-band). These are not new brand colors: the six approved brand hexes above and the Balanced Horizon V2 master geometry remain locked and unchanged.

[ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md) changed how the palette is allocated rather than what it contains. The light page ground rises to Soft Mist, supporting text becomes a derived neutral instead of Calm Current, and Calm Current becomes a selective accent rather than the default supporting ink. Colour is spent on the garments and on the weather tint behind them; interface text carries as little of it as the hierarchy allows. The six approved hexes are still the only brand colours.

## Typography

- Application UI uses platform-appropriate system fonts. The semantic type scale and its retuning are recorded in [`design-system.md`](design-system.md) and [ADR 0017](../adr/0017-a-retuned-typography-scale.md).
- No custom application font is required for the MVP.
- A custom lowercase `kuyara` wordmark may be developed and approved separately.
- The app icon must not contain text, initials, or a hidden `k`.
- Typography must support Turkish characters, text scaling, accessibility settings, and platform-native behavior.

## Platform-adaptive UI

The product identity and information architecture are shared, but iOS and Android must not be forced into a pixel-identical interface.

### iOS

- Follow current Apple Human Interface Guidelines.
- Use supported Liquid Glass behavior sparingly, primarily for navigation and interactive control layers.
- Do not turn every card or content surface into glass.
- Preserve native-feeling navigation, sheets, gestures, scrolling, transitions, haptics, and accessibility behavior.
- Provide graceful fallbacks for unsupported platform versions.

### Android

- Follow current Material 3 and Material 3 Expressive guidance.
- Use platform-native navigation, back behavior, controls, motion, ripple, haptics, and accessibility behavior.
- Do not imitate Apple Liquid Glass.
- Express the same kuyara identity using Material semantics.

## Application icon

The production icon derives from the approved V2 repository master and follows these principles:

- Restrained navy-to-petrol full-bleed background
- One flat foreground symbol
- No text, initials, monogram, or hidden `k`
- No baked rounded corners or platform mask
- No border, glow, texture, shadow, glass, or 3D effect
- Geometry viable for iOS tinted and Android monochrome appearances
- Separable foreground and background for Android adaptive icons
- Operating-system ownership of the final platform mask

The full-color app icon, Android monochrome layer, and splash symbol are related exports with different platform roles. They are not interchangeable source systems, and none may silently modify the master geometry.

## Splash screen

The approved MVP splash direction is:

- Flat background
- Centered symbol only
- No wordmark or other text
- No animation
- No second branded launch screen
- Separate light and dark treatments
- A fast transition into the first application screen

The splash screen should establish continuity without delaying the user's decision or presenting a second marketing experience.

## In-app icons and illustration

The app icon and interface icons are separate systems. Prefer platform-native icon systems where they clearly express the required action or concept. Reserve custom icons for kuyara-specific concepts that platform libraries cannot represent well.

Custom interface icons should use clean forms, softened corners, moderate weight, and reliable small-size clarity. Illustrations should be minimal, geometric, lightly editorial, and limited in color.

Avoid photorealistic 3D clothing, plastic characters, AI sparkle aesthetics, fantasy mythology, and overly playful mascot styles. Garment and closet imagery should prioritize recognizability and color accuracy over decorative brand effects.

### Garment silhouettes

Approved by [ADR 0021](../adr/0021-direction-e-a-visual-first-design-language.md). A small set of simple line silhouettes represents the common garment types. One stroke weight at every rendered size, one optical size, no ornament beyond the single detail that identifies a type. A garment with no specific silhouette falls back to its structural category, so a composition degrades to six shapes rather than breaking; complete per-type artwork is not required and is not built speculatively.

The silhouette is a slot in the composition, not an asset the composition depends on. A later version may render the same slot as richer illustration, catalogue artwork, a product image, or the user's own Closet photograph, without redesigning the information hierarchy.

## Motion

Motion must be restrained, functional, and calm. Use it for hierarchy, feedback, and state transitions, and ensure that critical information remains understandable without motion. Continuous and repeating motion is permitted where it supports the weather atmosphere, state, hierarchy, feedback, or product character, per [ADR 0020](../adr/0020-rewriting-the-motion-law.md) and [`design-language.md`](design-language.md#law-7-motion); it must never be the only indication of a state change, must not sit under a screen's hero value, and must respect Reduced Motion.

Reduce or remove motion when Reduced Motion is enabled. Avoid constant decorative animation and transitions that delay the user's decision.

## Accessibility acceptance requirements

UI work is not complete until it considers:

- Text scaling and resilient layouts
- Meaningful screen-reader semantics and logical focus order
- Sufficient contrast in light and dark themes
- Adequate touch-target sizes
- Reduced Motion behavior
- Information that does not depend on color alone
- Turkish and English content and layout behavior
- Small-size icon legibility

These are product requirements, kept in routine development by the automated checks in `AGENTS.md`. The granular manual pass with a screen reader, Reduced Motion, and the largest text settings is risk-based rather than routine; `AGENTS.md` names the cases that call for it.
