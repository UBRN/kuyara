# kuyara clothing taxonomy

## Status, purpose, and scope

This is the canonical technical design and implemented domain contract shared by the kuyara catalog, Wardrobe flow, and deterministic recommendation engine. Its external research was accessed on 2026-07-30.

The document specifies stable identifiers, concept boundaries, values, validation rules, catalog records, and SQLite migration version 3. The taxonomy slice did **not** change migrations 1 or 2 or define weather thresholds and outfit behavior.

kuyara provides everyday clothing guidance, not medical or occupational-safety advice. In extreme conditions, official local weather alerts and public-safety guidance take priority over an outfit recommendation. The US alert names and Fahrenheit thresholds in some research sources are evidence about weather effects only; they are not kuyara domain values.

## Pre-v3 constraints preserved

The local-first boundary before schema version 3 had these facts:

- SQLite migration version 2 stores profile-owned `wardrobe_items` with UUID lifecycle fields, optional `name`, optional free-text `color`, optional private `photo_relative_path`, and one required `category`.
- The six stable structural categories are `top`, `bottom`, `one_piece`, `outerwear`, `footwear`, and `accessory`.
- `WardrobeItem`, `WardrobeItemRecord`, their explicit mapper, the repository, and the SQLite data source are separate boundaries. Invalid stored values do not cross into the domain.
- The local profile stores the mutable clothing preference as `womens` or `mens`; this is a catalog/recommendation preference, not biological sex.
- User-facing English and Turkish strings live in the localization boundary. Persisted values are locale-independent.
The implemented taxonomy extends these facts rather than reinterpreting migration version 2 or treating the Today fixture as production catalog data.

Current implementation locations are:

- taxonomy values, Zod schemas, and inferred types: `apps/mobile/src/features/catalog/domain/garment-taxonomy.ts`
- immutable catalog definitions and validation: `apps/mobile/src/features/catalog/domain/garment-catalog.ts`
- Turkish and English catalog messages: `apps/mobile/src/features/catalog/localization/catalog-messages.ts`
- effective garment resolution: `apps/mobile/src/features/wardrobe/domain/effective-garment.ts`
- schema version 3: `apps/mobile/src/infrastructure/sqlite/migrations.ts`

## Research findings and design consequences

The evidence and kuyara's conclusions are deliberately separated below.

| Evidence from source | Design consequence for kuyara |
| --- | --- |
| NIOSH recommends several loose layers because they insulate and can be removed to prevent overheating; it separately calls for wind protection, waterproof options, and protection for the head, hands, and feet. [S1] | Layer capability, thermal effect, wind protection, water protection, and body coverage must be separate concepts. |
| REI describes the base layer as moisture-managing, the middle layer as heat-retaining, and the outer/shell layer as protection from wind and rain. It also notes that the same garment choice depends on activity and personal metabolism. [S2] | A garment type can support more than one layer role. The role selected for one outfit is runtime context, while warmth is an intrinsic/default property and later personal sensitivity is a separate input. |
| NWS/NOAA defines wind chill from the increased heat loss caused by wind and cold, rather than air temperature alone. [S3, S4] | The deterministic engine must evaluate wind separately. `season` or temperature alone cannot represent clothing need. Provider-specific wind-chill or condition codes do not belong on a garment record. |
| NIOSH says wet clothing, boots, and gloves should be avoided and waterproof, insulated boots are appropriate in cold conditions. NWS also states that wet clothing increases heat loss. [S1, S5] | Water protection and insulation are separate axes. Footwear water protection matters independently of its thermal level. A failed weather refresh must not alter these garment facts. |
| CDC says lightweight, light-colored, loose-fitting clothes improve cooling, and clothing that blocks water-vapour transfer inhibits evaporative heat loss. [S6] | Breathability is useful for hot-weather filtering. Weight and fit are meaningful but are deferred because type defaults plus thermal level and breathability are sufficient for the first deterministic model. |
| CDC says coverage and tightly woven fabric can improve UV protection, while wet fabric protects less and darker colors may protect more. [S7] | Coverage can be modeled now, but verified sun protection cannot be inferred from garment type or color alone. A future explicit verified sun-protection field is safer than an MVP guess. |
| ISO 811 specifies a hydrostatic-pressure test for fabric resistance to water penetration. ISO 13287 specifies a test for footwear slip resistance. [S8, S9] | kuyara must not present user guesses or broad type defaults as laboratory ratings. MVP values are coarse recommendation categories, and enhanced traction is not a safety certification. |
| GS1 Global Product Classification uses codes for product classes and keeps descriptions and attributes distinct from those codes. [S10] | kuyara should use stable machine IDs, localized labels, and independent attributes rather than localized product names as identity or one ever-growing enum that embeds every property. |

