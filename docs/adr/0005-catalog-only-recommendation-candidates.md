# ADR 0005: Recommendation candidates come from the catalog, not the wardrobe

Status: Accepted (2026-08-30)

Implementation: Landed. Catalog-only candidates, the Wardrobe entry state, and
schema version 7 shipped; the local day variant is `localDayVariant()` in
`recommendation-application-controller.ts`, compared by the `local-day-changed`
trigger and carried into the Worker cache key.

Amended by [ADR 0007](0007-ai-selects-precomposed-outfits.md) (2026-08-30):
section 4's AI job becomes selection and labeling of precomposed outfits, color
harmony is removed from the MVP, and the day seed becomes a seven-slot day
variant.

Amended by [ADR 0013](0013-catalog-content-corrections-and-version-3.md)
(2026-09-03): the "Out of scope" line excluding catalog expansion no longer
holds. Two garment types are added and four property values corrected at catalog
version 3.

## Context

Recommendations currently compose from two sources: the bundled garment catalog
and active owned Wardrobe items. The catalog already contains 30 garment types,
a version constant, clothing-preference applicability, weather-relevant
properties, and Turkish and English localization keys. `WardrobeItem` already
carries a nullable catalog type reference.

Using the Wardrobe as a candidate source made the product's main feature depend
on setup. A new user with an empty Wardrobe could not receive a useful
recommendation in the first minute of use. Keeping two candidate sources also
widened the AI privacy boundary and made recommendation cache identity depend on
personal records.

The decision narrows an existing mechanism. It does not create a new catalog or
replace the deterministic weather and garment rules.

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

Recommendation input includes a local calendar day seed. Within one local day,
the result is stable and cacheable. A new local day produces different outfits
from the same weather.

Recommendation cache identity is weather snapshot identity, clothing
preference, catalog version, and day seed.

### 4. Restated AI job and privacy boundary

AI remains central, but it is not personalization. It turns deterministic
weather requirements into three outfits that are stylistically coherent and
varied: color harmony, consistent formality, plausible layering, and
combinations that do not repeat the previous day.

Its inputs are deterministic weather requirements, catalog candidate
identifiers and properties, clothing preference, and day seed. No
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
- Every user with the same clothing preference, weather, catalog version, and
  day seed sees the same three outfits. The product is no longer personalized.
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

- Expanding or replacing the existing 30-type catalog.
- Accounts, remote sync, or server-owned Wardrobe data.
- Using ownership as a recommendation filter.
- A future ownership tie-breaker between equally suitable catalog candidates.
