# Current Project Status

This file carries only today's state, the active and approved work, the release
blockers, and the open verification gaps. Completed work lives in Git history and in the
ADR that decided it; product decisions live in [`product-decisions.md`](product-decisions.md).

## Current State

- **Mobile:** Expo SDK 57, React Native, Expo Router and Expo SQLite (schema version 15)
  provide a five-step onboarding flow (welcome, gender, dress style, birth
  date, optional location); three primary tabs, Today, Weather and Profile, drawn by Expo
  Router Native Tabs, with the Closet and Settings as Profile stack destinations; private
  Closet photos; Turkish and English; System/Light/Dark appearance; and semantic haptics
  at the six sites the design language names. The minimum supported iOS is 26.0.
- **Weather:** The current-conditions card leads with the day's one remaining
  decision-changing transition, precipitation starting or easing or an apparent-temperature
  swing, before the measurements below the divider. Mobile preserves the last valid snapshot,
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
  on-device tier gets 6 seconds, the Worker request then gets 38 seconds, and the Worker
  bounds its whole AI walk at 36 seconds (five attempts of 7 seconds plus one second),
  so every provider gets its turn and the deterministic fallback is reached only after
  the last one fails; the whole wait is bounded at 44 seconds. Generation triggers compare
  current signals with the persisted snapshot. Today also carries a **show another outfit**
  action that regenerates the recommendation alone, leaving weather to the pull gesture: the
  first five taps of a local day reach the AI chain, and after that the same tap composes the
  next valid three from the already-composed pool without an AI request. The allowance lives
  in one policy module with a small app-private JSON counter, so it needed no migration, and
  the button is always enabled: no provider, quota or remaining count is ever shown. Today draws a breathing skeleton garment
  board under a phase line (checking the on-device AI, asking the AI stylist, answer
  received, preparing outfits, using standard suggestions) while a recommendation is
  generated, the same phase line replaces the freshness caption during a refresh of a
  shown recommendation, its pull cycle keeps spinning until both the weather and the
  recommendation refresh settle, and its clock re-reads on focus and on foreground. Only the coarse generation mode is exposed,
  and Settings carries the bounded active AI probe beside an on-device availability row
  that calls no provider. Where the selection runs is decided in
  [ADR 0034](adr/0034-on-device-ai-selection-through-apple-foundation-models.md): the
  shared model-input projection and pick distinctness rule in `packages/contracts`, the
  routed client, the third generation mode with SQLite migration 13, the two AI badges and
  the local Swift Foundation Models module are implemented and bound, so every Apple
  Intelligence eligible iPhone takes the on-device tier first with a 6-second budget, then
  the Worker, then the deterministic fallback. The on-device badge names Apple Intelligence
  as a referential word mark, the other says only AI, and the recommendation detail carries
  one plain generation source sentence in all three modes. On-device latency stays unmeasured: the
  only observation is Simulator inference running on the Mac host, so the ADR's
  measurement table still reads not yet measured; builds 6 and 7 carry the module.
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
  Connect record (`com.ubrn.kuyara`, ASC app `6806664440`) exist. Build 9 carries the
  version on sale and the next version is being prepared (see Release State below);
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

## Active Work and Next Approved Work

Milestones 10 and 11 shipped with the first App Store release; what remains of milestone
11 is stated inside it. The numbering continues the sequence the ADRs cite.

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
    environment and the `production` build profile loads that environment. A build from
    the `production` profile is analytics-on wherever it is distributed; the
    `development` profile loads no EAS environment and carries no PostHog key. The
    project's "Filter out internal and test users" setting is meant to exclude Simulator
    traffic by the `$is_emulator` event property and the maintainer's current install id
    (shown under Settings, Privacy on the phone); the maintainer applies that in PostHog
    and replaces the id after every consent cycle or reinstall, and Observe has no
    equivalent filter. The DPA
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
    policy is published (see Release State). `expo-insights` is installed and the
    `expo-updates` launch check is documented: both send the EAS install identifier to Expo
    outside the consent gate, the launch event on every cold start and the update check on
    every launch, both privacy policies disclose them, and
    neither adds a privacy-manifest row or a questionnaire answer (ADR 0033 sections 3 and
    7). The questionnaire answer set is re-derived against ADR 0033 section 7 before the next
    submission, and `expo-insights` sends nothing until the next native build.
