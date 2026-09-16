import { Directory, File, Paths } from 'expo-file-system';

import { nextSessionIndex } from '@/features/analytics/domain/analytics-session';

const directorySegments = ['kuyara', 'analytics'] as const;
const fileName = 'sessions.json';

/**
 * Counts this launch and returns the 1-based index of the session it starts. A launch that
 * cannot be read or recorded is reported as the first session, so the consent sheet stays
 * deferred rather than being shown on a session the device cannot account for.
 */
export function countLaunchedSession(): number {
  try {
    const file = new File(Paths.document, ...directorySegments, fileName);
    const index = nextSessionIndex(file.exists ? file.textSync() : null);
    new Directory(Paths.document, ...directorySegments).create({
      idempotent: true,
      intermediates: true,
    });
    file.write(String(index));
    return index;
  } catch {
    return 1;
  }
}
