# ADR 0035: PostHog Error Tracking

Status: Proposed (2026-09-13)

Implementation: not started. This ADR decides what milestone 12 in
[`docs/current-status.md`](../current-status.md) may build: which failures reach PostHog,
how a Hermes stack trace is made readable, how the one consent answer governs it, what an
exception payload may carry, what it changes in the App Store privacy answers, what it
costs and how that cost is capped, and how it divides the ground with the EAS Observe
integration that already collects crash data.

Every PostHog statement below was read from the URL cited next to it on the date recorded
there, and every SDK statement was read from the version installed in this repository
(`posthog-react-native` 4.68.4, `@posthog/core` 1.52.0). Prices and allowances are what
those pages said on 2026-09-13; `AGENTS.md` forbids freezing them, so the implementer
recalculates them from the same pages before enabling anything.

## Context

[ADR 0023](0023-behavioural-product-analytics-with-posthog.md) section 8 named PostHog
Error Tracking the preferred first candidate for automated crash and exception tracking,
because it correlates a failure with the product behaviour that preceded it in one system
rather than two, and left source maps, release correlation and the payload boundary to be
decided at implementation time. [ADR 0033](0033-apple-privacy-obligations-for-first-party-analytics.md)
section 6 item 8 made that conditional: Error Tracking is not enabled in milestone 10, and
when milestone 12 adds it, the Diagnostics categories and the privacy manifest are
extended in the same change.

The gap this closes is real and was measured, not imagined. When the build 3 start-up
failure shipped, the maintainer found it only by installing the TestFlight build personally. PostHog could
not have shown it: `errorTracking.autocapture` is `false` and `exceptionSteps` disabled in
`apps/mobile/src/features/analytics/data/posthog-product-analytics.ts`, session replay is
off, and the only failure signal in the taxonomy is the coarse `error_shown` and
`error_recovered` pair over six surfaces, none of them the bootstrap screen. A
user-initiated "Report a problem" share action now exists on the bootstrap failure screen,
which gives a person a way to tell the maintainer what broke, but it needs the person to
act, it produces prose in a share sheet rather than a grouped issue, and it says nothing
about the failures nobody bothers to report.

Three things already in the repository bound what can be added.

**The payload rule is a closed list.** `AGENTS.md` states that analytics, telemetry and
error payloads must never carry exact coordinates, photos or image content, free-form user
text, full AI prompts or model responses, raw provider responses, secrets, complete SQLite
rows, credentials, or a persistent device fingerprint, and that an error reaches a
telemetry provider as a closed code with coarse attributes, never with a caught error's own
message. The `PerformanceTelemetry` boundary enforces the last clause structurally with
`TelemetryError`, which accepts a code and typed attributes and nothing else. A stack trace
is the first thing this project would send that does not fit that shape, so the ADR has to
reconcile the two rather than assume them compatible.

**There is already a crash collector.** ADR 0033 section 7 records that
`expo-app-metrics` persists MetricKit crash diagnostics and unhandled JavaScript errors
with exception type, message and stack trace, that `expo-observe` dispatches them once
consent is granted, and that Crash Data is a declared and published App Privacy category
with the App Functionality purpose. Adding a second collector without deciding the division
would leave two systems answering the same question with different data.

**Consent is one answer and lives in the profile row.** ADR 0033 section 3 forbids a second
consent surface, and the stored answer (`undecided`, `granted`, `withdrawn`) is a profile
column in the SQLite database. That is why the failure that motivated this work, a database
that will not open, is the one failure a consent-gated collector can never see.

## Decision

### 1. Uncaught exceptions only, and the bootstrap failure stays outside

PostHog Error Tracking captures two classes and no others:

- **Uncaught JavaScript exceptions**, through
  `errorTracking.autocapture.uncaughtExceptions`.
- **Unhandled promise rejections**, through
  `errorTracking.autocapture.unhandledRejections`.

