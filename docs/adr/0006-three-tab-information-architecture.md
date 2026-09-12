# ADR 0006: Three primary tabs, with Closet and Settings inside Profile

Status: Accepted (2026-08-30)

Implementation: Complete. Three tabs are live: Today at `/`, Weather at
`/weather`, and Profile at `/profile`. Closet and Settings are
stack destinations reached from the Profile tab; Settings opens from an icon
in the Profile header. The wanted list is a filter on the Closet list
rather than a separate screen, matching the rejected alternative below.

## Context

The Closet is a personal record and does not supply recommendation candidates;
[ADR 0005](0005-catalog-only-recommendation-candidates.md) keeps recommendations
catalog-only. It therefore does not need the prominence of a primary tab.
Settings is likewise a utility destination rather than a daily primary task.

## Decision

The main application has three primary tabs:

- Today at `/`.
- Weather at `/weather`.
- Profile at `/profile`.

The Closet and the wanted list live inside Profile. The English user-facing label is
**Closet** and the Turkish label is **Gardırop**. The internal domain name, SQLite tables,
route segment, localization keys, repository types, file names, and test ids remain
`wardrobe`; do not rename them for terminology alone. Settings opens from an icon in the
Profile header and is not a tab.

Gender and dress style are required, prominent onboarding inputs because they shape the
catalogue selection and formality order. Their Settings controls live in the last,
deliberately unprominent About you group. Birth date is optional; language and appearance
follow the device by default and remain changeable in Settings. The profile fields are
decided in [ADR 0031](0031-dress-style-is-the-formality-signal.md).

Expo Router Native Tabs implements the tab bar under
[ADR 0012](0012-adopting-expo-router-native-tabs.md). The onboarding gate and
platform-adaptive, localized, accessible tab presentation remain unchanged in principle.

## Consequences

- Primary navigation contains exactly three destinations.
- The Closet is less discoverable because it sits behind Profile. This is an
  accepted cost of matching navigation prominence to its personal-record role.
- Settings is less prominent but remains reachable from the Profile header.
- Closet and Settings route placement, deep links, navigation tests, and tab-bar
  expectations follow the Profile nesting.
- Gender and dress style have different prominence by context: required in
  onboarding, deliberately secondary in Settings.

## Alternatives considered

- **Keep the four-tab information architecture.** Rejected because it preserves
  primary prominence for a Closet that does not shape recommendations.
- **Keep Settings as a tab and move only the Closet.** Rejected because Settings is
  not a primary daily destination and Profile provides a conventional home for
  it.
- **Add a separate wanted-list tab or screen.** Rejected because `owned | wanted`
  is one Wardrobe state, not a second product area.

## Out of scope

- The native tab-bar implementation, governed by
  [ADR 0012](0012-adopting-expo-router-native-tabs.md).
- Redesigning visual identity, tab icons, or shared navigation primitives.
- Changing the onboarding gate or adding account navigation.
