# ADR 0016: Location in onboarding, and an honest empty state

Status: Accepted (2026-09-03)

Implementation: not started, and blocked. This decision cannot ship before real
location selection, for the reason given under Dependency below.

## Context

A newly onboarded user currently lands on Today with no location selected, which
means no weather, which means no recommendation. What they see is this:

> Today's guidance is unavailable
> There is no saved guidance to show right now.

That copy is true and useless. It does not say why there is nothing, and it
offers nothing to do about it. This was observed directly on 2026-09-03 while
repairing the end-to-end suite: the first screen of a fresh install is an empty
card.

The cause is not a defect in Today. Today is correctly reporting that it has
nothing, because nothing has asked the user where they are. Location selection
lives on the Weather tab and is never reached during onboarding.

[`product-decisions.md`](../product-decisions.md) records the rule that produced
this: "No location prompt occurs during app bootstrap or merely by opening the
Weather tab." That rule exists for a good reason, an unexplained permission
sheet on first launch is hostile, and it should not be discarded. But it was
written as a prohibition without a corresponding answer to "then when?", and the
answer turned out to be "never, unless the user goes looking".

## Decision

### 1. Onboarding asks for location, as its own explained step

Onboarding gains a location step after birth year. The step explains what
location is used for before any system permission sheet appears, which is what
the existing rule was protecting. The rationale is not removed; it is moved to
where the user first needs it.

The recorded rule survives, narrowed to what it was actually defending:

- No permission request occurs during application bootstrap.
- No permission request occurs merely by opening the Weather tab.
- A permission request occurs only after kuyara has explained, in the user's
  language, what it is for. Onboarding's location step is such an explanation.

### 2. Declining is a supported path, not a dead end

The step must be completable without granting permission. iOS does not re-ask
after a denial, so a design that requires permission to proceed would lock a
user out of the application permanently, and it would not survive App Store
review.

A user who declines is offered city selection in the same step. They reach a
working application by a different route rather than a degraded one.

### 3. The empty state says why, and offers the way out

When Today has no location it must say so plainly and link to the place where a
location can be chosen. The current copy describes the symptom, that there is no
saved guidance, rather than the cause, that kuyara does not know where the user
is.

This is a copy and affordance change, not a new state. Today already
distinguishes its unavailable branch; it is the wording that fails.

### 4. Recommendations already assume every garment is available

Recorded here because it was asked for as though it were new.
[ADR 0005](0005-catalog-only-recommendation-candidates.md) already removed the
Wardrobe from the candidate set: outfits are composed from the bundled catalog,
not from what the user owns. Granting location therefore already produces
recommendations drawn from the whole catalog. No change is needed, and none
should be made in the belief that this behaviour is missing.

## Dependency

This decision cannot be implemented before the real location selection
milestone.

Declining permission has to lead somewhere, and the only somewhere available
today is a picker offering three hardcoded entries labelled "Sample Istanbul",
"Sample Ankara" and "Sample London". Shipping an onboarding step whose decline
path leads there would take the worst screen in the application and put it in
front of every new user on their first run.

The ordering is therefore fixed: real location selection, then this.

## Relationship to the pending interface redesign

The maintainer is evaluating an interface redesign that changes information
architecture rather than only visual treatment. Onboarding is one of the screens
such a redesign would restructure.

This ADR decides *what* onboarding must accomplish and *when* permission may be
requested. It deliberately does not decide the step's layout, its copy, or
whether it remains a discrete step rather than being folded into a redesigned
flow. Those belong to the redesign, and settling them here would only have them
re-settled later.

## Consequences

- Onboarding grows a fourth step, on top of the three
  [ADR 0015](0015-gender-and-age-band-in-the-profile.md) already defines. Whether
  four discrete steps is the right shape is a question for the redesign.
- Every new user is asked for location permission during their first run. The
  grant rate will be higher than today's, where the request is effectively
  hidden, and some users will decline who never encountered the question before.
- The decline path becomes a first-class flow with its own copy, its own
  accessibility pass, and its own end-to-end coverage. It is not an error state.
- Today's unavailable branch stops being reachable for the ordinary reason it is
  reachable now, since a user completing onboarding will have either a device
  location or a chosen city. It remains reachable for genuine failures.

## Alternatives considered

**Leave onboarding alone and only fix the empty-state copy.** Cheaper, and it
would remove the confusion without removing the emptiness. The user would still
finish onboarding, read an explanation, and then have to go and do something
else before the application does anything. Rejected as treating the symptom.

**Request permission silently at the end of onboarding, with no explanation
step.** Fewer screens. Rejected: it is exactly what the existing rule forbids,
and an unexplained sheet is the reason permission gets denied.

**Require permission to complete onboarding.** Simplest code path, and rejected
outright. iOS does not re-ask after a denial, so this permanently locks out any
user who declines once, and it would fail App Store review.

**Ship the onboarding step now with the sample-city decline path, and improve it
when real location selection lands.** Rejected. It would put placeholder data in
front of every new user during the interval, which is a worse first impression
than the current empty card.

## Out of scope

- The layout and copy of the location step, which belong to the redesign.
- Background location, which remains out of scope for the MVP.
- Any change to what crosses the native adapter or reaches SQLite. Normalized
  hundredth-degree coordinates, IANA time zone, source, and accuracy remain the
  only values, and raw coordinates are still neither logged nor persisted.
- Reverting ADR 0005. Recommendations continue to compose from the catalog.
