# Current Project Status

This file carries only today's state, the active and approved work, the release
blockers, and the open verification gaps. Completed work lives in Git history and in the
ADR that decided it; product decisions live in [`product-decisions.md`](product-decisions.md).

## Current State

- **Mobile:** Expo SDK 57, React Native, Expo Router and Expo SQLite (schema version 18)
  provide a seven-step onboarding flow (welcome, optional name, gender, dress style,
  style preferences, birth date, optional location); three primary tabs, Today, Weather and Profile, drawn by Expo
  Router Native Tabs, with the Closet and Settings as Profile stack destinations; private
  Closet photos; Turkish and English; System/Light/Dark appearance; and semantic haptics
  at the six sites the design language names. The minimum supported iOS is 26.0.
- **Weather:** The current-conditions card leads with the day's one remaining
  decision-changing transition, precipitation starting or easing or an apparent-temperature
  swing, before the measurements below the divider. Below the hourly rail a five-day
  outlook gives each day its condition glyph, the measured precipitation beside its chance
  (the chance alone when no amount was reported, and nothing when the day carries neither),
  its low and high, and a rail positioned against the week's own range with a mark for the
  current temperature on today's row. Mobile reads it from the Worker's `/v2/weather`
  route and keeps it in the schema version 16 snapshot column, so a refresh failure leaves
  the last valid outlook on screen and a snapshot stored by an earlier build simply shows
  no outlook section. Mobile preserves the last valid snapshot,
  keeps it visible as stale while a newly selected place loads, refreshes data older than 30
  minutes, treats a timestamp up to five minutes in the device's future as clock skew rather
  than invalid data, and reaches providers only through the Worker. The chain is WeatherKit,
  Open-Meteo, then OpenWeather, with bounded attempts, runtime validation, attribution, rate
  limiting and a best-effort OpenWeather daily cap. Location comes from the foreground
  device flow or the native `/weather/location` picker over the Worker's place-search
  route, which carries its own per-IP rate limit so typed searches and weather refreshes
  cannot exhaust each other. The deterministic sample provider is test-only.
- **Recommendations:** The deterministic layer composes at most 24 valid outfits from the
  bundled catalog (version 5); the AI tier selects three and labels each with an
  archetype, on-device Apple Foundation Models where the device reports them available and
  otherwise the Worker's chain, Workers AI then OpenRouter; mobile validates, persists and
  falls back to a device-local deterministic generator. The refresh waits for a stylist answer: the
  on-device tier gets 8 seconds, the Worker request then gets 38 seconds, and the Worker
  bounds its whole AI walk at 36 seconds (five attempts of 7 seconds plus one second),
  so every provider gets its turn and the deterministic fallback is reached only after
  the last one fails; the whole wait is bounded at 46 seconds. Generation triggers compare
  current signals with the persisted snapshot. Today also carries a **show another outfit**
  action that regenerates the recommendation alone, leaving weather to the pull gesture: the
  first five taps of a local day reach the AI chain, and after that the same tap composes the
  next valid three from the composed pool without an AI request. The allowance lives
  in one policy module with a small app-private JSON counter, so it needed no migration. The
  action, a full-width bordered button, is hidden once no distinct unseen valid option remains; no provider,
  quota or remaining count is ever shown. Today draws a breathing skeleton garment
  board under a phase line (checking the on-device AI, asking the AI stylist, answer
  received, preparing outfits, using standard suggestions) while a recommendation is
  generated, the same phase line replaces the freshness caption during a refresh of a
  shown recommendation, its pull cycle keeps spinning until both the weather and the
  recommendation refresh settle, and its clock re-reads on focus and on foreground. Under the
  garment board it shows the existing deterministic day insight and a second sentence about
  a precipitation interval, sustained temperature, wind interval or temperature swing when
  the forecast supports one. Both lines use body text and primary ink. The top row pairs
  the place with the dressing day's date, which turns at 04:00. The title is one localized
  template, Today, temperature, the condition's animated SF Symbol and the condition, with
  the day-type pill at its right; the pill opens the day-type sheet, and a change dims the
  outfit under an "Updating for a … day" line until the new one lands. The AI badge sits
  below with its own symbol (multicolor Apple Intelligence on a neutral, `sparkles` in the
  purple family for the Worker), the archetype is a small label, the finishing touches are a
  caption with 16-point drawings whose stroke scales with them, Plan tomorrow is a one-row
  group, and outfit reasons appear only on detail. The hours
  from 18:00 are called the evening rather than the night, and every
  temperature it prints carries one decimal in the reader's own separator. Only the coarse generation mode is exposed,
  and Settings carries the bounded active AI probe beside an on-device availability row
  that calls no provider. Where the selection runs is decided in
  [ADR 0034](adr/0034-on-device-ai-selection-through-apple-foundation-models.md): the
  shared model-input projection and pick distinctness rule in `packages/contracts`, the
  routed client, the third generation mode with SQLite migration 13, the two AI badges and
  the local Swift Foundation Models module are implemented and bound, so every Apple
  Intelligence eligible iPhone takes the on-device tier first with an 8-second budget, then
  the Worker, then the deterministic fallback. The on-device badge names Apple Intelligence
  as a referential word mark, the other says only AI, and the recommendation detail carries
  one plain generation source sentence in all three modes. On-device latency is not measured
  on eligible physical hardware; the one observation is a Simulator run on an M3 Pro host
  (5.1 to 5.4 s warm, 6.7 s cold), recorded in ADR 0034, and a Simulator number does not
  stand in for a device measurement. Builds 6 and 7 carry the module.
