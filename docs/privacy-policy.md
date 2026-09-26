---
title: kuyara privacy policy
lang: en
ref: privacy-policy
---

# kuyara privacy policy

Effective date: 2026-09-19.

kuyara is a weather and outfit recommendation app for iOS and Android. This policy
describes what data the app sends off your device, why, and what you can do about it.

## Summary

- kuyara does not ask you to sign in. Your profile, Closet and settings live on your device.
- Usage analytics and diagnostics are optional and sent only after you accept the consent
  question kuyara asks after onboarding.
- Two requests made by Expo, the toolkit kuyara is built with, happen every time the app
  starts, before and regardless of that answer. They carry a random installation identifier
  and version details about the app and the device, never anything you enter in kuyara.
- Analytics never includes your location, photos, name, garment names, birth date, or
  anything you type.
- kuyara does not track you across other apps or websites, shows no ads, and sells no data.
- You can turn analytics and diagnostics off at any time in Settings under Privacy.

## Usage analytics

kuyara asks once, after onboarding, whether you want to share usage data. If you decline,
nothing is sent and the app works exactly the same. If you accept, kuyara collects:

- **Product interaction.** Which screens open, taps such as refresh, whether a
  recommendation loaded, and how the Closet is used.
- **Other usage data.** Coarse product state such as whether a recommendation came from
  AI or the built-in fallback, your dress style setting, and a coarse age range (never
  your birth date).
- **An analytics identifier.** A random identifier created on your device when analytics
  is enabled. It links your events to each other so that funnels and feature use can be
  understood. It is not the advertising identifier, is not derived from any hardware
  identifier, and is not connected to your profile, your Closet, or any account.

Because dress style and age range travel with the identifier, this data counts as linked
to you under Apple's App Store definitions. It is not used for tracking.

**Why.** To understand which parts of kuyara are used, where recommendations fail, and
what to improve. It is used for nothing else.

**Never in analytics:** your location, coordinates, or city; Closet photos or image
content; garment names or any free-form text; your birth date or birth year; your gender;
full AI prompts or responses; raw weather provider responses; any device fingerprint.

**Processor.** Analytics is processed by PostHog (PostHog, Inc.) on PostHog Cloud EU,
hosted in Frankfurt, Germany. PostHog processes this data on kuyara's behalf as a data
processor under its data processing agreement and protects it to at least the standard
described here. PostHog's project settings discard your IP address at ingestion, so no
location, not even a city, is derived from it.

**Retention.** Analytics events are kept for 12 months and then deleted by PostHog.

## Performance and diagnostics

Performance and diagnostic data follows the same consent question kuyara asks after
onboarding for usage analytics. It is sent only if you accept. If you decline, nothing is
sent. If you accept, kuyara sends:

- **Performance timings.** App launch and screen-navigation timing, including time to first
  render and time to interactive.
- **App-defined events.** That a recommendation was generated or weather was refreshed.
  These events contain only closed category values and durations in whole milliseconds.
- **Handled errors.** Errors kuyara reports itself contain a short error code, coarse
  attributes and a stack trace of the app's own code, never the original error's message.
- **Crashes and unhandled errors.** If the app crashes or hits an error it did not handle,
  the report includes the technical error type, its message and a stack trace, plus the
  crash diagnostics iOS provides. These describe the app's code, not you. They can still
  contain technical text the app was processing at that moment. iOS hands crash
  diagnostics to the app after a later launch, and they are sent with the next dispatch
  while sharing is on. Unhandled JavaScript error reports and their stack traces also go
  to kuyara's analytics provider, PostHog, in the EU under the same consent answer.
- **Network performance.** The host name of the slowest network request during the app
  launch window.
- **Technical details.** A random per-installation identifier created by the Expo package,
  the OS name and version, generic device model name and model identifier (not the name you
  gave your device), language, app identifier, version, build number, runtime version, and
  update and channel identifiers. The package attaches these details to every payload. The
  per-installation identifier is separate from the analytics identifier. The two are never
  joined to each other or to your profile.

**Why.** To find slow launches, failures and crashes and fix them. Nothing else.

