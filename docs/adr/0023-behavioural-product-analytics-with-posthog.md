# ADR 0023: Behavioural product analytics with PostHog

Status: Accepted (2026-09-04)

Implementation: complete. The `ProductAnalytics` boundary, typed event catalog
([`analytics-taxonomy.md`](../analytics-taxonomy.md)), PostHog adapter, consent surface,
and current call sites are implemented. This ADR records the analytics direction and
privacy boundary.

Consent before collection and an in-app withdrawal control are required. The current
Apple privacy obligations are decided in
[ADR 0033](0033-apple-privacy-obligations-for-first-party-analytics.md).

## Context

The MVP was scoped without behavioural analytics, alongside accounts and sync, to keep
the first release small. That was the right call for scope and the wrong call for
learning: the application is on TestFlight, the interface is being redesigned for the
second time, and every judgement about what users value has so far come from intuition.
There is no measurement of activation, of where onboarding is abandoned, or of whether
anyone opens outfit detail at all.

The maintainer revoked the no-analytics rule on 2026-09-04 and named two goals at once:
improve the product on evidence, and learn product analytics in practice. Both point at
broad behavioural coverage rather than a handful of counters.

Three constraints already in this repository bound that. Provider usage runs on a small
maintainer-funded budget with hard limits and no pay-as-you-go overage, so event volume
is a cost, not a free variable. The AI input privacy boundary is a closed list, and it
exists because a previous decision found it too easy to leak wardrobe and location data
into an outbound payload. And App Store submission already has unmet privacy
prerequisites recorded as known issues.

## Decision

### 1. Behavioural product analytics is part of the production direction

Analytics is part of the shipping product and is planned early enough that the behaviour
of kuyara's first real users is measurable.

**Sequenced before the first public App Store release** (decided 2026-09-04). This makes
the privacy policy URL, the App Store Connect data-collection questionnaire, and the
consent question below hard prerequisites of submission rather than follow-up work.

### 2. PostHog is the product analytics provider

PostHog is chosen for product analytics. It is not installed by this ADR.

### 3. The objective is coverage, not volume

The measurement goal is enough structured behaviour to reconstruct how real users move
through the product: activation, funnels, feature adoption, retention, abandonment and
friction, and before-and-after comparison of product changes.

The principle is **maximum useful behavioural coverage, not maximum event count**. Enough
structured events and coarse properties to answer product questions; nothing collected
merely because it is technically collectible. This is a privacy posture and a cost
posture at the same time, since it is also what keeps usage inside a free tier.

High-frequency signals (arbitrary taps, scroll, rapidly repeated interactions) are
aggregated, sampled, or omitted unless they answer a concrete product question.

### 4. Analytics goes behind a project-owned boundary

PostHog SDK calls are not scattered through screens and components. Features and
application code call a project-owned `ProductAnalytics` boundary; one adapter behind it
talks to PostHog.

```text
features / application
        ↓
ProductAnalytics boundary
        ↓
PostHog adapter
```

This buys a centralised event taxonomy, one place to enforce the privacy filter below,
testable call sites, control over payload shape, and the ability to replace the provider.
It is the same boundary rule the repository already applies to SQLite and to weather
providers.

### 5. Intended coverage areas

The taxonomy is designed before it is written, and reviewed as its own artefact. It
should reach: app lifecycle and session usage; onboarding progress and abandonment;
screen and navigation usage; weather interactions; recommendation impressions and
interactions; outfit selection; refresh and retry behaviour; Closet adoption and its
create/update/delete actions; Settings usage; failure and recovery behaviour; feature
adoption; and account conversion once accounts exist.

Properties are structured, language-independent, and low-cardinality wherever possible.

### 6. The analytics privacy boundary

Broad behavioural coverage does not mean capturing user content. An analytics payload
must never contain:

- exact latitude or longitude
- Closet photos or any image content
- free-form user text, including garment names and colours
- full AI prompts or full model responses
- raw WeatherKit or other provider responses
- secrets or tokens
- complete SQLite rows
- account credentials
- a device identifier intended to fingerprint a physical device persistently

Coarse product properties are allowed where they answer a question: weather condition
category, recommendation generation mode, selected outfit position, cache or fallback
state, feature entry point, success or failure category, screen name, feature usage
state.

