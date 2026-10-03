import type { RefObject } from 'react';
import { Share, type View } from 'react-native';
import { File, Paths } from 'expo-file-system';

/**
 * Draws a mounted view into a PNG in the app's temporary directory, offers it through the
 * system share sheet under `fileName` with `message` beside it, and deletes both files once the
 * sheet has closed, shared or not. The only importer of the capture library, the way `haptics`
 * is the only importer of its own. Like haptics it is best-effort: it never rejects. The
 * library resolves its native module the moment it loads, so it is required on first use: a JS
 * bundle running on a binary without that module only fails the share, never the launch.
 */
export async function shareSnapshot(
  view: RefObject<View | null>,
  { fileName, message }: Readonly<{ fileName: string; message: string }>,
): Promise<void> {
  let path: string | null = null;
  let viewShot: typeof import('react-native-view-shot') | null = null;
  let named: File | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    viewShot = require('react-native-view-shot') as typeof import('react-native-view-shot');
    path = await viewShot.captureRef(view, { format: 'png', result: 'tmpfile' });
    // The capture's own name is random; the shared copy carries the readable one.
    named = new File(Paths.cache, fileName);
    if (named.exists) named.delete();
    // iOS returns a bare path; the file system and the share sheet take a file URL.
    await new File(`file://${path}`).copy(named);
    await Share.share({ message, url: named.uri });
  } catch {
    // A failed capture or share leaves the screen as it was; the person can try again.
  }
  try {
    if (named?.exists) named.delete();
  } catch {
    // The cache directory is the system's to clear; a copy left there is harmless.
  }
  if (path && viewShot) viewShot.releaseCapture(path);
}
