import {
  structuralCategories,
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

export const wardrobeItemCategories = structuralCategories;
export type WardrobeItemCategory = StructuralCategory;

export type WardrobeItemTaxonomyFields = Readonly<{
  garmentTypeId: GarmentTypeId | null;
  colorFamily: ColorFamily | null;
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
  garmentTypeId: GarmentTypeId;
  color?: string | null;
  colorFamily?: ColorFamily | null;
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
  garmentTypeId?: GarmentTypeId;
  color?: string | null;
  colorFamily?: ColorFamily | null;
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