**`localProfileId` is not an analytics identifier.** It exists to link device rows to a
future authenticated profile, and reusing it because it is already there would fuse
application persistence identity with analytics identity permanently. If an anonymous
analytics identity is needed, it is designed for analytics specifically, and the relevant
Apple and privacy constraints are verified before it is implemented.

The event and property schema is reviewed on its own before PostHog integration changes.

### 7. ATT and privacy consent are different questions

**App Tracking Transparency is not expected to apply.** ATT governs tracking as Apple
defines it: linking user or device data with data from other companies' apps and websites
for advertising or measurement, or sharing it with data brokers. kuyara's direction
includes no advertising, no IDFA, no cross-app or cross-site tracking, and no data-broker
sharing, so first-party product analytics alone does not trigger it. No ATT prompt is
added.

**That is not a finding that no privacy work is required.** App Privacy disclosure, the
App Store Connect data-collection questionnaire, a privacy policy, consent, retention and
deletion, and consent revocation are separate obligations with their own current rules.
They must be verified against current official Apple documentation before analytics
changes and again before App Store submission.

The current privacy rules are:

- Consent is obtained before collection and can be withdrawn from an accessible in-app
  control.
- The disclosure stays short and understandable; no long Terms & Conditions flow is
  required by this decision.
- Analytics serves product improvement, reliability, and the maintainer's own learning.
- Data is not sold, not used for advertising, and not intentionally shared with data
  brokers or unrelated third parties.
- Retention, deletion, identifier linkage, and the consent implementation are governed by
  [ADR 0033](0033-apple-privacy-obligations-for-first-party-analytics.md).

### 8. Error tracking

Automated JavaScript error tracking uses **PostHog Error Tracking** under
[ADR 0035](0035-posthog-error-tracking.md), correlating failures with the product behaviour
that preceded them. Observe retains native crash and performance reporting.

Source maps and release correlation follow ADR 0035. Error metadata
carries no secrets, user content, exact locations, Closet contents, or AI prompts; the
same exclusion list in section 6 applies.

A user-submitted "Report a problem" flow is a separate future product feature. It may
later use PostHog's feedback or survey capabilities or something else; nothing is chosen
here.

### 9. Session replay stays disabled

**The evaluation is complete: do not enable production session replay on either
platform.** A safe implementation has not been demonstrated for kuyara's native UI
and consent lifecycle. This is not a claim that PostHog cannot support safe replay;
it is a decision that SDK capabilities alone do not satisfy this app's data boundary.
Existing structured events and Error Tracking remain the evidence channels.

| Control | Current decision |
|---|---|
| Screens and fields | No screen, field, image, touch stream or replay metadata is recorded on iOS or Android. No masking implementation is claimed. |
| Start event | None. Neither `error_shown`, `$exception`, `screen_viewed`, consent grant nor app launch starts replay. No pre-consent or pre-trigger recording buffer. |
| Sampling | 0% of sessions, enforced by `enableSessionReplay: false` and the absent native replay plugin, not by sampling alone. |
| Retention | No replay is created or retained locally or remotely. This is not a configured vendor zero-day retention period. Existing analytics event retention is unchanged. |
| Consent and withdrawal | Existing analytics consent grants no replay permission. Decline, withdrawal and later re-consent all leave replay disabled; no additional prompt or toggle is introduced. |
| Cost | $0 incremental replay spend and zero replay ingestion. No paid subscription, card, automatic top-up or limit change is authorized. |

#### Evidence and limits

Sources below were checked on 2026-09-20 against repository code and official
documentation. Native replay masking, queue disposal and live billing settings remain
unverified. This decision authorizes no SDK installation, recording or production change.

- **The existing gate is for events.** `resolvePostHogProviderOptions` in
  `apps/mobile/src/features/analytics/data/posthog-product-analytics.ts` disables replay.
  Its `before_send` filters event properties and exceptions; it does not mask native
  screenshots. `withdraw()` clears the JavaScript event queue and rotates identity.
  Neither that code nor its tests prove native replay queue deletion. The installed
  `posthog-react-native` is 4.68.4; the optional native replay plugin is absent.
