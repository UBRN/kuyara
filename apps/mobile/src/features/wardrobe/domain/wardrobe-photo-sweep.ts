const hourInMs = 60 * 60 * 1000;

// What keeps a file a save is about to name safe is the controller: the sweep never runs
// beside a save. A copy can keep the staged file's old modification date, so age is no proof
// of that. A day is only an extra margin for the leftovers of a crash.
export const orphanedWardrobePhotoMinimumAgeMs = 24 * hourInMs;

// A staged photo only waits for the form that picked it; one an hour old belongs to a form
// that no longer exists.
export const staleStagedWardrobePhotoMinimumAgeMs = hourInMs;

/**
 * Whether a file modification time is a time at all. A failed read comes back as null,
 * undefined, NaN or, on Android, 0; a file whose time is not known is never swept.
 */
export function isKnownFileTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

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
        isKnownFileTime(file.modifiedAtMs) &&
        nowMs - file.modifiedAtMs > orphanedWardrobePhotoMinimumAgeMs,
    )
    .map((file) => file.relativePath);
}
