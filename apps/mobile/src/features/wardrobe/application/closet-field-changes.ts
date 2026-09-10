// `docs/analytics-taxonomy.md` section 5.8: `closet_item_updated`'s `fields_changed`
// reports which categories changed between the loaded item and the submitted form
// payload, never a value. The category list mirrors `ClosetFieldChanged`
// (`features/analytics/domain/analytics-events.ts`, the closed catalog this lane does not
// own) and the seven override fields of `wardrobeOverrideDefinitions` (`wardrobe-form.ts`).
import type { ClosetFieldChanged } from '@/features/analytics/domain/analytics-events';
import type {
  Breathability,
  ColorFamily,
  Coverage,
  GarmentTypeId,
  ThermalLevel,
  TractionSuitability,
  WaterProtection,
  WindProtection,
} from '@/features/catalog/domain/garment-taxonomy';
import { normalizeOptionalWardrobeText } from '@/features/wardrobe/domain/wardrobe-item';
import type { WardrobeEntryState, WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import type { WardrobeOverrideField } from '@/features/wardrobe/application/wardrobe-form';

// The submitted payload always fills every field (`wardrobe-form.ts`'s `visibleFields`),
// but the controller's own input type marks them optional, so this stays defensive: a
// field the caller did not supply is treated as unchanged rather than compared against
// `undefined`.
export type ClosetItemUpdateSubmission = Readonly<{
  name?: string | null;
  garmentTypeId?: GarmentTypeId;
  colorFamily?: ColorFamily | null;
  thermalLevelOverride?: ThermalLevel | null;
  waterProtectionOverride?: WaterProtection | null;
  windProtectionOverride?: WindProtection | null;
  breathabilityOverride?: Breathability | null;
  armCoverageOverride?: Coverage | null;
  legCoverageOverride?: Coverage | null;
  tractionSuitabilityOverride?: TractionSuitability | null;
  entryState?: WardrobeEntryState;
}>;

const overrideFieldsByProperty: Readonly<
  Record<
    Exclude<
      ClosetFieldChanged,
      'garment_type' | 'name' | 'color_family' | 'state' | 'photo'
    >,
    WardrobeOverrideField
  >
> = {
  thermal_level_override: 'thermalLevelOverride',
  water_protection_override: 'waterProtectionOverride',
  wind_protection_override: 'windProtectionOverride',
  breathability_override: 'breathabilityOverride',
  arm_coverage_override: 'armCoverageOverride',
  leg_coverage_override: 'legCoverageOverride',
  traction_suitability_override: 'tractionSuitabilityOverride',
};

// Which categories changed between `previous` (the item loaded before editing) and
// `submitted` (the payload the form is about to save), plus whether the photo changed.
// Reports categories only: `name` is free text and color/override values are never sent
// (taxonomy section 4), so this never returns a value, only the field name.
export function closetFieldsChanged(
  previous: WardrobeItem,
  submitted: ClosetItemUpdateSubmission,
  photoChanged: boolean,
): readonly ClosetFieldChanged[] {
  const changed: ClosetFieldChanged[] = [];

  if (
    submitted.garmentTypeId !== undefined &&
    submitted.garmentTypeId !== previous.garmentTypeId
  ) {
    changed.push('garment_type');
  }

  if (
    submitted.name !== undefined &&
    normalizeOptionalWardrobeText(submitted.name) !== previous.name
  ) {
    changed.push('name');
  }

  if (
    submitted.colorFamily !== undefined &&
    submitted.colorFamily !== previous.colorFamily
  ) {
    changed.push('color_family');
  }

  for (const [property, field] of Object.entries(overrideFieldsByProperty) as [
    ClosetFieldChanged,
    WardrobeOverrideField,
  ][]) {
    const value = submitted[field];
    if (value !== undefined && value !== previous[field]) {
      changed.push(property);
    }
  }

  if (
    submitted.entryState !== undefined &&
    submitted.entryState !== previous.entryState
  ) {
    changed.push('state');
  }

  if (photoChanged) {
    changed.push('photo');
  }

  return changed;
}
