# Current Project Status

This file carries only today's state, the active and approved work, the release
blockers, and the open verification gaps. Completed work lives in Git history and in the
ADR that decided it; product decisions live in [`product-decisions.md`](product-decisions.md).

## Current State

- **Mobile:** Expo SDK 57, React Native, Expo Router and Expo SQLite (schema version 13)
  provide an accountless five-step onboarding flow (welcome, gender, dress style, birth
  date, optional location); three primary tabs, Today, Weather and Profile, drawn by Expo
  Router Native Tabs, with the Closet and Settings as Profile stack destinations; private
  Closet photos; Turkish and English; System/Light/Dark appearance; and semantic haptics
  at the six sites the design language names. The minimum supported iOS is 26.0.
- **Weather:** Mobile preserves the last valid snapshot, keeps it visible as stale while a
  newly selected place loads, refreshes data older than 30 minutes, treats a timestamp up to
  five minutes in the device's future as clock skew rather than invalid data, and reaches
  providers only through the Worker. The chain is WeatherKit, Open-Meteo, then OpenWeather,
  with bounded attempts, runtime validation, attribution, rate limiting and a best-effort
  OpenWeather daily cap. Location comes from the foreground
  device flow or the native `/weather/location` picker over the Worker's place-search
  route. The deterministic sample provider is test-only.
- **Recommendations:** The deterministic layer composes at most 24 valid outfits from the
  bundled catalog (version 4); the AI tier selects three and labels each with an
  archetype, on-device Apple Foundation Models where the device reports them available and
  otherwise the Worker's chain, Workers AI then OpenRouter; mobile validates, persists and
  falls back to a device-local deterministic generator. The refresh waits for a stylist answer: the
  on-device tier gets 6 seconds, the Worker request then gets 38 seconds, and the Worker
  bounds its whole AI walk at 36 seconds (five attempts of 7 seconds plus one second),
  so every provider gets its turn and the deterministic fallback is reached only after
  the last one fails; the whole wait is bounded at 44 seconds. Generation triggers compare
  current signals with the persisted snapshot. Today draws a breathing skeleton garment
  board under a phase line (checking the on-device AI, asking the AI stylist, answer
  received, preparing outfits, using standard suggestions) while a recommendation is
  generated, the same phase line replaces the freshness caption during a refresh of a
  shown recommendation, its pull cycle keeps spinning until both the weather and the
  recommendation refresh settle, and its clock re-reads on focus and on foreground. Only the coarse generation mode is exposed,
  and Settings carries the bounded active AI probe beside an on-device availability row
  that calls no provider. Where the selection runs is decided in
  [ADR 0034](adr/0034-on-device-ai-selection-through-apple-foundation-models.md): the
  shared model-input projection and pick distinctness rule in `packages/contracts`, the
  routed client, the third generation mode with SQLite migration 13, the three badges and
  the local Swift Foundation Models module are implemented and bound, so every Apple
  Intelligence eligible iPhone takes the on-device tier first with a 6-second budget, then
  the Worker, then the deterministic fallback. On-device latency stays unmeasured: the
  only observation is Simulator inference running on the Mac host, so the ADR's
  measurement table still reads not yet measured; builds 6 and 7 carry the module.
- **Notifications:** on-device local weather alerts only ([ADR 0032](adr/0032-local-weather-alert-rules.md)):
  opt-in in Settings, deterministic precipitation-onset and temperature-swing rules, a
  delivery ledger, rescheduling on every persisted snapshot and on opt-in, permission and
  language changes, and a best-effort `expo-background-task` refresh. Pending alerts
  survive a cold launch and the tap that launched the app is delivered. No server, no
  push.
- **Analytics:** the `ProductAnalytics` boundary, typed twenty-three-event catalog,
  error-episode and retry trackers, consent-gated PostHog adapter, Today consent
  sheet and Settings Privacy surface are implemented. Consent is profile-owned in schema
  version 12; absent configuration uses the no-op adapter (a logging adapter in
  development). The sheet cannot be swiped away, so accepting and declining are its only
  exits, and withdrawal clears the SDK's persisted queue and holds the opt-out through the
  reset. Phase 3 landed the taxonomy's feature call sites on 2026-09-10, so every
  approved event is emittable except `error_shown` on the `settings` and `onboarding`
  surfaces, which have no failure classification to observe yet. EAS Observe landed
  alongside it on 2026-09-13 as separate observability instrumentation: its own
  `PerformanceTelemetry` port and single `expo-observe` adapter, launch-time configuration
  bound to the same consent answer through a synchronous read of
  `local_profiles.analytics_consent`, per-screen readiness marks, and the two events
  `recommendation.generated` and `weather.refreshed`. Dispatch and the dashboard are
  unverified: that needs a native build. See
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
  follow-ups closed. Motion follows [ADR 0020](adr/0020-rewriting-the-motion-law.md): press
  feedback on buttons, rows and Today's cards, staggered content entrances, the arrival
  spring where garment pieces land on a board, and an ambient tempo taken from the
  condition's intensity.
