# ADR 0006: Three primary tabs, with Wardrobe and Settings inside Profile

Status: Accepted (2026-08-30)

Implementation: Complete (milestone 6). Three tabs are live: Today at `/`,
Weather at `/weather`, and Profile at `/profile`. Wardrobe and Settings are
stack destinations reached from the Profile tab; Settings opens from an icon
in the Profile header. The wanted list is a filter on the wardrobe list
rather than a separate screen, matching the rejected alternative below.

## Context

The four-tab information architecture was previously recorded as final: Today,
Weather, Wardrobe, and Settings. Wardrobe held a primary tab because it was the
only user-controlled source that personalized recommendations.

ADR 0005 removes Wardrobe items from the recommendation candidate set. Wardrobe
is now a personal record, so its former reason for primary navigation placement
no longer exists. Settings is also a utility destination rather than a daily
primary task.

## Decision

The main application has three primary tabs:

- Today at `/`.
- Weather at `/weather`.
- Profile at `/profile`.

Wardrobe and the wanted list live inside Profile. Settings opens from an icon in
the Profile header and is not a tab.

Amended 2026-09-03: the English user-facing label for that destination is **Closet**, not
Wardrobe. Turkish is unchanged at **Gardırop**. The structure this ADR decided is
untouched; only the word changes. The internal domain name, the SQLite tables, the route
segment and the repository types remain `wardrobe` until a separate rename, so the label
change is a localization and documentation change rather than a refactor.

Implementation of that label change: not started. The English strings in
`apps/mobile/src/localization/messages.ts` still read "Wardrobe".

Clothing preference is the only user input that shapes recommendations. It
remains a prominent, required onboarding step. In Settings it is the last
section and is deliberately not prominent.

Expo Router's stable JavaScript Tabs remain the navigation implementation. The
onboarding gate and platform-adaptive, localized, accessible tab presentation
remain unchanged in principle.

## Consequences

- Primary navigation is reduced from four destinations to three.
- Wardrobe is less discoverable because it moves behind Profile. This is an
  accepted cost of matching navigation prominence to its personal-record role.
- Settings is less prominent but remains reachable from the Profile header.
- Existing Wardrobe and Settings route placement, deep links, navigation tests,
  and tab-bar expectations must change during implementation.
- Clothing preference has different prominence by context: required in
  onboarding, deliberately secondary in Settings.

## Alternatives considered

- **Keep the four-tab information architecture.** Rejected because it preserves
  primary prominence for a Wardrobe that no longer shapes recommendations.
- **Keep Settings as a tab and move only Wardrobe.** Rejected because Settings is
  not a primary daily destination and Profile provides a conventional home for
  it.
- **Add a separate wanted-list tab or screen.** Rejected because `owned | wanted`
  is one Wardrobe state, not a second product area.

## Out of scope

- Migrating from JavaScript Tabs to Native Tabs. This option is since taken up
  separately; see [ADR 0012](0012-adopting-expo-router-native-tabs.md). The
  three-tab architecture decided here is unchanged by that migration.
- Redesigning visual identity, tab icons, or shared navigation primitives.
- Changing the onboarding gate or adding account navigation.

## Note (2026-09-03)

[ADR 0015](0015-gender-and-age-band-in-the-profile.md) removes the onboarding
language and appearance step; both now follow the device default and stay
changeable in Settings. It also renames the onboarding/Settings preference from
clothing preference to gender. This ADR's three-tab decision and its rule about
that control's prominence (required and prominent in onboarding, last and
unprominent in Settings) are unaffected.