12. **PostHog Error Tracking.** [ADR 0035](adr/0035-posthog-error-tracking.md) is accepted
    and its repository work is implemented: uncaught exceptions and unhandled rejections
    only, the existing consent gate, a field-level `before_send` allowlist, deduplication and
    a five-exception client-session cap, the Analytics purpose on the Crash Data row, and
    Hermes source-map wiring through the Expo plugin, Metro helper and pinned CLI. PostHog's
    ingestion limits are configured at 100 exceptions per 60 minutes project-wide and 20 per
    60 minutes per issue; excess is dropped before billing. Observe retains native crashes
    and performance while the accepted unhandled-JavaScript overlap remains.
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

## Release State

Version 0.1.20260913 with build 8 (built from commit 67c20ae) went on sale in every
territory on 2026-09-15 at 09:14 UTC, at <https://apps.apple.com/app/kuyara/id6806664440>.
Apple approved submission `b125d544` on 2026-09-15; the Guideline 2.1 Information Needed
questionnaire of 2026-09-14 (the six-item set sent to accounts with a limited review
history: physical-device recording, purpose, setup, external services, regional
differences, regulated content) was answered in the Resolution Center with the iPhone 14
Pro full-flow recording and named no defect in the binary or the metadata. Automatic
release was selected, so the version went on sale with the approval. The store primary
language was switched from Turkish to `en-US` with `asc app-setup info set` the same day
and Turkish remains a localization (see `product-decisions.md`); the EU Digital Services
Act trader-status declaration was entered on 2026-09-13 as non-trader. Same-day
post-release checks: PostHog receives consented build 8 events, including a first
non-maintainer install that granted consent on 2026-09-15, and EAS Observe reports a
0.52 s median cold launch and 0.22 s startup TTI for build 8, in line with build 6.

Version 0.1.20260915 with build 9 (commit e4c9350, EAS build 7e305161) was approved and
released on 2026-09-15 at 21:26 UTC and is the version on sale; App Store Connect reports it
as Ready for Distribution with no blocking issues, no submission in flight, and phased
release configured. Its only listing difference from the version before it is the final line
of the English and Turkish descriptions, which no longer mentions creating an account. The
maintainer installed build 9 from TestFlight over the installed store build on the phone
before the submission: the upgrade kept the existing data and onboarding did not reappear.