- **Builds:** iOS is the first release target. EAS production credentials, an App Store
  Connect record (`com.ubrn.kuyara`, ASC app `6806664440`) and TestFlight internal builds up
  to 1.0.0 (6) exist. Build 6, EAS production build from commit d0a78fe, is the first
  binary uploaded to TestFlight with the current native runtime: the local Foundation
  Models module, migration 13, the motion package, the pre-submission sweep, EAS Observe
  and the on-device prompt's archetype rules. It was uploaded on 2026-09-13 and passed
  the maintainer's physical-device pass the same day; builds 4 and 5 are superseded and
  build 5 was never distributed. The store version string follows the
  `0.MINOR.YYYYMMDD` scheme: the leading 0 says the product is not yet declared stable,
  the middle number counts minor updates, and the trailing date stamps the update. The
  first store version is `0.1.20260913`, set in App Store Connect and in `app.json`, and
  build 8 (built from commit 67c20ae, uploaded and processed on 2026-09-13) carries it
  and is the build attached to the App Store version; build 7, the same version string
  without the validation-gate fix, and build 6, still versioned 1.0.0, are superseded.
  The production profile auto-increments the build number; because
  `runtimeVersion` follows the app version, every build of one version string shares
  one runtime and no EAS Update may be published to the production channel until the
  next binary is the only one installed. Preview and production profiles
  use the deployed Worker. Shared code stays Android-compatible; Android validation is
  deferred.

The shipped app has no account, cross-device sync or server-sent push. Supabase is the intended backend ([ADR 0022](adr/0022-supabase-is-the-intended-backend-and-kuyara-is-not-local-first.md))
with nothing implemented, and the project is source-available under PolyForm
Noncommercial ([ADR 0024](adr/0024-relicensing-to-polyform-noncommercial.md)).

## Active Work and Next Approved Work

Analytics is sequenced before the first public App Store release, so milestones 10 and
11 are release blockers. The numbering continues the sequence the ADRs cite.

<!-- markdownlint-disable MD029 -->

10. **PostHog product analytics integration.** Phase 1 (the shared failure
    classification and boundary) landed 2026-09-09. ~~Phase 2: add the consent-gated
    PostHog adapter, Today consent sheet and Settings Privacy surface.~~ Landed
    2026-09-09. ~~Phase 3 adds the taxonomy's feature call sites
    ([`analytics-taxonomy.md`](analytics-taxonomy.md)).~~ Landed 2026-09-10. No SDK
    calls in features. ~~The PostHog project and the EAS variables.~~ Configured
    2026-09-10: PostHog Cloud EU project 270871 with client IP discard on, the GeoIP
    transformation disabled, session replay off and twelve-month retention (ADR 0033
    sections 4 to 6); the two public Expo variables live in the EAS `production`
    environment and the `production` build profile loads that environment. The `preview`
    environment carries no variables, so preview builds stay analytics-off; a build from
    the `production` profile is analytics-on wherever it is distributed. The DPA
    condition closed on 2026-09-11: consent is the recorded lawful basis and the
    maintainer signed PostHog's DPA the same day (ADR 0033 section 7). The milestone is
    complete.
11. **App Store privacy disclosure and privacy policy.** The privacy policy URL and the
    App Store Connect data-collection questionnaire must describe analytics collection,
    with the install identifier declared linked to the user (ADR 0033 section 5), before
    any analytics-enabled release. ~~Where the policy is hosted, its
    URL, the lawful basis and the deletion wording.~~ Decided and written 2026-09-11:
    the policy and support page live in `docs/` for GitHub Pages, `PRIVACY_POLICY_URL`
    is set, consent is the lawful basis, and the policy promises withdrawal and
    retention but not identifier-based deletion (ADR 0033 section 7). Pages went live
    and the questionnaire, both URLs, the subtitle and the listing copy were entered in
    App Store Connect on 2026-09-11. The EAS Observe integration (2026-09-13) added
    Performance Data, Other Diagnostic Data, Crash Data and the App Functionality purpose
    on Device ID to the answer set (ADR 0033 sections 1 and 7); the privacy policy in
    `docs/` discloses them, the App Store Connect questionnaire carries them, and the
    policy is published (see Release Blockers).
