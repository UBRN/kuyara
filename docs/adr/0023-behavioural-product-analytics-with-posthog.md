# ADR 0023: Behavioural product analytics with PostHog

Status: Accepted (2026-09-04)

Implementation: not started. No SDK is installed, no event is emitted, and no consent
surface exists. This ADR records the decision, its privacy boundary, and the compliance
question that must be answered before any of it is built.

Revokes: the MVP rule "no behavioral analytics" in `AGENTS.md` and in
[`product-decisions.md`](../product-decisions.md)'s confirmed MVP decisions.
Narrows: `AGENTS.md`'s "Do not add behavioral tracking in the MVP."

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

Analytics is no longer excluded from the shipping product. It is planned early enough
that the behaviour of kuyara's first real users is measurable.

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

The event and property schema is reviewed on its own before the PostHog integration is
written.

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
They must be verified against current official Apple documentation before the analytics
implementation, and again before App Store submission.

Current product preference, which does not settle the legal question:

- No permanent "Share analytics" toggle purely as a product preference.
- No long Terms & Conditions flow unless genuinely required.
- Analytics serves product improvement, reliability, and the maintainer's own learning.
- Data is not sold, not used for advertising, and not intentionally shared with data
  brokers or unrelated third parties.

**Open and unresolved:** whether current Apple and applicable privacy requirements oblige
a consent, revocation, or deletion mechanism, and what form it must take. If they do, that
requirement wins over the preference above. A short, understandable privacy disclosure is
preferred to a legalistic agreement flow if it satisfies the verified requirement. No
consent UX is designed by this ADR.

### 8. Error tracking

Automated crash, exception, and error tracking is planned. **PostHog Error Tracking is the
preferred first candidate**, because it correlates failures with the product behaviour
that preceded them in one system rather than two.

Source maps and release correlation are considered during implementation. Error metadata
carries no secrets, user content, exact locations, Closet contents, or AI prompts; the
same exclusion list in section 6 applies.

A user-submitted "Report a problem" flow is a separate future product feature. It may
later use PostHog's feedback or survey capabilities or something else; nothing is chosen
here.

### 9. Session replay is an evaluation item

Session replay is neither rejected nor approved for production capture. Before it could be
enabled: privacy masking is designed first, Closet photos and other personal surfaces are
never captured unmasked, sampling is chosen to bound volume and cost, the consent and
privacy implications are verified, and the free-tier impact is understood. Unrestricted
100% capture is not approved.

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

Grafana Cloud or another OpenTelemetry-compatible stack may be evaluated later, preferring
a usable free tier and spending controls. Nothing is added now.

### 11. Cost posture

The existing cost rules apply unchanged: meaningful free tiers, explicit quotas, hard
spending limits where available, no surprise pay-as-you-go exposure. Analytics is
implemented with an event budget in mind: deliberate schemas, low-cardinality properties,
sampling where appropriate, no duplicate events, no noisy high-frequency telemetry.

Current prices and quotas are deliberately not recorded here. Reverify them from official
sources at implementation time, as [ADR 0001](0001-worker-ai-probe-and-rate-limiting.md)
and [ADR 0002](0002-real-weather-provider-chain.md) already require for providers.

## Consequences

- "The MVP has no behavioural analytics" stops being true as a forward-looking rule and
  is corrected wherever it is stated as one. Statements describing what shipped remain
  accurate for the versions they describe.
- App Store submission gains prerequisites: the privacy policy and the data-collection
  questionnaire now have to describe analytics collection, and the consent question has to
  be resolved first.
- The redesign is upstream of the taxonomy. Screen-name and navigation events depend on
  the information architecture the redesign settles, so the taxonomy is written after it
  rather than against screens that are about to change.
- Nothing here weakens the AI input privacy boundary or the logging rules. Analytics is an
  additional outbound path with its own closed exclusion list, not a loophole in theirs.

## Out of scope

- Installing or configuring PostHog, any SDK, or any dependency.
- Writing event calls, the taxonomy, or the `ProductAnalytics` boundary.
- Session replay, ATT permission, consent UI, or Terms & Conditions UI.
- Grafana, OpenTelemetry, or any logging infrastructure.
- Choosing the user-facing feedback mechanism.
