import { z } from 'zod';
import type { ClosetColorChoice } from '@/features/wardrobe/domain/closet-color-options';

import {
  garmentTypeIdSchema,
  structuralCategorySchema,
  type Breathability,
  type ColorFamily,
  type Coverage,
  type GarmentTypeId,
  type StructuralCategory,
  type ThermalLevel,
  type TractionSuitability,
  type WaterProtection,
  type WindProtection,
} from '@/features/catalog/domain/garment-taxonomy';

export type WardrobeItemCategory = StructuralCategory;

export const wardrobeEntryStateSchema = z.enum(['owned', 'wanted']);
export type WardrobeEntryState = z.infer<typeof wardrobeEntryStateSchema>;

export type WardrobeItemTaxonomyFields = Readonly<{
  garmentTypeId: GarmentTypeId | null;
  colorFamily: ColorFamily | null;
  colorChoice?: ClosetColorChoice | null;
  thermalLevelOverride: ThermalLevel | null;
  waterProtectionOverride: WaterProtection | null;
  windProtectionOverride: WindProtection | null;
  breathabilityOverride: Breathability | null;
  armCoverageOverride: Coverage | null;
  legCoverageOverride: Coverage | null;
  tractionSuitabilityOverride: TractionSuitability | null;
}>;

export type WardrobeItem = Readonly<{
  id: string;
  localProfileId: string;
  name: string | null;
  category: WardrobeItemCategory;
  entryState: WardrobeEntryState;
  color: string | null;
  photoRelativePath: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}> & WardrobeItemTaxonomyFields;

export type CreateWardrobeItemInput = Readonly<{
  localProfileId: string;
  name?: string | null;
  category?: WardrobeItemCategory;
  entryState?: WardrobeEntryState;
  garmentTypeId: GarmentTypeId;
  color?: string | null;
  colorFamily?: ColorFamily | null;
  colorChoice?: ClosetColorChoice | null;
  thermalLevelOverride?: ThermalLevel | null;
  waterProtectionOverride?: WaterProtection | null;
  windProtectionOverride?: WindProtection | null;
  breathabilityOverride?: Breathability | null;
  armCoverageOverride?: Coverage | null;
  legCoverageOverride?: Coverage | null;
  tractionSuitabilityOverride?: TractionSuitability | null;
  photoRelativePath?: string | null;
}>;

export type UpdateWardrobeItemInput = Readonly<{
  id: string;
  localProfileId: string;
  name?: string | null;
  category?: WardrobeItemCategory;
  entryState?: WardrobeEntryState;
  garmentTypeId?: GarmentTypeId;
  color?: string | null;
  colorFamily?: ColorFamily | null;
  colorChoice?: ClosetColorChoice | null;
  thermalLevelOverride?: ThermalLevel | null;
  waterProtectionOverride?: WaterProtection | null;
  windProtectionOverride?: WindProtection | null;
  breathabilityOverride?: Breathability | null;
  armCoverageOverride?: Coverage | null;
  legCoverageOverride?: Coverage | null;
  tractionSuitabilityOverride?: TractionSuitability | null;
  photoRelativePath?: string | null;
}>;

export class WardrobeItemValidationError extends Error {
  constructor() {
    super('The wardrobe item is invalid.');
    this.name = 'WardrobeItemValidationError';
  }
}

export function isWardrobeItemCategory(value: string): value is WardrobeItemCategory {
  return structuralCategorySchema.safeParse(value).success;
}

/**
 * The stored garment type column: null stays null and a catalog id is kept. An id this build's
 * catalog does not list reads as null, so the piece stays readable (a legacy entry); a
 * non-string throws. A caller that must refuse such an id tells it apart by the non-null input.
 */
export function garmentTypeIdFromColumn(value: unknown): GarmentTypeId | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('Invalid garment type column.');
  const result = garmentTypeIdSchema.safeParse(value);
  return result.success ? result.data : null;
}

/** The longest Closet name the form takes, in characters; the account holds a name of up to 800 bytes (4 per character). */
export const WARDROBE_NAME_MAX_LENGTH = 200;

export function normalizeOptionalWardrobeText(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new WardrobeItemValidationError();
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeWardrobePhotoRelativePath(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalWardrobeText(value);

  if (normalized === null) {
    return null;
  }

  const hasUriScheme = /^[a-z][a-z\d+.-]*:/i.test(normalized);
  const hasWindowsDrive = /^[a-z]:[\\/]/i.test(normalized);
  const segments = normalized.split('/');
  const hasInvalidSegment = segments.some(
    (segment) => segment.length === 0 || segment === '.' || segment === '..',
  );

  if (
    normalized.startsWith('/') ||
    normalized.startsWith('\\') ||
    normalized.includes('\\') ||
    normalized.includes('\0') ||
    hasUriScheme ||
    hasWindowsDrive ||
    hasInvalidSegment
  ) {
    throw new WardrobeItemValidationError();
  }

  return normalized;
}
