import { isUuidV4 } from '@/domain/record-identity';

const managedPathPattern = /^kuyara\/history\/photos\/([^/]+)\.jpg$/i;

export function isManagedHistoryPhotoPath(path: string): boolean {
  const fileId = managedPathPattern.exec(path)?.[1];
  return fileId !== undefined && isUuidV4(fileId);
}
