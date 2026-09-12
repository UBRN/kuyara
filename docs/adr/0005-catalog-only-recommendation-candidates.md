# ADR 0005: Recommendation candidates come from the catalog, not the wardrobe

Status: Accepted (2026-08-30)

Implementation: complete. Catalog-only candidates, the Wardrobe entry state, and
schema version 7 shipped; the local day variant is `localDayVariant()` in
`recommendation-application-controller.ts`, compared by the `local-day-changed`
trigger and carried into the Worker cache key.

The current AI job is selection and labeling of precomposed outfits, with a
seven-slot day variant, as decided in
[ADR 0007](0007-ai-selects-precomposed-outfits.md). The current catalog has 32
types and four corrected property values at version 3, as decided in
[ADR 0013](0013-catalog-content-corrections-and-version-3.md).

## Context

The design problem was a recommendation path that composed from two sources:
the bundled garment catalog and active owned Wardrobe items. The catalog had 30
garment types, a version constant, clothing-preference applicability,
weather-relevant properties, and Turkish and English localization keys.
`WardrobeItem` already carried a nullable catalog type reference.

Using the Wardrobe as a candidate source made the product's main feature depend
on setup. A new user with an empty Wardrobe could not receive a useful
recommendation in the first minute of use. Keeping two candidate sources also
widened the AI privacy boundary and made recommendation cache identity depend on
personal records.

The catalog-only rule reuses the existing catalog and deterministic weather and
garment rules.

## Decision

### 1. Catalog-only candidates

Both AI and the device-local deterministic three-outfit fallback compose only
from the bundled garment catalog filtered by clothing preference. The Wardrobe
is never a candidate source in the MVP.

The closed-set invariant remains unchanged. AI may select only candidate
identifiers supplied in the request and must never invent catalog entries,
wardrobe items, slots, properties, or identifiers.

### 2. Wardrobe as a personal record

Each Wardrobe entry has one state, `owned` or `wanted`. There is no separate
wishlist table, screen, or tab. Marking a garment does not affect any
recommendation in the MVP.

Every newly created entry must reference a catalog garment type. Free-form entry
of a garment outside the catalog is not offered for new records. Existing rows
with a null `garmentTypeId` remain readable, editable, and deletable as legacy
records; no row is discarded.

### 3. Daily variation and cache identity

Recommendation input includes a `dayVariant`, defined as the local day of year
modulo 7. Within one local day, the result is stable and cacheable. Consecutive
local days produce different outfits from the same weather; unchanged buckets
may recur weekly.

Recommendation cache identity is weather snapshot identity, clothing
preference, dress style, catalog version, and day variant.

### 4. AI job and privacy boundary

AI remains central, but it is not personalization. A deterministic layer
composes at most 24 complete, valid, requirement-satisfying,
formality-consistent outfits. AI selects exactly three supplied option
identifiers, labels each with one closed-list archetype identifier, and does not
compose garments or handle color harmony. The selected outfits must be varied
and must not repeat the previous day.

Its inputs are deterministic weather requirements, precomposed catalog options,
clothing preference, dress style, catalog version, and day variant. No
Wardrobe-derived data reaches the model: no owned-item source kind, overrides,
free-form names, photos, paths, or ownership state. Profile and device
identifiers, coordinates, secrets, complete database records, and unrelated
personal data also remain excluded.

Every AI response still passes shared Zod schemas and deterministic domain
invariants. Invalid or partially invalid output is rejected, never silently
repaired into a different outfit.

### 5. Schema version 7

Schema version 7 adds the Wardrobe entry state. The migration preserves every
existing row and defaults existing entries to `owned`.

## Consequences

- A user can receive the product's main recommendation without first building a
  Wardrobe.
- Every user with the same clothing preference, dress style, weather, catalog
  version, and day variant sees the same three outfits. The product is not
  personalized.
- Marking a garment gives the user no visible return beyond the personal record,
  which may reduce marking over time.
- Recommendation quality is only as good as the bundled catalog's coverage and
  property accuracy.
- The AI request and cache identity are smaller and contain no Wardrobe-derived
  data.
- Legacy null catalog references remain a permanent compatibility case unless a
  later user-approved reclassification removes them.

## Alternatives considered

- **Keep catalog and Wardrobe candidates.** Rejected because an empty Wardrobe
  still weakens the first-minute experience and preserves the wider personal
  data boundary.
- **Make Wardrobe setup mandatory before recommendations.** Rejected because it
  delays the main feature and increases onboarding work.
- **Add a separate wishlist model and screen.** Rejected because one state on the
  existing Wardrobe record expresses the distinction without a second store or
  destination.
- **Discard or infer legacy null catalog references.** Rejected because either
  loses user data or silently invents a classification.

## Out of scope

- Further catalog content or version changes, which are governed by
  [ADR 0013](0013-catalog-content-corrections-and-version-3.md).
- Accounts, remote sync, or server-owned Wardrobe data.
- Using ownership as a recommendation filter.
- A future ownership tie-breaker between equally suitable catalog candidates.