Version 0.1.20260916 with build 11 (commit dfb1f42, EAS build dede366e) was submitted for
review on 2026-09-17 at 10:25 UTC as submission `7ae3525e`, attached to the App Store Connect
version record `ed843aea` with its What's New in both locales; phased release stays configured.
Build 10 from the same version never reached App Store Connect: its PostHog source-map phase
failed because the production profile also set `uploadSourceMaps`, which the profile no longer
does (see the release preconditions in [Release path](testing.md#release-path)). The Worker was
deployed the same morning ahead of the build, so the deployed request schema accepts the new
`dayKind`, accessory slots and empty requirement set. The build number is issued by EAS, which
auto-increments it from the remote version source.

The strict, Worker-owned AI recommendation request changed in five ways: it carries an
optional `dayKind` of `weekday` or `weekend`, recognises 20 new garment type ids, allows the
four optional accessory outfit slots `head`, `neck`, `hands` and `handheld`, raises each
option's `garments` maximum from 5 to 9, and admits the `extremity_cover` requirement kind.
The Worker must be deployed with all five request changes before a binary that can send them
ships; against an older deployment the route answers `400 invalid_request` and mobile falls
back to the deterministic three.

Continuous integration and the iOS release workflow now exist in the repository.
`.github/workflows/ci.yml` installs from the lockfile and runs Expo Doctor, `pnpm check`
and the mobile component suite on every push to `main` and every pull request, and
`apps/mobile/.eas/workflows/release-ios.yml` builds the production iOS binary and submits
it with the `production` submit profile, started only by `eas workflow:run` (see
[Release path](testing.md#release-path)). CI is green on `main`; its first run failed
until the git-ignored Expo typed-route types were generated on the runner. Since
2026-09-15 the repository also has Dependabot version updates with the Expo SDK excluded,
a dependency-review job on pull requests, Dependabot alerts and security updates, secret
scanning with push protection and CodeQL default setup, whose first scan passed with no
alert (see [testing.md](testing.md)). Every third-party action in every workflow is pinned
to a full commit SHA, `.github/workflows/secret-scan.yml` runs gitleaks over the pushed and
proposed commits, and `.github/workflows/deploy-worker.yml` can deploy the Worker only from
a manual dispatch; it has never run because its `production` environment still lacks the
`CLOUDFLARE_API_TOKEN` secret and the `CLOUDFLARE_ACCOUNT_ID` variable. The release
workflow has not run yet, but the App Store Connect API key it needs is already held by
EAS, proven by the non-interactive submit of build 9. The version bump, the TestFlight pass
on the phone and Submit for Review stay the maintainer's manual steps exactly as they are
today.

The evidence behind the release: the full-flow recording Apple asked for was captured on
2026-09-14 on the maintainer's iPhone 14 Pro on iOS 26.6.2 from the TestFlight build 8,
from app launch through onboarding, the location prompt, the first three-outfit
recommendation, an outfit detail, the Weather tab, the city search and the Profile tab
with the Closet and Settings; no crash or hang was seen. The earlier physical-device
check of build 8 (2026-09-13, same device) showed the "AI assisted" badge against the
production Worker, which is the point of the build: build 7 had shown "Standard
suggestions" on every recommendation because the mobile validation gate rebuilt each
picked option with the first valid arrangement of its garments instead of the offered
one, refusing healthy Worker answers that picked a mid layer or an optional outer layer,
and refusing 84 of 648 deterministic results at save time. Builds 7 and 8 are the first
binaries with catalog version 4 (jumpsuit and leggings womens-only) and the Crash Data
privacy manifest row. The iPhone 14 Pro is not Apple Intelligence eligible, so it
exercises the Worker tier and the fallback only; the on-device tier remains unmeasured on
eligible hardware, as ADR 0034's verification boundary records, and the Simulator run
landed at the 6 s budget's edge. Real VoiceOver, background refresh and production
analytics dispatch were not separately inspected on the device (see Known Issues).

PostHog Error Tracking is verified end to end. The EAS `production` environment holds
`POSTHOG_CLI_API_KEY` (a personal key scoped to `error_tracking:write` and
`organization:read`, entered as a secret on 2026-09-15), `POSTHOG_CLI_PROJECT_ID=270871`
and `POSTHOG_CLI_HOST=https://eu.posthog.com`. On 2026-09-15 an EAS Release Simulator build
of the same JavaScript with a temporary, uncommitted unhandled rejection fired three seconds
after consent produced one `$exception` event and one issue in PostHog whose top frame
resolved to `/apps/mobile/src/app/analytics-consent.tsx` line 18, so the Hermes source map
upload from the Xcode bundle phase works. The event only arrived after the PostHog project
setting "Enable exception autocapture" (`autocapture_exceptions_opt_in`) was switched on:
the SDK reads that flag from the remote config at client creation and it overrides the local
`errorTracking.autocapture` option, so a project with the setting off captures nothing. A
Debug or Metro build cannot serve as this proof because Expo's serializer emits no debug id
in development and the frames never match an uploaded map.
App Store Connect's Crash Data answer carries the Analytics purpose beside App Functionality
since 2026-09-15, added and published through the `asc web privacy` pull, plan, apply and
publish flow with one created row and nothing deleted, matching the privacy manifest in
`apps/mobile/app.json`. The organisation is on the free plan
without a payment method, so PostHog stops ingestion at the free allowance instead of
billing; a billing limit becomes a step only if a card is added, and the owner's 80 and 100
percent usage alert emails are on by default. Every `eas update` also needs
`posthog-cli hermes upload --directory dist` after publishing.

The PostHog wrapper around the "Bundle React Native code and images" phase exits before any
CLI call when `SKIP_BUNDLING` is set, and Expo's generated phase script exports
`SKIP_BUNDLING=1` for every Debug configuration, Simulator or device. So Debug builds
(`expo run:ios`, the dev client) never need the CLI variables, while every Release build,
which is every EAS production build, bundles JavaScript and fails without all three
`POSTHOG_CLI_*` values. The plugin also sets `ENABLE_USER_SCRIPT_SANDBOXING=NO` on every
Xcode configuration at prebuild so the upload script can read git metadata.

A Simulator acceptance tour of the same JavaScript (iPhone 17 Pro, iOS 26.5, English,
dev client on Metro against the production Worker, 2026-09-13 evening) passed all ten
steps with no crash, error screen or hang: onboarding with a manual location, the first
recommendation, the consent sheet, outfit detail, Weather, Closet add and delete,
Settings with the notification permission and the AI status screen, regeneration after
a dress-style change, a cold relaunch showing the persisted recommendation, and pull to
refresh. No generation-mode badge appeared, which is what a deterministic
result looks like at rest, and that evening the production AI quota was exhausted. The tour is evidence for the flows, not for the AI
tier. The weather no longer decides whether a tier is tried at all: a day that derives no
clothing requirement reaches the AI tiers like any other, and the composed pool is what
decides whether there is anything to choose from. One product observation came out of it and was settled on 2026-09-15: in mild weather
(19°, cloudy) the deterministic rules produce no requirement, so Today's rationale line
rendered empty and the detail surface showed no reasons section while the store
description promised outfits "explained piece by piece". Today now shows one deterministic
status sentence when no requirement fires, the detail reasons section stays
requirement-only as ADR 0026 section 4 designs it, and the store description promises
reasons "when the weather asks for it" (see `product-decisions.md`); the App Store text
itself changes with the next submitted version.

Everything else in milestone 11 is done. App Store Connect holds the privacy policy and
support URLs, the category, content rights, price, the build, the review information,
the App Privacy questionnaire including the EAS Observe rows (Performance Data, Other
Diagnostic Data, Crash Data and the App Functionality purpose on Device ID), entered
with the `asc` CLI on 2026-09-13 and published, and the ten framed screenshots (five per
localization, `APP_IPHONE_67`) uploaded the same day; `asc validate` reports no blocking
finding. The privacy policy and support pages are published from `main` on GitHub Pages
in English (`/privacy-policy` and `/support`) and Turkish (`/tr/privacy-policy` and
`/tr/support`) with `docs/_config.yml` and a layout override that carries the language
switcher, so the page metadata no longer inherits the GitHub repository description and
the theme's "open source" footer is gone. No app preview video is used: Apple allows only raw
in-app footage there, so it did not earn its place, and the preview sets in both
localizations were emptied on 2026-09-13. The uploaded hero screenshot in both
localizations shows a deterministic-fallback result, captured while that mode still
carried a badge, whose archetype and reason read oddly beside a cloudy 24° forecast; whether to recapture it
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

- **Expo retention is known only for Observe.** Expo's pricing page lists 90 days of data
  retention for EAS Observe on every plan; no period is published for the EAS Insights
  launch event or the EAS Update check, which receive the same install identifier. Both
  privacy policies still say Expo has published no period for the Observe data; naming
  90 days there is the maintainer's call, because the source is a pricing table rather
  than a privacy document.
- **EAS Observe has two external open items.** The `expo-observe`, `expo-app-metrics`
  and `expo-eas-client` packages ship no privacy manifest and do not clear pre-consent
  unhandled-error records on iOS. Two issue drafts for `expo/expo` were prepared on
  2026-09-13 after a search found no existing issue on either defect; sending them is
  the maintainer's decision. Whether to use an EAS paid plan for Observe's route and
  event views is also undecided; the Starter plan is the first tier that exposes them.
- **Apple's iOS 27 SDK build requirement lands in April 2027.** Apple's news item of
  2026-09-09 states that starting April 2027, apps uploaded to App Store Connect must be
  built with the iOS 27 and iPadOS 27 SDK or later
  (<https://developer.apple.com/news/?id=k1mtkt1k>). This is a build-SDK requirement,
  separate from the 26.0 deployment target of ADR 0011, which does not change. The Expo
  SDK release that builds against the iOS 27 SDK is not yet identified; every upload from
  April 2027 depends on it, so the SDK upgrade has to be scheduled before then.
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
- **The Pages site ignores Reduce Motion by decision.** The website at `docs/` animates
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
