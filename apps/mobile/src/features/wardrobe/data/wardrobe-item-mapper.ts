import type { ZodType } from 'zod';

import type { WardrobeItemRecord } from '@/features/wardrobe/data/wardrobe-item-record';
import { closetColorChoiceFromColumns } from '@/features/wardrobe/domain/closet-color-options';
import {
  breathabilitySchema,
  colorFamilySchema,
  coverageSchema,
  thermalLevelSchema,
  tractionSuitabilitySchema,
  waterProtectionSchema,
  windProtectionSchema,
} from '@/features/catalog/domain/garment-taxonomy';
import {
  garmentTypeIdFromColumn,
  isWardrobeItemCategory,
  normalizeWardrobePhotoRelativePath,
  wardrobeEntryStateSchema,
  type WardrobeItem,
  type WardrobeItemCategory,
} from '@/features/wardrobe/domain/wardrobe-item';
import { isUtcIsoTimestamp, isUuidV4 } from '@/domain/record-identity';

export class WardrobeItemMappingError extends Error {
  constructor() {
    super('The stored wardrobe item is invalid.');
    this.name = 'WardrobeItemMappingError';
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function mapEnum<Value>(value: unknown, schema: ZodType<Value>): Value {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new WardrobeItemMappingError();
  }

  return result.data;
}

function mapNullableEnum<Value>(value: unknown, schema: ZodType<Value>): Value | null {
  if (value === null) {
    return null;
  }

  return mapEnum(value, schema);
}

export function mapWardrobeCategoryToRecord(
  category: WardrobeItemCategory,
): string {
  switch (category) {
    case 'top':
      return 'top';
    case 'bottom':
      return 'bottom';
    case 'one_piece':
      return 'one_piece';
    case 'outerwear':
      return 'outerwear';
    case 'footwear':
      return 'footwear';
    case 'accessory':
      return 'accessory';
  }
}

export function mapWardrobeCategoryFromRecord(value: string): WardrobeItemCategory {
  if (!isWardrobeItemCategory(value)) {
    throw new WardrobeItemMappingError();
  }

  return value;
}

export function mapWardrobeItemRecord(record: WardrobeItemRecord): WardrobeItem {
  try {
    const normalizedPhotoPath = normalizeWardrobePhotoRelativePath(record.photoRelativePath);
    const entryState = mapEnum(record.entryState, wardrobeEntryStateSchema);
    const garmentTypeId = garmentTypeIdFromColumn(record.garmentTypeId);
    const colorFamily = mapNullableEnum(record.colorFamily, colorFamilySchema);
    const colorChoice = closetColorChoiceFromColumns(
      record.colorOptionId ?? null,
      record.colorCustomHex ?? null,
      colorFamily,
    );
    const thermalLevelOverride = mapNullableEnum(
      record.thermalLevelOverride,
      thermalLevelSchema,
    );
    const waterProtectionOverride = mapNullableEnum(
      record.waterProtectionOverride,
      waterProtectionSchema,
    );
    const windProtectionOverride = mapNullableEnum(
      record.windProtectionOverride,
      windProtectionSchema,
    );
    const breathabilityOverride = mapNullableEnum(
      record.breathabilityOverride,
      breathabilitySchema,
    );
    const armCoverageOverride = mapNullableEnum(
      record.armCoverageOverride,
      coverageSchema,
    );
    const legCoverageOverride = mapNullableEnum(
      record.legCoverageOverride,
      coverageSchema,
    );
    const tractionSuitabilityOverride = mapNullableEnum(
      record.tractionSuitabilityOverride,
      tractionSuitabilitySchema,
    );
    const hasValidDeletedAt =
      record.deletedAt === null ||
      (typeof record.deletedAt === 'string' && isUtcIsoTimestamp(record.deletedAt));

    if (
      typeof record.id !== 'string' ||
      !isUuidV4(record.id) ||
      typeof record.localProfileId !== 'string' ||
      record.localProfileId.length === 0 ||
      !isNullableString(record.name) ||
      !isNullableString(record.color) ||
      normalizedPhotoPath !== record.photoRelativePath ||
      typeof record.createdAt !== 'string' ||
      !isUtcIsoTimestamp(record.createdAt) ||
      typeof record.updatedAt !== 'string' ||
      !isUtcIsoTimestamp(record.updatedAt) ||
      !hasValidDeletedAt
    ) {
      throw new WardrobeItemMappingError();
    }

    return {
      id: record.id,
      localProfileId: record.localProfileId,
      name: record.name,
      category: mapWardrobeCategoryFromRecord(record.category),
      entryState,
      garmentTypeId,
      color: record.color,
      colorFamily,
      colorChoice,
      thermalLevelOverride,
      waterProtectionOverride,
      windProtectionOverride,
      breathabilityOverride,
      armCoverageOverride,
      legCoverageOverride,
      tractionSuitabilityOverride,
      photoRelativePath: normalizedPhotoPath,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deletedAt: record.deletedAt,
    };
  } catch (error) {
    if (error instanceof WardrobeItemMappingError) {
      throw error;
    }

    throw new WardrobeItemMappingError();
  }
}