- **Notifications:** on-device local notifications only, in two kinds behind one OS
  permission ([ADR 0004](adr/0004-notifications-in-the-mvp.md),
  [ADR 0032](adr/0032-local-weather-alert-rules.md)): the deterministic
  precipitation-onset and temperature-swing weather alerts, and a morning briefing at
  07:00 local projected from tomorrow's own morning hours. Each has its own opt-in, its
  own row on the Settings Notifications surface, and its own schema-version-15 profile
  flag; they share the delivery ledger, the rescheduling on every persisted snapshot and
  on opt-in, permission and language changes, and the best-effort `expo-background-task`
  refresh. The briefing is planned only from a fresh snapshot whose hourly window reaches
  tomorrow's 07:00 hour and is silently skipped otherwise; it composes no recommendation.
  ADR 0004's one contextual offer on Today now appears when either kind would have been
  sent, is never shown again, and on acceptance turns both kinds on and opens the
  Notifications surface. Pending notifications survive a cold launch and the tap that
  launched the app is delivered. No server, no push.
- **Analytics:** the `ProductAnalytics` boundary, typed twenty-four-event catalog,
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
  verified against build 8: Observe reports its launch metrics (see Release State). See
  [ADR 0023](adr/0023-behavioural-product-analytics-with-posthog.md) and
  [ADR 0033](adr/0033-apple-privacy-obligations-for-first-party-analytics.md). PostHog
  Error Tracking captures only uncaught JavaScript exceptions and unhandled rejections for
  consenting users. Its adapter allowlists exception fields, deduplicates matching failures
  and caps each client session at five exceptions; console capture, native crashes,
  breadcrumbs and session replay remain off. The Expo plugin, Metro chunk ids and pinned
  `@posthog/cli` 0.18.2 wire Hermes source-map upload ([ADR 0035](adr/0035-posthog-error-tracking.md)).
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
- **Builds:** iOS is the first release target. EAS production credentials and an App Store
  Connect record (`com.ubrn.kuyara`, ASC app `6806664440`) exist. Build 13 carries the
  version ready for distribution, with no submission in flight (see Release State below);
  the `production` profile points at the deployed Worker, and the `development` profile
  is the physical-iPhone path ([Development build on the physical
  iPhone](testing.md#development-build-on-the-physical-iphone)). The version scheme and
  the EAS Update rule are in [Approved release
  versioning and update path](product-decisions.md#approved-release-versioning-and-update-path),
  and the commands are in [Release path](testing.md#release-path). Shared code stays
  Android-compatible; Android validation is deferred.

The shipped app has neither sign-in nor cross-device sync nor server-sent push. Supabase is the intended backend ([ADR 0022](adr/0022-supabase-is-the-intended-backend-and-kuyara-is-not-local-first.md))
with nothing implemented, and the project is source-available under PolyForm
Noncommercial ([ADR 0024](adr/0024-relicensing-to-polyform-noncommercial.md)).

## Active Work

The approved phase order, active work and remaining open items are in [the roadmap](roadmap.md). This file records current implementation and release evidence.

## Release State

- **Last released build:** Version `0.1.20260919`, build 13, EAS build
  `25ec7173-99fd-4b67-ac0d-de8cb99a4dfe`, was built from commit
  `798605a505d4e0979df030a47712e04611e03d20`.
- **App Store Connect:** Version record
  `729cdddd-cd75-4d6d-aa62-6eb2f311d374` is `READY_FOR_DISTRIBUTION`, review
  `6039308f-ace6-4821-bd42-9f132c5ae933` is `COMPLETE`.
- **Privacy and listing:** The public App Store privacy page returned HTTP 200 on
  2026-09-20. Its linked analytics `Device ID`, `Product Interaction`, `Other Usage Data`
  and `Crash Data`, plus the functionality `Device ID`, `Crash Data`, `Performance Data`
  and `Other Diagnostic Data`, match [ADR 0033](adr/0033-apple-privacy-obligations-for-first-party-analytics.md).
  The English and Turkish support URLs also returned HTTP 200. Apple's three privacy pages
  were re-read on the same date; no obligation changed.
- **Current candidate:** The target version is `0.1.20260920`. Its approved scope is the
  help and feedback row, localized copy, and Expo SDK 57 patch compatibility. It changes no
  Worker route, shared contract, or migration, so no Worker deployment is required for this
  candidate. The frozen install and `expo install --check` passed. `pnpm check` passed with
  826 mobile, 101 contracts, and 256 Worker Node tests plus lint, TypeScript, and Worker
  bundle checks; the component suite passed with 51 suites and 534 tests. The native build
  succeeded with version `0.1.20260920` in `Info.plist`. The iPhone 17 Pro Simulator on
  iOS 26.5 rendered Today, Weather and Settings, and opened the published support pages in
  the app's selected English or Turkish despite conflicting browser language preferences.
  The independent accumulated binary-diff review and the focused review of the support
  language fix found no release blocker. GitHub CI, secret scanning and CodeQL passed for
  candidate commit `9b427ed`; Pages also deployed that commit. EAS
  workflow `01a0bbad-38de-7643-afae-f8d2943dc483` completed both the production build
  and App Store Connect upload for build 14 (`6ef15f23-4a65-4c3d-8467-b6aab046a36d`).
  Apple processed build `42d5dea4-f393-4875-be4c-f93298f4f41d` as `VALID`; it is attached
  to the version and available to the internal `Team (Expo)` TestFlight group as
  `IN_BETA_TESTING`, with English and Turkish test notes.
  Version record `efb0b7f0-0486-44b0-bd4c-b1213b2d54d2` is `WAITING_FOR_REVIEW`,
  with both release notes and 16 screenshots. Release is `AFTER_APPROVAL` with phased
  release configured as `INACTIVE`, ready to start when Apple releases the version.
  `asc validate --check-urls` and `asc review doctor` report zero blocking findings, and
  the review dry-run returns `wouldSubmit: true`. The public store privacy answers match
  ADR 0033; API-only checks cannot inspect web-only regulatory declarations. Review
  submission `582511a3-dd49-45af-a2f6-57fb5fc8c7d7` was submitted at
  `2026-09-19T22:16:18.533Z` and is `WAITING_FOR_REVIEW`, with no blocking issues.
  Apple approval and release are pending.
- **Release evidence:** App Store Connect currently holds eight screenshots per locale,
  16 total. The first English and Turkish hero assets inspected from the live records show
  `Crewe 13° / Rain Ready / Chosen with AI` and `14° / Yağmura Hazır / AI ile seçildi`.
  The maintainer confirmed updating the phone through TestFlight to build 14 and seeing
  no apparent issue, and explicitly requested submission. This is owner-reported evidence,
  not a separate agent-run physical-device tour.
- **Compatibility:** Builds 8 and 9 were built before `8e949ec` and use strict `/v1`
  response schemas. Keep every `/v1` response shape frozen while either remains installed;
  this candidate makes no Worker or contract change.

## Recently Completed

- **First-generation runway:** while a dressing day lacks a valid recommendation and generation is running, Today shows the runway: the day's atmosphere from behind the status bar to the tab bar, which stays usable, landing marks with the deterministic composition's pieces gliding in one every 1.2 seconds and moving to the AI's board when it picks another outfit, particles in the board band, a phase-driven progress bar whose spoken value counts the placed pieces, and one rotating line. After ten seconds a native alert offers an early deterministic outfit; the AI request continues and can replace it. The runway holds a green completion state for 0.8 seconds. Component and controller tests cover it; the Simulator pass is still to run. The app does not read the OS motion preference.
- **Daily style choices:** schema 18 preserves profiles and adds style aesthetics, the morning question setting and keyed formality choices. Today offers the day-type sheet (Casual, Smart and Formal tiles in one radio group, the current answer preselected, the setup answer with a caption on the first day), the title pill and tomorrow planning; the sheet opens over the first wait but never over an error card, and it carries no lasting-preference section, because onboarding and Settings alone edit the aesthetic preferences. Automated repository and component checks pass, the rebuilt version 17 device database replay passed, and the Simulator pass covered onboarding, chips, plan tomorrow, More and Settings; the morning sheet appeared at the first daytime open in the Simulator; its alert and the runway's skip alert are covered by component tests.

- **Settings and provider attribution:** the root presents Appearance, Notifications,
  Profile, Help and About in order, followed by the centred kuyara name and version.
  Help opens the platform share sheet, direct store review and PolyForm licence;
  About opens Service providers, which combines device AI status, the bounded probe
  and the last valid weather snapshot's provider attribution. Today and Weather no
  longer draw attribution. The Apple Weather mark loads from the public attribution
  endpoint with a localized text fallback. Simulator verification remains open.

- **Optional display name:** schema 17 adds a nullable profile name and a one-time prompt
  version while preserving existing rows. Onboarding asks for a name after welcome,
  existing users receive one Today sheet, and Settings can edit or remove it. Today
  greets named users, Profile personalizes the Closet heading and no longer shows
  location; the onboarding location step remains.

- **The refresh reaches the stylist:** the validation gate rebuilds a picked option by
  finding the valid arrangement equal to the offer, so every option the app composes is
  accepted and a persisted
  deterministic result always reloads; the Worker walks all five providers inside 36
  seconds and the mobile client waits 38 seconds for it after the 8-second on-device tier;
  Today shows the generation phase on a live region with an
  ambient mark; the Settings AI status screen keeps a coarse tier label; the Privacy row
  shows no On/Off value. Checks: `pnpm check`, the component suite (405 tests), the
  design-language greps, and one Simulator run of a phased refresh that settled on the
  AI-assisted badge, with
  the mark animating. The Worker change is deployed (the 36 s walk
  is live) and the mobile change ships in build 8 and later binaries.
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
- **Milestone 11 documents** (2026-09-11): `docs/privacy-policy.md` and `docs/support.md`
  in English with `docs/tr/privacy-policy.md` and `docs/tr/support.md` in Turkish, written
  from ADR 0033's findings for publication through GitHub Pages; `PRIVACY_POLICY_URL` set to the published address with a route test proving the
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

- **Expo retention is known only for Observe.** Both privacy policies attribute Observe's
  90-day retention to [Expo's pricing page](https://expo.dev/pricing). No period is published
  for the EAS Insights launch event or the EAS Update check, which receive the same install
  identifier; their retention remains an external open item.
- **EAS Observe has two external open items.** The `expo-observe`, `expo-app-metrics`
  and `expo-eas-client` packages ship no privacy manifest, reported as
  [expo/expo#50372](https://github.com/expo/expo/issues/50372), and do not clear
  pre-consent unhandled-error records on iOS, reported as
  [expo/expo#50373](https://github.com/expo/expo/issues/50373) for `clearStoredEntries`.
  The reproduction is at <https://github.com/UBRN/expo-observe-privacy-repro>. Observe stays
  within the existing free scope; paid route and event dashboards are deferred.
- **Apple's iOS 27 SDK build requirement lands in April 2027.** Apple's news item of
  2026-09-09 states that starting April 2027, apps uploaded to App Store Connect must be
  built with the iOS 27 and iPadOS 27 SDK or later
  (<https://developer.apple.com/news/?id=k1mtkt1k>). This is a build-SDK requirement,
  separate from the 26.0 deployment target of ADR 0011, which does not change. The one
  launch-blocking consequence, the scene-based life cycle, is adopted through the config
  plugin of [ADR 0040](adr/0040-ios-scene-based-life-cycle.md): on 2026-09-23 a local Xcode
  27 Debug build launched on the iOS 27.0 Simulator, loaded JavaScript from Metro and
  delivered a cold-start URL; universal links and a route-level cold-start assertion are not
  yet exercised at runtime. Production builds still use the EAS `sdk-57` image; the image
  that builds with Xcode 27 is chosen for the first upload that needs it, before April 2027.
- **Apple Intelligence device verification is deferred.** No eligible physical device is
  available. The iPhone 14 Pro exercises the Worker and deterministic fallback tiers only;
  no on-device AI latency or success is claimed from its runs.
- **N2's background execution and notification delivery remain unverified on a device.**
  The focused notification checks pass: 72 Node tests and 41 component tests. On the
  iPhone 14 Pro running iOS 27, both notification opt-ins and Background App Refresh are
  enabled. Build 13 records the morning briefing for 07:00 Türkiye time in SQLite, and
  the database passes `quick_check`. This proves the app's accepted scheduling record,
  not the OS's pending request or actual delivery. The physical background trigger could
  not be exercised: LLDB cannot resolve the Objective-C system calls needed to inspect or
  trigger the task on this iOS 27 device (a local Xcode 27 Debug binary launches since
  [ADR 0040](adr/0040-ios-scene-based-life-cycle.md), so the earlier scene-lifecycle stop no
  longer applies). No cache timestamp was altered, and no background
  refresh is claimed. This physical-device gap does not block routine Simulator verification;
  a compatible device/debugger environment is needed only to verify background execution.
  The Simulator cannot execute this task. For that optional check, install a
  development build ([Development build on the physical
  iPhone](testing.md#development-build-on-the-physical-iphone)), enable Background App
  Refresh, open the app once so
  `registerBackgroundWeatherAlertTask` runs, then either attach Xcode and evaluate
  `e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.expo.modules.backgroundtask.processing"]`
  in LLDB (debug builds only) or wait for a real system window. Confirm a fresh snapshot
  and rescheduled alerts through persistence, not console output; the task swallows its
  own errors by design.
- **One Dependabot alert stays open by decision.** `decode-uri-component` 0.2.2 reaches
  the app only through expo-router 57's `query-string` 7.1.3, whose CommonJS `require`
  cannot load the only patched release, 0.5.0, which is ESM-only; an override would throw
  on the first deep-link parse. The exposure is CPU exhaustion of the app on the same
  device through a crafted `kuyara://` query. The alert is dismissed on GitHub as
  tolerable with this reason; re-check `pnpm why decode-uri-component` at every Expo SDK
  upgrade.
- **Android is unverified**, consistent with the repository's posture: the native tab
  bar, the icon set and garment artwork, the `@expo/ui` text field, picker list and date
  picker, the `weather-alerts` notification channel, and the resolved manifest after
  blocking fine-location permission. Android verification is deferred by the
  maintainer's decision until an explicit go-ahead. The development Mac has no Android
  SDK, no AVD and no `ANDROID_HOME`, so the check starts with Android Studio, an SDK
  Platform and a Pixel AVD on API 35 or later before `expo run:android` can run. Until
  then shared code stays Android-compatible and no iOS-only assumption enters it.
- OpenWeather stays in the chain: ADR 0002 now records the ODbL reading (share-alike
  reaches only a reusable dataset exported outside the organisation), and provider
  attribution with the licence name, the link and the OpenWeather logo is rendered on
  Today and the Weather screen through one component (5febd3b).
- **WeatherKit's exhaustion status is unobserved.** Apple does not document what it
  returns once the monthly allowance is exhausted. The adapter maps 429 to `quota`, 401
  and 403 to `auth`, 404 to `availability` and every other non-400 status to `upstream`,
  each unit-tested and fallback-eligible, so the chain advances whichever status Apple
  sends; only the exact status is unobserved, and the Worker's own 8,000-a-day cap has
  never been reached.
- **The provider chain hides a broken provider in the response.** A failing adapter
  returns HTTP 200 from a lower-ranked source, so a green suite and a successful deploy do
  not prove the intended provider ran. Both chains now log every failed attempt to the
  Worker's observability (`weather_provider_attempt_failed` with the attempt position and
  the closed error kind, `ai_provider_attempt_failed` with the model and a closed reason),
  so read `wrangler tail` and confirm `origin.sourceId` in a live response after any
  provider change. The composition order (WeatherKit, Open-Meteo, OpenWeather) is
  asserted offline in `apps/worker/src/index.test.mjs`; a composed adapter that fails
  live is still visible only there.
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
- **The Pages site always animates by decision.** The website at `docs/` animates
  regardless of the OS setting and offers a System/Light/Dark selector stored in the
  browser; the decision is recorded in `product-decisions.md` and qualified in
  `docs/design/visual-identity.md`. With JavaScript off the selector is absent and the
  site follows the system scheme; a Turkish-language browser is redirected from `/` to
  `/tr/` on first visit by the language-memory script.
- **Landing page limits.** The landing `<title>` is the bare name in both languages (the
  Primer pages keep "Page | kuyara"); a descriptive browser title would be new bilingual
  copy. The Smart App Banner meta matches Apple's documented format and App Store id,
  but whether it renders can only be shown in Safari on a physical iPhone or iPad on
  iOS 26 with the App Store; the Simulator never shows it. Firefox 155 takes the
  finished page through the `@supports` gate and the IntersectionObserver reveal at
  1280 and 400 px in both languages; keyboard operation of the controls in Firefox is
  unverified. The garment path data is copied from `silhouettes.ts`;
  `landing-boards.test.mjs` in the mobile suite fails when the copy and the vocabulary
  disagree. The 2.6:1 stage row and the `2xl` band padding are web-only choices recorded
  under "Web presence" in `docs/design/visual-identity.md`, together with the favicon and
  Open Graph compositions. The favicon, apple-touch-icon and Open Graph image are served
  from `docs/` and wired through `<link>` tags and a `defaults` image key; a client that
  ignores them and fetches the origin root `https://ubrn.github.io/favicon.ico` still
  gets the user site's 404, which this repository cannot serve.
- **Dark theme limits on the Primer pages.** Dark code uses a three-tone palette from the
  semantic text tokens (primary, the accent for literals, secondary for comments and
  output); names that Rouge's light palette distinguishes stay primary because no fourth
  token reaches 4.5:1, and diff and error backplates are transparent because no token
  names a red or a green. `.markdown-body img` sits on the page ground in dark, as
  GitHub renders it. The theme control's styles precede Primer's stylesheet by design:
  every rule is class-scoped and the shipped Primer 0.6.0 reaches those elements only
  through element selectors, so specificity settles each conflict. The theme cross-fade
  sets a colour-only `transition` with `!important` on every element for 400 ms, and
  both it and the indicator use `linear` because the tokens carry durations and no
  easing; an easing token derived from the app's Reanimated default is proposed, not
  decided.
- **A local Jekyll build differs from Pages only in `<head>`.** Pages builds with
  `github-pages` 232 (Jekyll 3.10.0, jekyll-seo-tag 2.8.0, Ruby 3.3.4); the maintainer's
  Ruby 4 resolves only 223 (Jekyll 3.9.0, jekyll-seo-tag 2.7.1), so a local build lacks
  the `og:type` meta and differs in the generator and SEO-tag version lines while every
  page body matches the live site. Jekyll loads the `github-pages` plugin set only when a
  `Gemfile` sits in the process working directory, so a build started from another
  directory renders pages without layouts and copies front-matter-less Markdown raw;
  `docker pull` hangs on the maintainer's machine, so the official build image cannot run
  locally. The recipe is in `docs/testing.md`.
