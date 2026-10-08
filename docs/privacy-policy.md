---
title: kuyara privacy policy
lang: en
ref: privacy-policy
---

# kuyara privacy policy

Effective date: 8 October 2026.

kuyara is a weather and outfit recommendation app for iOS and Android. This policy
describes what data the app sends off your device, why, and what you can do about it.
This policy is the notice required by KVKK Article 10 and GDPR Article 13.

## Summary

- You can use kuyara without an account; an account is optional. Without one, your profile,
  Closet and settings live on your device. If you sign in, the [Accounts](#accounts) section
  explains what goes to your account.
- Usage analytics and performance diagnostics follow the choice you make in the app, apart
  from rare technical records described below.
- Two requests made by Expo, the toolkit kuyara is built with, happen every time the app
  starts, before and regardless of that answer. They carry a random installation identifier
  and version details about the app and the device. An update request can also carry the
  previous launch's fatal error text, as described below.
- Analytics never includes your location, photos, name, garment names, birth date, or
  anything you type.
- kuyara does not track you across other apps or websites, shows no ads, and sells no data.
- You can turn analytics and diagnostics off at any time in Settings under Privacy.

## Usage analytics

kuyara asks once, after onboarding, whether you want to share usage, performance and
diagnostic data. If you decline, none of this data is sent, apart from the rare technical
cases below, and the app works exactly the same. The separate Expo launch requests still
run. If you accept, kuyara collects:

- **Product interaction.** Which screens open, taps such as refresh, whether a
  recommendation loaded, whether you like a suggestion, which look you wear, which piece of
  an outfit you change, how the Closet is used, and whether signing in, syncing or deleting
  an account worked (never who you are).
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
onboarding for usage analytics. It is normally sent only if you accept. If you decline,
none is sent after your answer, apart from the rare technical cases below. If you accept,
kuyara sends:

- **Performance timings.** App launch and screen-navigation timing, including time to first
  render and time to interactive.
- **App-defined events.** That a recommendation was generated, that the first recommendation
  was shown after the app started, or that weather was refreshed. These events contain only
  closed category values and durations in whole milliseconds.
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
contents or photos; your name or anything you type; profile preferences; AI prompts or
responses; the analytics identifier or the app's local profile identifier.

One technical limit applies. The Expo package may automatically write technical error
records before you answer the consent question. When you accept, kuyara first asks the
package to skip every record already written, so those records are normally not delivered.
In rare cases a record from before your answer can still be delivered: a crash report from
an earlier launch that iOS hands to the app only after you accept; a record written while
sharing was off, if a delivery attempt had failed shortly before you turned sharing back on;
and, on the first launch after installing, launch timing, if the app is sent to the
background before kuyara has started. After you answer "no", Observe sends no further
records while sharing is off; the separate Expo launch requests below still run.

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

Open Settings, then Privacy, and switch off "Share usage and diagnostics". At that moment
the app sends the records already waiting to go, with a note that sharing was turned off,
one last time; after that it sends no usage analytics and no performance or diagnostic
records, and anything still queued is discarded. The Expo package may keep writing error records locally, but
none are sent to Observe while sharing is off; the rare delivery limits above apply if you
turn sharing back on. The app also stops using the analytics identifier, so events collected
before that moment cannot be linked to anything collected later. Turning sharing back on
creates a new analytics identifier. So that you can still ask for deletion, the current
version of the app keeps the old identifier on your phone and in its backups, and shows it
under Privacy until you remove it or turn sharing back on; if your version does not show it
there, the identifier was discarded. kuyara never sends it anywhere.
The diagnostics identifier stays on your device and still accompanies the separate Expo
Insights launch count and Expo Updates check described above. Those requests are outside
this switch and continue either way.

## Requesting deletion

To delete your account and everything in it, use Settings > Account; the [Accounts](#accounts)
section explains what deletion covers. Deleting kuyara from your phone does not delete your
account.

Analytics events are stored without a user profile. That keeps them anonymous, but it also
means the processor cannot always delete them by identifier. If you want your events
deleted:

1. Copy your analytics identifier from Settings under Privacy (it is shown while sharing
   is on and, in the current version of the app, after you turn sharing off until you
   remove it or turn sharing back on).
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
  birth date, or identifier for your device in this request. If you are signed in, an "Ask
  the stylist again" request also carries your account's sign-in token so the server can count
  your daily member allowance. The sign-in token also contains your account's email address and,
  for Google, the name and picture Google sent. The server reads only the account identifier
  from it, for that count, and logs none of it; none of it reaches the AI provider.
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
  settings. If you sign in, copies of some of these records also go to your account; see
  [Accounts](#accounts). Photos never go to the account.

## Accounts

An account in kuyara is optional. If you do not sign in, this section does not apply to you.
This section is the notice required by Article 10 of Türkiye's Personal Data Protection Law
No. 6698 (KVKK) and Article 13 of the EU General Data Protection Regulation (GDPR). You do not
need to approve it.

**Controller.** ubrn (Utku Barın), an individual developer based in Türkiye. Email:
[quint.inboard_9t@icloud.com](mailto:quint.inboard_9t@icloud.com). A postal address for written
applications is shared on request by email.

**What data.**

- **Account details.** The email address and user identifier Apple or Google provides, your
  kuyara account identifier, and when the account was created and last signed in. If you chose
  Hide My Email with Apple, kuyara sees only Apple's relay address. Apple is not asked for your
  name. If you sign in with Google, Google also sends your name and profile picture. The account
  service keeps them in the account record as part of the sign-in record; kuyara copies them
  into no table and never reads or uses them. They are kept on the same basis as the account
  details and are deleted when you delete your account.
- **Profile.** Your display name and gender. These sync for every account.
- **Records synced with consent.** Only if you give the sync consent: your Closet pieces
  (without photos), your History (without photos), your dress style and style aesthetics, your
  daily choices, and your departure records (time and time zone).
- **Security records.** The account service records the time, IP address and the client
  information the app sends with the request when you sign in, refresh your session or sign
  out. The record of an open session holds the same IP address and client information.
- **Member counter.** kuyara's server reads your account identifier from your sign-in token to
  count members' daily "Ask the stylist again" requests and to carry out account deletion. The
  token also contains your account's email address and, for Google, the name and picture Google
  sent; the server reads none of that and logs none of it, and none of it reaches the AI
  provider.
- **Sync consent record.** Each answer you give to the sync consent (given or withdrawn), the
  version of the text shown and the time.
- **Request correspondence.** Emails you send us and our replies.

Your birth date, the analytics consent and your other consent choices, notification setting,
language and appearance settings, locations and photos never go to the account. Account data
never enters an AI request. Analytics is never linked to your account: kuyara never connects
the analytics identifier to your account, so the analytics processor holds no account data.

**Purposes and legal bases.**

| Data | Purpose | KVKK | GDPR |
| --- | --- | --- | --- |
| Account details, display name, gender | Creating and running the account, bringing your profile to your phones | Formation and performance of a contract (Art. 5/2-c) | Contract (Art. 6(1)(b)) |
| Records synced with consent | Bringing records to a new phone or a reinstalled app, keeping phones in step | Explicit consent (Art. 6/3-a; may be special-category data) | Explicit consent (Art. 6(1)(a); Art. 9(2)(a) where it counts as special-category data) |
| Security records | Protecting the account against abuse | Legitimate interest (Art. 5/2-f) | Legitimate interest (Art. 6(1)(f)) |
| Member counter | Counting the member allowance, deleting the account | Performance of a contract (Art. 5/2-c) | Contract (Art. 6(1)(b)) |
| Sync consent record | Proving that consent was given or withdrawn | Legal obligation and protecting a right (Art. 5/2-ç and Art. 5/2-e) | Legal obligation (Art. 6(1)(c), read with Art. 7(1)) |
| Request correspondence | Answering requests about your rights | Legal obligation (Art. 5/2-ç) | Legal obligation (Art. 6(1)(c)) |

**How data is collected.** Through the app, by automated means, in electronic form, when you
sign in with Apple or Google and while you use the app. Request correspondence arrives by email.

**Recipients.**

- **Supabase Inc. (USA).** Provides the account and database service as a processor on
  kuyara's behalf. Data is held on servers in Frankfurt, Germany. Supabase's sub-processors
  include Amazon Web Services. Support and maintenance staff may access data from the USA.
  Sub-processor list:
  [supabase.com/legal/customer-resources/subprocessor-list](https://supabase.com/legal/customer-resources/subprocessor-list).
- **Cloudflare, Inc. (USA).** kuyara's server runs on Cloudflare. As a processor on kuyara's
  behalf, Cloudflare processes the sign-in token your phone sends, which contains your account
  identifier, your account's email address and, for Google, the name and picture Google sent.
  The server reads only the account identifier from it, for the member counter and account
  deletion, and logs none of it. Cloudflare's servers are in many countries.
- **Apple and Google.** They provide the account you sign in with and work under their own
  privacy policies. When you delete an account that uses Sign in with Apple, kuyara asks
  Apple to revoke your sign-in permission.
- **Public authorities.** Only when the law requires it.

**Transfer abroad.** Your account data is held outside Türkiye, in Germany, and may be accessed
from the USA. This transfer relies on Supabase's Data Processing Addendum and the standard
contractual clauses it contains. If you live in the EU, any access from outside the EU relies
on the same clauses. Because your sign-in token is also processed by kuyara's server, it
may be transferred to Cloudflare servers outside Türkiye; this transfer relies on Cloudflare's
data processing agreement.

**How long data is kept.**

- Account details and profile: until you delete your account.
- Records synced with consent: until you withdraw consent or delete your account. If you delete
  a record in the app, the content of its copy in the account is deleted when your phone next
  syncs. So that the deletion reaches your other phones, only the record's identifier, its day
  where it has one, and its creation, change and deletion times stay in the account; these are
  also deleted when you withdraw consent or delete your account.
- Manual backups: the account service makes no automatic backups. The developer backs up the
  database by hand, encrypted, with the key kept separately, and deletes each backup within
  30 days. Deleted data, including a deleted account, stays in these backups for up
  to 30 days. Backups are kept only to restore the service after a fault. A restore can bring
  back an account deleted, or a consent withdrawn, after that backup was taken. If that
  happens, the developer emails every member about the restore and deletes such an account, or
  removes such records, again at the member's request.
- Security records: the records of session events are not written to the database; they are
  kept briefly in the account service's log store and, on the plan kuyara uses, can be viewed
  for at most the last day. The record of an open session stays until the session ends or you
  delete your account.
- Member counter: only a count of the day's requests is kept, under a name made from your
  account identifier, and the stored count holds no identifier. It is not deleted with your
  account and expires on its own within 7 days.
- Sync consent record: until you delete your account.
- Request correspondence: 2 years after the request is closed.

**Managing your account and consent.** You can change your display name and gender in Profile.
You can give or withdraw the sync consent in Settings > Account; withdrawing deletes the
account's copies of those records. You can delete your account in Settings > Account; after you
confirm with Apple or Google that it is you, deletion removes everything in it. If your account
uses Sign in with Apple, kuyara revokes your Sign in with Apple permission where Apple allows it; when it cannot, the app tells you to remove kuyara
under Settings > your name > Sign in with Apple on your iPhone.

**Your rights.** Under KVKK Article 11 you can ask to learn whether your data is processed and,
if so, for information about it; to learn the purpose and whether data is used accordingly; to
know who it was transferred to in Türkiye or abroad; to have incomplete or wrong data corrected;
to have data deleted or destroyed; to have those corrections and deletions passed on to the
recipients; to object to a result against you that comes only from automated analysis; and to
claim compensation for damage caused by unlawful processing. If you live in the EU, the GDPR
also gives you the rights of access, rectification, erasure, restriction, objection and data
portability, and you can withdraw consent at any time. kuyara makes no automated decision about
you from your account data.

**How to apply.** Write to [quint.inboard_9t@icloud.com](mailto:quint.inboard_9t@icloud.com)
from the email address of your account. If you write from another address, we send an email to
your account's address to confirm it is you; replying is enough. If you chose Hide My Email with
Apple, that email reaches you through Apple's relay. You can also apply in writing by post; we
share the postal address on request by email. A written application must include your name,
surname and signature, your Turkish ID number if you are a Turkish citizen or otherwise your
nationality and passport or ID number, an address for notices, and your request (Communiqué on
the Procedures and Principles of Application to the Data Controller). We answer free of charge
within 30 days (under the GDPR within one month, which can be extended by two months for
complex requests, with notice). If you ask for a copy of your data, we send it as a
machine-readable JSON file, encrypted, and send the password in a separate message.

**Complaints.** If your request is refused, you find the answer insufficient, or you get no
answer within 30 days, you can complain to the Turkish Personal Data Protection Board within 30
days of learning the answer, and in any case within 60 days of your request (KVKK Article 14).
If you live in the EU, you can complain to the data protection authority of the country where
you live or work.

## Changes

Changes to this policy are published at this address with a new effective date.

## Contact

Controller: ubrn. Questions, deletion requests, data copies and other requests:
[quint.inboard_9t@icloud.com](mailto:quint.inboard_9t@icloud.com). A postal address for written
applications is shared on request by email. Bug reports belong on the
[support page](support).
