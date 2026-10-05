const hourInMs = 60 * 60 * 1000;

// A stored photo is written before the row that names it, so the file a save is about to
// name is always young. A day is far longer than any save.
export const orphanedWardrobePhotoMinimumAgeMs = 24 * hourInMs;

// A staged photo only waits for the form that picked it; one an hour old belongs to a form
// that no longer exists.
export const staleStagedWardrobePhotoMinimumAgeMs = hourInMs;

/** A managed photo file (`<directory>/<uuid v4>.jpg`); `modifiedAtMs` is null when the system cannot say. */
export type ManagedWardrobePhotoFile = Readonly<{
  relativePath: string;
  modifiedAtMs: number | null;
}>;

/**
 * The managed photo files nothing names and that are old enough to be leftovers: the files a
 * failed save or delete could not remove, or a crash between copying a photo and writing its
 * row left behind. `namedPaths` are every path any row names, deleted and other profiles' rows
 * included, as stored: a path is compared in lower case, so a row the mapper rejects still
 * protects its file. A file whose age is unknown is never one of them.
 */
export function orphanedWardrobePhotoPaths(
  files: readonly ManagedWardrobePhotoFile[],
  namedPaths: readonly string[],
  nowMs: number,
): string[] {
  const named = new Set(namedPaths.map((path) => path.trim().toLowerCase()));
  return files
    .filter(
      (file) =>
        !named.has(file.relativePath.toLowerCase()) &&
        file.modifiedAtMs !== null &&
        nowMs - file.modifiedAtMs > orphanedWardrobePhotoMinimumAgeMs,
    )
    .map((file) => file.relativePath);
}
