import type { RefObject } from 'react';
import { Share, type View } from 'react-native';

/**
 * Draws a mounted view into a PNG in the app's temporary directory, offers it through the
 * system share sheet, and deletes the file once the sheet has closed, shared or not. The only
 * importer of the capture library, the way `haptics` is the only importer of its own. Like
 * haptics it is best-effort: it never rejects. The library resolves its native module the moment
 * it loads, so it is required on first use: a JS bundle running on a binary without that module
 * only fails the share, never the launch.
 */
export async function shareSnapshot(view: RefObject<View | null>): Promise<void> {
  let path: string | null = null;
  let viewShot: typeof import('react-native-view-shot') | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    viewShot = require('react-native-view-shot') as typeof import('react-native-view-shot');
    path = await viewShot.captureRef(view, { format: 'png', result: 'tmpfile' });
    // iOS returns a bare path; the share sheet takes a file URL.
    await Share.share({ url: `file://${path}` });
  } catch {
    // A failed capture or share leaves the screen as it was; the person can try again.
  }
  if (path && viewShot) viewShot.releaseCapture(path);
}
