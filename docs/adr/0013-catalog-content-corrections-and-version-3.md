# ADR 0013: Catalog content corrections and catalog version 3

Status: Accepted (2026-09-03)

Implementation: Planned.

Amends [ADR 0005](0005-catalog-only-recommendation-candidates.md) and
[ADR 0007](0007-ai-selects-precomposed-outfits.md), whose "out of scope" lists
both exclude expanding the 30-type catalog.

## Context

[ADR 0005](0005-catalog-only-recommendation-candidates.md) made the bundled
catalog the only candidate source and recorded the consequence plainly:
recommendation quality is now only as good as the catalog's coverage and
property accuracy. A review of the 30 types during M6.1 produced naming
corrections, which shipped, plus property and coverage proposals, which were
deferred because they change catalog content and so need a version decision.

Three facts found while measuring that decision shape it.

**The Wardrobe override escape hatch is gone.**
[`clothing-taxonomy.md`](../clothing-taxonomy.md) justifies deliberately coarse
catalog defaults by pointing at Wardrobe overrides: an unlined waterproof shell
or a heavy sweater "can use the appropriate Wardrobe overrides rather than
forcing another canonical type". ADR 0005 removed the Wardrobe from the
candidate set, so an override now widens nothing a recommendation can see. The
argument for coarseness survives for the Wardrobe as a personal record and no
longer survives for recommendations.

**Accessories never enter an outfit.** `outfit-composition.ts` composes only
`top`, `bottom`, `one_piece`, `outerwear`, and `footwear`, across six slots with
no accessory slot. The five accessory types are catalog records used by the
Wardrobe picker; their weather properties are read by nothing in the
recommendation path.

**Thermal is an additive budget, not a maximum.** Body thermal is summed across
garments and compared against the requirement's strength, and exceeding it draws
a `thermal_over_protection` penalty. An overstated thermal value therefore both
wins slots it should not and inflates penalties elsewhere.

## Decision

### 1. Four property corrections

| Type | Field | From | To | Reason |
|---|---|---|---|---|
| `blouse` | `defaultThermalLevel` | `light` | `none` | Arms are `partial`; at `light` it sat level with `long_sleeve_t_shirt`, whose arms are `full`. |
| `trench_coat` | `defaultThermalLevel` | `moderate` | `light` | An unlined water-resistant shell. At `moderate` it competed with `coat` for cold buckets while carrying no insulation. |
| `rain_jacket` | `defaultThermalLevel` | `light` | `none` | A waterproof shell has no insulation. At `none` the engine correctly requires a mid layer for cold rain instead of counting the shell as warmth. |
| `gloves` | `defaultWaterProtection` | `water_resistant` | `none` | A generic glove is not water resistant. Accessories never enter an outfit, so this changes no behaviour; it corrects the record. |

Breathability is out of scope for this round and is not touched.

### 2. Two new garment types

The catalog has two structural holes that no existing type can fill and no
override can any longer close.

- **No top with `none` arm coverage.** `dress` is the only garment with bare
  arms, and it is `womens` and `one_piece`. A `mens` hot-weather outfit cannot
  go below `t_shirt`.
- **No bottom above `light` thermal, for either preference.** The upper body
  reaches `high` by layering; the legs cannot be warmed at all.

| `typeId` | Category | Roles | Thermal | Water | Wind | Breathability | Coverage | Formality | Applicability |
|---|---|---|---|---|---|---|---|---|---|
| `sleeveless_top` | `top` | `base`, `standalone` | `none` | — | — | `high` | arms `none` | `casual` | both |
| `leggings` | `bottom` | `standalone` | `moderate` | — | — | `moderate` | legs `full` | `casual` | both |

`leggings` applies to both preferences because the warm-bottom hole exists for
both, and because the repository models this as a mutable clothing preference
rather than biological sex. It surfaces only in cold buckets, where scoring is
weather-driven.

English and Turkish names are `Sleeveless top` / `Kolsuz üst` and
`Leggings` / `Tayt`. Artwork is keyed by `structuralCategory`, not by type, so
neither needs new artwork.

### 3. `overshirt` and `jumpsuit` stay as they are

Both reconsiderations are closed rather than deferred.

