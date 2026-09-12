# ADR 0016: Location in onboarding, and an honest empty state

Status: Accepted (2026-09-03)

Implementation: complete. The onboarding location step, its decline path through live
city search, and Today's no-location copy are implemented.

## Context

Without this decision a newly onboarded user lands on Today with no location
selected, which means no weather, which means no recommendation. What they see
is an empty card:

> Today's guidance is unavailable
> There is no saved guidance to show right now.

That copy is true and useless. It does not say why there is nothing, and it
offers nothing to do about it. Repairing the end-to-end suite made it visible:
the first screen of a fresh install is an empty card.

The cause is not a defect in Today. Today correctly reports that it has
nothing, because nothing has asked the user where they are. With location
selection living only on the Weather tab, it is never reached during
onboarding.

[`product-decisions.md`](../product-decisions.md) records the rule that produces
this: no location prompt occurs during app bootstrap or merely by opening the
Weather tab. That rule exists for a good reason, an unexplained permission
sheet on first launch is hostile, and it is not discarded. But a prohibition
without a corresponding answer to "then when?" resolves to "never, unless the
user goes looking".

## Decision

### 1. Onboarding asks for location, as its own explained step

Location selection is the fifth and last onboarding step, after birth date;
the five steps are recorded in
[ADR 0031](0031-dress-style-is-the-formality-signal.md) section 5. The step
explains what location is used for before any system permission sheet appears,
which is what the existing rule protects. The rationale is not removed; it is
moved to where the user first needs it.

The recorded rule holds, narrowed to what it actually defends:

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
working application by a different route rather than a degraded one. The step
can also be skipped outright: onboarding is completable with no location, and
Today's copy in decision 3 then does the pointing.

### 3. The empty state says why, and offers the way out

When Today has no location it says so plainly and links to the place where a
location can be chosen. Copy that describes the symptom, that there is no saved
guidance, rather than the cause, that kuyara does not know where the user is, is
not acceptable for this branch.

This is a copy and affordance decision, not a new state. Today already
distinguishes its unavailable branch; only the wording is decided here.

### 4. Recommendations already assume every garment is available

Recorded here because it was asked for as though it were new.
[ADR 0005](0005-catalog-only-recommendation-candidates.md) already removed the
Wardrobe from the candidate set: outfits are composed from the bundled catalog,
not from what the user owns. Granting location therefore already produces
recommendations drawn from the whole catalog. No change is needed, and none
should be made in the belief that this behaviour is missing.

## The decline path leads to real location selection

Declining permission has to lead somewhere, and that somewhere is live city
search, the same selection the Weather tab offers. Never route the decline path
to placeholder or sample entries: an onboarding step whose decline path leads to
sample data puts the worst screen in the application in front of every new user
on their first run.

## Scope of this decision

This ADR decides *what* onboarding must accomplish and *when* permission may be
requested. It does not decide the step's layout or its copy; the step count is
[ADR 0031](0031-dress-style-is-the-formality-signal.md)'s.

## Consequences

- Location selection is the fifth and last onboarding step, after the profile
  steps [ADR 0015](0015-gender-and-age-band-in-the-profile.md) defines; the full
  sequence is [ADR 0031](0031-dress-style-is-the-formality-signal.md) section 5.
- Every new user is asked for location permission during their first run. The
  grant rate is higher than it would be with the request effectively hidden on
  the Weather tab, and some users decline who would never have encountered the
  question there.
- The decline path becomes a first-class flow with its own copy, its own
  accessibility pass, and its own end-to-end coverage. It is not an error state.
- Today's no-location branch is reached only by a user who skipped the location
  step, and decision 3's copy points them to where a location can be chosen.
  The unavailable branch remains reachable for genuine failures.

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

**Ship the onboarding step with a sample-city decline path and improve it once
real location selection exists.** Rejected. It puts placeholder data in front of
every new user, which is a worse first impression than an empty card.

## Out of scope

- The layout and copy of the location step.
- Background location, which remains out of scope for the MVP.
- Any change to what crosses the native adapter or reaches SQLite. Normalized
  hundredth-degree coordinates, IANA time zone, source, and accuracy remain the
  only values, and raw coordinates are still neither logged nor persisted.
- Reverting ADR 0005. Recommendations continue to compose from the catalog.
