const managedPathPattern = /^kuyara\/history\/photos\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i;

export function isManagedHistoryPhotoPath(path: string): boolean {
  return managedPathPattern.test(path);
}
