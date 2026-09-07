# ADR 0030: Settings as a native grouped list

Status: Accepted (2026-09-07)

Implementation: not started. This records an approved design produced by the 2026-09-04
design session and corrected on 2026-09-07 against the list-row reference, with the
version line added the same day. No production code, contract or route was changed to
reach it. The rendered target sheet, in English and Turkish, both appearances, the two
pushed surfaces, denied and unset states and three text sizes, is kept outside the
repository; its "target, in numbers" table is the implementation target.

Builds on: [ADR 0015](0015-gender-and-age-band-in-the-profile.md), whose Settings
placement of gender it keeps; [ADR 0019](0019-adopting-expo-ui-at-the-control-layer.md),
whose boundary this screen is the first full exercise of; and
[ADR 0028](0028-the-profile-tab-and-the-list-row-anatomy.md), whose row anatomy it
inherits where the value is kuyara's to set.

Amends: [ADR 0015](0015-gender-and-age-band-in-the-profile.md) section 2, together with
ADR 0028. The amendment is recorded in ADR 0015 itself.

## Context

Design goal 6 asked where the boundary lies between what ADR 0019 hands to the platform
and what keeps kuyara's identity, given that native grouped lists render in system
colours. The list-row reference adopted on 2026-09-07 was a settings screen, and goal 6
took it as its reference with two decisions carried in rather than reopened: section
headings outside the native group in kuyara's sentence case, and a version line as the
screen's last element.

The shipped Settings draws its own cards, renders the notifications control as a bare
React Native `Switch` in the system's default green, carries an intro sentence and a
dev-only test row, and has no version line.

## Decision

### 1. The boundary

The root is a native inset grouped list in the system's colours over kuyara's ground,
with the list's own scroll-content background hidden. Kuyara owns the large title colour,
the tint, the ground, the status inks, the section headings, the leading tiles and the
version line. Inside a cell, nothing is kuyara's: label, secondary value, separator,
chevron, toggle and picker are the system's. This makes the system-colour trade visible
rather than hidden, which is what goal 6's acceptance asked for.

### 2. Root groups, in order

1. Language, Appearance; each a value row ("System" / "Sistem") opening a native picker
   with a checkmark.
2. Notifications, a value row ("On" / "Off"), and AI status, a plain row; each opens its
   own surface.
3. **About you** / **Hakkında**, last and unprominent per ADR 0015 section 7: Gender, then
   Birth date. The group footer explains that gender selects the catalogue and that the
   birth date is optional and shapes recommendation style. Save errors become this
   footer's text.

The intro sentence and the dev-only test row are removed.

### 3. The rows take ADR 0028's anatomy

Every root row carries the shared leading tile: 28 × 28, radius 7, a monochrome glyph at
20 in the system label ink, fill from that ink at 8% in light and 12% in dark. The
separator starts 56 from the group edge. The trailing value is the system's secondary
before the chevron, and above `fontScale` 1.5 it stacks under the label. Because the
list is the system's to lay out under Dynamic Type, the Profile-only cap on control
scaling does not apply here.

Section headings are kuyara's: sentence case, `bodyStrong` 17, `textPrimary`, drawn
outside the native group with 12 below before the group and 24 between groups. SwiftUI's
uppercase header never appears. Only About you carries a heading.

### 4. The version line

The last root content element, after the About you footer: centred, `caption` 13 in
`textSecondary`, tabular figures, followed by the trailing `spacing['2xl']`. It is
produced from one localized template key with placeholders, "Version {version} ({build})"
and "Sürüm {version} ({build})", never assembled from fragments. The build number is
EAS-managed and absent from `app.json`, so which API reports it at runtime,
`expo-constants` or `expo-application`, is verified at implementation; `expo-application`
would be a new dependency and needs the usual justification.

### 5. The two surfaces

Each opens with a native inline title and a back button labelled "Settings", one group
today, laid out so more groups can be added beneath.

