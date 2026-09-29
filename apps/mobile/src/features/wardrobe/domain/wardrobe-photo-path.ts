import { normalizeWardrobePhotoRelativePath } from '@/features/wardrobe/domain/wardrobe-item';
import { WardrobePhotoValidationError } from '@/features/wardrobe/domain/wardrobe-photo';

export const managedWardrobePhotoDirectorySegments = Object.freeze([
  'kuyara',
  'wardrobe',
  'photos',
] as const);

const managedPhotoPathPattern =
  /^kuyara\/wardrobe\/photos\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i;
const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireWardrobePhotoUuidV4(value: string): string {
  if (!uuidV4Pattern.test(value)) {
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
    return normalized !== null && managedPhotoPathPattern.test(normalized);
  } catch {
    return false;
  }
}
