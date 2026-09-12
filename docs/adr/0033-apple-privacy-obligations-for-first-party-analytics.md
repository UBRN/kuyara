# ADR 0033: Apple's privacy obligations for first-party product analytics

Status: Accepted (2026-09-09)

Implementation: the milestone 10 consent sheet, Settings Privacy surface, fail-closed
adapter, and PostHog project configuration are complete. Milestone 11 items 1 and 2 are
complete, consent is the recorded lawful basis, and the maintainer signed PostHog's DPA on
2026-09-11. Nothing is recorded or queued before consent. This ADR defines Apple's privacy
requirements for the analytics direction in
[ADR 0023](0023-behavioural-product-analytics-with-posthog.md) and the resulting consent,
revocation, deletion, and disclosure rules.

Every Apple and PostHog statement below was read on 2026-09-09 from the URL cited next to
it. Apple's pages carry no visible revision date, so a second reading before App Store
submission is part of the follow-up in section 6, not optional.

## Context

ADR 0023 approved behavioural product analytics with PostHog, sequenced before the first
public App Store release, and recorded the product's preference: no permanent "Share
analytics" toggle, no long agreement flow, a short disclosure if that satisfies the rules.
It also recorded that App Tracking Transparency (ATT) is not expected to apply, and was
explicit that this is not a finding that no privacy work is required. What Apple requires
of App Privacy disclosure, consent, retention, deletion and revocation was left to be
verified against current official documentation.

kuyara has no account, no advertising, no in-app purchase, and the analytics payload
exclusion list in ADR 0023 already forbids exact coordinates, photos, free-form text, AI
prompts, raw provider data, complete rows, credentials and any persistent device
fingerprint. The only identifier the analytics path could carry is one the SDK generates
for itself. `localProfileId` is not available to it.

The verification below reads five Apple sources: the App Privacy Details page that
defines the App Store Connect questionnaire, the User Privacy and Data Use page that
defines tracking, the App Store Review Guidelines section 5.1, the account-deletion
support page, and the privacy-manifest documentation. It reads PostHog's privacy, GDPR,
data-storage and pricing pages, the React Native SDK documentation, and the SDK source
for how the anonymous identifier is produced.

## Decision

### 1. App Privacy disclosure: which categories analytics collection enters

Apple defines collection as transmitting data off the device "in a way that allows you
and/or your third-party partners to access it for a period longer than what is necessary
to service the transmitted request in real time" (App Privacy Details,
<https://developer.apple.com/app-store/app-privacy-details/>, read 2026-09-09).
Analytics events sent to PostHog Cloud and stored there are collection under that
definition. The developer must disclose the practices of "third-party partners", which
the page defines to include "analytics tools", so PostHog's behaviour is kuyara's to
declare.

Against Apple's category list on that page, kuyara's planned collection maps as follows:

| Apple category | Applies | Why |
|---|---|---|
| Usage Data: Product Interaction | Yes, from milestone 10 | Apple's example is "app launches, taps, clicks, scrolling information ... or other information about how the user interacts with the app". Screen, navigation, recommendation and Closet events are exactly this. |
| Usage Data: Other Usage Data | Yes, from milestone 10 | Coarse product properties that are not interactions, such as generation mode or fallback state. PostHog's own iOS manifest declares this category alongside Product Interaction. |
| Diagnostics: Crash Data, Performance Data, Other Diagnostic Data | Yes, from milestone 12, not before | PostHog Error Tracking sends crash and exception data. It is not collected until that milestone lands, and the questionnaire is updated then. |
| Identifiers: Device ID or User ID | Yes, from milestone 10 | The SDK's random per-install identifier is an "other device-level ID" and is declared linked to the user because profile-derived properties ride on it; see section 5. |
| Location: Coarse Location | No | PostHog derives `$geoip_city_name` and related properties from the request IP on its servers. Apple's Coarse Location definition covers any location "with lower resolution than a latitude and longitude with three or more decimal places". IP discard and the separately disabled GeoIP transformation keep this category out; see section 5. |
| Precise Location | No | Coordinates never enter an analytics payload under ADR 0023. |
| Health, Sensitive Info, Contacts, User Content, Photos | No | Nothing in the taxonomy touches them. Gender and dress style are stored profile values, not sensitive-info categories in Apple's list; section 5 governs linkage. |