`overshirt` keeps `top` with `mid`, `outer`, and `standalone` roles.
[`clothing-taxonomy.md`](../clothing-taxonomy.md) already records this as
deliberate, that "a multi-role type such as `overshirt` remains a `top` rather
than being misclassified as `outerwear`", and reclassifying it changes no
behaviour the engine exposes.

`jumpsuit` keeps `womens, mens`. It is the only `one_piece` available to `mens`,
so narrowing it would delete that body-core branch and its contribution to
outfit diversity in exchange for nothing.

### 4. Catalog version 3

`garmentCatalogVersion` moves from 2 to 3 in the same change as the content
above. All content changes share one bump; the version is not incremented per
edit.

Bumping is not optional when content changes. `catalogVersion` is a segment of
the Worker's shared AI cache key, and the mobile client validates an AI pick by
recomposing it from the *current* catalog and comparing the derived traits. If
content changed without the version moving, the Worker would keep serving picks
composed under the old properties, `matchesOption` would reject them, and every
user would silently fall through to the deterministic fallback until the cache
aged out.

## Consequences

### What the bump costs, and what a user sees

**On device, the version number invalidates nothing by itself.**
`catalogVersion` is stored in the snapshot's context but is not among the
signals `recommendationRefreshTrigger` compares. What invalidates a snapshot is
the content change: `mapStoredRecommendation` re-derives every stored garment
from the current catalog and requires the recomposition to match what was
stored. A corrected property that shifts composition makes that fail, the
repository raises `invalid-data`, and controller initialization catches it and
starts with no snapshot.

The trigger then returns `first-recommendation` and Today regenerates on that
same launch. So on the first launch after the update a user sees **one extra
loading state and then three fresh outfits**. The stored row is not deleted, only
overwritten by the next successful save, and the last-valid-result rule is
untouched: a failed refresh still keeps what was there. Offline is safe, because
the device-local deterministic fallback composes from the new catalog.

**On the Worker, the bump is a single bounded cache miss.** Every
`(requirement vector, clothing preference, day variant)` key misses once, so a
bucket costs at most seven regenerations before it is a permanent hit again.
That is the ceiling ADR 0007's seven-slot ring was designed to impose, paid once
per bump. It is the reason all content changes share one version.

### Other consequences

- `garmentTypeIds` is duplicated in `packages/contracts/src/ai-v1.ts` and
  `garment-taxonomy.ts`. Adding a type is a shared-contract change, so mobile,
  the Worker, and the contracts package move together.
- The catalog manifest check requires the definition list to be exactly
  `garmentTypeIds`, so the counts move from 30 to 32 in lockstep.
- The probe request in `apps/worker/src/ai/probe-handler.ts` hardcodes
  `catalogVersion`, and moves with the bump.
- Inserting ids changes deterministic tie-break ordering for outfits that scored
  equally. Version 3 already invalidates those results, so no separate
  transition is needed.
- Lowering `trench_coat` and `rain_jacket` thermal reduces the supply of warm
  outerwear in cold, wet buckets. `insulated_jacket` remains `high` with water
  resistance, but the option count per bucket must stay at three or more, or
  `aiRequestFromContext` returns null and the bucket degrades to the
  deterministic fallback. This is the specific regression the boundary tests
  have to rule out.
- No schema migration. Wardrobe rows store `garmentTypeId` strings; adding ids
  adds choices and removes none, and no existing row's id disappears.

## Alternatives considered

- **Correct the properties without bumping the version.** Rejected: a stale
  shared cache would serve picks that the client then rejects, degrading every
  user to the fallback with no visible failure.
- **Bump once per change.** Rejected: each bump costs a full shared-cache miss,
  and the changes are one coherent revision.
- **Add no types, record the two holes as known limits.** Rejected: with the
  Wardrobe out of the candidate set there is nothing left to close them, and both
  holes sit at the ends of the range the product exists to cover.
- **Restrict `leggings` to `womens`.** Rejected: the warm-bottom hole is not
  preference-specific, and leaving `mens` unable to warm the legs preserves the
  defect this change exists to fix.
- **Reclassify `overshirt` as `outerwear`.** Rejected: it reverses a recorded
  decision for no behavioural gain.

## Out of scope

- Breathability, wind, and traction values.
- Any new garment property axis.
- Colour, colourways, and any colour model, which remain out per ADR 0007.
- The Wardrobe as a candidate source or a tie-breaker.
- Schema migrations.
