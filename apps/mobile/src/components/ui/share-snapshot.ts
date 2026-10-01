import type { RefObject } from 'react';
import { Share, type View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';

/**
 * Draws a mounted view into a PNG in the app's temporary directory, offers it through the
 * system share sheet, and deletes the file once the sheet has closed, shared or not. The only
 * importer of the capture library, the way `haptics` is the only importer of its own. Like
 * haptics it is best-effort: it never rejects.
 */
export async function shareSnapshot(view: RefObject<View | null>): Promise<void> {
  let path: string | null = null;
  try {
    path = await captureRef(view, { format: 'png', result: 'tmpfile' });
    // iOS returns a bare path; the share sheet takes a file URL.
    await Share.share({ url: `file://${path}` });
  } catch {
    // A failed capture or share leaves the screen as it was; the person can try again.
  }
  if (path) releaseCapture(path);
}
