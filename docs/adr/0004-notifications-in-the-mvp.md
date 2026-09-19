# ADR 0004: Notifications in the MVP are on-device local weather alerts, not server push

Status: Accepted (2026-08-29)

Implementation: N1 and N2 are complete. N2 is governed by
[ADR 0032](0032-local-weather-alert-rules.md), which decided the thresholds this ADR left
open; N3 remains deferred.

Behavioural analytics is governed by
[ADR 0023](0023-behavioural-product-analytics-with-posthog.md), and the backend direction
is governed by
[ADR 0022](0022-supabase-is-the-intended-backend-and-kuyara-is-not-local-first.md). The
argument against server push rests on the first release shipping without sign-in and
without a server-owned per-user store. N3 remains deferred and still needs its own ADR.

## Context

The product should warn a user about upcoming weather that changes what they
need to wear, for example rain starting in the afternoon or a sharp temperature
swing. The first release still ships without sign-in or cross-device sync.

"Reliable even when the app has not been opened for days" points at remote push:
the Worker would hold a per-device push token, a stored location, alert
thresholds, and a schedule, and a cron trigger would fetch each device's
forecast and send a push. That path forces three departures from recorded
decisions:

- **A server-owned per-user store.** Expo SQLite is the device-side database and
  the MVP forbids an outbox, sync engine, or server revision system. There is no
  account. A subscription table would be the first server-owned user record.
- **Coordinates persisted server-side.** The weather API was designed so the
  Worker stores no coordinates; mobile sends rounded coordinates per request.
  Server-side forecast evaluation requires persisting a location per device,
  keyed to a stable push token.
- **Unbounded upstream spend.** A cron over N devices multiplies forecast calls
  by the tick rate. Open-Meteo fair-use is exhausted quickly as devices grow,
  and `AGENTS.md` requires explicit or safely derived limits.

kuyara is a "check it in the morning, get dressed" app. A user who opens it most
mornings already gives the app a fresh forecast at the moment it matters, from
which it can schedule on-device local notifications for the next 24 to 48 hours.
`expo-notifications` local scheduling needs no push token, no APNs credential,
no EAS `projectId`, and no Worker change.

The app-open path is the only dependable trigger. iOS `BGTaskScheduler` (via
`expo-background-task`) is best-effort only: iOS alone decides when a background
task runs, `minimumInterval` is a floor not a schedule, short intervals are
usually ignored in favour of system windows such as overnight, and iOS stops
the app's background tasks entirely once the user swipes the app away in the
app switcher. So background refresh reduces how stale the scheduled alerts get
on days the app is not opened; it does not guarantee that any given weather
change is caught. The residual gap is a user who has not opened the app in days
being alerted about weather changing within the hour.

## Decision

Notifications enter the MVP as **on-device local notifications only**. No push
token, no APNs registration, no Worker endpoint, no server-side device or
location store.

There are **two notification kinds**, each with its own opt-in behind the single OS
permission. The weather alert is the rule-driven one ADR 0032 owns. The **morning
briefing** is one notification a day at 07:00 local, carrying the morning's own
temperature range, its condition and whether precipitation is likely, plus the fact that
the day's outfit is ready. It composes nothing: no recommendation is generated for
tomorrow, the approved recommendation triggers and cache identity are untouched, and
tapping the briefing opens Today, where the outfit is produced by those ordinary
triggers. The briefing's opt-in is `morning_briefing_opt_in` on `local_profiles` (schema
version 15), and its row is the second group on the Settings Notifications surface, where
either kind can be turned off in one tap.

The briefing is scheduled only from a snapshot that is fresh under the existing 30-minute
window and whose hourly array actually reaches tomorrow's 07:00 hour in the snapshot's
time zone. When it does not, no briefing is planned and nothing is shown: the content is
never invented. Its identity is `morning_briefing:<localDate>` in the existing
`weather_alert_deliveries` ledger, which is what bounds it to one a day.