- **Notifications**: an "Allow notifications" toggle in the system's own control, tinted
  `brandPrimary`, with a footer. When the system permission is denied the footer text
  changes and an "Open Settings" row is added. This retires the bare `Switch`.
- **AI status**: a first group with the last recommendation's coarse generation mode; a
  second group with the tinted "Check AI status" row, the result row (a monochrome status
  glyph at 20 in the shared tile, words beside it in system secondary), and a footer.
  Provider and model do not appear. The sheet drew a variant that shows them; it is not
  the target, because AGENTS.md, `product-decisions.md`, `architecture.md` and the probe
  contract forbid exposing provider or model identity, and adopting it would need a
  contract field and rule amendments. Nothing here changes that rule.

### 6. Birth date

The About you group's second row shows the birth date itself, locale-formatted
("14 March 1994" / "14 Mart 1994"), "Not set" / "Ayarlanmadı" when null, and opens the
system date picker. No age category is shown anywhere. This is the ADR 0015 amendment.

### 7. Tint, haptics, motion, theme

- Tint is `brandPrimary` on the toggle, the button rows and the back buttons.
- Haptics: selection on language, appearance and gender change, the sites Law 8 already
  names; native toggles supply their own; none on navigation rows.
- No motion of kuyara's.
- `Host` follows the device appearance by default, so a Light preference on a dark device
  would invert every native control; the spike's finding stands and `Host colorScheme`
  follows the app's resolved theme.

## Consequences

- **The trade is explicit.** A white system group sits on Soft Mist in light; Profile's
  kuyara-drawn group beside it is a hairline outline. Both are recorded, and the
  difference is the boundary, not a defect.
- **Two known issues close with the screen**: the untinted bare `Switch` and the absent
  version line.
- **One prerequisite is not solved here.** The `@expo/ui` `List` / `Button` import group
  terminates the app with no crash report in the spike; isolating it belongs to the
  native port spike, design goal 7, and nothing here assumes it is done. Amended 2026-09-07: Isolated on 2026-09-07 on the iPhone 17 Pro / iOS 26.3 Simulator with five probe screens swapped into the Settings route: importing the group does not crash; `List` and `ListItem` render; `Button` with the `label` prop renders; `Button` given string children terminates the app with an `NSInternalInconsistencyException` from `RCTComponentViewFactory`, "ComponentView with componentHandle (`RawText`) not found", because Fabric has no `RawText` view to mount inside a SwiftUI host. A crash report is written after all (`kuyara-2026-09-07-175305.ips`). `ListItem` takes a plain string or an `@expo/ui` `Text` as its headline, `supportingText`, an `@expo/ui` `Text` in `trailing`, and an `RNHostView` in `leading` holding kuyara's own 28 by 28 tile with a tinted PNG glyph, which verifies list-row check 2 at runtime. A React Native `Text` placed directly in a slot does not crash but breaks the row layout; the rule is that slot content is `@expo/ui` components or an `RNHostView`, never bare React Native views or strings on `Button`.
- **Android renders the same components as Jetpack Compose** and is not drawn, as with
  every other sheet; ADR 0019 records Android as unverified.
- **Whether a separate "Saving…" line survives** is decided at implementation against the
  real component, which shows its own progress.

## Alternatives considered

**Keeping kuyara-drawn cards for Settings.** Rejected: it keeps the screen outside
ADR 0019's boundary, keeps the untinted `Switch`, and makes the third list-shaped screen
the one that does not take the platform's list.

**Native section headers with increased prominence, inside the group.** Rejected on
2026-09-07: they render in the system's ink and metrics, and the list-row reference showed
that a sentence-case heading outside the group reads as the product's rather than the
platform's.

**Provider and model in the probe result.** Not adopted; see section 5.

## Out of scope

- The `@expo/ui` crash isolation (done afterwards, 2026-09-07; see the amended consequence above).
- The pushed pickers themselves; nothing about them is kuyara's.
- Android verification.
- Any production code change.
