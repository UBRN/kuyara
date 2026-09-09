# Analytics event and property taxonomy

Status: draft, for review. Implements milestone 8 ("Analytics, and what it makes a
release prerequisite") from `docs/current-status.md`.

This document is the reviewable artifact named by
[ADR 0023](adr/0023-behavioural-product-analytics-with-posthog.md), section 6: "the event
and property schema is reviewed on its own before the PostHog integration is written."
Nothing in this file installs an SDK, calls a provider, or emits an event. It is a design
document only.

Source of truth for the rules this taxonomy follows:

- [ADR 0023](adr/0023-behavioural-product-analytics-with-posthog.md): PostHog as provider,
  coverage over volume, the `ProductAnalytics` boundary, the privacy exclusion list, ATT
  and consent as separate questions.
- [ADR 0031](adr/0031-dress-style-is-the-formality-signal.md): dress style and the coarse
  age bucket as the only allowed profile-derived properties; the birth date and its year
  never leave the device.
- `AGENTS.md`, "Worker, API, security, and privacy" and "Localization and preferences."

## 1. Design principles this taxonomy follows

- Coverage, not volume: enough structured events to reconstruct activation, funnels,
  feature adoption, retention, abandonment, and friction. No event exists only because it
  was technically easy to add.
- Every property is structured, language-independent, and low-cardinality: closed enums or
  bucketed numbers, never free text, never a raw provider value.
- High-frequency signals are aggregated, sampled, or omitted rather than sent per
  occurrence.
- All PostHog calls go through the project-owned `ProductAnalytics` boundary (not written
  by this task); this taxonomy is that boundary's contract, not an implementation.
- Where PostHog's React Native SDK already covers an area through a documented, built-in
  capability, this taxonomy prefers that capability over a hand-rolled duplicate, to keep
  the custom event count proportionate to what the built-in coverage cannot answer.

## 2. Identity decision

**Decision: yes, a minimal anonymous analytics identity is needed, and it must not be
`localProfileId`.**

Funnels, retention, and abandonment all require grouping events from one install into one
timeline. Without any identity, every event is an unlinkable point and none of ADR 0023's
stated goals (activation, funnels, retention, before/after comparison) can be answered.

Constraints on that identity:

- It is generated and persisted by the PostHog SDK's own default anonymous-ID mechanism, not
  derived from `localProfileId`, not derived from any hardware or OS-level identifier, and
  not read from or written to the app's SQLite database.
- It is not a "device identifier intended to fingerprint a physical device persistently"
  (the excluded category in ADR 0023 section 6): PostHog's anonymous ID is an
  install-scoped random value the SDK manages and can reset independently of app data, not
  a stable hardware fingerprint.
- `localProfileId` and the analytics identity are never sent in the same payload and never
  derived from one another, so the two identity spaces stay permanently separable.
- Resetting analytics data (e.g. a future "reset my analytics" action) must not touch
  `localProfileId` or any application data, and clearing application data must not be
  required to reset analytics identity.

**Open, not decided here:** whether and how to link this anonymous identity to a future
authenticated profile once accounts exist. ADR 0023 section 6 requires the relevant Apple
and privacy constraints to be verified before that linking is implemented; this document
does not pre-approve a mechanism for it. See open question 1.

## 3. Coarse age bucket and dress style: the only profile-derived properties

Per ADR 0031, these two are the only values derived from the profile that may appear on any
analytics event or property. No other profile field (including gender) is an analytics
property under this taxonomy.

| Property | Allowed values | Derivation rule |
| --- | --- | --- |
| `dress_style` | `casual`, `smart`, `formal` | The profile's stored dress style; a null stored value reads as `smart`, matching product logic, so no event ever carries null. |
| `age_bucket` | `18_24`, `25_34`, `35_44`, `45_54`, `55_64`, `65_plus`, `unknown` | Computed at emit time from the birth year only, never sent as a date or year. `unknown` covers no birth date on file. See open question 2 for computed ages under 18. |

Both are closed, low-cardinality, language-independent, and safe to attach to any event
listed in section 5 where profile context is relevant. `gender` is intentionally never an
analytics property.

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

## 5. Event list, grouped by ADR 0023 section 5's coverage areas

Event names are stable, `snake_case`, and versioned only by adding new events, not by
renaming existing ones. "Trigger" is the exact user or system action that fires the event.

### 5.0 Properties every event carries

Every custom event sent through the `ProductAnalytics` boundary carries `schema_version`
(integer, starting at 1). It is incremented only when an existing event's properties change
meaning or an allowed value set changes, not when a new event is added. The SDK-supplied app
version, OS version, and build number (already covered by the provider default, section 5.1)
are not duplicated as custom properties on any event.

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

**Product questions answered.** Lifecycle autocapture answers "how often and how long is the
app used?"

### 5.2 Onboarding progress and abandonment

Onboarding has five steps per `AGENTS.md`: welcome, gender, dress style, birth date
(optional), location (optional). Abandonment is read from PostHog funnels between
`onboarding_started` and `onboarding_completed`, not from a dedicated abandonment event,
since there is no reliable trigger for "the user will never come back."

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
| `screen_viewed` | A tracked screen gains focus. | `screen_name`: `onboarding`, `today`, `outfit_detail`, `weather`, `weather_location`, `profile`, `closet_list`, `closet_item_detail`, `closet_item_form`, `closet_garment_type_picker`, `settings`, `settings_appearance`, `settings_language`, `settings_notifications`, `settings_gender`, `settings_dress_style`, `settings_birth_date`, `settings_ai_status` |

The enum is closed and reviewed alongside route changes; adding a route means adding a
value here, not inventing an ad hoc name at the call site.

**Product questions answered.**

- `screen_viewed`: which screens do people actually visit, and how often?

### 5.4 Weather interactions

| Event | Trigger | Properties |
| --- | --- | --- |
| `weather_refreshed` | A weather fetch completes, manual or automatic (stale-data background refresh). | `trigger_method` (`manual`\|`automatic_stale`), `result` (`success`\|`failure_kept_last_known`), `condition_category` (`clear`\|`cloudy`\|`precipitation`\|`snow`\|`storm`\|`fog`\|`extreme`\|`unknown`) |
| `location_changed` | The active location changes, in onboarding or in Settings/Weather. | `method` (`device`\|`manual_selection`), `change_context` (`onboarding`\|`weather_tab`) |

`condition_category` is a small closed bucket derived from the provider-neutral weather
model, never the raw provider condition string.

**Product questions answered.**

- `weather_refreshed`: how often do refreshes succeed versus fail, and under which
  conditions?
- `location_changed`: how do people set their location, and how often does it change after
  onboarding?

### 5.5 Recommendation impressions and interactions

| Event | Trigger | Properties |
| --- | --- | --- |
| `recommendation_viewed` | Today renders a recommendation, cached or freshly generated. | `generation_mode` (`ai_assisted`\|`deterministic_fallback`), `cache_state` (`fresh`\|`stale_shown`\|`refreshing`), `outfit_count` (integer) |
| `recommendation_regenerated` | A new recommendation is generated, matching the five documented triggers. | `trigger_reason` (`stale_weather_refresh`\|`location_changed`\|`clothing_preference_changed`\|`new_calendar_day`\|`manual_request`), `generation_mode` (`ai_assisted`\|`deterministic_fallback`), `result` (`success`\|`failure_kept_last_known`) |

**Product questions answered.**

- `recommendation_viewed`: how often do people see a fresh, stale, AI-assisted, or fallback
  recommendation?
- `recommendation_regenerated`: which of the five triggers actually drives regeneration, and
  how often does it fail?

### 5.6 Outfit selection

| Event | Trigger | Properties |
| --- | --- | --- |
| `outfit_detail_opened` | The user opens one of the three outfits from Today. | `outfit_position` (`1`\|`2`\|`3`), `archetype` (one of the twelve closed archetype identifiers already defined in the AI selection contract; not restated here to avoid drift from that source of truth), `generation_mode` (`ai_assisted`\|`deterministic_fallback`) |

This is the only selection signal the current product surfaces: there is no separate
"choose this outfit" action beyond opening its detail. If a future explicit "wearing this"
action ships, it gets its own event rather than overloading this one.

**Product questions answered.**

- `outfit_detail_opened`: which outfit position and archetype do people open, and does that
  vary by generation mode?

### 5.7 Refresh and retry behaviour

| Event | Trigger | Properties | Sampling / aggregation |
| --- | --- | --- | --- |
| `manual_refresh_triggered` | The user pulls to refresh or taps refresh on Today or Weather. | `surface` (`today`\|`weather`), `result` (`success`\|`failure_kept_last_known`) | none, this action is user-paced |
| `retry_after_failure_triggered` | The user retries after a shown failure state. | `surface` (`today`\|`weather`\|`recommendation`), `attempt_number` (integer, bounded by the Worker's configured max attempts), `result` (`success`\|`failure`) | See section 6: repeated retries within a short window are deduplicated client-side before they reach `ProductAnalytics`. |

**Product questions answered.**

- `manual_refresh_triggered`: how often do people manually refresh, and does it work?
- `retry_after_failure_triggered`: do retries after a failure eventually succeed, and how
  many attempts does it take?

### 5.8 Closet adoption and create/update/delete actions

| Event | Trigger | Properties |
| --- | --- | --- |
| `closet_item_created` | A new Closet entry is saved. | `state` (`owned`\|`wanted`), `garment_type_id` (catalog identifier, closed vocabulary), `has_photo` (boolean), `entry_point` (`closet_tab`\|`outfit_detail`) |
| `closet_item_updated` | An existing entry is edited and saved. | `fields_changed` (subset of the closed set `state`, `garment_type`, `photo`), `garment_type_id` |
| `closet_item_deleted` | An entry is deleted. | `state` (`owned`\|`wanted`), `had_photo` (boolean) |

Closet screen views are covered by `screen_viewed` (5.3), not a separate event.
`garment_type_id` is the catalog's own identifier, never a free-form name.

**Product questions answered.**

- `closet_item_created`: do people adopt the Closet, and from which entry point?
- `closet_item_updated`: what do people change about an existing entry after creating it?
- `closet_item_deleted`: how often are Closet entries removed, and were they owned or
  wanted?

### 5.9 Settings usage

| Event | Trigger | Properties |
| --- | --- | --- |
| `setting_changed` | Any Settings value changes. | `setting_name` (`appearance_theme`\|`language`\|`notifications_enabled`\|`dress_style`\|`gender`\|`birth_date`), `new_value` (present only for `appearance_theme`: `system`\|`light`\|`dark`; `language`: `system`\|`tr`\|`en`; `notifications_enabled`: boolean; `dress_style`: section 3 values; absent for `gender` and `birth_date`, since neither value is an allowed analytics property) |
| `ai_probe_triggered` | The user manually triggers the AI status probe in Settings. | `probe_type` (`config_readiness`\|`active_provider_probe`), `result` (`success`\|`failure`), `cached` (boolean) |

**Product questions answered.**

- `setting_changed`: which settings do people actually change?
- `ai_probe_triggered`: how often do people manually check AI status, and does it succeed?

### 5.10 Failure and recovery behaviour

| Event | Trigger | Properties | Sampling / aggregation |
| --- | --- | --- | --- |
| `error_shown` | A user-facing failure state renders on any screen. | `surface` (`today`\|`weather`\|`recommendation`\|`closet`\|`settings`\|`onboarding`), `failure_category` (`network`\|`timeout`\|`provider_unavailable`\|`quota_or_rate_limit`\|`invalid_response`\|`validation_failed`\|`storage_error`\|`unknown`), `recovered` (boolean, set when a later success on the same surface lands in the same session) | Identical `(surface, failure_category)` pairs within a short rolling window (implementation detail, not fixed here) are coalesced into one event with an `occurrence_count` property, never resent per occurrence. |

Never the provider name, model identity, raw error message, or stack trace, per the
existing "sanitized errors" and "never expose provider names" rules.

**Product questions answered.**

- `error_shown`: where and why do failures happen, and do people recover in the same
  session?

### 5.11 Feature adoption

One generic first-use event instead of a bespoke "first X" event per feature.

| Event | Trigger | Properties |
| --- | --- | --- |
| `feature_used_first_time` | The first time, per install, that a defined feature is used. | `feature_name` (`closet`\|`manual_refresh`\|`ai_status_probe`\|`location_override`\|`appearance_override`\|`language_override`) |

**Product questions answered.**

- `feature_used_first_time`: which features get discovered at all, and how soon after
  install?

### 5.12 Account conversion

Not defined. Accounts do not exist yet (`AGENTS.md`, product scope). No event name is
reserved here; designing this area now would be speculative infrastructure ahead of the
feature it measures. Revisit this section when Supabase Auth work is scheduled.

## 6. High-frequency signal handling

None of the events above fire on raw taps, scroll, or continuous gestures; all are gated by
a completed user action or a state transition, which already bounds their frequency to
normal usage. The two exceptions requiring an explicit rule:

- `retry_after_failure_triggered`: a user or automatic retry loop must not turn into an
  event storm. `attempt_number` is bounded by the Worker's configured max attempts per
  request, and the `ProductAnalytics` boundary must not be called more often than that
  bound regardless of UI retry-button mashing.
- `error_shown`: identical failures repeating in a short window are coalesced client-side
  into one event carrying `occurrence_count`, not sent once per occurrence.

If a future need arises to measure genuinely high-frequency interaction (e.g. scroll depth
on a list), it must be added here with an explicit sampling rate before it is implemented,
not sent unsampled by default.

## 7. Open questions for the maintainer

1. **Identity linking at account creation.** Section 2 decides an anonymous ID is needed
   now, but not whether or how to link it to a future authenticated profile. ADR 0023
   requires verifying Apple and privacy constraints before that linking exists. Needs a
   decision when Supabase Auth work starts.
2. **`age_bucket` for a computed age under 18.** ADR 0031's standard buckets start at
   `18_24`. This taxonomy currently sends `unknown` for any birth date implying an age
   under 18. Confirm that is the intended behavior rather than a new bucket.
3. **Consent gating.** ADR 0023 section 7 leaves consent, revocation, and deletion
   mechanisms unresolved. This taxonomy assumes every event in section 5 is gated behind
   whatever consent mechanism is eventually chosen; it does not itself define one.
4. **`fields_changed` granularity on `closet_item_updated`.** The taxonomy currently
   reports which closed categories changed (`state`, `garment_type`, `photo`) but not old
   or new values beyond what section 3 and 9 already allow. Confirm this granularity is
   enough to answer the intended product questions before implementation.
5. **Error window and dedupe threshold.** Section 6 requires coalescing repeated
   `error_shown` events but does not fix the rolling-window length or occurrence-count cap;
   that is an implementation parameter, not a taxonomy decision, and should be set with the
   cost budget in mind.
6. **Session replay and Error Tracking scope.** ADR 0023 sections 8 and 9 leave PostHog
   Error Tracking and session replay as separate future decisions. This taxonomy does not
   cover either; both need their own privacy and sampling review before implementation.