Three capture paths the SDK offers stay off. `console` autocapture stays off: it turns
every `console.error` into a billed exception carrying whatever string the call site
passed, which is a free-text channel straight through the exclusion list. `nativeCrashes`
stays off: it needs the optional `@posthog/react-native-plugin`, a new native dependency,
to collect what Observe's MetricKit subscriber already collects (section 7).
`exceptionSteps` stays off: breadcrumbs are app-authored strings attached to exceptions as
`$exception_steps`, another free-text channel, and the adapter already disables them.

**Handled failures are not forwarded.** The surfaces that render a user-facing error keep
emitting the coarse `error_shown` and `error_recovered` events exactly as
[`analytics-taxonomy.md`](../analytics-taxonomy.md) section 5.10 defines them, and none of
them becomes a `$exception` event. Three reasons, each sufficient. They are already
measured, with a session-scoped emission rule and an occurrence bucket, so an exception
event would add volume, not knowledge. Their input is a caught error whose message
`AGENTS.md` forbids sending, so forwarding them would either send the forbidden message or
send a code that the analytics event already carries. And `captureException` on a caught
error is precisely the call the red lines below prohibit, so allowing it here would leave
the rule unenforceable.

**The bootstrap failure cannot be covered, and this ADR does not pretend otherwise.** When
the profile database fails to open, three independent facts each keep PostHog blind: the
consent answer is a column in the database that did not open, so the app cannot know
whether it may send anything; the analytics adapter is composed after the profile loads, so
no client exists; and the failure is caught and rendered as the bootstrap error screen, so
it is not an uncaught exception and no autocapture handler would fire even if a client
existed. The channels that do cover it are the ones already shipped: the user-initiated
"Report a problem" share action on that screen, which needs no database, no consent and no
network; App Store Connect crash reports for a genuine native crash; and the controller's
own `TelemetryError` with `stage` and `error_name`, which reaches Observe when consent was
granted in an earlier session. Widening the `ErrorSurface` enum with a `bootstrap` value
would create the appearance of coverage without the substance, and is a red line.

### 2. Source maps are uploaded, and correlation is per-chunk, not per-release

A Hermes stack trace without a source map is a list of byte offsets in a minified bundle.
Capturing exceptions and not resolving them would spend the privacy and cost budget for
data nobody can read, so source map upload is part of the same change, not a follow-up.

The mechanism, from PostHog's React Native source map documentation (read 2026-09-13):
`posthog-cli` 0.7.8 or later, chunk id injection through the
`posthog-react-native/expo` config plugin with `getPostHogExpoConfig` in
`metro.config.js` (Expo 50 or later), automatic upload from the Xcode and Gradle build
phases during a native build, and `posthog-cli hermes upload --directory dist` after an
`eas update` publish. Authentication is `POSTHOG_CLI_API_KEY` (a personal API key scoped to
error tracking write), `POSTHOG_CLI_PROJECT_ID`, and `POSTHOG_CLI_HOST` set to the EU host,
since the project is PostHog Cloud EU project 270871.

Three consequences follow for this repository.

**Build identity is the per-frame `chunk_id`, not a release name.** The stack frame type in
`@posthog/core` 1.52.0 carries `chunk_id` on each frame, and the injected bundle carries the
matching id, so a trace resolves against the map uploaded for that exact bundle. Nothing has
to agree on a version string. This matters here because the version scheme is
`0.MINOR.YYYYMMDD` with `runtimeVersion` following `appVersion`, so every stamp is a new
runtime and a new bundle; an upload therefore runs per build and per update publish, never
once per marketing version.

**The credentials are build-time secrets.** `POSTHOG_CLI_API_KEY` is a personal API key with
write scope, which is categorically different from the public project key already shipped in
the app. It lives as an EAS secret in the build environment. It is never committed, never an
`EXPO_PUBLIC_` variable, never in `app.json`, and never in the bundle.

**Resolved frames may show source context.** A frame resolved against an uploaded map can
carry `context_line`, `pre_context` and `post_context`. That content is kuyara's own source,
not user data, and the project is source-available under PolyForm Noncommercial, so this adds
no disclosure and no licensing problem. The frame field that would be a problem is `vars`,
local variable values, which is why section 4 drops it whether or not the SDK ever populates
it.

