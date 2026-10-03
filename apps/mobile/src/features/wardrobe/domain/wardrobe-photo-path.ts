import { isManagedPhotoPath, managedPhotoRelativePath } from '@/domain/managed-photo-path';
import { isUuidV4 } from '@/domain/record-identity';
import { normalizeWardrobePhotoRelativePath } from '@/features/wardrobe/domain/wardrobe-item';
import { WardrobePhotoValidationError } from '@/features/wardrobe/domain/wardrobe-photo';

export const managedWardrobePhotoDirectorySegments = Object.freeze([
  'kuyara',
  'wardrobe',
  'photos',
] as const);

export function requireWardrobePhotoUuidV4(value: string): string {
  if (!isUuidV4(value)) {
    throw new WardrobePhotoValidationError();
  }

  return value.toLowerCase();
}

export function createManagedWardrobePhotoRelativePath(id: string): string {
  const path = managedPhotoRelativePath(managedWardrobePhotoDirectorySegments, id);
  if (path === null) {
    throw new WardrobePhotoValidationError();
  }

  return path;
}

// A stored wardrobe path is read through the record's own normalisation (trim, reject unsafe).
export function isManagedWardrobePhotoRelativePath(value: string): boolean {
  return isManagedPhotoPath(
    managedWardrobePhotoDirectorySegments,
    value,
    normalizeWardrobePhotoRelativePath,
  );
}