The App Privacy Details page also requires the developer to declare, per category, whether
data is "linked to the user" and whether it is "used to track you". Tracking is settled in
section 2. Linkage is decided in section 5.

Apple's four-condition exemption for optional disclosure does not apply: analytics is part
of primary functionality, it is not user-entered in a form, and it is not infrequent. The
page states that "Data types must meet all criteria in order to be considered optional for
disclosure."

The questionnaire answers may be updated "at any time, and you do not need to submit an
app update in order to change your answers", so the disclosure follows the real
integration rather than preceding it, but it must be accurate before any analytics-enabled
build reaches the App Store.

### 2. App Tracking Transparency does not apply

Apple's definition, verbatim from User Privacy and Data Use
(<https://developer.apple.com/app-store/user-privacy-and-data-use/>, read 2026-09-09):

> Tracking refers to the act of linking user or device data collected from your app with
> user or device data collected from other companies' apps, websites, or offline
> properties for targeted advertising or advertising measurement purposes. Tracking also
> refers to sharing user or device data with data brokers.

The same page gives one analytics-specific example of tracking: "using an analytics SDK
that repurposes the data it collects from your app to enable targeted advertising in other
developers' apps." kuyara meets none of the elements:

- It links no analytics data with data from other companies' apps, websites or offline
  properties. PostHog is a processor holding kuyara's data alone.
- It has no advertising and no advertising measurement.
- It shares nothing with a data broker.
- The SDK reads no advertising identifier. The React Native SDK's native dependency module
  emits `$app_version`, `$device_name`, `$os_version`, `$locale`, `$timezone` and similar
  properties and reads neither IDFA nor `identifierForVendor`
  (<https://github.com/PostHog/posthog-js/blob/main/packages/react-native/src/native-deps.tsx>,
  read 2026-09-09).

The Review Guidelines confirm the boundary from the other side: "You must receive explicit
permission from users via the App Tracking Transparency APIs to track their activity"
(5.1.1 (ii) and 5.1.2 (i)), where "track" carries the definition above. Apple's page also
notes that the vendor identifier "may be used for analytics across apps from the same
content provider. In this case, the use of the AppTrackingTransparency framework is not
required", which is a stronger case than kuyara's, since kuyara does not read that
identifier either.

Consequences: no ATT prompt, `NSPrivacyTracking` stays `false` in
`apps/mobile/ios/kuyara/PrivacyInfo.xcprivacy`, no `NSPrivacyTrackingDomains`, and every
collected data type is declared with tracking `false`. This decision is revisited only if
a future SDK, advertising or attribution integration is proposed, which none of the
recorded product decisions contemplates.

### 3. A consent prompt and a withdrawal control are required by Apple

App Store Review Guideline 5.1.1 (ii) Permission
(<https://developer.apple.com/app-store/review/guidelines/#privacy>, read 2026-09-09):

> Apps that collect user or usage data must secure user consent for the collection, even if
> such data is considered to be anonymous at the time of or immediately following
> collection. ... Apps must also provide the customer with an easily accessible and
> understandable way to withdraw consent.

Product analytics is "usage data" in Apple's own vocabulary (section 1), and the guideline
removes the anonymity argument explicitly. Two obligations follow directly from Apple, not
from any privacy law:

1. **Consent before collection.** The app must obtain consent before the first analytics
   event leaves the device. A privacy policy link alone is not consent. The guideline's
   only alternative is collection "for a legitimate interest without consent by relying on
   the terms of the European Union's General Data Protection Regulation ("GDPR") or
   similar statute", which is a legal basis to be chosen with counsel, not a product
   preference, and does not remove the withdrawal obligation.
2. **Withdrawal in the app.** An "easily accessible and understandable way to withdraw
   consent" must exist inside the app. That is a persistent control, not a one-time
   prompt.

Guideline 5.1.1 (i) adds the disclosure obligations: a privacy policy link "in the App
Store Connect metadata field and within the app in an easily accessible manner", a policy
that identifies what is collected and how it is used, confirms that third parties such as
"analytics tools" give "the same or equal protection", and explains "its data
retention/deletion policies and describe how a user can revoke consent and/or request
deletion of the user's data". Guideline 5.1.2 (ii) prohibits repurposing: data collected
for product analytics may not later be used for anything else without further consent.

The disclosure stays short and understandable rather than becoming a legalistic agreement
flow, because Apple requires consent, not a Terms and Conditions document. The current
surface follows these constraints:

- One clear question, answered before any event is captured, with decline as easy as
  accept. Declining changes nothing else in the product (5.1.1 (ii): functionality must
  not depend on the grant, and 5.1.1 (iv): no manipulation into consenting).
- The SDK client is not constructed before consent. Once consent is granted, the client
  initialises opted in with `defaultOptIn: true`, because the SDK records its one-time
  application-installed event during initialisation. While consent is `undecided`, captures
  are dropped rather than recorded or queued. The React Native SDK documents `defaultOptIn`,
  `optIn()` and `optOut()`
  (<https://posthog.com/docs/libraries/react-native>, read 2026-09-09); PostHog states
  that opting out "will prevent all data from being captured and sent to PostHog"
  (<https://posthog.com/docs/privacy/data-collection>, read 2026-09-09).
- A Settings row that shows the current state and withdraws consent, placed in the
  existing native grouped list per [ADR 0030](0030-settings-as-a-native-grouped-list.md),
  beside the privacy policy link the same guideline requires in the app.
- Copy from localization keys, Turkish and English, and the same copy discipline as the
  rest of Settings.

**GDPR, KVKK and similar statutes are legal questions, not Apple rules.** Consent is the
maintainer's recorded lawful basis for kuyara's analytics, and the maintainer signed
PostHog's self-serve DPA on 2026-09-11. PostHog hosts an EU region in Frankfurt
(<https://posthog.com/docs/privacy>, read 2026-09-09). Counsel review of the GDPR and KVKK
reading remains due before submission. This ADR records the product decision and Apple's
requirements, not a broader legal conclusion.

PostHog's own terms impose no user-facing prompt; its documentation says "It's your
responsibility to decide what data you collect, if it complies with regulations, and
communicate with your users" (same page).

**Placement.** The withdrawal control is unprominent, not hidden. It
lives one level deep, on a Privacy surface opened from a plain row on the Settings root,
placed with the other secondary groups rather than at the top, alongside the in-app
privacy policy link that guideline 5.1.1 (i) requires anyway. The row and the toggle use
the ordinary list-row anatomy of [ADR 0028](0028-the-profile-tab-and-the-list-row-anatomy.md)
and [ADR 0030](0030-settings-as-a-native-grouped-list.md), with no accent, badge, banner or
onboarding mention pointing at them. The maintainer asked for the control to be as
inconspicuous as possible; this placement is the floor, because the guideline's own words
are "easily accessible", the accessibility rules in `AGENTS.md` forbid controls that are
hard to reach or unlabeled, and a reviewer who cannot find the control in two taps has
grounds to reject. Two taps from Settings, a clear label, no dark pattern.

### 4. Deletion and revocation for an accountless app

Apple's account-deletion requirement does not apply. The support page states it applies to
apps that "support account creation", and Guideline 5.1.1 (v) conditions it on the same:
"If your app supports account creation, you must also offer account deletion within the
app" (<https://developer.apple.com/support/offering-account-deletion-in-your-app/>, read
2026-09-09). kuyara has no account in the first release. This changes when
[ADR 0022](0022-supabase-is-the-intended-backend-and-kuyara-is-not-local-first.md)'s
accounts arrive: account deletion will then have to delete analytics data associated with
the account too, since Apple expects "all data associated with their account" to go.

What Apple does require today is the 5.1.1 (i) policy text: how a user can revoke consent
"and/or request deletion". Revocation is the Settings control in section 3. For deletion
the decision is:

- **Withdrawal severs the identity.** When consent is withdrawn the app calls `optOut()`
  and then resets the SDK identity, so any later re-consent starts a new anonymous
  identifier and past events cannot be joined to future ones. The SDK generates the
  anonymous identifier with `uuidv7()` and persists it on the device
  (<https://github.com/PostHog/posthog-js/blob/main/packages/core/src/posthog-core.ts>,
  read 2026-09-09); `reset()` regenerates it but by default keeps the separately persisted
  `$device_id`, which was seeded from the first anonymous id
  (<https://github.com/PostHog/posthog-js/blob/main/packages/react-native/src/posthog-rn.ts>,
  read 2026-09-09). The implementation therefore clears `DeviceId` as well; otherwise the
  severance would be incomplete.
- **Deletion requests do not promise identifier-based deletion.** PostHog deletes a
  person and their
  events through the UI or the persons API, asynchronously, and warns against reusing a
  `distinct_id` until deletion completes
  (<https://posthog.com/docs/privacy/data-storage>, read 2026-09-09). Doing that from the
  app would require a PostHog personal API key on the Worker and a new route, which is
  infrastructure with no other caller and is not approved here. The privacy policy instead
  allows a request to be sent to the maintainer by email, and the Settings screen lets the
  user see and copy their analytics identifier so a request about their data can name it.
  The outcome is not guaranteed because the persons API cannot delete events by identifier
  when no person profile exists; section 7 records the finding.
- **Retention is stated, not left to the vendor's default.** PostHog Cloud keeps data one
  year on the free plan and seven years on paid plans
  (<https://posthog.com/pricing>, read 2026-09-09). The policy must state kuyara's
  retention period. The free plan offers no shorter project-level event retention, the
  project reports twelve-month event retention, and the privacy policy states one year.

### 5. The analytics identifier, linkage, and the privacy manifest

**Identifier.** ADR 0023 asked whether an anonymous analytics identity is needed at all.
The SDK creates one unconditionally: a random `uuidv7()` per install, stored in app
storage, with no hardware or vendor identifier behind it. That is acceptable under the
ADR 0023 exclusion list, which forbids a fingerprint of the physical device, not a random
per-install value. No additional identity is designed. `identify()`, `alias()`, `group()`
and `setPersonProperties()` are not called in the accountless release, and the core
`personProfiles` option keeps its `identified_only` default, so events stay anonymous
events with no person profile; PostHog documents that "for identified events we create a
person profile for the user, whereas for anonymous events we do not"
(<https://posthog.com/docs/data/anonymous-vs-identified-events>, read 2026-09-09).

**Linked to the user.** Apple treats collected data as linked to the user "unless
specific privacy protections are put in place before collection to de-identify or
anonymize it", and adds that data defined as personal data under privacy law "are
considered linked to the user". A random install identifier joins events to each other
but to no real-world identity, no account and no `localProfileId`, and kuyara commits to
never attempt re-linking. PostHog's own iOS SDK manifest declares Product Interaction and
Other Usage Data as not linked and not tracking
(<https://github.com/PostHog/posthog-ios/blob/main/PostHog/Resources/PrivacyInfo.xcprivacy>,
read 2026-09-09). The taxonomy keeps `dress_style` and a coarse `age_bucket` on four
analytics events, which combines the identifier with profile data. The questionnaire
therefore declares the collected categories **linked to the user**. The other constraints
stand: no account, no `localProfileId`, no identifier from another system, and no
re-linking. Because the pseudonymous-identifier question is where Apple's wording and
privacy law can diverge, counsel review remains due before submission.

**IP capture off.** IP addresses feed PostHog's geo properties and are "considered
personal data under GDPR" in PostHog's words
(<https://posthog.com/docs/privacy/gdpr-compliance>, read 2026-09-09). The PostHog
project is configured to discard IP addresses, which removes the Coarse Location category
from section 1 and reduces the personal-data surface. On PostHog Cloud EU project 270871,
"Discard client IP data" is on and the GeoIP transformation in Data pipelines is disabled
separately. The IP toggle alone does not stop enrichment: GeoIP runs before the discard, so
both settings are required to keep `$geoip_*` properties out of events and Coarse Location
out of the questionnaire.

**Privacy manifest.** Apple asks apps to declare collected data types in
`PrivacyInfo.xcprivacy`, and the file's `NSPrivacyTracking` and per-type booleans must
match the questionnaire (Privacy manifest files,
<https://developer.apple.com/documentation/bundleresources/privacy-manifest-files>, and
Describing data use in privacy manifests,
<https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests>,
both read 2026-09-09). Apple warns that Xcode "won't generate a privacy report correctly
if you define your own collected data types", so identifiers are copied from Apple's
table at implementation time. The two identifiers verified so far, through PostHog's own
manifest, are `NSPrivacyCollectedDataTypeProductInteraction` and
`NSPrivacyCollectedDataTypeOtherUsageData`, each with the purpose
`NSPrivacyCollectedDataTypePurposeAnalytics`. The React Native SDK is JavaScript and
ships no manifest of its own; its Expo peer dependencies (`expo-application`,
`expo-device`, `expo-localization`, `expo-file-system`) carry theirs and are aggregated by
the Expo Podfile setting already present in the repository. PostHog does not appear on
Apple's list of SDKs that require a signature
(<https://developer.apple.com/support/third-party-SDK-requirements/>, read 2026-09-09).

### 6. Follow-up for milestones 10 and 11

Milestone 10, PostHog product analytics integration, has these acceptance conditions:

1. No event is recorded or leaves the device before consent is granted. A component test
   proves that declining sends nothing and that the app behaves identically either way.
   The SDK client is not constructed before consent; once consent exists it initialises
   opted in (`defaultOptIn: true`), because the SDK records its one-time
   application-installed event during initialisation. While the answer is `undecided`,
   captures are dropped rather than recorded or queued, and acceptance starts recording
   from that moment. The onboarding funnel before the consent surface is therefore not
   measurable, which is accepted.
   The stored answer values are `undecided`, `granted` and `withdrawn`, the last covering
   both a declined sheet and a later withdrawal.
2. A consent surface exists, with one question and Turkish and English copy from
   localization keys. It is shown once on Today after the first recommendation has
   rendered. Accept is the primary action; decline is a same-size secondary action directly
   beneath it. Decline stays one tap and is never hidden, reduced, faded, coloured as a
   warning or delayed. Declining changes nothing else in the product.
3. A Settings row reads the current consent state, withdraws it, and on withdrawal calls
   `optOut()`, `reset()`, and clears the persisted `DeviceId`; a test asserts a fresh
   identifier after re-consent. The row also exposes the current analytics identifier for
   a deletion request.
4. A privacy policy link is reachable from Settings.
5. `identify()`, `alias()`, `group()` and `setPersonProperties()` have no caller;
   `personProfiles` stays `identified_only`. A grep-style check guards this like the
   `@expo/ui` rule in `AGENTS.md`.
6. The single PostHog project is Cloud EU project 270871 on the free plan. "Discard client
   IP data" is on, the GeoIP transformation is disabled (the IP toggle alone is not enough;
   see section 5), session replay is off (ADR 0023 section 9), and event retention is twelve
   months (section 4). Consent is the recorded lawful basis, and the maintainer signed the
   DPA on 2026-09-11.
7. `apps/mobile/ios/kuyara/PrivacyInfo.xcprivacy` declares Product Interaction and Other
   Usage Data with linked `true`,
   tracking `false`, purpose Analytics, and `NSPrivacyTracking` absent or `false`; the
   Xcode privacy report from an archive is read once to confirm the aggregation.
8. Error Tracking is not enabled in milestone 10; when milestone 12 adds it, the
   Diagnostics categories and the manifest are extended in the same change.

Milestone 11, App Store privacy disclosure and privacy policy, has these conditions:

1. The privacy policy states what is collected (the categories in section 1), why, that
   PostHog processes it under equal protection, the retention period, how to withdraw in
   Settings, and how to request deletion naming the identifier. Its URL goes into App
   Store Connect and into the app. `docs/privacy-policy.md` provides English and Turkish
   versions published from the main branch's `docs/` folder through GitHub Pages at
   <https://ubrn.github.io/kuyara/privacy-policy>; the app's `PRIVACY_POLICY_URL` carries
   the same address and the Settings Privacy row opens it. The URL is live and entered in
   App Store Connect.
2. The questionnaire is filled from the Xcode privacy report and section 1, marking every
   category as not used for tracking and with the linkage answer from section 7. The answer
   sheet uses section 1 (Product Interaction and
   Other Usage Data, each collected, linked to the user, not used for tracking, purpose
   Analytics; no other category), and the same answers are entered in App Store Connect.
3. Apple's three pages cited in sections 1 to 3 are re-read on the submission date, and
   any changed obligations are reflected in the current decision and supporting documents.
4. If accounts ship before or with analytics, account deletion also deletes analytics data
   for that account, per the account-deletion page.

### 7. Current privacy decisions and remaining counsel review

- **Linkage.** The install identifier is declared linked to the user because
  profile-derived properties ride on it. Counsel review of the GDPR and KVKK reading is
  still owed before submission.
- **Lawful basis and DPA.** Consent is the recorded lawful basis. The Today consent sheet
  and Settings withdrawal control stay in place. The maintainer generated and signed
  PostHog's self-serve DPA through PandaDoc on 2026-09-11; the countersigned copy is kept
  outside the repository.
- **Deletion of anonymous events.** PostHog's persons API cannot delete events by
  `distinct_id` when no person profile exists. Its single and bulk delete endpoints resolve
  identifiers to person rows and queue `AsyncDeletion` records keyed by person UUID; an
  identifier with no person row resolves to nothing (`posthog/api/person.py` and
  `posthog/models/person/bulk_delete.py` on the `master` branch, read 2026-09-10). kuyara's
  events use `$process_person_profile` false under `identified_only`, so no person row
  exists. The policy therefore promises withdrawal from Settings, identity severance, and
  twelve-month retention, but not identifier-based deletion. A user may email the
  maintainer with the identifier about their data, and the policy states that the outcome
  is not guaranteed.
- **Retention control.** The free plan offers no shorter project-level retention, so the
  policy states one year (section 4).
- **Profile-derived properties.** `dress_style` and coarse `age_bucket` are the only
  profile-derived analytics properties. Gender is not an analytics property. Their use is
  the reason the install identifier is declared linked.
- **Consent placement.** The consent surface is shown once on Today after the first
  recommendation has rendered; onboarding stays five steps. See section 6.

## Consequences

- A consent prompt before collection and a withdrawal control in Settings are part of
  milestone 10's definition of done because Apple requires both regardless of anonymity.
- ATT remains not applicable under Apple's cited definition.
- The App Store questionnaire answer set is known in advance: Product Interaction and
  Other Usage Data for analytics, Diagnostics categories only when Error Tracking lands,
  no Location, no tracking, and linked to the user. Counsel review of the privacy-law
  reading remains due before submission.
- Apple's account-deletion rule does not apply to the accountless release, but the privacy
  policy still has to describe revocation and a deletion request path, and the accounts
  milestone inherits an analytics-deletion obligation.
- The analytics identity question from ADR 0023 is closed: the SDK's random per-install
  identifier is the only one, no person profile is created, and withdrawal rotates it.

## Out of scope

- Implementation beyond the milestone acceptance conditions in section 6.
- Any broader legal conclusion under GDPR, KVKK, or other statute.
- Error Tracking, session replay, and Grafana, which keep their ADR 0023 status.
- Account deletion design, which belongs with accounts.

## Sources

Apple, all read 2026-09-09:

- App Privacy Details on the App Store: <https://developer.apple.com/app-store/app-privacy-details/>
- User Privacy and Data Use: <https://developer.apple.com/app-store/user-privacy-and-data-use/>
- App Store Review Guidelines, section 5.1 Privacy: <https://developer.apple.com/app-store/review/guidelines/#privacy>
- Offering account deletion in your app: <https://developer.apple.com/support/offering-account-deletion-in-your-app/>
- Privacy manifest files: <https://developer.apple.com/documentation/bundleresources/privacy-manifest-files>
- Describing data use in privacy manifests: <https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests>
- Upcoming third-party SDK requirements: <https://developer.apple.com/support/third-party-SDK-requirements/>

PostHog, all read 2026-09-09:

- Privacy overview: <https://posthog.com/docs/privacy>
- Controlling data collection: <https://posthog.com/docs/privacy/data-collection>
- Controlling data storage: <https://posthog.com/docs/privacy/data-storage>
- GDPR compliance: <https://posthog.com/docs/privacy/gdpr-compliance>
- Anonymous vs identified events: <https://posthog.com/docs/data/anonymous-vs-identified-events>
- React Native SDK: <https://posthog.com/docs/libraries/react-native>
- Pricing, retention figures: <https://posthog.com/pricing>
- Source: `packages/core/src/posthog-core.ts` and `packages/react-native/src/{native-deps.tsx,posthog-rn.ts}` in <https://github.com/PostHog/posthog-js>, and `PostHog/Resources/PrivacyInfo.xcprivacy` in <https://github.com/PostHog/posthog-ios>