The opt-in is offered in two places and nowhere else. The Settings Notifications
surface holds it permanently, and Today makes one contextual offer at a moment a
notification would have been sent: an alert would have fired under
[ADR 0032](0032-local-weather-alert-rules.md)'s rules, **or** the morning briefing would
have been scheduled. Because a briefing is scheduled every day, the offer arrives on the
first fresh open rather than waiting for a rare rule crossing, and the person is asked
where the value is visible rather than three taps into Settings. The offer names both
kinds in one sentence, with an accept action and a dismiss action of the same size and no
accent fill; accepting turns both kinds on and lands on the Notifications surface, where
each can be turned off immediately. That offer is made once for the life of the install:
accepting it or dismissing it sets a durable `weather_alert_offer_shown` flag on
`local_profiles`, and a person who says no is never asked again. No other screen
asks, and nothing asks on a schedule.

The decision is scoped into three milestones:

- **N1, mobile notification foundation.** The `expo-notifications` config
  plugin; the OS permission flow behind the opt-in; a `notifications_opt_in`
  preference on `local_profiles` (schema version 6), following the existing
  language and theme preference pattern; a notification-response deep-link
  observer in the root layout; and a development-only "send test notification"
  action. `expo-notifications` is imported only in a single adapter behind a
  feature application controller. No weather logic. No background task.
- **N2, local weather alerts.** A deterministic alert-rule module over the
  existing weather snapshot and hourly data, in the style of the deterministic
  recommendation engine. The architecture is: on every app open, deterministically
  (re)schedule local notifications for the upcoming threshold crossings in the
  fresh forecast; additionally attempt a best-effort `expo-background-task`
  refresh that reschedules from newer data when iOS grants it. Plus repeat
  suppression and quiet hours. The background task is a staleness reducer, not a
  guarantee that a change is caught. Still no server.
- **N3, server-sent push. Deferred, not scheduled.** Reconsidered only if N2
  proves insufficient in real use. It would require its own ADR covering the
  server-owned subscription store, the persisted-coordinate privacy posture,
  APNs or Expo Push delivery, and hard spend controls.

## Consequences

- The MVP is limited to on-device local notifications, with no server-sent push.
- The briefing depends on the hourly window reaching tomorrow morning, which the
  36-hour contract normally gives but a short provider response can withhold. A day it
  cannot cover is a silent day, not a fabricated one.
- The briefing's fire time is 07:00 in the snapshot's time zone, the end of quiet hours
  there. [ADR 0032](0032-local-weather-alert-rules.md) section 4 records that quiet hours
  are read in the device's time zone, so the two can disagree while the person is
  travelling.
- No privacy regression. No new identifier is created or stored. The Worker,
  the AI input privacy boundary, and the "no coordinates persisted or logged"
  rule are untouched.
- Alert timeliness is bounded by how often the user opens the app; the
  background task only narrows the staleness on unopened days and stops
  altogether if the user swipes the app away in the app switcher. This is an
  accepted limitation, and the reason N3 stays on the table.
- `expo-background-task` background execution is unavailable on the iOS
  Simulator. A physical-device check is optional when actual background execution needs
  verification; the Simulator's foreground evidence does not establish that behavior.
- N1 is independently shippable and was completed without weather-alert logic.
- Continuous Native Generation applies the `expo-notifications` plugin during
  builds. Its iOS notification entitlement is accepted, while remote background
  notifications remain disabled and no push token is requested.

## Out of scope

- Any Worker change, endpoint, binding, or secret.
- Push tokens, APNs keys, Expo Push Service, EAS `projectId` wiring.
- Local alert-rule thresholds and behavior, which are owned by
  [ADR 0032](0032-local-weather-alert-rules.md).
- Android exact-alarm and notification-channel setup, which N1 does not need
  because it schedules no real notifications; N2 addresses them.
