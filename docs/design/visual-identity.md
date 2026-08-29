# kuyara visual identity

## Status and scope

This document is the canonical reference for kuyara branding and the visual intent of product UI and UX. Read it before changing themes, icons, illustrations, animation, splash screens, branded surfaces, or other presentation decisions.

The decisions below are approved constraints. They describe design intent and acceptance criteria; they do not imply that semantic design tokens, components, or every platform asset have been implemented. When implementation and this document conflict, report the conflict instead of silently choosing or redefining the identity.

The current implementation details for semantic tokens and theme consumption are documented in [`design-system.md`](design-system.md).

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

Visual work should communicate this idea through calm structure, relationships, and rhythm rather than literal weather or clothing illustrations.

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

## Typography

- Application UI uses platform-appropriate system fonts.
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

Avoid photorealistic 3D clothing, plastic characters, AI sparkle aesthetics, fantasy mythology, and overly playful mascot styles. Garment and wardrobe imagery should prioritize recognizability and color accuracy over decorative brand effects.

## Motion

Motion must be restrained, functional, and calm. Use it for hierarchy, feedback, and state transitions, and ensure that critical information remains understandable without motion.

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

Important UI should be reviewed in Turkish and English, in light and dark themes, with larger text settings, with a screen reader, and with Reduced Motion enabled.
