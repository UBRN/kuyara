# ADR 0032: Local weather alerts fire on two deterministic rules over today's forecast

Status: Accepted (2026-09-09)

Implementation: phases 1 and 2 landed 2026-09-09 (phase 1 independently reviewed, phase 2 verified on the Simulator); phase 3 landed 2026-09-09, code-reviewed and verified on the Simulator for registration safety and unchanged foreground behavior, with the actual background execution left to a physical-device check the Simulator cannot give (see Known Issues). Dependency decision for phase 3: `expo-background-task` and its required peer `expo-task-manager`, both pinned `~57.0.16` (checked against the npm registry 2026-09-09), are the current stable releases aligned with the installed `expo@~57.0.9` (SDK 57), matching the `~57.0.x` pattern already used for `expo-location`, `expo-notifications`, and `expo-sqlite`. Neither package was previously in the lockfile. Bundle/native impact: `expo-background-task` wraps `BGTaskScheduler` on iOS and `WorkManager` on Android through a small JS surface with no extra permission beyond the config plugin's own `Info.plist`/manifest entries; `expo-task-manager` is its required peer and is already the standard companion Expo ships for out-of-app task registration. Both are maintained by the Expo core team, MIT-licensed, and add no new network path. No existing dependency covers this; a hand-rolled native module would duplicate what the platform package already wraps, so this is preferred over a custom implementation per the dependency policy.

Completes: [ADR 0004](0004-notifications-in-the-mvp.md) milestone N2, which left
"the alert-rule thresholds themselves" as an N2 design question.

## Context

N1 shipped the notification foundation: the `expo-notifications` plugin, the opt-in
preference on `local_profiles`, the permission flow on the Settings Notifications
surface, and the response observer in the root layout. Nothing schedules a real
notification yet. ADR 0004 named the product intent, "rain starting in the afternoon or a
sharp temperature swing", and deferred the rules.

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

The planner evaluates the snapshot's hourly entries that lie after `now`.

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

An alert's identity is `<ruleId>:<locationKey>:<localDate>`, where `localDate` is the
snapshot's local calendar day. Each identity fires at most once. Rescheduling cancels every
pending kuyara alert and re-plans from the fresh snapshot, so a pending alert may move or
disappear as the forecast changes; an identity that has already fired is handed to the
planner as delivered and is never re-planned that day. Changing the active location starts
a new identity space, so a user who switches cities can be alerted for the new one.

### 3. Lead time

An alert fires 60 minutes before its crossing. A crossing less than 60 minutes ahead of
`now` produces no alert: the app is open at that moment and the Weather tab already shows
the hour. The lead time is one named constant in the domain module.

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
permission is granted. Turning opt-in off cancels every pending alert.

- **Phase 1, domain.** `features/notifications/domain/weather-alerts.ts`: the planner,
  its types and constants, with boundary tests in the style of the requirement engine.
  Nothing imports it yet, so the running app is unchanged.
- **Phase 2, scheduling.** The gateway grows cancel-all and schedule-with-identity
  methods; an Android notification channel; a `weather_alert_deliveries` ledger at the
  next schema version holding identity and fire time; a reschedule after every persisted
  fresh snapshot and after opt-in changes. The Simulator verifies the foreground path.
- **Phase 3, background refresh.** `expo-background-task`, evaluated against the
  installed Expo SDK before it is added, re-running the refresh and reschedule when iOS
  grants a window. Needs one physical-device check; the Simulator cannot run it.

## Consequences

- Alerts cover today only until the weather contract carries tomorrow's hours. That
  change is a separate decision, because it touches every provider adapter and the
  Worker cache.
- The thresholds are shared numbers, not shared code: the alert module restates 0.6 and
  8 °C as its own named constants and a test pins them to the requirement engine's values
  so the two cannot drift silently.
- A user who opens the app after the lead time has passed gets no alert for that
  crossing; ADR 0004 accepted this and phase 3 narrows it.
- Nothing here changes the Worker, the privacy boundary or any persisted coordinate.

## Out of scope

- A quiet-hours control, per-rule toggles, or alert history in the UI.
- Multi-day alerts, provider alerts, `forecastNextHour` and WeatherKit severe-weather
  alerts (ADR 0014).
- Server-sent push (N3).
