# Current Project Status

This file carries only today's state, the active and approved work, the release
blockers, and the open verification gaps. Completed work lives in Git history and in the
ADR that decided it; product decisions live in [`product-decisions.md`](product-decisions.md).

## Current State

- **Mobile:** Expo SDK 57, React Native, Expo Router and Expo SQLite (schema version 22)
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
  bundled catalog (version 6); the AI tier selects three and labels each with an
  archetype, on-device Apple Foundation Models where the device reports them available and
  otherwise the Worker's chain, Workers AI then OpenRouter; mobile validates, persists and
  falls back to a device-local deterministic generator. The refresh waits for a stylist answer: the
  on-device tier gets 8 seconds, the Worker request then gets 38 seconds, and the Worker
  bounds its whole AI walk at 36 seconds (five attempts of 7 seconds plus one second),
  so every provider gets its turn and the deterministic fallback is reached only after
  the last one fails; the whole wait is bounded at 46 seconds. Generation triggers compare
  current signals with the persisted snapshot. Today's "Ask the stylist again" action
  opens a sheet for day type and Now or Later, then regenerates the recommendation alone;
  weather refresh remains on the pull gesture. Five confirmed re-asks per local day can
  reserve an AI attempt; when the allowance is exhausted or reservation fails, the
  device-local deterministic generator supplies the answer. A small app-private JSON
  counter holds the allowance. The action is hidden when the composed pool has no other
  valid option; no provider, quota or remaining count is shown. Today draws a breathing
  skeleton garment board under a phase line (checking the on-device AI, asking the AI stylist, answer
  received, preparing outfits, using standard suggestions) while a recommendation is
  generated, the same phase line replaces the freshness caption during a refresh of a
  shown recommendation, its pull cycle keeps spinning until both the weather and the
  recommendation refresh settle, and its clock re-reads on focus and on foreground. Under the
  garment board it shows one insight line in body text and primary ink: the validated AI
  sentence, else the deterministic day insight. After a place change it waits for the new
  place's weather instead of showing the previous place's under the new name. The top row pairs
  the place with the dressing day's date, which turns at 04:00. The title is one localized
  template, Today, temperature, the condition's animated SF Symbol and the condition; Today
  has no day-type pill. Directly under the board a clock caption states the window the outfit
  was chosen for in one sentence, ending at the last forecast hour when the forecast stops
  short, and a warning-ink caption with its glyph appears when the rest of that window needs
  rain, snow or cold protection the outfit was not chosen for. "Last updated" sits under the
  finishing touches. The last element of the content is the tonal Large "Ask the stylist
  again" button, hidden when the pool has no other valid option; it opens one sheet with the
  day-type tiles (current type checked), Now | Later with a 15-minute wheel over the next 12
  hours, the warning sentence for the window and one prominent confirmation. Confirming stores
  a changed type as the day's `chip` answer and a Later departure under its own dressing day,
  then runs one reserved re-ask while the outfit dims under a "Choosing for the weather
  between …" line; approved-trigger evaluation waits for it. The 18:00 evening sheet opens
  empty on the first foreground open of the evening key; closing either sheet answers it with
  the profile dress style. A morning or evening answer dims the
  outfit under an "Updating for a … day" line until the new one lands. The AI badge sits
  below with its own symbol (multicolor Apple Intelligence on a neutral, `sparkles` in the
  purple family for the Worker), the archetype is a small label, the finishing touches are a
  caption with 16-point drawings whose stroke scales with them, and outfit reasons appear only on
  detail, whose weather recap carries the coverage sentence. The hours
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
  reset. The taxonomy's feature call sites are in place, so every
  approved event is emittable except `error_shown` on the `settings` and `onboarding`
  surfaces, which have no failure classification to observe yet. EAS Observe runs
  alongside it as separate observability instrumentation: its own
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
  Connect record (`com.ubrn.kuyara`, ASC app `6806664440`) exist. Build 15 (`0.1.20260926`)
  is on the App Store and has received one production EAS Update (see Release State below);
  the `production` profile points at the deployed Worker, and the development client
  builds locally ([Development build on the physical
  iPhone](testing.md#development-build-on-the-physical-iphone)). The version scheme and
  the EAS Update rule are in [Approved release
  versioning and update path](product-decisions.md#approved-release-versioning-and-update-path),
  and the commands are in [Release path](testing.md#release-path). Shared code stays
  Android-compatible; Android validation is deferred.

The shipped app has neither sign-in nor cross-device sync nor server-sent push. Supabase is the intended backend ([ADR 0022](adr/0022-supabase-is-the-intended-backend-and-kuyara-is-not-local-first.md))
with nothing implemented. Phase 9, optional accounts, is accepted in
[ADR 0041](adr/0041-optional-accounts.md) and not implemented: no Supabase project, Apple
key or Google client exists yet. The project is
source-available under PolyForm Noncommercial
([ADR 0024](adr/0024-relicensing-to-polyform-noncommercial.md)).

## Active Work

The approved phase order, active work and remaining open items are in [the roadmap](roadmap.md). This file records current implementation and release evidence.

## Release State

- **Build 15:** Version `0.1.20260926`, build 15, is `READY_FOR_SALE`; App Store Connect status was checked on 27 September 2026. It was submitted on 26 September 2026 with `AFTER_APPROVAL` release and phased release configured. Build 14 (`0.1.20260920`) is the previous release.
- **EAS Update:** Build 15 installs receive the latest production iOS update, group `ec077814-51d0-4939-a557-cbc7a049c57f`, runtime `0.1.20260926`, commit `156b8e1`, which replaced the first update from `7b5b4f8`. It carries the Today, recommendation (the formal suit rule and catalog version 6, day-aware labels, hot-day smart outfits), notification, accessibility, History and consent fixes since build 15. The EAS `production` environment carries `EXPO_PUBLIC_KUYARA_WORKER_BASE_URL` and the PostHog variables, and the Hermes source maps for release `kuyara@cf88f54` are uploaded to PostHog.
- **Worker:** The deployed Worker is version `8f6c020e`, built from commit `3b76f19`: only free OpenRouter models (`:free` slugs or the `openrouter/free` router) are composed into the AI chain, the v2 insight sentence is grounded in closed day flags, and the content-keyed AI cache keeps gate version 3; `/v1/health` returned 200 and `/v1/weather` answered from WeatherKit after the deploy.
- **Build 16:** Version `0.1.20260928`, build 16, built locally from commit `aeb2fd0`, was submitted for App Review on 28 September 2026 with `AFTER_APPROVAL` release and phased release configured. It includes schema version 22, the expanded Closet palette and camera path, Easier to see, the coach-mark tour, manual mix, and the revised consent and analytics boundary. The coach tour and manual mix gestures have Simulator evidence only; Android has not been built.
- **Compatibility:** Builds 8 and 9 were released before commit `f0ab923` and carry strict `/v1` response schemas. Keep `/v1` response shapes frozen while either binary remains installed; changed shapes use a new route.

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
  On a grant, the app now finishes a disabled Observe dispatch before enabling delivery,
  skipping rows already stored before consent. Native dispatch still defaults to on before
  JavaScript configures it, a MetricKit crash row delivered after a grant can still be sent,
  and a retry gate left by a failed send skips the cursor advance for a re-grant inside its
  backoff; closing those paths requires a native change.
  The reproduction is at <https://github.com/UBRN/expo-observe-privacy-repro>. Observe stays
  within the existing free scope; paid route and event dashboards are deferred.
- **iOS 27 SDK upload requirement.** Starting in April 2027, Apple requires uploads to use
  the iOS 27 SDK or later. Build 15 (`0.1.20260926`), submitted for review on 26 September
  2026, was built locally with Xcode 27 and the iOS 27 SDK, as used by the
  [current local release path](testing.md#release-path). The minimum deployment target
  remains iOS 26.0. The scene-based life cycle is adopted through the config plugin of
  [ADR 0040](adr/0040-ios-scene-based-life-cycle.md):
  on 2026-09-23 a local Xcode 27 Debug
  build launched on the iOS 27.0 Simulator, loaded JavaScript from Metro and delivered a
  cold-start URL; universal links and a route-level cold-start assertion are not yet
  exercised at runtime.
- **Camera capture is unverified on a device.** The iOS Simulator has no camera: there
  Take photo shows the permission prompt and then the localized unavailable note, while
  Choose photo remains available. The denied note can be rendered, but the Settings
  link cannot be proven there. A real capture, Retake, the Settings link and the captured
  photo's orientation after processing need a physical iPhone.
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
  blocking fine-location permission. Android verification is deferred until
  Android work starts. The development Mac has no Android
  SDK, no AVD and no `ANDROID_HOME`, so the check starts with Android Studio, an SDK
  Platform and a Pixel AVD on API 35 or later before `expo run:android` can run. Until
  then shared code stays Android-compatible and no iOS-only assumption enters it.
- OpenWeather stays in the chain. Provider attribution with the licence name, link and OpenWeather logo is shown in Settings > Service providers; Today and Weather do not show provider attribution.
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
- **The segmented control is untinted on iOS:** the installed `@expo/ui`
  community control reads `tintColor` only on Android, and composing its SwiftUI `Picker`
  directly with `tint(brandPrimary)` was tried on the Simulator and left the selected
  segment white in light and system grey in dark. SwiftUI's tint does not reach
  `UISegmentedControl.selectedSegmentTintColor`, and the package exposes no UIKit
  appearance hook, so the `brandPrimary` tint stays Android-only until it does.
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
  unverified. The garment outlines are copied from `silhouettes.ts` and drawn flat;
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

## Implemented design by release

Build 15 shipped with schema version 19. Outfit detail implements O6 and O7: piece rows open one Closet edit sheet (owned or wanted, the 13 colour families, a photo-library photo), the rows and board badges name each piece's Closet match by type and palette colour family, and "Wore this today" under the board writes one `outfit_history` row per dressing day. Profile's History row opens History, a date-titled list with an empty state. Profile draws the Closet as the open rack (O9): the newest one to three owned pieces per rail face out, the rest hang side-on as slices in their colour families, accessories hang from hooks and shoes stand on the shelf, with six category cells (counts, owned plus wanted) under it that open the Closet on their category. The Closet shows the six categories as a horizontal tab strip over one vertically scrolling page per category, owned and wanted as sections on it, in three columns and two at the largest standard text sizes; categories change by tab. The add-piece and edit forms shipped in build 15 with O10 and photo-library import: an inline title with the toolbar's Cancel and Save pair (Save names Closet or wanted pieces), a preview stage that draws the piece in its colour or shows its photo from the library, illustrated owned and wanted cards, an inline two-level type picker, the type's usual colour families first with the first one preselected, and the optional name last; after a save the Closet names the piece above the grid with Undo and rings its tile. Undo emits no analytics event. Migration 20 with the wide Closet colour and pattern fields and its UI (O8) are implemented on main for build 16: the edit sheet and the add-piece form offer the 33 solids, the iOS system colour well and the 14 two-colour and pattern options in place of the family swatches and the usual colours, and the edit previews and the detail's "Yours" draw the chosen colour or pattern; in-app camera capture (P5) is also on main for build 16: Take photo sits beside Choose photo on the add-piece and edit forms' stage, backed by the camera usage string in English and Turkish, which is native configuration, so it cannot reach build 15 by update. Also on main for build 16 (B5): Today, outfit detail, Weather, the onboarding sample, spoken labels and local notifications show temperatures in the device's Temperature setting, read again when the app returns to the foreground; this needs the expo-localization native module, so it cannot reach build 15 by update. Also on main for build 16 (O13): Settings > Accessibility > Easier to see holds a preview card, the switch (migration 21, off by default) and, on iPhone, a read-only group showing Larger Text, Bold Text and Increase Contrast. With the switch on, kuyara-owned text is one weight heavier with nothing under 15 points and secondary text reads in the primary ink; buttons are 56 points, rows 60 and Closet chips 48; kuyara-drawn buttons, Closet chips and tiles and Today's offer and alternatives take a 2-point strong edge; garment boards draw their caps × 1.3 with a 2.8-point outline, tile drawings 1.3 times larger in the same tile with the Closet at two columns, Today's finishing touches at 24 points, the alternatives as full-width rows and the offer's actions stacked; the native Settings list changes text only. iOS Bold Text alone brings the heavier text and Increase Contrast alone the primary ink and the edges. Garment fills stay their palette colours. Also for build 16 (Phase 8): the nine-step coach-mark tour over Today, outfit detail, the piece sheet and Profile, gated by migration 22's `walkthrough_version`, with Settings, Help restarting it. The outfit detail marks no option as recommended: the three are equal (ADR 0021). On Today's primary stage a board that already fills the width grows only about 3 %, because the stage fit keeps its 28-point side margins; alternates, detail and Closet drawings grow 1.3 times. Phase 6 artwork is implemented: the 33 drawings are redrawn as colour fashion flats with the eight additions, and Today's board, its alternates, the finishing-touch badges, the detail and the runway take each outfit's colours from the Phase 6 palette (O15); Today's primary stage fits its board with the runway preset, is the fitted board plus 24 points tall within 0.66 to 1.14 of its width, and stands each garment on a flat contact shade in the stage colour moved in OKLCH lightness; the alternates keep the Today preset with the detail preset's insets (P2). The first-generation runway implements O1 and O17: condition-hued fields, neutral five-slot drafts before the answer, piece-by-piece dressing in the outfit's palette and full-ink particles. Also on main for build 16 (Phase 7): outfit detail changes pieces through each row's Change and its picker and directly on the board by tap, swipe, arrows and VoiceOver's adjustable actions, keeps untouched pieces' colours, names the changed outfit and its source, raises the unusual note, forgets the change on leaving and records it only through "Wore this today" as `manual`; the gesture thresholds, the back swipe while focused and the re-layout motion have only Simulator evidence. On main for build 17 (Phase 7b), the board's focus ring, arrows and focus label are gone: a tap enlarges the piece in place to twice its size (never under 1.6 times) while the others step back to 0.9, a strip under the board names it with "n / total" and Done over the slot's candidates as 44-point tiles in rows of up to seven (six on 375-point phones, where the 13-candidate top takes three rows and, on a 667-point-tall screen, the reveal keeps the enlarged piece's top so the third row waits under the tab bar until the page scrolls), and a swipe or a tile changes it while it stays large, paging opaque inside its window; the title changes at once and "Changed from" waits for a still board, one block height moves the content under the board once, entering and leaving blocks sequence height and text, and every changeable slot has its own whole Change sentence in both languages. It has component and unit evidence only; the Simulator pass is pending. The re-ask sheet opens at the large detent: a content-fitted detent is not used. The morning and evening sheets ask the day type, then the day's styles at the large detent (M18, N7); both answers are written in one row and start one generation.
