# ADR 0004: Notifications in the MVP are on-device local weather alerts, not server push

Status: Accepted (2026-08-29)

Implementation: N1 completed on 2026-08-29; N2 remains next; N3 remains deferred.

## Context

The confirmed MVP decisions excluded notifications entirely ("The MVP has no
account, cross-device sync, behavioral analytics, or notifications"). That
exclusion is now lifted: the product should warn a user about upcoming weather
that changes what they need to wear, for example rain starting in the afternoon
or a sharp temperature swing.

"Reliable even when the app has not been opened for days" points at remote push:
the Worker would hold a per-device push token, a stored location, alert
thresholds, and a schedule, and a cron trigger would fetch each device's
forecast and send a push. That path forces three departures from recorded
decisions:

- **A server-owned per-user store.** The local-first rules make Expo SQLite the
  source of truth and forbid an outbox, sync engine, or server revision system
  in the MVP. There is no account. A subscription table is the first
  server-owned user record.
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

Notifications enter the MVP as **on-device local weather alerts only**. No push
token, no APNs registration, no Worker endpoint, no server-side device or
location store. The decision is scoped into three milestones:

- **N1, mobile notification foundation.** The `expo-notifications` config
  plugin; an OS permission flow surfaced in Settings; a `notifications_opt_in`
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

- The "no notifications" MVP line becomes "notifications limited to on-device
  local weather alerts, no server-sent push". `product-decisions.md`,
  `current-status.md`, and `AGENTS.md` are updated to match.
- No privacy regression. No new identifier is created or stored. The Worker,
  the AI input privacy boundary, and the "no coordinates persisted or logged"
  rule are untouched.
- Alert timeliness is bounded by how often the user opens the app; the
  background task only narrows the staleness on unopened days and stops
  altogether if the user swipes the app away in the app switcher. This is an
  accepted limitation, and the reason N3 stays on the table.
- `expo-background-task` background execution is unavailable on the iOS
  Simulator, so N2's background path needs one physical-device verification.
- N1 is independently shippable and was completed without weather-alert logic.
- Continuous Native Generation applies the `expo-notifications` plugin during
  builds. Its iOS notification entitlement is accepted, while remote background
  notifications remain disabled and no push token is requested.

## Out of scope

- Any Worker change, endpoint, binding, or secret.
- Push tokens, APNs keys, Expo Push Service, EAS `projectId` wiring.
- The N2 alert-rule thresholds themselves, which are an N2 design question.
- Android exact-alarm and notification-channel setup, which N1 does not need
  because it schedules no real notifications; N2 addresses them.