12. **PostHog Error Tracking.** [ADR 0035](adr/0035-posthog-error-tracking.md) (Proposed,
    awaiting the maintainer's acceptance) decides the shape: uncaught exceptions and
    unhandled rejections only, source maps uploaded per bundle with the CLI key held as an
    EAS secret, the one existing consent answer with no pre-consent buffering, an explicit
    `before_send` allowlist for exception properties, the Analytics purpose added to the
    Crash Data privacy row, a zero-dollar error-tracking billing limit with a per-session
    cap, and Observe keeping the native layer while PostHog owns the JavaScript layer.
    Nothing is implemented.
13. **Session replay evaluation.** Only after privacy masking and sampling are designed.
    Not approved for capture.
14. **Operational observability evaluation.** Grafana Cloud or an OpenTelemetry stack for
    Worker latency, errors, provider fallbacks and quota; later than product analytics.
    A maintainer-side options report (2026-09-13) found that the Worker logs three
    structured events, none of which distinguishes a Workers AI quota failure from any
    other provider error, and that `429` responses are never logged server-side. Its
    recommendation is to add those two fields on the free Workers Logs first, keep Grafana
    Cloud as the next step only if alerting becomes necessary, and not adopt OpenTelemetry
    while Cloudflare's tracing is in open beta. No decision has been taken.
15. **Supabase accounts and sync**, when product scope reaches it. Promoting device rows
    into an authenticated profile needs its own ADR; until then build no sync
    infrastructure.

<!-- markdownlint-enable MD029 -->

Provider prices and quotas are deliberately absent from this list; reverify them from
official sources when each item is implemented. Server-sent push (N3) stays deferred
and needs its own ADR ([ADR 0004](adr/0004-notifications-in-the-mvp.md)).

## Release Blockers

Version 0.1.20260913 with build 8 was submitted for App Review on 2026-09-13 through
`asc review submit` (submission `b125d544`, state WAITING_FOR_REVIEW); release is manual
after approval. The EU Digital Services Act trader-status declaration was entered in App
Store Connect on 2026-09-13 as non-trader. No item is open on the maintainer's side;
what remains is Apple's review and the manual release after approval.

The physical-device check of build 8 ran on 2026-09-13 at about 18:30 UTC on the
maintainer's iPhone 14 Pro from TestFlight: Today showed the "AI assisted" badge against
the production Worker, which is the point of the build. Build 7 on the same device had shown "Standard
suggestions" on every recommendation, the validation-gate defect build 8 fixes: the
mobile validation gate rebuilt each picked option with the first valid arrangement of
its garments instead of the offered one, so a healthy Worker answer that picked an
option with a mid layer or an optional outer layer was refused whole and the
deterministic three were shown; the same rebuild refused 84 of 648 deterministic results
at save time. The full flow pass on record ran on build 6 on 2026-09-13 (iPhone 14 Pro,
no problem found); builds 7 and 8 are the first binaries that carry catalog version 4
(jumpsuit and leggings womens-only) and the Crash Data privacy manifest row, and the
build 8 check covered the badge, not every flow. The iPhone 14 Pro is not Apple
Intelligence eligible, so it exercises the Worker tier and the fallback only; the
on-device tier remains unmeasured on eligible hardware, as ADR 0034's verification
boundary records, and the Simulator run of the same day landed at the 6 s budget's
edge. Real VoiceOver, background refresh and production analytics dispatch were not
separately inspected on the device (see Known Issues).

Everything else in milestone 11 is done. App Store Connect holds the privacy policy and
support URLs, the category, content rights, price, the build, the review information,
the App Privacy questionnaire including the EAS Observe rows (Performance Data, Other
Diagnostic Data, Crash Data and the App Functionality purpose on Device ID), entered
with the `asc` CLI on 2026-09-13 and published, and the ten framed screenshots (five per
localization, `APP_IPHONE_67`) uploaded the same day; `asc validate` reports no blocking
finding. The privacy policy and support pages are published from `main` on GitHub Pages
(`/privacy-policy` and `/support`) with `docs/_config.yml` and a layout override, so the
page metadata no longer inherits the GitHub repository description and the theme's
"open source" footer is gone. No app preview video is used: Apple allows only raw
in-app footage there, so it did not earn its place, and the preview sets in both
localizations were emptied on 2026-09-13. The uploaded hero screenshot in both
localizations shows a deterministic-fallback result ("Standard suggestions") whose
archetype and reason read oddly beside a cloudy 24° forecast; whether to recapture it
before submitting is the maintainer's call.

## Recently Completed

- **The refresh reaches the stylist** (2026-09-13, working tree, not yet in a build or
  deployed): the validation gate rebuilds a picked option by finding the valid arrangement
  equal to the offer, so every option the app composes is accepted and a persisted
  deterministic result always reloads; the Worker walks all five providers inside 36
  seconds and the mobile client waits 38 seconds for it after the 6-second on-device tier;
  Today shows the generation phase on a live region with a still-under-Reduce-Motion
  ambient mark; the Settings AI status screen keeps a coarse tier label with a one-line
  switch reserved for the pending provider-name decision; the Privacy row shows no On/Off
  value. Checks: `pnpm check`, the component suite (405 tests), the design-language greps,
  and one Simulator run of a phased refresh that settled on the AI-assisted badge, with
  the mark still under Reduce Motion. The Worker change is deployed (the 36-second walk
  is live) and the mobile change ships in build 8, the build attached to the submitted
  App Store version.
- **AI chain repair** (2026-09-13): the dead OpenRouter slugs were replaced with the
  three free models that answer the real strict `json_schema` request
  (`nex-agi/nex-n2.5-mini:free`, `nvidia/nemotron-3-super-120b-a12b:free`,
  `nex-agi/nex-n2.5-pro:free`); a second Workers AI model,
  `@cf/mistralai/mistral-small-3.1-24b-instruct` (valid picks on both test scenarios, 2 to
  3 s, about 40 to 56 neurons), follows `llama-3.3-70b-instruct-fp8-fast`; the per-attempt
  timeout is 7 seconds and `index.ts` no longer overrides it to 20 seconds, which had let
  one stalled attempt consume the whole 19-second deadline so that no fallback ever ran;
  and every attempt's outcome is logged as a closed reason code. Eight other Workers AI
  models were evaluated against the contract gates and rejected (see
  `product-decisions.md`). OpenRouter free variants stay capped at 20 requests a minute
  and 50 a day for accounts with under $10 of purchased credits, which the project's key
  is; nothing depends on that cap because the two Workers AI models answer first, and a
  one-time $10 credit purchase (daily cap 1000) is the only spend question left.
- **Open-item sweep** (2026-09-13): the Worker's OpenRouter chain replaced with the three
  free models that pass the real prompt, plus closed-reason logging of every AI provider
  attempt, deployed on 2026-09-13; Turkish copy moved to one
  informal register across 58 strings and the three iOS permission texts, recorded in
  `product-decisions.md`; the native list row gained a `selected` prop carried by the
  `@expo/ui` `accessibilityAddTraits(['isSelected'])` modifier, so the location picker
  drops its trailing "Selected" text (Simulator hierarchy shows `selected: true` on the
  chosen row only); the Workers AI neuron cost measured live and recorded in ADR 0007; ADR
  0010's destructive label now names `textOnBrand`. The iOS segmented tint was tried
  through SwiftUI `tint()` and reverted on Simulator evidence (see Known Issues).
  Checks: `pnpm check`, the component suite (396 tests), the design-language greps, and
  one Simulator tour.
- **Milestone 11 documents** (2026-09-11): `docs/privacy-policy.md` and `docs/support.md`,
  English and Turkish, written from ADR 0033's findings for publication through GitHub
  Pages; `PRIVACY_POLICY_URL` set to the published address with a route test proving the
  Settings Privacy row opens it; the Settings identifier footer says the identifier can
  be quoted in a data request and does not promise deletion. ADR 0033 section 7 records
  the lawful-basis and deletion decisions.
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
  Closet's `manual_refresh_triggered`, with no JS errors. Consent stays unanswered during
  onboarding and until Today renders the first recommendation. Nothing is recorded or
  queued before the sheet is answered, so onboarding and everything before that first
  recommendation are not measurable; this is accepted. A bootstrap failure is outside both
  boundaries, so the bootstrap error screen carries a quiet "Report a problem" action that
  opens the system share sheet with the build, OS, device model and failure stage the user
  reads before sending.
  ADR 0033 section 6 and taxonomy section 2 record the current gate. Its seven measurement-accuracy findings (trackers reset at the consent
  boundary, session-end finalisation, focus-bound error tracking, the Closet's false
  recovery, retry counters, duplicate `outfit_detail_opened`, no-op `setting_changed`)
  were fixed in a follow-up lane.
- **Milestone 10 phase 2** (2026-09-09): added the PostHog adapter behind
  `ProductAnalytics` with fail-closed configuration and lazy client construction,
  profile-owned `undecided | granted | withdrawn` consent in SQLite schema version 12,
  the Today consent sheet, Settings Privacy controls and SDK boundary guards.
  The only phase 2 events are consent grant, consent withdrawal and allowlisted SDK
  lifecycle events after opt-in. The client is constructed only after consent and then
  initialises opted in, because the SDK marks its one-time application-installed event
  during initialisation; ADR 0033 section 6 item 1 is met by never constructing a client
  before consent rather than by the `defaultOptIn: false` flag it names. Verified on the
  iPhone 17 Pro Simulator with Maestro on 2026-09-10: decline and withdrawal store
  `withdrawn`, re-consent stores `granted`. The Today-after-recommendation presentation
  needs main-session Simulator verification.

## Known Issues and Manual Verification Gaps

- **EAS Observe has two external open items.** The `expo-observe`, `expo-app-metrics`
  and `expo-eas-client` packages ship no privacy manifest and do not clear pre-consent
  unhandled-error records on iOS. Two issue drafts for `expo/expo` were prepared on
  2026-09-13 after a search found no existing issue on either defect; sending them is
  the maintainer's decision. Whether to use an EAS paid plan for Observe's route and
  event views is also undecided; the Starter plan is the first tier that exposes them.
- **Real VoiceOver is unverified.** The XCUITest hierarchy was checked on the Simulator
  (single labelled elements in source order; ownership buttons carry `selected`; picker
  options carry the radio role; on iOS the notifications switch carries its row label), but
  spoken grouping, focus order, the rotor, Today's
  refresh accessibility custom action on the scroll container, and how VoiceOver speaks
  the location picker's selected row (its `isSelected` trait is in the XCUITest
  hierarchy) need a physical-device pass. Accessibility
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
  blocking fine-location permission. Android verification is deferred by the
  maintainer's decision until an explicit go-ahead. The development Mac has no Android
  SDK, no AVD and no `ANDROID_HOME`, so the check starts with Android Studio, an SDK
  Platform and a Pixel AVD on API 35 or later before `expo run:android` can run. Until
  then shared code stays Android-compatible and no iOS-only assumption enters it.
