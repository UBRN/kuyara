import { isManagedPhotoPath, managedPhotoRelativePath } from '@/domain/managed-photo-path';

export const historyPhotoDirectory = Object.freeze(['kuyara', 'history', 'photos'] as const);

export function createManagedHistoryPhotoPath(id: string): string | null {
  return managedPhotoRelativePath(historyPhotoDirectory, id);
}

// A history path is read exactly as stored: there is no record normalisation to apply first.
export function isManagedHistoryPhotoPath(path: string): boolean {
  return isManagedPhotoPath(historyPhotoDirectory, path);
}
