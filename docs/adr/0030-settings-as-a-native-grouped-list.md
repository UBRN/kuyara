# ADR 0030: Settings as a native grouped list

Status: Accepted (2026-09-07)

Builds on: [ADR 0015](0015-gender-and-age-band-in-the-profile.md), whose Settings
placement of personal facts it keeps; [ADR 0019](0019-adopting-expo-ui-at-the-control-layer.md),
whose boundary this screen is the first full exercise of; and
[ADR 0028](0028-the-profile-tab-and-the-list-row-anatomy.md), whose row anatomy it
inherits where the value is kuyara's to set. Dress style and the age boundary are owned by
[ADR 0031](0031-dress-style-is-the-formality-signal.md).

## Context

The design boundary separates what ADR 0019 hands to the platform from what keeps
kuyara's identity, because native grouped lists render in system colours. The reference
is a settings screen with sentence-case section headings outside the native
group and a centred brand name above the version line as the last element.

## Decision

### 1. The boundary

The root is a native inset grouped list in the system's colours over kuyara's ground,
with the list's own scroll-content background hidden. Kuyara owns the large title colour,
the tint, the ground, the status inks, the section headings, the leading tiles and the
brand and version footer. Inside a cell, the leading tile is kuyara's; label, secondary value, separator,
chevron, toggle and picker are the system's. This makes the system-colour trade visible
rather than hidden. The installed `@expo/ui` 57.0.8 SwiftUI API exposes
`listStyle('insetGrouped')` and `scrollContentBackground('hidden')`; the wrapper uses both
and keeps kuyara's ground visible, as verified on the iPhone 17 Pro / iOS 26.3 Simulator.

### 2. Root groups, in order

1. **Appearance:** Language and theme, each a value row opening the native picker.
2. **Notifications:** the notification preference and its pushed surface.
3. **Profile:** display name, gender, dress style, style aesthetics and birth date. The `aboutYouFooter` helper text under birth date is removed. This foundation permits an Account group above Profile when optional accounts arrive.
4. **Help:** Support, Share kuyara and Rate kuyara.
5. **Accessibility:** one "Easier to see" / "Görme kolaylığı" switch. It follows iOS Bold Text and Increase Contrast, enlarges the garment board by 1.3, enlarges targets, and keeps the preview card.
6. **About:** Service providers, Privacy and Licence.
7. The centred version and build footer.

Native inset groups and ADR 0028's row anatomy stay. Inside native cells the system owns typography and colour; the app-owned `kuyara` footer uses the display role and Deep Atmosphere in light or Quiet Sky in dark. It fits on one line at the largest accessibility text size. The name is not a custom wordmark.

Share kuyara opens the platform share sheet with the App Store link on iOS or Play link on Android and short localized text in the sharer's voice. Rate kuyara opens the store review page directly (`?action=write-review` on iOS, `market://details?id=` on Android), and its row shows five filled system-grey stars at 13 points. No in-app review request is used. **Risk accepted:** the star treatment trades against Apple 5.6.1 and Google in-app review guidance on steering.

### 3. The rows take ADR 0028's anatomy

Every root row carries the shared leading tile:
28 × 28, radius 7, a monochrome glyph at 20 in the system label ink, fill from that ink
at 8% in light and 12% in dark. Language, Appearance, Gender and Dress style use a hosted leading tile beside their Picker labels. Every tile follows the same anatomy. The separator starts 56 from the group
edge. The trailing value is the system's secondary before the chevron, and above
`fontScale` 1.5 it stacks under the label. The leading tile is kuyara's own React Native
view hosted inside the native row, so it keeps ADR 0028 section 3's capped control scale
exactly as the Profile rows do. Only the system-drawn text, chevron, and separator use the
system's Dynamic Type scaling. Value stacking uses the same shared hook as the Profile
rows.

Section headings are kuyara's: sentence case, `bodyStrong` 17, `textSecondary`, drawn
outside the native group with 12 below before the group and 24 between groups. SwiftUI's
uppercase header never appears. Each of the six root groups carries its sentence-case heading.

### 4. The version line