### Why one `season` field is insufficient

This is a design inference from the combined evidence, not a statement quoted from one source. Two days in the same season can differ materially in wind, rain, solar exposure, humidity, activity, and surface conditions. A light breathable long-sleeve garment can be useful for sun coverage in hot weather, while a similarly covering but non-breathable garment can be unsuitable. A waterproof shell can be useful in cool rain yet excessive on a dry calm day at the same air temperature. Therefore `season` is neither stored nor used as the primary decision model.

## Sources

All sources were accessed on 2026-07-30.

- **S1 — CDC/NIOSH:** [The Physiological Response of Working in Cold Environments and how your PPE can Help](https://www.cdc.gov/niosh/bulletin/2021/cold_ppe.html). Several loose layers, avoiding wet clothing, waterproof insulated boots, protection for ears/face/hands/feet, and wind-related heat loss.
- **S2 — REI Co-op Expert Advice:** [Layering Basics](https://www.rei.com/learn/expert-advice/layering-basics.html). Base/middle/outer functions, adjustment across conditions, and the difference between water-resistant and waterproof shells.
- **S3 — National Weather Service:** [Understanding Wind Chill](https://www.weather.gov/safety/cold-wind-chill-chart). Wind and cold increase heat loss from exposed skin; US warning thresholds are intentionally not adopted.
- **S4 — NOAA:** [Wind Chill](https://prod-01-alb-www-noaa.woc.noaa.gov/jetstream/synoptic/wind-chill). Wind removes body heat faster and affects perceived cold.
- **S5 — National Weather Service:** [Wind Chill Safety](https://www.weather.gov/bou/windchill). Wet clothing increases heat loss; layers, coverage, and waterproof insulated boots are relevant in cold weather.
- **S6 — CDC:** [Heat-related illness prevention: clothing](https://www.cdc.gov/nceh/hsb/extreme/Heat_Illness/page1720.html). Lightweight, light-colored, loose-fitting clothing and evaporative heat loss.
- **S7 — CDC:** [Sun Safety Facts](https://www.cdc.gov/skin-cancer/sun-safety/index.html). Coverage, weave, wetness, color, hats, and certified UV protection.
- **S8 — ISO:** [ISO 811:2018 — Textiles — Determination of resistance to water penetration](https://www.iso.org/standard/65149.html). Hydrostatic-pressure test method, confirmed current in 2025.
- **S9 — ISO:** [ISO 13287:2019 — Footwear — Test method for slip resistance](https://www.iso.org/standard/74965.html). Test method for PPE footwear slip resistance.
- **S10 — GS1:** [How Global Product Classification works](https://www.gs1.org/standards/gpc/how-gpc-works) and [GPC implementation guide](https://www.gs1.org/docs/gpc/GPC_Development_Implementation.pdf). Stable classification codes, descriptions, attributes, and change management.

## Recommended modeling approach

Use a **small canonical garment-type catalog with defaults plus limited Wardrobe overrides**.

The model has five boundaries:

1. `GarmentType` is an app-bundled, provider-independent catalog definition identified by an immutable `typeId`.
2. `WardrobeItem` is a personal SQLite record that refers to a type, retains lifecycle data, and stores only actual item values or explicit overrides. It is not a recommendation input.
3. Catalog defaults describe the typical item for a type. They are useful starting points, not immutable truths about every owned item.
4. An effective garment view resolves each Wardrobe override over the current catalog default for personal-record display and editing.
5. A recommendation input contains catalog candidate identifiers and properties, deterministic weather requirements, clothing preference, and a local calendar day seed. Runtime outfit roles are not written back as garment taxonomy.

```text
canonical GarmentType defaults ───────────────┐
deterministic weather requirements ───────────┤
clothing preference + local calendar day seed ├─ recommendation input
WardrobeItem values/overrides ─ effective garment view (personal record only)
```

This gives the deterministic engine explicit dimensions without requiring a user to classify every property manually.

## Core domain concepts

### Structural category

Keep the six existing values unchanged:

| Value | Meaning |
| --- | --- |
| `top` | A primary upper-body garment; it may act as base, mid, standalone, or a light outer layer. |
| `bottom` | A primary lower-body garment. |
| `one_piece` | One garment that fills both top and bottom structural slots. |
| `outerwear` | A garment constructed principally as the outermost body layer. |
| `footwear` | A worn item for the feet. |
| `accessory` | A worn or carried complementary item such as a hat, scarf, gloves, or umbrella. |

`structuralCategory` and `layerRole` are not synonyms. An `overshirt` remains structurally `top` even when a particular outfit uses it as an `outer` layer. `outerwear` is an intrinsic catalog/category classification; `outer` is a role in one composition.

Migration version 3 retains the stored `category` column as a compatibility and orphan-resilience snapshot. When `garmentTypeId` is present, the application requires its catalog type to have the same category. New-item UI derives the category from the selected type rather than asking for both. Legacy version 2 rows remain usable with `garmentTypeId = null` and their existing category.

### Canonical garment type

Each catalog type has exactly one stable `typeId`. A type captures recognizable construction/function, not style, fit, color, brand, material, gender identity, weather condition, or a complete outfit role.

Canonical ID rules:

- ASCII English, lower-case `snake_case`.
- Match `^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$`.
- Never contain a localized label, brand, season, provider name, or marketing claim.
- Never change because display copy changes.
- A semantic split creates new IDs; it does not mutate the meaning of an existing ID.

### Layer capability versus selected layer role

The catalog stores `supportedLayerRoles`, a set containing zero or more of:

| Value | Meaning |
| --- | --- |
| `base` | Can be worn next to the body or as the first visible upper-body layer. |
| `mid` | Can add warmth or adaptable coverage between another top and an outer layer. |
| `outer` | Can be the weather-facing or outermost body garment in a composition. |
| `standalone` | Can fill its structural slot without another garment of that slot. |

Do not add `insulating`: insulation belongs to `thermalLevel`, not composition order. Do not add `not_applicable`: footwear and accessories simply have an empty role set. A candidate outfit chooses one supported role at runtime; that chosen role is not persisted on the Wardrobe item.

### Body region and coverage

The catalog stores a primary `bodyRegion` from:

`upper_body`, `lower_body`, `full_body`, `feet`, `head`, `neck`, `hands`.

`umbrella` has no body region because it is carried and provides variable overhead protection. No generic `not_applicable` value is needed; its region is null.

For upper- and full-body types, `armCoverage` is `none`, `partial`, or `full`. For lower- and full-body types, `legCoverage` uses the same three values. `partial` intentionally groups short and three-quarter construction; exact lengths are not needed for the MVP engine. Other types omit these fields. Catalog defaults can be overridden on a Wardrobe item because dresses, shirts, skirts, and similar broad types vary materially.

### Thermal level

Use four ordered labels:

| Value | Order | Meaning |
| --- | ---: | --- |
| `none` | 0 | No meaningful insulation beyond basic coverage. |
| `light` | 1 | Small warming contribution. |
| `moderate` | 2 | Clear insulating contribution suitable for layering. |
| `high` | 3 | Strong insulation within kuyara's everyday-use scope. |

Four levels are enough to distinguish a thin top, knit/fleece-like layer, and insulated outerwear without suggesting laboratory precision. `very_high` is excluded because extreme-weather clothing and safety equipment are outside the MVP. The value is not a temperature rating, does not promise comfort at a Celsius threshold, and can vary by construction, activity, and person. It starts as a catalog default, may be overridden for a real item, and will later be interpreted with a separate user warmth sensitivity.

For items where warmth has no useful meaning, such as an umbrella, the catalog value is null. Null means not applicable there; `unknown` is not an enum member.

### Water, wind, and ground protection

Use independent properties:

| Property | Values | MVP interpretation |
| --- | --- | --- |
| `waterProtection` | `none`, `water_resistant`, `waterproof` | Coarse protection offered by relevant weather-facing garments, footwear, or carried protection. `water_resistant` is for limited exposure; `waterproof` requires a credible catalog/product claim, not inference from a photo or name. |
| `windProtection` | `none`, `wind_resistant` | Whether a relevant outer layer materially blocks wind. No `windproof` claim is made without a defined verification policy. |
| `tractionSuitability` | `everyday`, `enhanced` | Footwear-only relative suitability. `enhanced` can help rank weather boots for wet, snowy, or potentially slippery ground, but is never displayed as certified slip resistance. |

Do not add a separate `wetGroundSuitable` field. For footwear it is derived at runtime from `waterProtection`, `tractionSuitability`, and current precipitation/surface needs. This avoids duplicating water protection. A future catalog backed by verified SKU data could add standard identifiers or measured values, but users should not be asked for hydrostatic-pressure or slip-test results.

### Breathability and other hot-weather properties

`breathability` uses `low`, `moderate`, or `high` for clothing and footwear where the comparison is useful. It is a coarse catalog estimate with an optional item override, not a laboratory water-vapour resistance value.

Other proposed hot-weather fields are handled as follows:

| Concept | Decision |
| --- | --- |
| Lightweight construction | Defer. `thermalLevel`, `breathability`, and type provide enough first-release signal; garment mass would add user burden and false precision. |
| Loose/tight fit | Defer. Fit is item- and wearer-specific, overlaps style/size, and is not needed to establish the taxonomy boundary. |
| Sun protection | Defer an explicit `sunProtection` property until verified UPF or a clear catalog evidence policy exists. Use coverage only as a weak input, never as a UV guarantee. |
| Color lightness | Do not derive from free text or `colorFamily`. Navy and pale blue share a family but differ in lightness; patterned and multi-color items are more ambiguous. A future explicit tone or sampled color can be added separately. |

### Color model

For the MVP, store one optional canonical `colorFamily`:

`black`, `white`, `gray`, `brown`, `beige`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `multicolor`.

This is sufficient for coarse deterministic outfit compatibility. It is locale-independent and localized only for display. The existing optional `color` text can remain as the user's visible name during migration version 3; conceptually it becomes `colorDisplayName`, not an engine input. If the UI offers only a picker, the display name can remain null and the localized family label is shown.

Rejected MVP choices:

- Free text alone is not deterministic or reliably localizable.
- Multiple color families and pattern classification add input and rule complexity; `multicolor` is the MVP escape hatch.
- A pattern enum and photo-based color extraction are future work.
- Color lightness is not inferred from a family or user-entered word.

## Clothing-preference relationship

The canonical catalog stores `apparelPreferenceApplicability` as a non-empty set of existing profile values: `womens`, `mens`, or both. “Unisex” is represented by both values rather than a third profile preference.

Rules:

- The MVP filters new-item catalog choices to types whose applicability contains the current profile preference, consistent with existing onboarding copy. A later UI may add an explicit “show all” affordance, but silent ranking is not the primary rule.
- The same `GarmentType` can be available to both preferences.
- Applicability belongs to the canonical catalog, not a Wardrobe item.
- Changing the profile preference never hides, invalidates, deletes, or reclassifies an owned Wardrobe item.
- The recommendation engine uses only catalog types whose applicability contains the current clothing preference. Owned and wanted Wardrobe items are never recommendation candidates in the MVP.
- Production applicability is settled as follows: `blouse`, `skirt`, and `dress` contain only `womens`; every other canonical type, including `jumpsuit`, contains both `womens` and `mens`.

## Canonical MVP garment types

The following is the implemented manageable type set. It normalizes style variants and preserves weather-relevant distinctions without turning every material or silhouette into a type.

The English and Turkish labels below are localization copy, not identity. They may be edited without changing the corresponding ID.

| Structural category | `typeId` | English label | Turkish label |
| --- | --- | --- | --- |
| `top` | `t_shirt` | T-shirt | Tişört |
| `top` | `long_sleeve_t_shirt` | Long-sleeve T-shirt | Uzun kollu tişört |
| `top` | `shirt` | Shirt | Gömlek |
| `top` | `blouse` | Blouse | Bluz |
| `top` | `sweatshirt` | Sweatshirt | Sweatshirt |
| `top` | `hoodie` | Hoodie | Kapüşonlu sweatshirt |
| `top` | `sweater` | Sweater | Kazak |
| `top` | `cardigan` | Cardigan | Hırka |
| `top` | `overshirt` | Overshirt | Gömlek ceket |
| `bottom` | `trousers` | Trousers | Pantolon |
| `bottom` | `jeans` | Jeans | Jean |
| `bottom` | `shorts` | Shorts | Şort |
| `bottom` | `skirt` | Skirt | Etek |
| `one_piece` | `dress` | Dress | Elbise |
| `one_piece` | `jumpsuit` | Jumpsuit | Tulum |
| `outerwear` | `light_jacket` | Light jacket | Hafif ceket |
| `outerwear` | `trench_coat` | Trench coat | Trençkot |
| `outerwear` | `rain_jacket` | Rain jacket | Yağmurluk |
| `outerwear` | `insulated_jacket` | Insulated jacket | Yalıtımlı mont |
| `outerwear` | `coat` | Coat | Kaban |
| `footwear` | `sneakers` | Sneakers | Spor ayakkabı |
| `footwear` | `closed_shoes` | Closed shoes | Kapalı ayakkabı |
| `footwear` | `ankle_boots` | Ankle boots | Bilek botu |
| `footwear` | `weather_boots` | Weather boots | Hava koşullarına uygun bot |
| `footwear` | `sandals` | Sandals | Sandalet |
| `accessory` | `beanie` | Beanie | Bere |
| `accessory` | `brimmed_hat` | Brimmed hat | Kenarlı şapka |
| `accessory` | `scarf` | Scarf | Atkı |
| `accessory` | `gloves` | Gloves | Eldiven |
| `accessory` | `umbrella` | Umbrella | Şemsiye |

Normalization decisions:

- `shirt` means a general woven/button-front shirt; cut, material, and formality are not type identity. `blouse` remains separate because it is a recognizable catalog choice, but its weather properties may be similar.
- `trousers` includes casual and tailored trousers. `jeans` stays separate because its typical construction and breathability differ enough to justify a default.
- `sweatshirt`, `hoodie`, `sweater`, and `cardigan` remain separate recognizable constructions. Their exact warmth is still an overrideable property.
- `light_jacket`, `insulated_jacket`, `rain_jacket`, and `coat` distinguish the weather function that the engine needs. Turkish “ceket”, “mont”, “yağmurluk”, and “kaban” are localized labels or search synonyms, not IDs.
- `trench_coat` is retained because it is a stable, recognizable outerwear construction and appears in current Today copy; “light” is an attribute/default, not part of its ID.
- Generic “casual shoe” is normalized to `closed_shoes`; loafer, derby, and similar style names do not need separate MVP weather behavior.
- Generic boots are split into `ankle_boots` and `weather_boots` because wet/cold protection and traction are decision-relevant. Marketing text such as “waterproof ankle boot” is represented by type plus properties, never as a type ID.
- `umbrella` is a carried `accessory`, not a garment, but keeping it in the same catalog allows complete rain-ready recommendations without changing the six established categories.

New types may be appended without changing existing records. The engine must handle an unrecognized future type through validated catalog loading or a safe unsupported-type failure, never by silently mapping it to a different ID.

## Field definitions and ownership

### Canonical `GarmentType` definition

The catalog definition and its ownership boundary are:

| Field | Rule |
| --- | --- |
| `typeId` | Immutable canonical ID matching the naming regex and unique within every catalog version. A Wardrobe item stores one reference or null for legacy data, and the effective view carries the resolved ID when available. |
| `structuralCategory` | Exactly one of the six existing categories. A Wardrobe item retains the category snapshot, and the effective view rejects a typed item when the two disagree. |
| `nameKey` | `catalog.garment_type.<typeId>.name`; both Turkish and English messages required. SQLite stores only the user's optional item name, while the effective view uses the localized type label plus that optional name. |
| `bodyRegion` | One primary body region or null only for a carried item such as `umbrella`. |
| `supportedLayerRoles` | Unique set of layer capabilities; empty only when layering does not apply. |
| `defaultThermalLevel` | One thermal level or null when not applicable. As with every weather-property default, a Wardrobe item stores only an explicit actual-item override and the effective view resolves the override over the current default. |
| `defaultWaterProtection` | One water value for relevant types; null when not applicable. |
| `defaultWindProtection` | One wind value for relevant types; null when not applicable. |
| `defaultBreathability` | One breathability value for relevant worn types; null for carried items. |
| `defaultArmCoverage` | Required for upper/full-body types; otherwise null. |
| `defaultLegCoverage` | Required for lower/full-body types; otherwise null. |
| `defaultTractionSuitability` | Required for footwear; otherwise null. |
| `colorFamily` | The catalog does not prescribe an owned item's color. A Wardrobe item stores the canonical family and optional display text; the effective view uses the family for compatibility and the text only for display. |
| `apparelPreferenceApplicability` | Non-empty unique set containing `womens`, `mens`, or both. A Wardrobe item stores no applicability metadata, and preference changes never remove an owned item. |
| `status` | `active` or `deprecated`; deprecated entries remain resolvable against the current catalog manifest. Wardrobe items do not copy catalog versions or defaults. |
| `replacedByTypeId` | Null for active types; optional valid different ID for a deprecated type. |

Catalog validation rejects duplicate IDs, duplicate values in sets, invalid enum values, category/coverage mismatches, missing localization keys, active types with a replacement, deprecated replacement cycles, and a replacement whose structural category differs unless an explicit migration design approves the semantic change.

### Wardrobe schema version 3 fields

Migration version 3 retains all version 2 fields and adds nullable columns:

| Column | Meaning |
| --- | --- |
| `garment_type_id` | Stable catalog reference. Null only for legacy/unclassified version 2 items. |
| `color_family` | Optional canonical primary color family. |
| `thermal_level_override` | Explicit actual-item override; null uses catalog default. |
| `water_protection_override` | Explicit actual-item override; null uses catalog default. |
| `wind_protection_override` | Explicit actual-item override; null uses catalog default. |
| `breathability_override` | Explicit actual-item override; null uses catalog default. |
| `arm_coverage_override` | Explicit actual-item override; null uses catalog default. |
| `leg_coverage_override` | Explicit actual-item override; null uses catalog default. |
| `traction_suitability_override` | Explicit actual-item override; null uses catalog default. |

These columns are optional inputs, not a requirement that onboarding or add-item UI expose every control. Selecting a garment type supplies usable defaults; advanced or contextually relevant controls can record only the exceptions.

SQLite checks constrain every non-null enum override and `color_family`. `garment_type_id` does not use a SQL `CHECK` listing all IDs because adding a catalog type must not require a database migration. The repository validates it against the bundled catalog and requires the stored `category` to match. SQLite cannot use a foreign key to an app-bundled catalog.

### Effective garment resolution

For each overrideable property:

1. If a valid Wardrobe override is non-null, use it.
2. Otherwise use the current catalog default for the stored `garmentTypeId`.
3. If the item is legacy/unclassified, expose only its stored structural category and actual version 2 fields; do not invent detailed properties.
4. If a deprecated type resolves, continue using its retained definition. A replacement can be offered to the user but is never silently written.
5. If the ID cannot resolve because the catalog is corrupt or incomplete, return a sanitized invalid-data result and keep the SQLite row untouched.

The resulting effective garment view is computed in the domain/application boundary. It is not another SQLite source of truth.

The MVP does not offer a user-created or free-text custom type. New items select a canonical type; legacy `garmentTypeId = null` is a migration state, not a selectable “unknown” type. A future custom-type feature would require its own stable identity, sync, localization, and fallback decisions.

Changing a catalog default deliberately updates the effective value of an unoverridden item; it never overwrites SQLite. Explicit overrides remain stable. A deleted or renamed display label does not break an item because IDs are immutable and deprecated definitions remain resolvable. Reclassification to a replacement ID is an explicit user operation that updates `updatedAt`; it is not a catalog side effect.

`season` is rejected as a taxonomy field for the reasons in [Why one `season` field is insufficient](#why-one-season-field-is-insufficient). A per-garment temperature range is also rejected because it implies false precision and ignores the person, activity, and layering. A provider condition code and normalized current-weather needs are recommendation inputs, never garment facts. The selected `layerRole`, effective garment properties, and complete recommendation result are runtime-derived and must never become persisted item metadata.

## Unknown, null, default, and not-applicable behavior

Do not add `unknown` or `not_applicable` to every enum.

| Situation | Representation |
| --- | --- |
| Legacy item has no concrete type | `garmentTypeId = null`; retain category and do not synthesize detailed effective values. |
| A relevant property is not known by the user | Leave override null and use the validated catalog default. |
| A property does not apply to the type | Catalog field is null by its type/category validation rule; the Wardrobe override must also be null. |
| Catalog default is being used | Corresponding override column is null. |
| User explicitly overrides | Corresponding override column contains an enum value, including `none` when “no protection/insulation” is the intentional correction. |
| A new catalog changes a default | Unoverridden items receive the new default; explicit overrides remain unchanged. |
| A catalog type is deprecated | Keep its complete definition resolvable; optionally offer `replacedByTypeId`, never rewrite silently. |
| Catalog ID is unexpectedly missing | Treat as invalid catalog/data at the repository boundary; keep the stored row and avoid recommendation use until repaired. |

This distinguishes `null` as state/absence from domain values. For example, `waterProtection = none` means a relevant rain-facing item offers no meaningful water protection; null means the concept does not apply or no override is present, depending on which boundary owns the field.

## Localization and stable identities

- `typeId` and every stored enum value are language-independent English `snake_case`.
- Garment label keys use `catalog.garment_type.<typeId>.name`.
- Enum labels use `catalog.attribute.<field>.<value>`, for example `catalog.attribute.thermal_level.moderate`.
- Color labels use `catalog.color_family.<value>`.
- Every catalog type and displayable enum value must have both English and Turkish messages before catalog validation succeeds.
- Search synonyms such as Turkish “mont” or “kaban” are optional localized search metadata, never identifiers.
- Do not construct sentences from translated fragments. Recommendation reasons remain complete localized messages.

## Catalog and schema versioning

`schemaVersion` and `catalogVersion` solve different problems:

- SQLite `PRAGMA user_version` changes only when tables, columns, indexes, constraints, or data shape require a migration.
- `catalogVersion` changes when bundled type definitions, defaults, applicability, deprecations, or localization coverage change.
- Adding a new `typeId` or adjusting a catalog default does not require a database migration because `garment_type_id` is not constrained to a SQL list.
- Adding a new persisted enum value does require application compatibility analysis and may require a schema migration if a SQL `CHECK` must change.
- Renaming display copy changes localization only. Renaming an ID is prohibited; create a new ID, deprecate the old one, and offer an explicit user-approved reclassification.
- Never delete a type definition while an installed database could reference it. Deprecated definitions remain as tombstones with enough defaults to resolve existing items.
- Catalog defaults are versioned as a complete, validated manifest. Exact historical defaults need not be copied into every Wardrobe item; recommendation cache identity includes `catalogVersion`.

Each value list lives in one readonly tuple/module, and the TypeScript union is inferred from it. If a value later crosses a Worker/mobile contract, its Zod schema must use the same exported values rather than duplicate a second list. Mobile-only catalog definitions stay in the mobile catalog domain until a real shared contract exists; `packages/contracts` must not become a speculative dumping ground.

Implemented placement:

```text
apps/mobile/src/features/catalog/domain/
  garment-taxonomy.ts
  garment-catalog.ts
apps/mobile/src/features/catalog/localization/
  catalog-messages.ts
apps/mobile/src/features/wardrobe/domain/
  effective-garment.ts
apps/mobile/src/features/wardrobe/data/
  wardrobe-item-record.ts
  wardrobe-item-mapper.ts
apps/mobile/src/infrastructure/sqlite/
  migrations.ts                # append v3; never edit v1/v2
packages/contracts/src/        # remains reserved until values cross an API boundary
```

## Representative catalog records

These records are **model-consistency examples**, not the final production fixture or final merchandising assignments. A dash means the field is not applicable, not an enum value. `both` abbreviates `[womens, mens]`.

| `typeId` | Category | Roles | Thermal | Water | Wind | Breathability | Region / coverage | Traction | Applicability |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `t_shirt` | `top` | `base`, `standalone` | `none` | — | — | `high` | `upper_body`; arms `partial` | — | both |
| `long_sleeve_t_shirt` | `top` | `base`, `standalone` | `light` | — | — | `high` | `upper_body`; arms `full` | — | both |
| `sweater` | `top` | `mid`, `standalone` | `moderate` | — | — | `moderate` | `upper_body`; arms `full` | — | both |
| `cardigan` | `top` | `mid`, `standalone` | `moderate` | — | — | `moderate` | `upper_body`; arms `full` | — | both |
| `overshirt` | `top` | `mid`, `outer`, `standalone` | `light` | `none` | `none` | `moderate` | `upper_body`; arms `full` | — | both |
| `trousers` | `bottom` | `standalone` | `light` | — | — | `moderate` | `lower_body`; legs `full` | — | both |
| `shorts` | `bottom` | `standalone` | `none` | — | — | `high` | `lower_body`; legs `partial` | — | both |
| `dress` | `one_piece` | `standalone` | `light` | — | — | `moderate` | `full_body`; arms `none`, legs `partial` | — | `womens` |
| `insulated_jacket` | `outerwear` | `outer` | `high` | `water_resistant` | `wind_resistant` | `low` | `upper_body`; arms `full` | — | both |
| `rain_jacket` | `outerwear` | `outer` | `light` | `waterproof` | `wind_resistant` | `moderate` | `upper_body`; arms `full` | — | both |
| `sneakers` | `footwear` | — | `light` | `none` | — | `moderate` | `feet` | `everyday` | both |
| `sandals` | `footwear` | — | `none` | `none` | — | `high` | `feet` | `everyday` | both |
| `weather_boots` | `footwear` | — | `high` | `waterproof` | — | `low` | `feet` | `enhanced` | both |
| `beanie` | `accessory` | — | `moderate` | — | — | `moderate` | `head` | — | both |
| `scarf` | `accessory` | — | `moderate` | — | — | `moderate` | `neck` | — | both |
| `gloves` | `accessory` | — | `moderate` | `water_resistant` | — | `moderate` | `hands` | — | both |
| `brimmed_hat` | `accessory` | — | `none` | — | — | `high` | `head` | — | both |
| `umbrella` | `accessory` | — | — | `waterproof` | — | — | — | — | both |

These defaults intentionally remain coarse. A mesh sneaker, heavy sweater, short-sleeved dress, unlined waterproof shell, or fashion boot can use the appropriate Wardrobe overrides rather than forcing another canonical type.

## Scenario sufficiency checks

These checks show that the taxonomy carries the needed distinctions without defining thresholds or generating an outfit. It infers no cooling from color family and no UV protection from coverage alone, and a multi-role type such as `overshirt` remains a `top` rather than being misclassified as `outerwear`. It promises no safety on ice, assigns no Celsius rating per garment, and never overrides official extreme-weather warnings.

## Alternatives considered

The three approaches considered were detailed type only, type plus many independent required attributes, and small catalog defaults plus limited overrides. A type-only model hides weather behavior in names and makes the type list explode, while a fully attribute-driven model puts an unacceptable input burden on the user.

The third approach is selected. It keeps catalog assumptions replaceable, Wardrobe facts user-owned, and runtime composition explicit.

## Implemented migration version 3

The implementation:

1. Append migration version 3 after version 2 without editing released SQL.
2. Add the nine nullable columns listed under “Wardrobe schema version 3 fields”, with SQL checks for non-null enum values but no SQL list of garment type IDs.
3. Leave all existing rows intact, retain their required category, and set every new column to null. Do not infer a concrete type from category, name, color, photo, or Today fixture.
4. Require `garmentTypeId` for newly created items at the repository/application boundary while continuing to read legacy unclassified rows.
5. Add a validated bundled catalog and explicit catalog-to-domain and record-to-domain mapping; do not store the canonical catalog in SQLite for the MVP.
6. Derive category from selected type in new UI and validate that it matches the persisted snapshot.
7. Add effective-property resolution tests, catalog invariant tests, v2-to-v3 migration tests, mapper round trips, invalid enum tests, legacy-row behavior, deprecation behavior, and override/default precedence tests.
8. Keep provider condition codes, normalized current-weather needs, layer assignment, temperature thresholds, and recommendation outputs out of the Wardrobe table.

The implementation uses transactional `ALTER TABLE ... ADD COLUMN` statements with nullable checked columns. The production SQL is exercised by the repository's Node SQLite adapter for empty, version 1, and released version 2 databases, including rollback and idempotent re-entry, without editing migration version 2.

## Deferred product questions

- Is `umbrella` permanently a Wardrobe accessory, or should a later product model distinguish carried gear from worn accessories? The MVP can keep it as `accessory` without adding a seventh category.
- What evidence qualifies a SKU-specific `waterproof`, enhanced-traction, or future UPF claim? Until a policy exists, defaults remain conservative and user-facing safety claims are prohibited.

## Implemented boundary

The taxonomy/migration slice added the validated catalog values, localization keys, migration version 3, updated Wardrobe boundaries, the effective resolver, and focused tests. It did not add weather thresholds, WeatherKit/provider contracts, AI, sync, authentication, photo analysis, or remote catalog infrastructure.

Production applicability, override UI, and legacy color preservation are settled. The non-destructive migration preserves legacy items without guessing a type; the remaining deferred questions are listed above.
