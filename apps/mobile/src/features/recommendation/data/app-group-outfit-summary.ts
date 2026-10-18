import { File, Paths } from 'expo-file-system';

import type { OutfitSummary } from '@/features/recommendation/application/outfit-summary';

// ADR 0042 section 3: the App Group the Siri intents share with the app, declared by
// plugins/with-siri-intents.js. Android and a build without the entitlement expose no container.
const appGroup = 'group.com.ubrn.kuyara';
const fileName = 'outfit-summary.json';
const temporaryName = 'outfit-summary.json.tmp';

/**
 * Writes the summary for the Siri card. expo-file-system writes a file in place, so the text
 * goes to a temporary file first and is moved over the summary: Swift reads the old file,
 * briefly none (which it shows as the stale card), or the new one, never a half-written one.
 * Writes are synchronous, so one temporary name serves them all. A failure keeps the previous
 * file, which its `validUntil` still bounds. The file is protected until the first unlock, the
 * iOS default for an app without the data protection entitlement, so the card reads it on a
 * locked phone.
 */
export function writeOutfitSummary(summary: OutfitSummary): void {
  try {
    const container = Paths.appleSharedContainers[appGroup];
    if (!container) return;
    const temporary = new File(container, temporaryName);
    temporary.write(JSON.stringify(summary));
    temporary.moveSync(new File(container, fileName), { overwrite: true });
  } catch {
    // The card shows the previous summary until its window ends, then the stale state.
  }
}