The last root content element, after the About group: a centred `kuyara` name in
the display role and brand colour, then the version line in `caption` 13,
`textSecondary`, tabular figures, followed by trailing `spacing['2xl']`. It is
produced from one localized template key with placeholders, "Version {version} ({build})"
and "Sürüm {version} ({build})", never assembled from fragments. The build number is
EAS-managed and absent from `app.json`; the implementation reads the version and iOS
build number from `expo-constants` and omits unavailable build data cleanly.

### 5. Remaining pushed surfaces

Notifications, Service providers, Privacy and Birth date use native inline titles, back buttons and grouped content. The preference Pickers remain on the root list.

- **Notifications:** preferences use system controls, with denied-permission explanation and a way into system Settings.
- **Service providers:** the Artificial intelligence section first shows the system's rendering of the `apple.intelligence` SF Symbol and status in words, a status colour and shape: green `checkmark.circle` for compatible and running, yellow `pause.circle` for turned off, grey `xmark.circle` for not compatible. Its second row reads "Last recommendation: on this device / cloud / standard". A short explanation and the bounded active-probe row follow. The Weather data section names the provider behind the last valid snapshot and carries its full mark, text, link and OpenWeather logo as applicable. Only this surface may show the controlled, non-secret last-check provider and model ID. **Risk accepted:** Apple has not publicly answered whether a third party may show `apple.intelligence`; the Apple Intelligence word mark stays referential and is never the only status signal.
- **Privacy:** analytics consent and withdrawal use the native grouped surface decided in ADR 0033.

### 6. Birth date

The Profile group's birth-date row shows the birth date itself, locale-formatted
("14 March 1994" / "14 Mart 1994"), "Not set" / "Ayarlanmadı" when null, and opens the
system date picker. No age category is shown anywhere, and changing the date triggers no
recommendation behavior.

### 7. Tint, haptics, motion, theme

- Tint is `brandPrimary` on the toggle, the button rows and the back buttons. The
  installed `@expo/ui` 57.0.8 SwiftUI API exposes `tint`, so the wrapper applies it to
  the list and toggle; this is verified on the iPhone 17 Pro / iOS 26.3 Simulator.
- Haptics: selection on language, appearance, gender, and dress-style changes, the sites
  Law 8 already names; native toggles supply their own; none on navigation rows.
- No motion of kuyara's.
- `KuyaraThemeProvider` applies the in-app appearance override through React Native's
  `Appearance`, and `Host colorScheme` also receives the app's resolved theme so native
  controls stay aligned with the user's preference. Native alerts (`Alert.alert`) do not
  inherit that override, since their alert window is not one `Appearance.setColorScheme`
  reaches; the wardrobe confirmation presenter passes the resolved scheme explicitly as
  `userInterfaceStyle` so the alert renders in the user's chosen appearance.

## Consequences

- **The trade is explicit.** A white system group sits on Soft Mist in light; Profile's
  kuyara-drawn group beside it is a hairline outline. Both are recorded, and the
  difference is the boundary, not a defect.
- **The root uses native controls and a localized version line.** Settings uses the
  native wrapper and renders the localized version line.
- **Runtime isolation defines safe native slots.** Importing `List` and `Button` does not
  crash; `List` and `ListItem` render; `Button` with the `label` prop renders. String
  children on `Button` terminate the app with an `NSInternalInconsistencyException`
  because Fabric has no `RawText` view inside the SwiftUI host. `ListItem` accepts a plain
  string or `@expo/ui` `Text` as its headline, `supportingText`, `@expo/ui` `Text` in
  `trailing`, and an `RNHostView` in `leading`. Bare React Native views in slots are
  forbidden because they break row layout.
- **Android renders the same components as Jetpack Compose** and is not drawn, as with
  every other sheet; ADR 0019 records Android as unverified.
- **Saving feedback belongs to the real component.** Do not add a separate line when the
  component already shows progress.

## Alternatives considered

**Keeping kuyara-drawn cards for Settings.** Rejected: it keeps the screen outside
ADR 0019's boundary, keeps the untinted `Switch`, and makes the third list-shaped screen
the one that does not take the platform's list.

**Native section headers with increased prominence, inside the group.** Rejected: they
render in the system's ink and metrics, and the list-row reference shows
that a sentence-case heading outside the group reads as the product's rather than the
platform's.

**Provider and model outside Service providers.** Rejected; section 5 keeps technical identity on that one surface.

## Out of scope

- Android verification.
