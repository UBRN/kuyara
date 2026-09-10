# Current Project Status

This file carries only today's state, the active and approved work, the release
blockers, and the open verification gaps. Completed work lives in Git history and in the
ADR that decided it; product decisions live in [`product-decisions.md`](product-decisions.md).

## Current State

- **Mobile:** Expo SDK 57, React Native, Expo Router and Expo SQLite (schema version 12)
  provide an accountless five-step onboarding flow (welcome, gender, dress style, birth
  date, optional location); three primary tabs, Today, Weather and Profile, drawn by Expo
  Router Native Tabs, with the Closet and Settings as Profile stack destinations; private
  Closet photos; Turkish and English; System/Light/Dark appearance; and semantic haptics
  at the six sites the design language names. The minimum supported iOS is 26.0.
- **Weather:** Mobile preserves the last valid snapshot, refreshes data older than 30
  minutes, and reaches providers only through the Worker. The chain is WeatherKit,
  Open-Meteo, then OpenWeather, with bounded attempts, runtime validation, attribution,
  rate limiting and a best-effort OpenWeather daily cap. Location comes from the foreground
  device flow or the native `/weather/location` picker over the Worker's place-search
  route. The deterministic sample provider is test-only.
- **Recommendations:** The deterministic layer composes at most 24 valid outfits from the
  bundled catalog (version 3); the Worker's AI chain, Workers AI then OpenRouter, selects
  three and labels each with an archetype; mobile validates, persists and falls back to a
  device-local deterministic generator. Generation triggers compare current signals with
  the persisted snapshot. Only the coarse generation mode is exposed, and Settings carries
  the bounded active AI probe.
- **Notifications:** on-device local weather alerts only ([ADR 0032](adr/0032-local-weather-alert-rules.md)):
  opt-in in Settings, deterministic precipitation-onset and temperature-swing rules, a
  delivery ledger, rescheduling on every persisted snapshot and on opt-in, permission and
  language changes, and a best-effort `expo-background-task` refresh. No server, no push.
- **Analytics:** the `ProductAnalytics` boundary, typed twenty-three-event catalog,
  error-episode and retry trackers, consent-gated PostHog adapter, first-launch consent
  sheet and Settings Privacy surface are implemented. Consent is profile-owned in schema
  version 12; absent configuration uses the no-op adapter (a logging adapter in
  development). Phase 3 landed the taxonomy's feature call sites on 2026-09-10, so every
  approved event is emittable except `error_shown` on the `settings` and `onboarding`
  surfaces, which have no failure classification to observe yet. See
  [ADR 0023](adr/0023-behavioural-product-analytics-with-posthog.md) and
  [ADR 0033](adr/0033-apple-privacy-obligations-for-first-party-analytics.md).
- **Design:** Direction E ([ADR 0021](adr/0021-direction-e-a-visual-first-design-language.md))
  is implemented on every surface: Today's garment board and the Direction E tokens,
  the recommendation detail surface ([ADR 0026](adr/0026-the-recommendation-detail-surface.md)
  decisions 1 to 6), the app shell fixes ([ADR 0027](adr/0027-the-app-shell-and-its-three-tabs.md)),
  Profile, the Closet and Settings on the shared list-row anatomy
  ([ADR 0028](adr/0028-the-profile-tab-and-the-list-row-anatomy.md),
  [ADR 0029](adr/0029-the-closet-grid.md), [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md)),
  and the accessibility validation pass over the shipped app with its eight in-app
  follow-ups closed.
- **Builds:** iOS is the first release target. EAS production credentials, an App Store
  Connect record (`com.ubrn.kuyara`, ASC app `6806664440`) and TestFlight internal build
  1.0.0 (2) exist, verified on a physical device against the deployed Worker. Preview and
  production profiles use the deployed Worker. Shared code stays Android-compatible;
  Android validation is deferred.

The shipped app has no account, cross-device sync or server-sent push. Supabase is the intended backend ([ADR 0022](adr/0022-supabase-is-the-intended-backend-and-kuyara-is-not-local-first.md))
with nothing implemented, and the project is source-available under PolyForm
Noncommercial ([ADR 0024](adr/0024-relicensing-to-polyform-noncommercial.md)).

## Active Work and Next Approved Work

Analytics is sequenced before the first public App Store release, so milestones 10 and
11 are release blockers. The numbering continues the sequence the ADRs cite.

10. **PostHog product analytics integration.** Phase 1 (the shared failure
    classification and boundary) landed 2026-09-09. ~~Phase 2: add the consent-gated
    PostHog adapter, first-launch consent sheet and Settings Privacy surface.~~ Landed
    2026-09-09. ~~Phase 3 adds the taxonomy's feature call sites
    ([`analytics-taxonomy.md`](analytics-taxonomy.md)).~~ Landed 2026-09-10. No SDK
    calls in features. ~~The PostHog project and the EAS variables.~~ Configured
    2026-09-10: PostHog Cloud EU project 270871 with client IP discard on, the GeoIP
    transformation disabled, session replay off and twelve-month retention (ADR 0033
    sections 4 to 6); the two public Expo variables live in the EAS `production`
    environment and the `production` build profile loads that environment. The `preview`
    environment carries no variables, so preview builds stay analytics-off; a build from
    the `production` profile is analytics-on wherever it is distributed. The one item
    still open in this milestone is the **DPA decision** with counsel (ADR 0033 section
    7).