- **OpenWeather's licence reading needs a decision.** A maintainer-side reading of
  OpenWeather's terms of sale (2026-09-13) found that the data is licensed under ODbL and
  CC BY-SA 4.0 covers only OpenWeather's products and services, so share-alike does not
  reach the app; ADR 0002 records a different reasoning and is not yet corrected. The same
  reading found that the provider attribution names no licence and that Today shows the
  temperature and condition with no attribution at all. Which option to take (keep
  OpenWeather and fix attribution, remove it from the chain, or a paid plan) is open.
- **WeatherKit's quota path is untested against Apple.** Apple does not document the
  status returned once the monthly allowance is exhausted; the mapping lands on a
  fallback-eligible error either way, and the daily cap has never been reached.
- **The provider chain hides a broken provider in the response.** A failing adapter
  returns HTTP 200 from a lower-ranked source, so a green suite and a successful deploy do
  not prove the intended provider ran. Both chains now log every failed attempt to the
  Worker's observability (`weather_provider_attempt_failed` with the attempt position and
  the closed error kind, `ai_provider_attempt_failed` with the model and a closed reason),
  so read `wrangler tail` and confirm `origin.sourceId` in a live response after any
  provider change.
- **The Closet's segmented control is untinted on iOS:** the installed `@expo/ui`
  community control reads `tintColor` only on Android, and composing its SwiftUI `Picker`
  directly with `tint(brandPrimary)` was tried on the Simulator and left the selected
  segment white in light and system grey in dark. SwiftUI's tint does not reach
  `UISegmentedControl.selectedSegmentTintColor`, and the package exposes no UIKit
  appearance hook, so ADR 0029's `brandPrimary` tint stays Android-only until it does.
- **Dark elevated-surface step:** `backgroundElevated` sits 1.18:1 over `surface` by
  decision; a lighter value would drop `textSecondary` below its 4.5:1 floor.
- **Dark atmosphere states render neutral only.** ADR 0018 caps them at Deep Atmosphere's
  luminance; every compliant variation sits only 3 to 8 RGB levels from the current
  `#122A35` stage and is imperceptible. Lifting the cap needs a separate decision.
- **[ADR 0010](adr/0010-status-colours-destructive-variant-and-defined-borders.md)** states
  the destructive button's light label as `#FFFFFF`; the implementation follows the rule
  and uses `textOnBrand` (about 7.1:1, above 4.5:1). The illustrative hex is what is off.
