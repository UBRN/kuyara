# ADR 0032: Local weather alerts fire on two deterministic rules over today's forecast

Status: Accepted (2026-09-09)

Implementation: phases 1 to 3 are complete, code-reviewed, and verified on the Simulator
for foreground behavior and background-task registration safety. Actual background
execution still needs a physical-device check the Simulator cannot give (see Known Issues).
For phase 3, `expo-background-task` and its required peer `expo-task-manager` are pinned
`~57.0.16` (checked against the npm registry 2026-09-09), aligned with the installed
`expo@~57.0.9` (SDK 57), and follow the existing `~57.0.x` Expo package pattern. The first
wraps `BGTaskScheduler` on iOS and `WorkManager` on Android through a small JS surface;
the second is its standard Expo peer. Both are maintained by the Expo core team,
MIT-licensed, add no new network path, and require no permission beyond the config
plugin's `Info.plist` and manifest entries. No existing dependency covers this, and a
hand-rolled native module would duplicate the platform package.

Completes: [ADR 0004](0004-notifications-in-the-mvp.md) milestone N2, which left
"the alert-rule thresholds themselves" as an N2 design question.

## Context

N1 supplied the notification foundation: the `expo-notifications` plugin, the opt-in
preference on `local_profiles`, the permission flow on the Settings Notifications
surface, and the response observer in the root layout, without real alert scheduling.
ADR 0004 named the product intent, "rain starting in the afternoon or a sharp temperature
swing", and left the rules to this decision.

Three facts from the repository shape the rules:

- The weather contract's `hourly` array holds at most 25 entries and every entry must
  belong to the current local day of the snapshot's time zone
  (`packages/contracts/src/weather-v1.ts`). The "next 24 to 48 hours" ADR 0004 imagined
  are not available without a Worker and provider-adapter change. N2 therefore alerts on
  the remainder of today, and that limitation is accepted here rather than solved.
- The deterministic requirement engine already draws the product's weather lines:
  precipitation is "likely" at probability 0.6 and "possible" at 0.3, a daily range of
  8 °C is "wide", and cold, heat and wind have their own steps
  (`features/recommendation/domain/weather-to-clothing-requirements.ts`). An alert that
  used different numbers would contradict the outfit it interrupts.
- The requirement engine is pure and tested with boundary values. The alert module is
  built the same way: a pure planner over the snapshot, the clock and a small amount of
  state, with no import of `expo-notifications`, SQLite or React.

## Decision

### 1. Two rules, one alert each per location and local day

The planner evaluates the snapshot's hourly entries that lie after `now` and belong to
the day `now` falls in, in the snapshot's time zone. This same current-local-day rule is
used by the clothing requirement engine and Today's rain outlook.

- **Precipitation onset.** Fires when the current measurement is dry (probability below
  0.6 and a condition outside drizzle, rain, heavy rain, sleet, snow, thunderstorm) and a
  later hour of today is wet (probability at or above 0.6, or a wet condition). The
  crossing is the first wet hour. The alert carries `form: 'rain' | 'snow'`; sleet and
  snow are snow, everything else is rain.
- **Temperature swing.** Fires when a later hour's apparent temperature differs from the
  current apparent temperature by at least 8 °C. The crossing is the first such hour and
  the alert carries the direction, `drop` or `rise`, and both apparent temperatures. One
  swing alert per day; if the day has both a drop and a rise, the earlier crossing wins.

Wind is deliberately not a rule: wind changes what outerwear is, which the outfit already
covers, and it does not announce itself at an hour the way rain does. UV, humidity and
condition-only changes are not rules either.

### 2. Identity and repeat suppression

An alert's identity is `<ruleId>:<locationKey>:<localDate>`, where `localDate` is the day
`now` falls in, in the snapshot's time zone. Each identity fires at most once. Rescheduling
cancels every pending kuyara alert and re-plans from the fresh snapshot, so a pending alert
may move or disappear as the forecast changes; an identity that has already fired is handed
to the planner as delivered and is never re-planned that day. Changing the active location
starts a new identity space, so a user who switches cities can be alerted for the new one.

### 3. Lead time

On the foreground path, an alert fires 60 minutes before its crossing. A crossing less
than 60 minutes ahead of `now` produces no foreground alert because the app is open and the
Weather tab already shows the hour. On the background-task path, where the app is not open,
a crossing closer than 60 minutes is scheduled with a shortened 15-minute lead. Quiet
hours still apply, and the 30-minute post-quiet-hours budget never pushes an alert later
than the applicable lead. Both lead times are named constants in the domain module.

### 4. Quiet hours

Quiet hours are 22:00 to 07:00 by default, evaluated in the time zone the caller supplies
(the device's, since quiet hours are about the person, not the place). A fire time inside
quiet hours moves to the end of quiet hours when that still leaves at least 30 minutes
before the crossing; otherwise the alert is dropped for the day. No control exists for
quiet hours in this phase; ADR 0030's Notifications surface is laid out so a second group
can be added underneath without moving anything, and that group is where a control would
go, designed separately.

### 5. Content

The domain module produces structured plans, never copy. The scheduling layer turns a plan
into a localized title and body at scheduling time, in the active language, from keys
under `notifications.alerts`. The crossing time is formatted for the snapshot's time zone.
A notification carries no coordinates, no place name beyond what the user typed or chose,
and no identifier.

### 6. Gates and phases

Alerts are planned only when the profile's `notificationsOptIn` is true and the OS
permission is granted, and only from a snapshot that is fresh under the existing 30-minute
window. A stale or invalid snapshot cancels nothing and writes nothing; the existing
schedule and ledger remain until a fresh snapshot arrives. Turning opt-in off cancels every
pending alert regardless of snapshot age.

- **Phase 1, domain.** `features/notifications/domain/weather-alerts.ts` contains the
  planner, its types and constants, with boundary tests in the style of the requirement
  engine.
- **Phase 2, scheduling.** The gateway supports cancel-all and schedule-with-identity
  methods, an Android notification channel, a `weather_alert_deliveries` ledger holding
  identity and fire time, and rescheduling after every persisted
  fresh snapshot and after opt-in changes. The gateway reports whether the OS accepted a
  cancellation or schedule; a ledger row is written only for an accepted alert, and a
  failed cancel-all aborts the reschedule. The Simulator verifies the foreground path.
- **Phase 3, background refresh.** `expo-background-task` reruns the refresh and reschedule when iOS
  grants a window. It reuses a cached snapshot that is still fresh instead of fetching,
  registers on opt-in, and unregisters on opt-out. Needs one physical-device check; the
  Simulator cannot run it.

## Consequences

- Alerts cover today only until the weather contract carries tomorrow's hours. That
  change is a separate decision, because it touches every provider adapter and the
  Worker cache.
- The thresholds are shared numbers, not shared code: the alert module restates 0.6 and
  8 °C as its own named constants and a test pins them to the requirement engine's values
  so the two cannot drift silently.
- A user who opens the app after the foreground lead time has passed gets no foreground
  alert for that crossing. A background task may still schedule it with the shortened
  lead when quiet-hours rules permit.
- Nothing here changes the Worker, the privacy boundary or any persisted coordinate.
- The observer replans when the app becomes active and when the local date changes.
- Settings reports notifications as on only when opt-in and OS permission agree.

## Out of scope

- A quiet-hours control, per-rule toggles, or alert history in the UI.
- Multi-day alerts, provider alerts, `forecastNextHour` and WeatherKit severe-weather
  alerts (ADR 0014).
- Server-sent push (N3).