### 3. One consent answer, no second surface, and the honest cost of that

Exception capture is governed by the same stored answer as product analytics and adds no
second question, no separate "crash reports" toggle, and no row of its own beyond what the
Privacy surface already says. ADR 0033 section 3 settles this: Apple requires consent for
collection and a withdrawal control, not one control per data type, and a second surface
would make the first one dishonest by implying the answer the person already gave was
narrower than it was.

Mechanically this costs nothing extra, because the gate is structural rather than a rule
someone remembers. The PostHog client is constructed only on a `granted` profile or inside
`optIn()`. The autocapture handlers are installed by the client constructor, so while the
answer is `undecided` or `withdrawn` there is no client and therefore no handler. Withdrawal
runs the existing `withdraw()` path, which opts out, flushes once, drops the persisted queue,
resets, and clears the persisted device id, after which no handler survives.

Two behaviours are decided rather than inherited:

- **No pre-consent buffering of exceptions.** The composition-root decorator buffers ordinary
  captures in memory while the answer is undecided. Exceptions are excluded from that buffer
  and are dropped instead. A fatal exception usually ends the JavaScript runtime, so a buffer
  would rarely survive to be flushed, and replaying a crash from before the answer under the
  identity created by the grant is not what the person agreed to.
- **The privacy policy names it.** The policy already discloses crash and diagnostic data for
  Observe. Milestone 12 extends the same paragraph to say that exception reports with stack
  traces also reach the analytics provider under the same answer, in the same language, with
  no new question.

The consequence to state plainly, because it is the reason this feature is worth less than it
looks: people who declined and people who have not answered produce no exception event at all.
Observe is bound to the same answer, so it does not fill that gap either. For those installs
the channels are App Store Connect crash reports and the "Report a problem" share action, and
nothing else. Coverage is over consenting users, and any conclusion drawn from crash volume is
a conclusion about that group.

### 4. The payload exclusion list applies item by item, and the stack trace is reconciled with it

`AGENTS.md`'s list applies unchanged to a `$exception` event. Item by item:

| Forbidden | How it stays out |
|---|---|
| Exact coordinates | Never a property, never interpolated into a message, never a URL or query parameter. Coordinates travel only in Worker request bodies. |
| Photos or image content | Nothing in the exception path reads an image or a file path from the Closet. |
| Free-form user text | No app-authored property carries user text; `console` autocapture and `exceptionSteps`, the two channels that could, stay off. |
| Full AI prompts or model responses | The AI client never throws with its payload in the message, and no prompt is a property. |
| Raw provider responses | Provider adapters map to closed error kinds before anything is thrown upward. |
| Secrets and credentials | Never in the bundle, never in a thrown value; the source map upload key is build-time only. |
| Complete SQLite rows | No row is stringified into an error message; the bootstrap report line, which may quote a SQLite value, is a user-initiated share and never a telemetry payload. |
| Persistent device fingerprint | The identity stays the SDK's random per-install id under `identified_only`, as ADR 0033 section 5 decided. |

**Reconciling the stack trace with "never a caught error's own message".** That clause governs
what kuyara reports. It is a rule about the project's own reporting calls, and it stays
absolute: no `captureException` on a caught error, no caught message as an event property, no
exception derived from an error the code handled. An uncaught exception is a different object.
It is not a report the project composes; it is the runtime's terminal record of a failure the
project did not handle, and its `value` is whatever the throwing code produced. The reason that
is acceptable is the same reason ADR 0033 section 7 accepts it for Observe: the discipline
lives upstream of telemetry. No user content, coordinate, wardrobe value, prompt, provider body
or secret may be interpolated into an error message or a thrown value anywhere in the app, and
if one ever is, the fix is to stop the data reaching the throwing path, not to scrub or
suppress the report.

The structural half of that is the `before_send` hook, which needs extending. The current
`sanitizePostHogEvent` keeps any `$`-prefixed key that is not explicitly blocked, so exception
properties would pass by default, which is the wrong default for a payload this rich. Milestone
12 replaces that behaviour for exception events with an explicit allowlist:

- Allowed: `$exception_list` entries reduced to `type`, `value`, `mechanism`, and
  `stacktrace.frames` limited to `platform`, `filename`, `function`, `module`, `lineno`,
  `colno`, `in_app` and `chunk_id`; `$exception_level`; and the standard event properties the
  taxonomy already allows.
- Dropped: every frame `vars`, `context_line`, `pre_context` and `post_context` on the way out;
  `$exception_steps`; and the existing `$ip`, `$screen_name`, `$current_url`, `$referrer` and
  `$geoip*` blocks, which stay.

A unit test on the hook is the acceptance evidence, feeding it a synthetic `$exception` payload
carrying every dropped field and asserting the result. The implementer confirms that
`before_send` actually runs for `captureException` in the installed version (the React Native
client documents that its capture override chains to the core implementation so `before_send`
still runs) and the test asserts it rather than trusting the comment.

### 5. App Privacy: no new category, one new purpose, unchanged deletion

Crash Data is already declared, entered in App Store Connect and published for the Observe
integration, and Other Diagnostic Data and Device ID with it. PostHog Error Tracking adds a
second collector inside categories that are already answered, so the questionnaire gains no
row. One answer does change:

- **Crash Data gains the Analytics purpose.** Today that row carries only
  `NSPrivacyCollectedDataTypePurposeAppFunctionality`, because Observe's telemetry exists to keep
  the app working. A PostHog exception is stored in the analytics product, joined to the product
  events that preceded it on the same install identifier, and read to decide what to build next.
  That is Apple's "using data to evaluate user behavior", so `NSPrivacyCollectedDataTypePurposeAnalytics`
  is added to the Crash Data row in `apps/mobile/app.json` under `ios.privacyManifests` and to the
  App Store Connect answer, exactly as the Device ID row already carries both purposes.

Linkage and tracking do not move: linked to the user, on ADR 0033 section 5's reasoning, and not
used for tracking. Apple allows questionnaire answers to change without an app update, but they
must be accurate before any build with Error Tracking enabled reaches the App Store, and ADR 0033
section 6 item 3 already requires Apple's pages to be re-read on the submission date.

Retention and deletion inherit ADR 0033 section 4 and section 7 without improvement. An
exception is an event, so it falls under the project's twelve-month retention, and the stack
trace is retained with it. Deletion is no better than it is for any other event: kuyara's events
are anonymous under `identified_only`, no person profile exists, and PostHog's persons API
resolves a `distinct_id` to a person row that is not there, so identifier-based deletion is not
promised for exceptions either. The policy's existing wording stands and is extended only to name
crash and error data among what is collected.

### 6. Price, volume and the hard ceiling

From PostHog's error tracking pricing page (read 2026-09-13): 100,000 exceptions per month are
free, then $0.000370 per exception from 100,000 to 325,000, $0.000140 from 325,000 to 10 million,
and $0.000115 above that. Billing counts `$exception` events ingested and is separate from the
1,000,000 free analytics events per month on the same free plan (posthog.com/pricing, read
2026-09-13), so enabling this does not eat into the analytics allowance. Events dropped before
ingestion, which is what a server-side suppression rule does, are not billed. These figures are a
reading on one date and are recalculated from the same pages at implementation time.

The volume estimate for the expected first-release audience, tens to low hundreds of installs: at
200 installs and two sessions a day, roughly 12,000 sessions a month reach PostHog, and only the
consenting share of them at that. An uncaught exception in one session out of twenty is about 600
exceptions a month. Even a pathological release throwing once in every session is about 12,000, an
eighth of the free allowance. Reaching 100,000 needs roughly eight uncaught exceptions per session
at that install count, which no honest failure rate produces. The real risk is not the user count,
it is a loop: an exception thrown on every render or inside a retry, which can generate thousands
in one session on one device.

The required controls follow from that, and from `AGENTS.md`'s rule that paid usage has explicit
hard limits and no automatic top-up:

1. A per-session client cap. The app captures at most five exceptions per session and deduplicates
   by exception `type` plus the topmost in-app frame, so a render loop costs five events, not five
   thousand. This is the control that actually binds, because it acts before anything is sent.
