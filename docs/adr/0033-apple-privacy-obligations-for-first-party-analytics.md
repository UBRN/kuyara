# ADR 0033: Apple's privacy obligations for first-party product analytics

Status: Accepted (2026-09-09)

Implementation: not started. This ADR verifies what Apple actually requires of the
analytics direction in [ADR 0023](0023-behavioural-product-analytics-with-posthog.md) and
turns the open consent, revocation and deletion question into decisions and follow-up
work. It installs nothing and designs no screen.

Resolves: the "open and unresolved" item in ADR 0023 section 7 and the matching entry
under "Unresolved privacy and compliance questions" in
[`product-decisions.md`](../product-decisions.md).
Completes: `current-status.md` milestone 9.

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
| Identifiers: Device ID or User ID | Decision deferred to section 5 | The SDK's per-install random identifier is not the advertising identifier, but Apple's Device ID definition ends in "or other device-level ID". |
| Location: Coarse Location | No, provided IP capture is off | PostHog derives `$geoip_city_name` and related properties from the request IP on its servers. Apple's Coarse Location definition covers any location "with lower resolution than a latitude and longitude with three or more decimal places". Disabling IP capture at the PostHog project level, which PostHog Cloud EU does by default, removes this category. Section 5 requires it. |
| Precise Location | No | Coordinates never enter an analytics payload under ADR 0023. |
| Health, Sensitive Info, Contacts, User Content, Photos | No | Nothing in the taxonomy touches them. Gender and dress style are stored profile values, not sensitive-info categories in Apple's list, but see the open question in section 7. |

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

This is the finding that overrides the product preference in ADR 0023. App Store Review
Guideline 5.1.1 (ii) Permission
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
   prompt. The "no permanent Share analytics toggle" preference in ADR 0023 is therefore
   withdrawn.

Guideline 5.1.1 (i) adds the disclosure obligations: a privacy policy link "in the App
Store Connect metadata field and within the app in an easily accessible manner", a policy
that identifies what is collected and how it is used, confirms that third parties such as
"analytics tools" give "the same or equal protection", and explains "its data
retention/deletion policies and describe how a user can revoke consent and/or request
deletion of the user's data". Guideline 5.1.2 (ii) prohibits repurposing: data collected
for product analytics may not later be used for anything else without further consent.

The product preference for a short, understandable disclosure over a legalistic agreement
flow survives, because Apple requires consent, not a Terms and Conditions document. What
it must look like is milestone 10 design work; the constraints it inherits are:

- One clear question, answered before any event is captured, with decline as easy as
  accept. Declining changes nothing else in the product (5.1.1 (ii): functionality must
  not depend on the grant, and 5.1.1 (iv): no manipulation into consenting).