11. **App Store privacy disclosure and privacy policy.** The privacy policy URL and the
    App Store Connect data-collection questionnaire must describe analytics collection,
    with the install identifier declared linked to the user (ADR 0033, amended
    2026-09-09), before any analytics-enabled release.
12. **PostHog Error Tracking.** Source maps and release correlation are decided at
    implementation time; the same payload exclusion list applies.
13. **Session replay evaluation.** Only after privacy masking and sampling are designed.
    Not approved for capture.
14. **Operational observability evaluation.** Grafana Cloud or an OpenTelemetry stack for
    Worker latency, errors, provider fallbacks and quota; later than product analytics.
15. **Supabase accounts and sync**, when product scope reaches it. Promoting device rows
    into an authenticated profile needs its own ADR; until then build no sync
    infrastructure.

Approved design work that is decided and not built, none of it a release blocker:

- ADR 0026 decision 7, the Today-to-detail entry transition, and the spatial spring
  measurement under Reduced Motion that depends on it.
- ADR 0026 decision 5, the control that changes ownership on outfit detail; the
  per-garment owned/wanted button list is the interim.
- The per-condition stage tint: ADR 0018's seven states at ADR 0021's raised luminance
  have no recorded values, so the stage renders one tint.
- [ADR 0017](adr/0017-a-retuned-typography-scale.md)'s retuned type scale; the shipped
  scale is still 40 / 24 / 24 / 17 / 15 / 13 / 10.5.
- ADR 0021 section 9's horizontal hourly rail on Weather.
- Five accessory silhouettes, wanted and not approved; accessories draw the category glyph.
- A content container for tab screens that does not fill the viewport (see Known Issues).

Provider prices and quotas are deliberately absent from this list; reverify them from
official sources when each item is implemented. Server-sent push (N3) stays deferred
and needs its own ADR ([ADR 0004](adr/0004-notifications-in-the-mvp.md)).

## Release Blockers

App Store submission, not TestFlight, is blocked by:

- Milestone 10's DPA decision (the code, the PostHog project and the EAS variables are
  complete).
- Milestone 11: a privacy policy URL and the completed data-collection questionnaire.
- The remaining non-code prerequisites: a support URL, screenshots and description copy.

## Recently Completed

- **Milestone 10 configuration** (2026-09-10): the PostHog Cloud EU project was created
  and configured (client IP discard on, GeoIP transformation disabled, session replay
  off, twelve-month retention, verified through the project settings and the Data
  pipelines list); a dev-client smoke test with the key in the gitignored `.env` showed
  consent grant, `screen_viewed` and the SDK lifecycle events under Activity, after which
  the `.env` lines were removed; `EXPO_PUBLIC_POSTHOG_API_KEY` and
  `EXPO_PUBLIC_POSTHOG_HOST` were created in the EAS `production` environment and the
  `production` build profile now declares `"environment": "production"`. ADR 0033 records
  the verified settings. No new build was made.
- **Milestone 10 phase 3** (2026-09-10): the taxonomy's feature call sites. Lane 0 added
  the shared scaffolding (`useScreenViewed`, the app-private first-use store cleared on
  withdrawal, the location and AI-probe mappers, a development-only logging adapter);
  three parallel lanes with disjoint file ownership then wired onboarding, Settings,
  notifications and the AI probe; weather, recommendation, Today and outfit detail; and
  the Closet, and integration added `notification_opened` in the notification provider's
  response subscription. Twenty-two events now have call sites; `error_shown` for `settings` and
  `onboarding` has no observable failure category and is deliberately unimplemented. Two
  lanes had derived `age_bucket` and `dress_style` separately; integration folded them into
  one pair of mappers in `analytics-mappers.ts`. Checks: `pnpm check` and the component
  suite (the primary-tabs test gained the analytics provider). Verified on the iPhone 17 Pro
  Simulator through the development logging adapter on 2026-09-10: consent granted, one
  `screen_viewed` per tab focus, `setting_changed`, `feature_used_first_time` and the
  Closet's `manual_refresh_triggered`, with no JS errors. A read-only Codex review the
  same morning raised one product question: because the consent sheet follows onboarding
  (decided 2026-09-09), the three onboarding events could never be captured for a fresh
  install. Decided the same day: pre-consent captures are buffered on the device, sent
  with their original timestamps after `analytics_consent_granted` on acceptance and
  discarded on decline; ADR 0033 section 6 and taxonomy section 2 carry the amendment. Its seven measurement-accuracy findings (trackers reset at the consent
  boundary, session-end finalisation, focus-bound error tracking, the Closet's false
  recovery, retry counters, duplicate `outfit_detail_opened`, no-op `setting_changed`)
  were fixed in a follow-up lane.