2. An organisation billing limit for error tracking set to zero dollars, so the free allowance is a
   hard ceiling. PostHog stops capturing exception events for the rest of the billing period when a
   limit is reached, and warns that data beyond it "is lost forever", which is the correct trade for
   this project. If the billing settings refuse a zero value, the lowest amount they accept is used
   and the number is recorded with the setting.
3. The account owner's usage alerts at 80 and 100 percent of the free allowance stay on, so a noisy
   release is visible before the ceiling.
4. No automatic top-up, which PostHog does not offer, and no raising the limit during an incident
   without a decision.
5. A server-side suppression rule for any issue that proves noisy and uninformative, which stops
   ingestion and therefore stops billing for it.

### 7. Two collectors, split by layer, and no third

Both systems stay, with ownership divided by what each can actually see:

- **EAS Observe owns the native layer and performance.** MetricKit crash diagnostics on physical
  devices, launch and navigation timing, the two user-defined events, and kuyara's own
  `TelemetryError` reports with a closed code. Only the native subscriber sees a process that died.
- **PostHog owns the JavaScript layer.** Uncaught exceptions and unhandled rejections, grouped into
  issues, with source-mapped traces and the product events that preceded them on the same install.
  That correlation is the entire reason ADR 0023 preferred PostHog for this, and Observe cannot
  provide it because it holds no product behaviour by design.

Because the split is by layer, `nativeCrashes` autocapture stays off and
`@posthog/react-native-plugin` is not added. There stays exactly one native crash collector.

One overlap is accepted rather than solved. `expo-app-metrics` installs a global `ErrorUtils`
handler unconditionally when it is imported and records unhandled JavaScript errors as
`js.exception` log rows, and the installed version offers no switch to turn that off, as the
adapter's own verification notes record. So an uncaught JavaScript error will reach both systems
while consent is granted. That costs nothing on the PostHog side beyond the one exception already
counted, it duplicates no new data category, and the alternative would be patching a dependency's
global handler, which is worse than the duplication. If Expo adds a switch, Observe's JavaScript
error capture is turned off in the same change and PostHog owns that layer alone. Neither system is
dropped for errors in the meantime, and no third error collector is added.

### 8. Acceptance conditions for milestone 12

1. `errorTracking.autocapture` is `{ uncaughtExceptions: true, unhandledRejections: true }` with
   `console` absent or empty and `nativeCrashes` absent; `exceptionSteps` stays
   `{ enabled: false }`. A test asserts the resolved options.
2. No client, and therefore no handler, exists while consent is `undecided` or `withdrawn`; a test
   proves that an uncaught exception in that state sends nothing and is not buffered for a later
   grant.
3. The extended `before_send` allowlist is in place with the unit test described in section 4, and
   a test proves the hook runs for an exception event.
4. The per-session cap and deduplication of section 6 are implemented and tested.
5. Source map upload runs in the EAS build, the credentials are EAS secrets, and one real exception
   is confirmed resolved to readable frames in the PostHog issue view before the milestone is
   accepted. The verification exception is thrown deliberately from a development build, never from
   a production one.
6. The billing limit, the alerts and any suppression rules are configured in PostHog, and the values
   set are recorded in `docs/current-status.md`.
7. `apps/mobile/ios/kuyara/PrivacyInfo.xcprivacy` and `apps/mobile/app.json` carry the Analytics
   purpose on the Crash Data row, the App Store Connect answer matches, and the privacy policy names
   crash and error data reaching the analytics provider.
8. The greppable boundary rules still hold: no PostHog SDK import outside
   `apps/mobile/src/features/analytics/data/`, and `identify()`, `alias()`, `group()` and
   `setPersonProperties()` still have no caller.
9. PostHog's pricing and error tracking pages are re-read on the implementation date and the figures
   in section 6 are corrected in place if they moved.

## Consequences

- Uncaught JavaScript failures become grouped, source-mapped issues correlated with product
  behaviour, for consenting installs only.