- **React Native replay is screenshot capture on both platforms**, not the native SDKs'
  optional wireframe mode ([mobile recording modes](https://posthog.com/docs/session-replay/mobile)).
  Screenshots are a new outbound data surface; the exception-report allowance in ADR 0035
  does not authorize image content. Masking must prevent prohibited content from entering
  the outbound recording, not merely conceal it in the dashboard.
- **Masking depends on the resolved native implementation.** PostHog documents default
  text/image masking, `PostHogMaskView`, and native SwiftUI/Compose modifiers. It warns
  about Xcode 26 SwiftUI rendering and about unmasking a parent overriding child masks
  ([privacy controls](https://posthog.com/docs/session-replay/privacy)). The merged
  [iOS Fabric masking fix](https://github.com/PostHog/posthog-ios/pull/777) documents
  rendered text and SVG escaping earlier masks. Its existence is not proof of kuyara's
  resolved binary or of `@expo/ui` Host, native sheet and picker coverage. The app uses
  both SwiftUI and Compose controls, and neither platform has replay runtime evidence.
  Do not replace accessible labels with masking tokens; use the dedicated masking wrapper
  if a future implementation is authorized.
- **Defaults also open nonvisual paths.** The
  [React Native installation guide](https://posthog.com/docs/session-replay/installation/react-native)
  documents Android Logcat capture and iOS network telemetry enabled by default. Any
  future candidate must explicitly disable both, retain text/image/sandboxed-view masks,
  and keep route parameters, local paths, identifiers and free text out of replay metadata.
- **An error trigger does not recover the preceding mobile journey.** RN event triggers
  match event names only, require SDK 4.52.0+, and start at the event with no mobile
  pre-buffer. Thus `error_shown` cannot be restricted to Today by a property filter,
  and `$exception` does not supply a pre-crash movie. Sampling is session-based, supported
  from RN 4.37.0, with local configuration taking precedence over remote configuration
  ([recording rules](https://posthog.com/docs/session-replay/how-to-control-which-sessions-you-record),
  [RN configuration](https://posthog.com/docs/session-replay/installation/react-native)).
- **Mobile has its own allowance.** The
  [replay pricing page](https://posthog.com/session-replay/pricing) lists 2,500 free mobile
  recordings/month, then $0.0100 per recording in the first paid tier, separately from
  5,000 free web recordings. A sample percentage reduces expected volume but cannot
  guarantee a monthly cap; no nonzero sample is approved.
- **Replay retention is separate from event retention.** Free replay retention is up to
  30 days, not the analytics project's twelve months. A changed retention setting applies
  only to new recordings; expiry and manual deletion are not immediate
  ([recording retention](https://posthog.com/docs/session-replay/recording-retention)).
  No exact deletion deadline or automatic deletion on consent withdrawal is established.
- **Alerts are not spending controls.** PostHog documents per-product billing limits and
  dropping excess replays ([billing FAQ](https://posthog.com/docs/billing/common-questions)).
  The free plan requires no card ([pricing](https://posthog.com/pricing)); ADR 0035 records
  kuyara's no-card free account, but the live billing state was not rechecked here.
  An exact $0 paid-plan limit and zero overshoot have not been verified. Any later
  proposal must verify the no-card free stop or an equally hard $0 control before enabling
  ingestion; sampling and usage emails cannot substitute for it.

#### Boundaries a later proposal must prove

These are reopening conditions, not permission to install or capture. No nonzero sample,
start event or retention setting is approved. A later proposal must name those values
and the concrete product question before implementation is authorized.

| Surface | Required exclusion or masking before any future capture |
|---|---|
| Onboarding and consent | Exclude the entire flow, including gender, dress style, birth date, location and the consent sheet. |
| Profile, Closet list/create/edit/detail | Exclude the entire screen, including Profile's Closet preview rail, owned/wanted state and counts, photos, garment names/colours, file paths and place labels. |
| Settings and child screens | Exclude the entire screen, especially birth date, preferences, Privacy's analytics identifier and AI-status provider/model details. |
| Location search and native overlays | Exclude typed query, search results, selected place, permission dialogs, keyboard, photo picker, share sheet and in-app browser. Stop before presentation; navigation callbacks after a frame is drawn are insufficient. |
| Today and Weather | Only candidates for a later bounded trial. Mask all rendered text and inputs, every image/SVG/garment board, place labels, weather values and contextual captions; retain at most proven content-free layout and interactions. |
| Outfit detail, errors, unknown/new routes | Exclude by default. Detail exposes ownership; error and bootstrap/share surfaces may contain diagnostic text. No automatic resume from a sensitive screen. |

Apple's [Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
2.5.14 require explicit consent and a clear recording indication; 5.1.1 requires an
accessible withdrawal path and retention/deletion disclosure. The existing English and
Turkish `analytics.consentBody` never asks to record screens and promises to exclude
location, photos, name, and Closet item names and colours. A future proposal must
reconcile explicit replay permission, re-consent for existing grants and a visible
recording indicator with ADR 0033's one-answer design; it cannot silently widen an existing `granted` value or
invent a second consent surface. Withdrawal must stop capture immediately, discard
unsent native frames including offline queues, prevent later upload after restart or
re-consent, and sever replay identity. Already uploaded data needs an explicit retention
and deletion policy; the existing anonymous-event deletion limitation is not proof about
replay deletion. Re-derive [App Privacy disclosures](https://developer.apple.com/app-store/app-privacy-details/)
from the actual proposed payload before collecting it.

Acceptance of any later implementation requires synthetic-data tests on iOS and Android
covering the actual resolved SDK/native versions, RN Fabric, SwiftUI/Compose Hosts,
route transitions, modals, text scaling and both languages. Inspect decoded outbound
payloads and replay frames, including recognisable synthetic images and text canaries;
absence of strings alone cannot prove screenshot redaction. Exercise undecided, decline,
grant, offline withdrawal, restart and re-consent, native queue removal, sampling across
session rollover, trigger timing, retention and provider-side spend enforcement. Verify
that remote configuration cannot bypass local consent/exclusions. Native masking that
cannot be proved fails closed on that platform. Obtain the required independent review
of the completed implementation diff. These tests require a separately authorized test
integration; none ran in this documentation-only evaluation.

The present decision is verified by the existing boundary guard for
`enableSessionReplay: false`, dependency inspection and document consistency checks.
Confidence is high that keeping replay off preserves the current boundary; safety of a
nonzero replay implementation remains unverified. Implementation, a recording trial and
production enablement each require explicit authorization beyond this evaluation.

### 10. Grafana is operational observability, not product analytics

The two systems answer different questions and are not merged:

```text
PostHog                        Grafana / observability stack
→ product behaviour            → operational health
→ funnels                      → Worker and API latency
→ retention                    → request and error rates
→ feature adoption             → provider failures and fallback behaviour
→ user journeys                → quota and rate-limit health
```

The existing Cloudflare Workers Logs provide operational monitoring. Grafana Cloud and
OpenTelemetry are deferred until a concrete alerting need justifies evaluating them,
preferring a usable free tier and spending controls. Nothing is added now.

### 11. Cost posture

The existing cost rules apply unchanged: meaningful free tiers, explicit quotas, hard
spending limits where available, no surprise pay-as-you-go exposure. Analytics is
implemented with an event budget in mind: deliberate schemas, low-cardinality properties,
sampling where appropriate, no duplicate events, no noisy high-frequency telemetry.

Current prices and quotas are deliberately not recorded here. Reverify them from official
sources at implementation time, as [ADR 0001](0001-worker-ai-probe-and-rate-limiting.md)
and [ADR 0002](0002-real-weather-provider-chain.md) already require for providers.

## Consequences

- The MVP includes behavioural analytics behind the approved privacy and consent boundary.
- App Store submission requires a privacy policy and data-collection questionnaire that
  accurately describe analytics collection.
- The redesign is upstream of the taxonomy. Screen-name and navigation events depend on
  the information architecture the redesign settles, so the taxonomy is written after it
  rather than against screens that are about to change.
- Nothing here weakens the AI input privacy boundary or the logging rules. Analytics is an
  additional outbound path with its own closed exclusion list, not a loophole in theirs.

## Out of scope

- Installing or configuring PostHog, any SDK, or any dependency.
- Writing event calls, the taxonomy, or the `ProductAnalytics` boundary.
- Session replay implementation or capture, ATT permission, or Terms & Conditions UI. The consent surface is
  [ADR 0033](0033-apple-privacy-obligations-for-first-party-analytics.md)'s.
- Grafana, OpenTelemetry, or any logging infrastructure.
- Choosing the user-facing feedback mechanism.