- **Milestone 10 phase 2** (2026-09-09): added the PostHog adapter behind
  `ProductAnalytics` with fail-closed configuration and lazy client construction,
  profile-owned `undecided | granted | withdrawn` consent in SQLite schema version 12,
  the post-onboarding consent sheet, Settings Privacy controls and SDK boundary guards.
  The only phase 2 events are consent grant, consent withdrawal and allowlisted SDK
  lifecycle events after opt-in. The client is constructed only after consent and then
  initialises opted in, because the SDK marks its one-time application-installed event
  during initialisation; ADR 0033 section 6 item 1 is met by never constructing a client
  before consent rather than by the `defaultOptIn: false` flag it names. Verified on the
  iPhone 17 Pro Simulator with Maestro on 2026-09-10: the sheet appears right after
  onboarding, decline and withdrawal store `withdrawn`, re-consent stores `granted`.

## Known Issues and Manual Verification Gaps

- **Today's bottom gap is layout slack, not the inset.** Measured 2026-09-09: iOS's
  automatic content inset clears the tab bar exactly, but `Screen`'s content container has
  `flexGrow: 1` and grows to the scroll view's frame, which includes the 83 points under
  the bar, so Today's content ends about 130 points above it. Several screens rely on that
  fill (`justifyContent: 'center'` on Today's feedback and bootstrap states, `flex-end` in
  onboarding) and the bar height is not knowable in JS ([ADR 0027](adr/0027-the-app-shell-and-its-three-tabs.md)
  section 4), so a fix is a layout decision for tab screens, not an inset change.
- **Real VoiceOver is unverified.** The XCUITest hierarchy was checked on the Simulator
  (single labelled elements in source order; ownership buttons carry `selected`; picker
  options carry the radio role), but spoken grouping, focus order, the rotor, Today's
  refresh accessibility custom action on the scroll container, and how a location
  picker row reads its trailing "Selected" value need a physical-device pass. Accessibility
  Inspector needs desktop control. This is the ninth goal 7 follow-up.
- **N2's background execution cannot run on the Simulator.** Only registration safety and
  unchanged foreground behaviour were confirmed. On a physical iPhone: install a
  TestFlight or dev-client build, enable Background App Refresh, open the app once so
  `registerBackgroundWeatherAlertTask` runs, then either attach Xcode and evaluate
  `e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.expo.modules.backgroundtask.processing"]`
  in LLDB (debug builds only) or wait for a real system window. Confirm a fresh snapshot
  and rescheduled alerts through persistence, not console output; the task swallows its
  own errors by design.
- **Android is unverified**, consistent with the repository's posture: the native tab
  bar, the icon set and garment artwork, the `@expo/ui` text field, picker list and date
  picker, the `weather-alerts` notification channel, and the resolved manifest after
  blocking fine-location permission.
- **WeatherKit's quota path is untested against Apple.** Apple does not document the
  status returned once the monthly allowance is exhausted; the mapping lands on a
  fallback-eligible error either way, and the daily cap has never been reached.
- **The provider chain hides a broken provider.** A failing adapter returns HTTP 200 from
  a lower-ranked source, so a green suite and a successful deploy do not prove the
  intended provider ran. Confirm `origin.sourceId` in a live response after any provider
  change.
- **Outfit detail's ownership controls** are the heaviest element on the screen and the
  first candidate for ADR 0026 decision 5. Four accent-filled selected buttons in one
  viewport sit in tension with Law 1; the Turkish pair stacks above `fontScale` 1.5 as an
  interim. An untracked garment deliberately draws no marker while its accessibility label
  still speaks the state (decided 2026-09-09).
- **The native location picker** marks the selected result with a localized trailing
  "Selected" value because `NativeListRow` exposes no selected trait.
- **The Closet's segmented control is untinted on iOS:** the installed `@expo/ui`
  community control reads `tintColor` only on Android, so ADR 0029's `brandPrimary` tint
  is Android-only until the package exposes an iOS tint.
- **`components/ui/stretchy-header.tsx`** is built and tested, has no shipped caller and no
  Reduced Motion gate; wire it with a gate or delete it.
- **`outfit-composition.ts`'s `composeOutfits`** has no production caller; seven tests
  still exercise it. Fold them onto `composeOutfitOptions` and delete it when the
  composition changes next.
- **Dark appearance palette limits:** `backgroundElevated` equals `surface`, so an
  elevated card separates from the ground but not from a plain surface; and `brandPrimary`
  equals `brandAccent`, so filled buttons and selected chips share one Quiet Sky and the
  Closet can show three filled elements against Law 1. Fixing the second needs a distinct
  dark role for filled buttons.
- **Turkish register is mixed:** the Closet form speaks formally ("Gardırobunuz",
  "seçin") while its details caption ("Dokunmazsan") and the detail ownership labels
  ("Sende var" / "İstiyorsun", approved by ADR 0026) are informal. No app-wide register
  decision has been taken.
- **[ADR 0010](adr/0010-status-colours-destructive-variant-and-defined-borders.md)** states
  the destructive button's light label as `#FFFFFF`; the implementation follows the rule
  and uses `textOnBrand` (about 7.1:1, above 4.5:1). The illustrative hex is what is off.
- **The Workers AI neuron cost per call** has not been measured live; ADR 0007's figure is
  an estimate.