- The handled-error surfaces keep their coarse taxonomy events, so the failure picture stays split
  between two shapes of data: counted surfaces and grouped exceptions.
- The bootstrap failure remains invisible to every consent-gated collector, and the "Report a
  problem" share action stays the only in-app channel for it.
- The App Store questionnaire and the privacy manifest change by one purpose on an existing row,
  which does not require an app update but does require accuracy before the enabling build ships.
- A build-time personal API key enters the release pipeline, which is a new secret to hold and the
  first credential in this project that is not a Worker secret or a public key.
- Two error collectors run, split by layer, with one accepted duplicate for uncaught JavaScript
  errors until Expo makes theirs switchable.

## Red lines

- Never enable `console` autocapture. It converts arbitrary log strings into billed exceptions and
  is a free-text channel through the exclusion list.
- Never enable `nativeCrashes` or add `@posthog/react-native-plugin` without a new decision. One
  native crash collector.
- Never enable `exceptionSteps`. Breadcrumb messages are app-authored free text attached to
  exceptions.
- Never call `captureException` on a caught error, and never place a caught error's message in any
  property of any event. A handled failure reaches a provider as a closed code and coarse
  attributes.
- Never add a second consent surface, a separate crash-reporting toggle, or a prompt that asks for
  exception capture on its own.
- Never construct the analytics client before consent, and never move or copy the consent answer out
  of the profile row, to reach an earlier failure. The bootstrap gap is closed by the share action,
  not by weakening the gate.
- Never widen `ErrorSurface` with a `bootstrap` value to imply coverage that consent-gated analytics
  cannot provide.
- Never enable session replay to see what led to a crash. It keeps its ADR 0023 section 9 status.
- Never let `identify()`, `alias()`, `group()` or `setPersonProperties()` gain a caller because an
  issue would be easier to read with a person profile.
- Never relax `before_send` back to a blanket "every `$` key passes" rule for exception properties,
  and never send frame `vars`.
- Never commit `POSTHOG_CLI_API_KEY` or expose it as an `EXPO_PUBLIC_` variable.
- Never raise or remove the billing limit to keep data flowing during an incident, and never enable
  automatic top-up if PostHog ever offers one.
- Never suppress, rewrite or filter a crash record client-side to hide user data that reached it. If
  a message carries user data, stop the data reaching the throwing path.

## Out of scope

- Session replay, which keeps its ADR 0023 section 9 status.
- Operational observability for the Worker, which is milestone 14.
- A user-facing feedback, survey or in-app bug-report product beyond the share action already
  shipped.
- Alerting, on-call routing and issue assignment inside PostHog, which are workflow, not this
  decision.
- Any change to the Observe integration other than turning off its JavaScript error capture if and
  when Expo makes that possible.

## Sources

PostHog, all read 2026-09-13:

- Error tracking overview: <https://posthog.com/docs/error-tracking>
- React Native installation and `errorTracking` options: <https://posthog.com/docs/error-tracking/installation/react-native>
- Uploading source maps, React Native: <https://posthog.com/docs/error-tracking/upload-source-maps/react-native>
- Error tracking pricing: <https://posthog.com/docs/error-tracking/pricing>
- Pricing and free allowances: <https://posthog.com/pricing>
- Billing limits and alerts: <https://posthog.com/docs/billing/limits-alerts>
- Source: `dist/error-tracking/index.d.ts` and `dist/error-tracking/index.js` in
  `posthog-react-native@4.68.4`, and `dist/error-tracking/types.d.ts` in `@posthog/core@1.52.0`,
  as installed in this repository

Repository:

- [ADR 0023](0023-behavioural-product-analytics-with-posthog.md) sections 6, 8, 9 and 11
- [ADR 0033](0033-apple-privacy-obligations-for-first-party-analytics.md) sections 3 to 7
- [`docs/analytics-taxonomy.md`](../analytics-taxonomy.md) section 5.10
- `apps/mobile/src/features/analytics/data/posthog-product-analytics.ts` and
  `apps/mobile/src/features/analytics/data/observe-performance-telemetry.ts`
