import { isUuidV4 } from '@/domain/record-identity';
import { normalizeWardrobePhotoRelativePath } from '@/features/wardrobe/domain/wardrobe-item';
import { WardrobePhotoValidationError } from '@/features/wardrobe/domain/wardrobe-photo';

export const managedWardrobePhotoDirectorySegments = Object.freeze([
  'kuyara',
  'wardrobe',
  'photos',
] as const);

const managedPhotoPathPattern = /^kuyara\/wardrobe\/photos\/([^/]+)\.jpg$/i;

export function requireWardrobePhotoUuidV4(value: string): string {
  if (!isUuidV4(value)) {
    throw new WardrobePhotoValidationError();
  }

  return value.toLowerCase();
}

export function createManagedWardrobePhotoRelativePath(id: string): string {
  return `${managedWardrobePhotoDirectorySegments.join('/')}/${requireWardrobePhotoUuidV4(id)}.jpg`;
}

export function isManagedWardrobePhotoRelativePath(value: string): boolean {
  try {
    const normalized = normalizeWardrobePhotoRelativePath(value);
    const fileId = normalized === null ? undefined : managedPhotoPathPattern.exec(normalized)?.[1];
    return fileId !== undefined && isUuidV4(fileId);
  } catch {
    return false;
  }
}