**Processor.** Expo receives this data at its Observe endpoint over HTTPS.
According to [Expo's published pricing information](https://expo.dev/pricing),
Observe retains this data for 90 days.

**Never in performance and diagnostics:** your location, coordinates, or city; Closet
contents or photos; profile preferences; AI prompts or responses; the analytics identifier
or the app's local profile identifier.

One technical limit applies. The Expo package may automatically write technical error
records before you answer the consent question. If you accept without sending the app to
the background in between, those records may then be delivered. Nothing is sent while your
answer is "no".

Under Apple's App Store definitions, this data is linked to you through the per-installation
identifier. It is not used for tracking.

## Expo launch requests

kuyara is built with Expo, and two of Expo's own packages send a request every time the app
starts. They run in the app's native code before your consent answer can be read, so neither is
covered by the Privacy switch in Settings. The launch count cannot be turned off inside the
app. The update check is kept on because it is how kuyara delivers updates.

- **Launch count.** One request to Expo Insights, `https://i.expo.dev`, each time the app
  starts cold. It carries an installation identifier, kuyara's Expo project identifier, the
  app version, the platform and the operating system version.
- **Update check.** One request to Expo Updates, `https://u.expo.dev`, on each launch, asking
  whether a newer version of the app is available. It carries the same installation identifier
  in a request header, along with the platform and the app's runtime version. If the app
  crashed in a way it could not handle on the previous launch, the update check also carries
  the technical error text from that crash. It describes the app's code, but can contain
  technical text the app was processing.

The installation identifier is the same random per-installation value described under
Performance and diagnostics above.

**Never in these requests:** your location, coordinates, or city; Closet contents or photos;
profile preferences; your name, birth date or gender; anything you type; the analytics
identifier; the app's local profile identifier.

**Why.** To count installs and launches per released version, and to deliver app updates.

**Processor.** Expo receives both requests over HTTPS. Expo has not published a retention
period for this data. This policy will be updated when the period is confirmed.

Deleting kuyara from your device removes the installation identifier; a fresh install creates
a new one, unless a device backup restores the old value.

## Turning analytics and diagnostics off

Open Settings, then Privacy, and switch off "Share usage data". Sending stops
immediately for both in the same session. Records made before the switch are not sent
afterwards. The Expo package may keep writing error records locally, but none are sent while
sharing is off. The app also discards the analytics identifier, so events collected before
that moment cannot be linked to anything collected later. The diagnostics identifier stays on
your device, but nothing further is sent with it. Turning sharing back on creates a new
analytics identifier. The two Expo launch requests described above are not part of
this switch and continue either way.

## Requesting deletion

Analytics events are stored without a user profile. That keeps them anonymous, but it also
means the processor cannot always delete them by identifier. If you want your events
deleted:

1. Copy your analytics identifier from Settings under Privacy (it is shown while sharing
   is on).
2. Email the maintainer at the address in the Contact section below with that identifier.

kuyara will forward the request to PostHog and tell you what happened, but cannot
guarantee that events without a profile can be removed early. In every case the events
expire after 12 months.

Diagnostics data and the two Expo launch requests carry a separate identifier that the app
does not show, so kuyara cannot currently request deletion of that data by identifier. This section will be updated when Expo's
procedure is confirmed.

## Weather and recommendations

To show weather and build outfits, the app talks to kuyara's own server, which in turn
calls weather and AI providers. This is a live request, not a record of you:

- **Weather.** The server receives your chosen location rounded to a hundredth of a degree
  (roughly one kilometre) and its time zone, uses them to fetch the forecast from a
  weather provider (Apple WeatherKit, Open-Meteo or OpenWeather), and returns it. Exact
  coordinates are never sent, stored, or logged. A location you choose by typing a city
  name is looked up through the same server with Open-Meteo's geocoding service.
- **Recommendations.** The server receives your clothing preference, dress style, optional
  style aesthetics, the app language, the catalog version, a day variant, the day type,
  deterministic clothing requirements derived from the weather, and catalog outfit options
  with their identifiers, formality, garment types and traits. It may ask an AI provider to
  pick three using only your clothing preference, a formality order derived from your dress
  style, the day type, and the options' identifiers, formality, garment types and eligible
  outfit categories. The provider also receives an instruction to write in the app language.
  Style aesthetics affect option ordering on your device but are not sent to the AI provider.
  The server receives no location, Closet contents, outfit history, photos, display name,
  birth date, or identifier for you or your device in this request.
- **On the device.** Your profile, including an optional display name, Closet entries and
  photos, worn outfit history, daily formality and style aesthetics choices, Later departure
  plans, cached weather, and weather alert schedules are stored in the app's private storage
  on your device. Closet and outfit history photos are not uploaded. Weather alerts are
  scheduled locally; no push token or device registration is sent anywhere. This on-device
  data, including the app's local database and any photos, is included in your own device
  backup, such as an iCloud backup, under your own backup settings; that backup is yours and
  the maintainer never receives it. You can delete Closet entries and clear a Later plan in
  the app. The current History screen has no delete control. Deleting kuyara removes its
  local app data from the device; copies in your device backups remain subject to your backup
  settings.

## Accounts

kuyara does not offer sign-in or cross-device sync today. Accounts are planned for a
later version. When they arrive, this policy will be updated before they launch, and
account deletion will cover any analytics data associated with the account.

## Changes

Changes to this policy are published at this address with a new effective date.

## Contact

Questions and deletion requests: email the maintainer at
[quint.inboard_9t@icloud.com](mailto:quint.inboard_9t@icloud.com). Bug reports belong on the
[support page](support).
