# ADR 0030: Settings as a native grouped list

Status: Accepted (2026-09-07)

Implementation: complete. `NativeList`, `NativeListSection`, `NativeListRow`, the Settings
root, and value stacking above `fontScale` 1.5 are implemented. The rendered target sheet,
in English and Turkish, both appearances, the pushed surfaces, denied and unset states,
and three text sizes, is kept outside the repository; the numbers that matter are repeated
here so the decision stands alone.

Builds on: [ADR 0015](0015-gender-and-age-band-in-the-profile.md), whose Settings
placement of personal facts it keeps; [ADR 0019](0019-adopting-expo-ui-at-the-control-layer.md),
whose boundary this screen is the first full exercise of; and
[ADR 0028](0028-the-profile-tab-and-the-list-row-anatomy.md), whose row anatomy it
inherits where the value is kuyara's to set. Dress style and the age boundary are owned by
[ADR 0031](0031-dress-style-is-the-formality-signal.md).

## Context

The design boundary separates what ADR 0019 hands to the platform from what keeps
kuyara's identity, because native grouped lists render in system colours. The reference
is a settings screen with two kuyara-owned elements: sentence-case section headings
outside the native group and a version line as the screen's last element.

## Decision

### 1. The boundary

The root is a native inset grouped list in the system's colours over kuyara's ground,
with the list's own scroll-content background hidden. Kuyara owns the large title colour,
the tint, the ground, the status inks, the section headings, the leading tiles and the
version line. Inside a cell, nothing is kuyara's: label, secondary value, separator,
chevron, toggle and picker are the system's. This makes the system-colour trade visible
rather than hidden. The installed `@expo/ui` 57.0.8 SwiftUI API exposes
`listStyle('insetGrouped')` and `scrollContentBackground('hidden')`; the wrapper uses both
and keeps kuyara's ground visible, as verified on the iPhone 17 Pro / iOS 26.3 Simulator.

### 2. Root groups, in order

1. Language, Appearance; each a value row ("System" / "Sistem") opening a native picker
   with a checkmark.
2. Notifications, a value row ("On" / "Off"); AI status, a plain row; and Privacy, a
   consent-state value row. Each opens its own surface. The Privacy surface is governed by
   [ADR 0033](0033-apple-privacy-obligations-for-first-party-analytics.md).
3. **About you** / **Hakkında**, last and unprominent per ADR 0015 section 7: Gender,
   Dress style, then Birth date. The group footer explains that gender selects the
   catalogue, dress style orders formality, and birth date is optional and does not change
   suggestions. Save errors become this footer's text.

The intro sentence and the dev-only test row are removed.

### 3. The rows take ADR 0028's anatomy

Every root row carries the shared leading tile: 28 × 28, radius 7, a monochrome glyph at
20 in the system label ink, fill from that ink at 8% in light and 12% in dark. The
separator starts 56 from the group edge. The trailing value is the system's secondary
before the chevron, and above `fontScale` 1.5 it stacks under the label. The leading tile
is kuyara's own React Native view hosted inside the native row, so it keeps ADR 0028
section 3's capped control scale exactly as the Profile rows do. Only the system-drawn
text, chevron, and separator use the system's Dynamic Type scaling. Value stacking uses
the same shared hook as the Profile rows.

Section headings are kuyara's: sentence case, `bodyStrong` 17, `textSecondary`, drawn
outside the native group with 12 below before the group and 24 between groups. SwiftUI's
uppercase header never appears. Only About you carries a heading.

### 4. The version line

The last root content element, after the About you footer: centred, `caption` 13 in
`textSecondary`, tabular figures, followed by the trailing `spacing['2xl']`. It is
produced from one localized template key with placeholders, "Version {version} ({build})"
and "Sürüm {version} ({build})", never assembled from fragments. The build number is
EAS-managed and absent from `app.json`; the implementation reads the version and iOS
build number from `expo-constants` and omits unavailable build data cleanly.

### 5. Pushed surfaces

Each opens with a native inline title, a back button labelled "Settings", and grouped
content that can accept additional sections.

- **Notifications**: an "Allow notifications" toggle in the system's own control, tinted
  `brandPrimary`, with a footer. When the system permission is denied the footer text
  changes and an "Open Settings" row is added. This retires the bare `Switch`.
- **AI status**: a first group with the last recommendation's coarse generation mode; a
  second group with the tinted "Check AI status" row, the result row (a monochrome status
  glyph at 20 in the shared tile, words beside it in system secondary), and a footer.
  Provider and model do not appear. The sheet drew a variant that shows them; it is not
  the target, because AGENTS.md, `product-decisions.md`, `architecture.md` and the probe
  contract forbid exposing provider or model identity. Nothing here changes that rule.
- **Privacy**: analytics consent state and withdrawal live on the native grouped-list
  surface decided in ADR 0033. This ADR supplies the list anatomy, not the privacy policy.

### 6. Birth date

The About you group's third row shows the birth date itself, locale-formatted
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
- `Host` follows the device appearance by default, so `Host colorScheme` receives the
  app's resolved theme and keeps native controls aligned with the user's preference.

## Consequences

- **The trade is explicit.** A white system group sits on Soft Mist in light; Profile's
  kuyara-drawn group beside it is a hairline outline. Both are recorded, and the
  difference is the boundary, not a defect.
- **The bare untinted `Switch` and absent version line are absent.** Settings uses the
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

**Provider and model in the probe result.** Not adopted; see section 5.

## Out of scope

- The pushed pickers themselves; nothing about them is kuyara's.
- Android verification.
- Any production code change.
