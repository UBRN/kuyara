# Analytics event and property taxonomy

Status: draft, revised 2026-09-09 after review. Implements milestone 8 ("Analytics, and
what it makes a release prerequisite") from `docs/current-status.md`.

This document is the reviewable artifact named by
[ADR 0023](adr/0023-behavioural-product-analytics-with-posthog.md), section 6: "the event
and property schema is reviewed on its own before the PostHog integration is written."
Nothing in this file installs an SDK, calls a provider, or emits an event. It is a design
document only.

Source of truth for the rules this taxonomy follows:

- [ADR 0023](adr/0023-behavioural-product-analytics-with-posthog.md): PostHog as provider,
  coverage over volume, the `ProductAnalytics` boundary, the privacy exclusion list, ATT
  and consent as separate questions.
- [ADR 0033](adr/0033-apple-privacy-obligations-for-first-party-analytics.md): consent
  before the first event, an in-app withdrawal control, identity severance on withdrawal,
  `personProfiles: identified_only`, and IP capture off. It withdraws ADR 0023's "no
  permanent toggle" preference, so where the two disagree ADR 0033 governs.
- [ADR 0031](adr/0031-dress-style-is-the-formality-signal.md): dress style and the coarse
  age bucket as the only profile-derived properties; the birth date and its year
  never leave the device.
- `AGENTS.md`, "Worker, API, security, and privacy" and "Localization and preferences."

## 1. Design principles this taxonomy follows

- Coverage, not volume: enough structured events to reconstruct activation, funnels,
  feature adoption, retention, abandonment, and friction. No event exists only because it
  was technically easy to add.
- Every property is structured, language-independent, and low-cardinality: closed enums or
  bucketed numbers, never free text, never a raw provider value.
- Every enum in this document is closed. A new value is added here first, in the same
  change that adds it to the code it is derived from, and it bumps `schema_version`.
- High-frequency signals are aggregated, sampled, or omitted rather than sent per
  occurrence.
- All PostHog calls go through the project-owned `ProductAnalytics` boundary (not written
  by this task); this taxonomy is that boundary's contract, not an implementation.
- Where PostHog's React Native SDK already covers an area through a documented, built-in
  capability, this taxonomy prefers that capability over a hand-rolled duplicate, to keep
  the custom event count proportionate to what the built-in coverage cannot answer.
- Where a property would need a classification the code does not have yet, the taxonomy
  names that classification and makes it a prerequisite rather than inventing values the
  call site cannot supply.

## 2. Identity decision

**Decision: yes, a minimal anonymous analytics identity is needed, and it must not be
`localProfileId`.**

Funnels, retention, and abandonment all require grouping events from one install into one
timeline. Without any identity, every event is an unlinkable point and none of ADR 0023's
stated goals (activation, funnels, retention, before/after comparison) can be answered.

Constraints on that identity, all of them settled by ADR 0033 section 5 unless noted:

- It is the identity the PostHog SDK creates on its own: a random per-install value the SDK
  generates and persists. It is not derived from `localProfileId`, not derived from any
  hardware or OS-level identifier, and not read from or written to the app's SQLite
  database.
- It is not a "device identifier intended to fingerprint a physical device persistently"
  (the excluded category in ADR 0023 section 6), because it is an install-scoped random
  value with no hardware or vendor identifier behind it.
- `personProfiles` keeps its `identified_only` default, and `identify()`, `alias()`,
  `group()` and `setPersonProperties()` have no caller in the accountless release. Every
  event is therefore an anonymous event with no person profile. **Consequence for this
  taxonomy: there are no person properties.** Anything the analysis needs to segment by
  must be attached to the event itself, which is why section 3 states exactly which events
  carry `dress_style` and `age_bucket`.
- IP capture is disabled on the PostHog project, so no geo property is derived from the
  request and the Coarse Location category stays off the privacy questionnaire.
- `localProfileId` and the analytics identity are never sent in the same payload and never
  derived from one another, so the two identity spaces stay permanently separable.
- **Withdrawal severs the identity.** On withdrawal the app calls `optOut()`, `reset()`,
  and clears the separately persisted `$device_id`. `reset()` alone regenerates the
  anonymous id but keeps `$device_id`, which was seeded from the first anonymous id, so
  clearing it is what makes the severance real. That is a milestone 10 acceptance check in
  ADR 0033 section 6, not an optional refinement, and it means a later re-consent starts a
  new identity that cannot be joined to the old one.
- Resetting analytics data must not touch `localProfileId` or any application data, and
  clearing application data must not be required to reset analytics identity.

**Consent gate.** The SDK initialises with `defaultOptIn: false`. No event defined in
section 5 may be captured before `optIn()` is called from the consent surface, and a
decline captures nothing at all, not even a "declined" event (see section 5.14). Nothing
in this taxonomy overrides that gate.

**Open, not decided here:** whether and how to link this anonymous identity to a future
authenticated profile once accounts exist. See open question 1.

## 3. Coarse age bucket and dress style: the only profile-derived properties

Per ADR 0031, these two are the only values derived from the profile that may appear on any
analytics event or property. No other profile field (including gender) is an analytics
property under this taxonomy.

| Property | Allowed values | Derivation rule |
| --- | --- | --- |
| `dress_style` | `casual`, `smart`, `formal` | The profile's stored dress style; a null stored value reads as `smart`, matching product logic, so no event ever carries null. |
| `age_bucket` | `under_18`, `18_24`, `25_34`, `35_44`, `45_54`, `55_64`, `65_plus`, `unknown` | Computed at emit time from the birth year only, never sent as a date or year. `unknown` means no birth date on file and nothing else. |

**`under_18` is a distinct bucket, decided 2026-09-09.** ADR 0031's standard buckets start
at 18 to 24, and onboarding enforces no minimum date (the birth-date step caps the picker
at today and sets no lower bound), so a computed age under 18 is reachable. Folding it into
`unknown` would silently mix "no date on file" with "a real date below the first bucket"
and would hide the one segment where a product or legal question could arise. Both values
are still derived at emit time only; no bucket is stored, and the date and year never leave
the device.

**Which events carry them, as a rule rather than a judgement call.** Because there are no
person profiles (section 2), these properties exist only where they are attached. They are
attached to exactly four events, chosen because their product questions are segmentation
questions: `onboarding_completed`, `recommendation_viewed`, `outfit_detail_opened`, and
`closet_item_created`. No other event in section 5 carries either property. Two places
carry a dress-style value for a different reason and are not segmentation: the
`dress_style` step of `onboarding_step_completed`, and `setting_changed`'s `new_value` when
`setting_name` is `dress_style`. Both report the value being chosen.

`gender` is intentionally never an analytics property.

## 4. Property exclusion checklist

Apply this checklist to every event definition and every `ProductAnalytics` call site
before it ships. An event fails review if any box is unchecked.

- [ ] No exact latitude or longitude, and no place name entered as free text.
- [ ] No Closet photo, image content, or file path.
- [ ] No free-form user text (garment names, colors, notes, search input).
- [ ] No full AI prompt and no full AI model response.
- [ ] No raw WeatherKit or other provider response.
- [ ] No secret, token, or credential.
- [ ] No complete SQLite row.
- [ ] No persistent device fingerprint.
- [ ] `localProfileId` is never sent as, or derived into, an analytics identifier.
- [ ] No birth date and no birth year; only `age_bucket` (section 3) may leave the device.
- [ ] No `gender` value on any event or property.
- [ ] Every property value is a member of a closed enum or a bucketed/aggregated number,
      never an unbounded string.
- [ ] Any high-frequency signal is sampled, aggregated, or omitted per section 6, not sent
      per occurrence.
- [ ] Every custom event carries `schema_version`.
- [ ] The call site is unreachable before consent: nothing is captured until `optIn()`.

## 5. Event list, grouped by ADR 0023 section 5's coverage areas

Event names are stable, `snake_case`, and versioned only by adding new events, not by
renaming existing ones. "Trigger" is the exact user or system action that fires the event.

Sections 5.1 to 5.12 follow ADR 0023 section 5's twelve areas in order. Sections 5.13 and
5.14 are two areas that ADR 0023 could not have listed: local weather alerts shipped under
[ADR 0032](adr/0032-local-weather-alert-rules.md) after it was written, and the consent
surface became part of milestone 10 under ADR 0033.

### 5.0 Properties every event carries

Every custom event sent through the `ProductAnalytics` boundary carries `schema_version`
(integer, starting at 1). It is incremented only when an existing event's properties change
meaning or an allowed value set changes, not when a new event is added. The SDK-supplied app
version, OS version, and build number (already covered by the provider default, section 5.1)
are not duplicated as custom properties on any event.

**Count.** This document defines **twenty-four custom events**. `docs/current-status.md`
records twenty, which was the count of the first draft before this revision; that line is
corrected when the taxonomy is accepted.

**Domain values are mapped, not passed through.** Several enums below are the `snake_case`
form of a kebab-case domain type. `generation_mode` is `ai_assisted` / `deterministic_fallback`
for the domain's `'ai-assisted'` / `'deterministic-fallback'`
(`features/recommendation/domain/generation-mode.ts`), and `trigger_reason` maps the seven
values of `RecommendationRefreshTrigger` the same way. The mapping lives in the
`ProductAnalytics` boundary, in one place, and a domain value with no mapping is a build
error rather than a passed-through string.

### 5.1 App lifecycle and session usage

Covered by PostHog's React Native SDK lifecycle autocapture (`captureAppLifecycleEvents`),
not a custom event: it already emits application-installed, -opened, -backgrounded, and
-updated events with app version, OS version, and build metadata as properties, all
provider-added and already structured and low-cardinality. Adding a hand-rolled duplicate
would raise event volume for no new coverage. Session boundaries and session length are
PostHog's own session properties, not a custom event.

| Event | Trigger | Properties | Notes |
| --- | --- | --- | --- |
| *(provider default: application opened/backgrounded/updated/installed)* | app process lifecycle transitions | SDK-supplied: app version, OS version, build number | No custom code needed; verify at implementation time that the SDK default payload contains nothing on the exclusion list. |

The backgrounded event is also the flush point for the aggregation rules in section 6.

**Product questions answered.** Lifecycle autocapture answers "how often and how long is the
app used?"

### 5.2 Onboarding progress and abandonment

Onboarding has five steps: welcome, gender, dress style, birth date (optional), location
(optional). `AGENTS.md` and the implementation agree on five (`totalSteps = 5` in
`features/profile/presentation/onboarding-screen.tsx`); ADR 0031 section 5 says four
because it predates the location step and does not count welcome. Abandonment is read from
PostHog funnels between `onboarding_started` and `onboarding_completed`, not from a
dedicated abandonment event, since there is no reliable trigger for "the user will never
come back."

| Event | Trigger | Properties | Sampling / aggregation |
| --- | --- | --- | --- |
| `onboarding_started` | The welcome step is shown. | none | n/a |
| `onboarding_step_completed` | The user advances past a step. | `step_name` (`welcome`\|`gender`\|`dress_style`\|`birth_date`\|`location`), `step_index` (1-5), `skipped` (boolean, only meaningful for `birth_date`/`location`), `dress_style` (only on the `dress_style` step, section 3 values) | none |
| `onboarding_completed` | The last step finishes and the app enters the main tabs. | `dress_style` (section 3), `age_bucket` (section 3), `location_method` (`device`\|`manual`\|`skipped`) | none |

`gender` is intentionally absent from every onboarding event (section 3/4).

**Product questions answered.**

- `onboarding_started`: how many people begin onboarding at all, relative to installs?
- `onboarding_step_completed`: where in onboarding do people stop?
- `onboarding_completed`: what share of started onboardings finish, and with which dress
  style, age bucket, and location method?

### 5.3 Screen and navigation usage

One generic event with a closed `screen_name` enum instead of one custom event per route,
to keep coverage of "every screen" proportionate in event count.

| Event | Trigger | Properties |
| --- | --- | --- |
| `screen_viewed` | A tracked screen gains focus. | `screen_name`: `onboarding`, `today`, `outfit_detail`, `weather`, `weather_location`, `profile`, `closet_list`, `closet_item_form`, `closet_garment_type_picker`, `settings`, `settings_appearance`, `settings_language`, `settings_notifications`, `settings_gender`, `settings_dress_style`, `settings_birth_date`, `settings_ai_status`, `settings_privacy` |

The enum mirrors the routes that exist. Two corrections against the first draft:
`closet_item_detail` was removed, because there is no Closet detail screen (the grid's tile
opens the edit form directly, so `closet_item_form` covers both the new and edit routes);
and `settings_privacy` was added for the Privacy surface ADR 0033 section 3 places one
level under Settings. Adding a route means adding a value here, not inventing an ad hoc
name at the call site.

**Product questions answered.**

- `screen_viewed`: which screens do people actually visit, and how often?

### 5.4 Weather interactions

| Event | Trigger | Properties |
| --- | --- | --- |
| `weather_refreshed` | A weather fetch completes, manual or automatic (stale-data background refresh). | `trigger_method` (`manual`\|`automatic_stale`), `result` (`success`\|`failure_kept_last_known`), `condition_category` (present only when `result` is `success`) |
| `location_changed` | The active location changes, in onboarding or in Settings/Weather. | `method` (`device`\|`manual_selection`), `change_context` (`onboarding`\|`weather_tab`) |

`condition_category` is a bucket over the provider-neutral model's closed eleven-code
condition vocabulary (`weatherConditionCodes` in `packages/contracts/src/weather-v1.ts`,
mirrored in `features/weather/domain/weather.ts`), never a raw provider condition string.
The mapping is total and stated here so it cannot drift:

| `condition_category` | Condition codes |
| --- | --- |
| `clear` | `clear`, `mostly_clear` |
| `cloudy` | `partly_cloudy`, `cloudy` |
| `fog` | `fog` |
| `precipitation` | `drizzle`, `rain`, `heavy_rain` |
| `snow` | `sleet`, `snow` |
| `storm` | `thunderstorm` |

The first draft also listed `extreme` and `unknown`. Neither exists: no code maps to
`extreme`, and a failed refresh carries no new condition at all, which is why the property
is omitted rather than sent as `unknown` when `result` is `failure_kept_last_known`. A new
condition code extends the contract and this table in the same change.

**Product questions answered.**

- `weather_refreshed`: how often do refreshes succeed versus fail, and under which
  conditions?
- `location_changed`: how do people set their location, and how often does it change after
  onboarding?

### 5.5 Recommendation impressions and interactions

| Event | Trigger | Properties |
| --- | --- | --- |
| `recommendation_viewed` | Today renders a recommendation, cached or freshly generated. | `generation_mode` (`ai_assisted`\|`deterministic_fallback`), `cache_state` (`fresh`\|`stale_shown`\|`refreshing`), `outfit_count` (integer), `dress_style`, `age_bucket` (section 3) |
| `recommendation_regenerated` | A new recommendation is generated. | `trigger_reason` (seven values, below), `generation_mode` (`ai_assisted`\|`deterministic_fallback`), `result` (`success`\|`failure_kept_last_known`) |

`trigger_reason` is the `snake_case` mapping of `RecommendationRefreshTrigger`
(`features/recommendation/application/recommendation-application-controller.ts`), which has
seven values, not the five the first draft listed:

| `trigger_reason` | Domain value |
| --- | --- |
| `first_recommendation` | `first-recommendation` |
| `stale_weather_refresh` | `stale-weather-refreshed` |
| `location_changed` | `active-location-changed` |
| `clothing_preference_changed` | `clothing-preference-changed` |
| `dress_style_changed` | `dress-style-changed` |
| `new_calendar_day` | `local-day-changed` |
| `explicit_request` | `explicit` |

Two of these are absent from the five triggers `AGENTS.md` lists: the first generation
after install, and a dress-style change (which ADR 0031 made a recommendation input). The
code is the authority here, and the `AGENTS.md` sentence should be reconciled with it
separately.

`explicit_request` is **kept, and is expected to be absent from the data at first.** The
first draft called it `manual_request` and described it as a user action, but the only
producer of `'explicit'` is the `refresh` callback the recommendation provider exposes, and
no screen calls it: Today and outfit detail both destructure only `state`, and Today's pull
to refresh calls the weather application instead, which reaches recommendations as
`stale_weather_refresh`. Keeping the value costs nothing, matches the domain enum
one-for-one, and avoids a `schema_version` bump on the day a screen wires the callback up.
An analysis that sees zero `explicit_request` events is seeing the product as it is.

**Product questions answered.**

- `recommendation_viewed`: how often do people see a fresh, stale, AI-assisted, or fallback
  recommendation, and does that differ by dress style or age bucket?
- `recommendation_regenerated`: which trigger actually drives regeneration, and how often
  does it fail?

### 5.6 Outfit selection

| Event | Trigger | Properties |
| --- | --- | --- |
| `outfit_detail_opened` | The user opens one of the three outfits from Today. | `outfit_position` (`1`\|`2`\|`3`), `archetype` (one of the twelve closed archetype identifiers already defined in the AI selection contract; not restated here to avoid drift from that source of truth), `generation_mode` (`ai_assisted`\|`deterministic_fallback`), `dress_style`, `age_bucket` (section 3) |

This is the only selection signal the current product surfaces: there is no separate
"choose this outfit" action beyond opening its detail. If a future explicit "wearing this"
action ships, it gets its own event rather than overloading this one.

**Product questions answered.**

- `outfit_detail_opened`: which outfit position and archetype do people open, and does that
  vary by generation mode, dress style, or age bucket?

### 5.7 Refresh and retry behaviour

| Event | Trigger | Properties | Sampling / aggregation |
| --- | --- | --- | --- |
| `manual_refresh_triggered` | The user pulls to refresh, or taps a refresh control, on Today, Weather, or the Closet list. | `surface` (`today`\|`weather`\|`closet`), `result` (`success`\|`failure_kept_last_known`) | none, this action is user-paced |
| `retry_after_failure_triggered` | The user retries after a shown failure state. | `surface` (`today`\|`weather`\|`recommendation`\|`closet`), `attempt_number` (integer, bounded by the Worker's configured max attempts), `result` (`success`\|`failure`) | See section 6: repeated retries within a short window are deduplicated client-side before they reach `ProductAnalytics`. |

`closet` was missing from the first draft's `surface` enum: the Closet grid has its own
pull to refresh (`features/wardrobe/presentation/wardrobe-list-screen.tsx`). It is also the
one surface where the pull gesture and the failure-state retry button share a single
handler (`onRetry`), so the two events must be distinguished at the call site by which
control fired, not by the handler.

**Product questions answered.**

- `manual_refresh_triggered`: how often do people manually refresh, and does it work?
- `retry_after_failure_triggered`: do retries after a failure eventually succeed, and how
  many attempts does it take?

### 5.8 Closet adoption and create/update/delete actions

| Event | Trigger | Properties |
| --- | --- | --- |
| `closet_item_created` | A new Closet entry is saved. | `state` (`owned`\|`wanted`), `garment_type_id` (catalog identifier, closed vocabulary), `has_photo` (boolean), `entry_point` (`closet_tab`\|`outfit_detail`), `dress_style`, `age_bucket` (section 3) |
| `closet_item_updated` | An existing entry is edited and saved, or its ownership is changed from outfit detail. | `fields_changed` (subset of the closed set `garment_type`, `name`, `color_family`, `state`, `photo`), `garment_type_id`, `entry_point` (`closet_tab`\|`outfit_detail`) |
| `closet_item_deleted` | An entry is deleted. | `state` (`owned`\|`wanted`), `had_photo` (boolean) |

`fields_changed` now covers all five editable fields. The first draft listed three and
omitted `name` and `color_family`, which the form does edit
(`features/wardrobe/presentation/wardrobe-item-form-screen.tsx`). It reports **which
categories changed, never any value**: `name` is free text and its content may never leave
the device (section 4), and `color_family` is a closed catalog vocabulary whose values are
still not sent, because the product question is "what do people revisit", not "which colour
won". Whether the `name` and `color_family` flags are worth carrying at all is open
question 2.

`entry_point` is on `closet_item_updated` because ownership also changes outside the
Closet: outfit detail's ownership control creates or updates a Closet entry directly, so an
update event with no entry point would attribute Closet edits to a screen the user never
opened.

Closet screen views are covered by `screen_viewed` (5.3), not a separate event.
`garment_type_id` is the catalog's own identifier, never a free-form name.

**Product questions answered.**

- `closet_item_created`: do people adopt the Closet, and from which entry point?
- `closet_item_updated`: what do people change about an existing entry after creating it,
  and from where?
- `closet_item_deleted`: how often are Closet entries removed, and were they owned or
  wanted?

### 5.9 Settings usage

| Event | Trigger | Properties |
| --- | --- | --- |
| `setting_changed` | Any Settings value changes. | `setting_name` (`appearance_theme`\|`language`\|`notifications_enabled`\|`dress_style`\|`gender`\|`birth_date`), `new_value` (present only for `appearance_theme`: `system`\|`light`\|`dark`; `language`: `system`\|`tr`\|`en`; `notifications_enabled`: boolean; `dress_style`: section 3 values; absent for `gender` and `birth_date`, since neither value is an allowed analytics property) |
| `ai_probe_triggered` | The user triggers the AI status probe on the Settings AI status screen. | `result` (`ok`\|`unavailable`\|`rate_limited`\|`error`) |

`ai_probe_triggered` lost two properties the code cannot supply. `probe_type` is gone
because there is exactly one user-triggerable probe: the AI status screen's single check
action (`features/recommendation/application/use-ai-probe.ts`). Configuration readiness is
not a probe, it is a local boolean computed from whether a Worker base URL is configured,
and it fires no request and no event. `cached` is gone because the Worker's probe response
body is `{ status, checkedAt }` (`apps/worker/src/ai/probe-handler.ts`); the cache is
server-side and the client cannot tell a cached answer from a fresh one, so the flag could
only ever have been guessed. `result` now carries the four states the UI actually reaches
(`features/recommendation/application/ai-probe-state.ts`), which keeps the rate-limited
case visible instead of collapsing it into a generic failure.

**Product questions answered.**

- `setting_changed`: which settings do people actually change?
- `ai_probe_triggered`: how often do people manually check AI status, and what do they see?

### 5.10 Failure and recovery behaviour

| Event | Trigger | Properties | Sampling / aggregation |
| --- | --- | --- | --- |
| `error_shown` | A user-facing failure state renders on a surface, for the first time in this session for that `(surface, failure_category)` pair. | `surface` (`today`\|`weather`\|`recommendation`\|`closet`\|`settings`\|`onboarding`), `failure_category` (below), `occurrence_count` (integer, see the emission rule) | One event per `(surface, failure_category)` per session; see the rule below. |
| `error_recovered` | A success lands on a surface that emitted `error_shown` earlier in the same session. | `surface` (same enum), `failure_category` (the pair that recovered) | Once per `(surface, failure_category)` per session; a second failure and recovery in the same session does not emit again. |

**Emission rule, decided 2026-09-09.** The first draft carried a `recovered` boolean on
`error_shown`, which cannot work: a captured event is immutable, so a flag describing
something that happens later can never be set. Recovery is therefore its own event, joined
to the failure by `(surface, failure_category)` within the session. `occurrence_count`
follows the same shape: the boundary counts repeats of a pair in memory and finalises the
count when the session ends or the app is backgrounded (the lifecycle event in 5.1 is the
flush point), so exactly one `error_shown` per pair per session reaches PostHog. A count
that is still open when the process is killed is lost, which is acceptable: this measures
where friction is, not how many times it occurred to the last unit.

**`failure_category` needs a classification that does not exist yet.** No shared failure
taxonomy exists in the app today. The only classification is `WeatherRefreshFailure`
(`offline` | `unavailable` | `rate-limited`, in
`features/weather/application/weather-application-controller.ts`), and the screens above it
throw that detail away: Today and outfit detail collapse every failure, including a null
snapshot and a null recommendation, into one `unavailable` screen state. Emitting the
eight-value enum the first draft listed would mean inventing values no call site can
produce.

So `failure_category` is defined as the `snake_case` form of a shared domain failure
classification whose first version is exactly the four values today's code can distinguish:
`offline`, `unavailable`, `rate_limited`, `unknown`. **Introducing that classification, and
mapping the weather, recommendation, and Closet failure paths onto it, is a prerequisite of
milestone 10**, not part of the analytics integration itself; without it `error_shown` can
only report `unknown` and answers nothing. Widening it (a timeout, a validation failure, a
storage error) extends the domain type and this enum in the same change and bumps
`schema_version`.

Never the provider name, model identity, raw error message, or stack trace, per the
existing "sanitized errors" and "never expose provider names" rules.

**Product questions answered.**

- `error_shown`: where and why do failures happen, and how widespread is each kind?
- `error_recovered`: do people get out of a failure state in the same session?

### 5.11 Feature adoption

One generic first-use event instead of a bespoke "first X" event per feature.

| Event | Trigger | Properties |
| --- | --- | --- |
| `feature_used_first_time` | The first time, per install, that a defined feature is used. | `feature_name` (`closet`\|`manual_refresh`\|`ai_status_probe`\|`location_override`\|`appearance_override`\|`language_override`\|`notifications`) |

**Where "first time, per install" is remembered.** The `ProductAnalytics` boundary owns a
small set of already-emitted feature names in its own storage, alongside the SDK's own
persisted state and never in the app's SQLite database, which section 2 puts off limits to
analytics. It is cleared when the analytics identity is severed on withdrawal, so a
re-consented install reports first use again on the new identity, which is the correct
behaviour: the old identity's events are unjoinable by design. The exact storage mechanism
is a milestone 10 implementation choice. If no such store is available without adding a
dependency, the event is dropped rather than approximated, and first use is derived in
PostHog from the earliest occurrence of the underlying event per identity.

**Product questions answered.**

- `feature_used_first_time`: which features get discovered at all, and how soon after
  install?

### 5.12 Account conversion

Not defined. Accounts do not exist yet (`AGENTS.md`, product scope). No event name is
reserved here; designing this area now would be speculative infrastructure ahead of the
feature it measures. Revisit this section when Supabase Auth work is scheduled.

### 5.13 Notifications

Local weather alerts shipped under ADR 0032 after ADR 0023 was written, so this area is not
in its list. Three things are observable and one is not.

| Event | Trigger | Properties | Sampling / aggregation |
| --- | --- | --- | --- |
| `notification_permission_resolved` | The user turns the notifications setting on and the permission question resolves. | `outcome` (`enabled`\|`blocked`), `can_request_again` (boolean, present only when `outcome` is `blocked`) | none, user-paced |
| `weather_alert_scheduled` | A planned alert is scheduled with the OS. | `alert_rule` (`precipitation_onset`\|`temperature_swing`) | Once per plan identifier: the scheduler cancels and reschedules every plan on each weather change, so the event is emitted only for plan identifiers not already in the delivery ledger, never on a rescheduling of a plan already recorded. |
| `notification_opened` | The user taps a delivered weather alert and the app opens. | `alert_rule` (`unknown`) | none |

`outcome` is the controller's own return value (`'enabled'` | `'blocked'` | `'disabled'`,
in `features/notifications/application/notification-application-controller.ts`).
`disabled`, the user turning the setting off, is already `setting_changed` with
`notifications_enabled` (5.9) and is not duplicated here.

`alert_rule` on `notification_opened` is **`unknown` and stays `unknown` for now**: the
gateway's response subscription takes a listener with no payload
(`features/notifications/data/notification-gateway.ts`), so the app knows a notification was
tapped but not which one. Widening the listener to carry the plan identifier is a code
change, not a taxonomy decision; until it happens the property is honest about what is
known. The value is still sent rather than omitted so the enum can widen without a
different event shape.

**There is no delivered event.** iOS delivers a scheduled local notification with the app
suspended or terminated, and no delivery receipt reaches the app. The delivery ledger's
fired-identifier inference (a plan whose fire time has passed) is a scheduling bookkeeping
device, not evidence that anything was displayed, and must not be emitted as one. Delivery
volume is estimated from `weather_alert_scheduled` instead, with that caveat attached.

**Product questions answered.**

- `notification_permission_resolved`: how many people who want alerts are blocked by the
  OS permission?
- `weather_alert_scheduled`: which alert rule actually fires, and how often?
- `notification_opened`: do alerts bring people back into the app?

### 5.14 Consent

ADR 0033 section 3 makes a consent surface and an in-app withdrawal control part of
milestone 10's definition of done. Both are measurable, within a hard limit: **a decline
captures nothing at all.**

| Event | Trigger | Properties |
| --- | --- | --- |
| `analytics_consent_granted` | Immediately after `optIn()` succeeds. It is the first event on the identity. | `surface` (`onboarding`\|`first_launch_sheet`\|`settings_privacy`) |
| `analytics_consent_withdrawn` | Immediately before `optOut()`, `reset()`, and the `$device_id` clear. It is the last event on the identity. | none |

`surface` has three values because ADR 0033 leaves the consent surface's placement to
milestone 10 design and lists an onboarding step and a first-launch sheet as the
candidates; `settings_privacy` covers a re-consent after a withdrawal.

Declining, or never answering, is not an event and cannot be one: with `defaultOptIn: false`
nothing may be captured before `optIn()`, and guideline 5.1.1 (ii) requires decline to be as
easy as accept and to change nothing else. The decline rate is therefore not directly
measurable, and the correct proxy is grants against installs, using the SDK's
application-installed event, which is itself only captured after consent. This is a known
and accepted blind spot, not an oversight to be engineered around.

**Product questions answered.**

- `analytics_consent_granted`: how many people consent, and from which surface?
- `analytics_consent_withdrawn`: does anyone withdraw, and how often?

## 6. High-frequency signal handling

None of the events above fire on raw taps, scroll, or continuous gestures; all are gated by
a completed user action or a state transition, which already bounds their frequency to
normal usage. The exceptions requiring an explicit rule:

- `retry_after_failure_triggered`: a user or automatic retry loop must not turn into an
  event storm. `attempt_number` is bounded by the Worker's configured max attempts per
  request, and the `ProductAnalytics` boundary must not be called more often than that
  bound regardless of UI retry-button mashing.
- `error_shown`: one event per `(surface, failure_category)` per session, with
  `occurrence_count` finalised at session end or backgrounding (section 5.10). Repeats
  never reach the network.
- `error_recovered`: once per `(surface, failure_category)` per session, so a flapping
  network cannot produce an alternating stream.
- `weather_alert_scheduled`: deduplicated against the delivery ledger by plan identifier,
  because rescheduling is normal and frequent while the plan set is unchanged
  (section 5.13).
- `screen_viewed`: fires on focus, so a tab-switching session can produce a dozen. It is
  left unsampled because it is the backbone of navigation analysis, and it is the first
  lever named in section 7 if volume ever becomes a constraint.

If a future need arises to measure genuinely high-frequency interaction (e.g. scroll depth
on a list), it must be added here with an explicit sampling rate before it is implemented,
not sent unsampled by default.

## 7. Event volume estimate

**This is an estimate, not a measurement.** ADR 0023 section 11 deliberately refuses to
freeze provider prices and quotas, so nothing here records PostHog's free-tier allowance as
a fact. What this section fixes is kuyara's side of the arithmetic, so the allowance can be
divided by it at implementation time.

Assuming an engaged user who opens the app around 20 times a month (a weather app is
checked most days), sees two or three screens per open, and edits the Closet occasionally:

| Source | Events per month per active user |
| --- | --- |
| Lifecycle autocapture (opened, backgrounded, updated) | about 40 |
| `screen_viewed` | about 50 |
| `weather_refreshed` | about 30 |
| `recommendation_regenerated` | about 25 |
| `recommendation_viewed` | about 20 |
| `outfit_detail_opened` | about 10 |
| Everything else (manual refresh, retries, Closet, Settings, errors, notifications, first use, consent, onboarding amortised over the install's life) | about 25 |
| **Total** | **about 200, call it 200 to 300 with error and retry variance** |

So the monthly active user ceiling is roughly the plan's monthly event allowance divided by
300. Verify the current allowance, its overage behaviour, and whether a free plan drops
events or bills for them, from PostHog's own pricing page at implementation time; the first
release's expected audience is orders of magnitude below any plausible ceiling, which is
why no sampling is applied up front.

Two sources are 45 percent of the total. If the ceiling is ever approached, the levers in
order are: sample `screen_viewed`, then turn off lifecycle autocapture and keep only the
opened event. Neither breaks the onboarding funnel, the recommendation questions, or the
failure analysis, which are the reasons this taxonomy exists.

## 8. Open questions for the maintainer

Two questions remain open. The rest of the first draft's list has been answered and the
answers are now in the sections above.

1. **Identity linking at account creation.** Section 2 decides an anonymous identity is
   needed now, but not whether or how to link it to an authenticated profile once accounts
   exist. ADR 0033 section 7 keeps the related "linked or not linked" question open for the
   App Privacy questionnaire, and ADR 0022's accounts are milestone 15 work. Needs a
   decision when Supabase Auth work starts, not before.
2. **Are `name` and `color_family` edits worth measuring?** Section 5.8 reports both as
   category flags on `fields_changed`, with no values. The narrower question is whether
   knowing that someone renamed an item or changed its colour family answers any product
   question worth two more flags on the event. Dropping them costs nothing; keeping them is
   also privacy-safe. Maintainer's call.

Answered elsewhere, kept here as pointers:

- **Consent, revocation, and deletion.** Decided by ADR 0033 sections 3 and 4, not open.
  See section 2 for the gate and section 5.14 for the events.
- **`age_bucket` under 18.** Decided 2026-09-09: a distinct `under_18` bucket, section 3.
- **The `error_shown` window and cap.** Decided 2026-09-09: one event per
  `(surface, failure_category)` per session with `occurrence_count` finalised at session end
  or backgrounding, and recovery as its own event. Section 5.10.
- **Session replay and Error Tracking.** Held by ADR 0023 sections 8 and 9 and by
  milestones 12 and 13. This taxonomy covers neither, and both need their own privacy and
  sampling review before implementation.
