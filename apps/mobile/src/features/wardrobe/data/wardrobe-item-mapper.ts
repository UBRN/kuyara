import type { WardrobeItemRecord } from '@/features/wardrobe/data/wardrobe-item-record';
import {
  isWardrobeItemCategory,
  normalizeWardrobePhotoRelativePath,
  type WardrobeItem,
  type WardrobeItemCategory,
} from '@/features/wardrobe/domain/wardrobe-item';

export class WardrobeItemMappingError extends Error {
  constructor() {
    super('The stored wardrobe item is invalid.');
    this.name = 'WardrobeItemMappingError';
  }
}

function isUtcIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
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
      color: record.color,
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