- The SDK initialises with `defaultOptIn: false` and consent is expressed by calling
  `optIn()`, so a bug in the prompt fails closed. The React Native SDK documents
  `defaultOptIn`, `optIn()` and `optOut()`
  (<https://posthog.com/docs/libraries/react-native>, read 2026-09-09); PostHog states
  that opting out "will prevent all data from being captured and sent to PostHog"
  (<https://posthog.com/docs/privacy/data-collection>, read 2026-09-09).
- A Settings row that shows the current state and withdraws consent, placed in the
  existing native grouped list per [ADR 0030](0030-settings-as-a-native-grouped-list.md),
  beside the privacy policy link the same guideline requires in the app.
- Copy from localization keys, Turkish and English, and the same copy discipline as the
  rest of Settings.

**GDPR, KVKK and similar statutes are a legal question, not an Apple rule.** Whether
consent is also the correct lawful basis under those laws, what the policy must say, and
whether a Data Processing Agreement with PostHog is needed are decided with a legal
adviser. PostHog offers a self-serve DPA to Cloud customers and hosts an EU region in
Frankfurt (<https://posthog.com/docs/privacy>, read 2026-09-09). Nothing in this ADR
records a legal conclusion; it records that Apple's requirement is already at least as
strict as an opt-in consent model, so satisfying Apple does not conflict with the likely
legal outcome.

PostHog's own terms impose no user-facing prompt; its documentation says "It's your
responsibility to decide what data you collect, if it complies with regulations, and
communicate with your users" (same page).

**Placement, decided 2026-09-09.** The withdrawal control is unprominent, not hidden. It
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
  read 2026-09-09). The implementation must therefore clear `DeviceId` as well, or the
  severance is incomplete. This is a milestone 10 acceptance check.
- **Deletion on request, not in-app self-service.** PostHog deletes a person and their
  events through the UI or the persons API, asynchronously, and warns against reusing a
  `distinct_id` until deletion completes
  (<https://posthog.com/docs/privacy/data-storage>, read 2026-09-09). Doing that from the
  app would require a PostHog personal API key on the Worker and a new route, which is
  infrastructure with no other caller and is not approved here. The privacy policy instead
  states that deletion can be requested from the maintainer, and the Settings screen lets
  the user see and copy their analytics identifier so the request can name it. Whether
  events captured without a person profile can be deleted by identifier at all is an open
  question in section 7.
- **Retention is stated, not left to the vendor's default.** PostHog Cloud keeps data one
  year on the free plan and seven years on paid plans
  (<https://posthog.com/pricing>, read 2026-09-09). The policy must state kuyara's
  retention period; the free-plan figure is the ceiling unless the maintainer sets a
  shorter project-level retention where PostHog offers one. Verify the mechanism at
  implementation time.

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

**Linked or not linked.** Apple treats collected data as linked to the user "unless
specific privacy protections are put in place before collection to de-identify or
anonymize it", and adds that data defined as personal data under privacy law "are
considered linked to the user". A random install identifier joins events to each other
but to no real-world identity, no account and no `localProfileId`, and kuyara commits to
never attempt re-linking. PostHog's own iOS SDK manifest declares Product Interaction and
Other Usage Data as not linked and not tracking
(<https://github.com/PostHog/posthog-ios/blob/main/PostHog/Resources/PrivacyInfo.xcprivacy>,
read 2026-09-09). The proposed answer is **not linked**, on the condition that the
identifier is never combined with profile data, account data once accounts exist, or an
identifier from any other system. Because the pseudonymous-identifier question is exactly
where Apple's wording and privacy law can diverge, the maintainer confirms this with
counsel before the questionnaire is filled in (section 7). If the answer becomes linked,
nothing in the integration changes; only the questionnaire and the manifest booleans do.

**IP capture off.** IP addresses feed PostHog's geo properties and are "considered
personal data under GDPR" in PostHog's words
(<https://posthog.com/docs/privacy/gdpr-compliance>, read 2026-09-09). The PostHog
project is configured to discard IP addresses, which removes the Coarse Location category
from section 1 and reduces the personal-data surface. PostHog Cloud EU does this by
default for new projects; the setting is verified regardless of region.

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

Milestone 10, PostHog product analytics integration, gains these acceptance conditions:

1. The SDK is initialised with `defaultOptIn: false`; no event is captured before
   `optIn()` is called from the consent surface. A component test proves that declining
   captures nothing and that the app behaves identically either way.
2. A consent surface exists, with one question, equal accept and decline affordances,
   Turkish and English copy from localization keys, and no dependency of any feature on
   the answer. Its placement (onboarding step or first-launch sheet) is decided in that
   milestone with `beautiful-ui` and [ADR 0030](0030-settings-as-a-native-grouped-list.md)
   as constraints.
3. A Settings row reads the current consent state, withdraws it, and on withdrawal calls
   `optOut()`, `reset()`, and clears the persisted `DeviceId`; a test asserts a fresh
   identifier after re-consent. The row also exposes the current analytics identifier for
   a deletion request.
4. A privacy policy link is reachable from Settings.
5. `identify()`, `alias()`, `group()` and `setPersonProperties()` have no caller;
   `personProfiles` stays `identified_only`. A grep-style check guards this like the
   `@expo/ui` rule in `AGENTS.md`.
6. The PostHog project has IP capture disabled, and the region is chosen; the DPA decision
   from counsel is recorded before the first production event.
7. `apps/mobile/ios/kuyara/PrivacyInfo.xcprivacy` declares Product Interaction and Other
   Usage Data with linked `false` (or `true` if section 7 resolves the other way),
   tracking `false`, purpose Analytics, and `NSPrivacyTracking` absent or `false`; the
   Xcode privacy report from an archive is read once to confirm the aggregation.
8. Error Tracking is not enabled in milestone 10; when milestone 12 adds it, the
   Diagnostics categories and the manifest are extended in the same change.

Milestone 11, App Store privacy disclosure and privacy policy, gains these:

1. The privacy policy states what is collected (the categories in section 1), why, that
   PostHog processes it under equal protection, the retention period, how to withdraw in
   Settings, and how to request deletion naming the identifier. Its URL goes into App
   Store Connect and into the app.
2. The questionnaire is filled from the Xcode privacy report and section 1, marking every
   category as not used for tracking and with the linkage answer from section 7.
3. Apple's three pages cited in sections 1 to 3 are re-read on the submission date and
   this ADR is amended if their wording changed.
4. If accounts ship before or with analytics, account deletion also deletes analytics data
   for that account, per the account-deletion page.

### 7. Open questions for the maintainer

- **Linked or not linked.** Whether a random per-install identifier with no person profile
  makes the collected categories "linked to the user" in Apple's questionnaire. Section 5
  proposes not linked; confirm with counsel, since the same fact pattern is personal data
  under GDPR and may be under KVKK.
- **Lawful basis and DPA.** Whether consent or legitimate interest is the basis under
  GDPR and KVKK for kuyara's audience, and whether PostHog's DPA is signed. Apple's
  requirement is satisfied either way by the consent surface.
- **Deletion of anonymous events.** Whether PostHog can delete events by `distinct_id`
  when no person profile exists, or whether a deletion request would require a person
  profile to be created first. Confirm against PostHog's persons API before the privacy
  policy promises identifier-based deletion.
- **Retention control.** Whether PostHog Cloud offers a project-level retention shorter
  than the plan default; if not, the policy states the plan figure.
- **Gender and dress style as properties.** ADR 0023 allows coarse product properties.
  Gender is not in Apple's Sensitive Info list, but whether it enters the taxonomy at all
  is a milestone 8 decision, and if it does, whether it changes the linkage answer above.
- **Consent placement.** Onboarding is five steps by decision; adding a sixth or using a
  first-launch sheet is a design choice for milestone 10, not settled here.

## Consequences

- ADR 0023's "no permanent Share analytics toggle" preference is withdrawn. A consent
  prompt before collection and a withdrawal control in Settings become part of milestone
  10's definition of done, because Apple requires both regardless of anonymity.
- ATT remains not applicable, now with Apple's definition cited rather than assumed.
- The App Store questionnaire answer set is known in advance: Product Interaction and
  Other Usage Data for analytics, Diagnostics categories only when Error Tracking lands,
  no Location, no tracking, linkage pending one confirmation.
- Apple's account-deletion rule does not apply to the accountless release, but the privacy
  policy still has to describe revocation and a deletion request path, and the accounts
  milestone inherits an analytics-deletion obligation.
- The analytics identity question from ADR 0023 is closed: the SDK's random per-install
  identifier is the only one, no person profile is created, and withdrawal rotates it.
- `product-decisions.md` and `current-status.md` are updated when this ADR is accepted;
  this ADR changes neither.

## Out of scope

- Installing PostHog or any dependency, writing the taxonomy, or building the consent
  surface, the Settings row, or the privacy policy.
- Any legal conclusion under GDPR, KVKK, or other statute.
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
