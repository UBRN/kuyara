import { isUuidV4 } from '@/domain/record-identity';

/** The app-private directory a feature keeps its photos in, as path segments under the document root. */
export type ManagedPhotoDirectory = readonly string[];

function stemPattern(directory: ManagedPhotoDirectory): RegExp {
  const escaped = directory.map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join('/')}/([^/]+)\\.jpg$`, 'i');
}

/**
 * The relative path a photo with this id is stored at: the directory, then the lowercased id
 * as a `.jpg`. Null when the id is not a UUID v4, so no path is ever built from free text.
 */
export function managedPhotoRelativePath(directory: ManagedPhotoDirectory, id: string): string | null {
  return isUuidV4(id) ? `${directory.join('/')}/${id.toLowerCase()}.jpg` : null;
}

/**
 * Whether a stored path is exactly one managed photo of the directory: `<directory>/<uuid v4>.jpg`.
 * `normalize` runs first for a feature that accepts values its own record rules would trim or
 * reject (a throw there is a refusal); the default reads the value as stored.
 */
export function isManagedPhotoPath(
  directory: ManagedPhotoDirectory,
  value: string,
  normalize: (value: string) => string | null = (stored) => stored,
): boolean {
  try {
    const normalized = normalize(value);
    const fileId = normalized === null ? undefined : stemPattern(directory).exec(normalized)?.[1];
    return fileId !== undefined && isUuidV4(fileId);
  } catch {
    return false;
  }
}
