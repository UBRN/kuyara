import { appConfigV1SiriCardValues } from '@kuyara/contracts';
import { Directory, File, Paths } from 'expo-file-system';
import { z } from 'zod';

import type { SiriCardSwitchStore, StoredSiriCardSwitch } from '@/features/recommendation/application/siri-card-switch';
import { utcIsoTimestampSchema } from '@/domain/record-identity';

// The last remote switch answer is not user data and a table would cost a migration on the
// released schema, so it lives beside the AI re-ask counter as a small JSON file in app-private
// storage. Content that does not parse reads as never received, which is on, and is overwritten
// by the next check.
const directorySegments = ['kuyara', 'recommendation'] as const;
const fileName = 'siri-card.json';

const storedSchema = z.object({ siriCard: z.enum(appConfigV1SiriCardValues), checkedAt: utcIsoTimestampSchema });

export class ExpoFileSiriCardSwitchStore implements SiriCardSwitchStore {
  private file(): File {
    return new File(Paths.document, ...directorySegments, fileName);
  }

  async read(): Promise<StoredSiriCardSwitch | null> {
    try {
      const file = this.file();
      return file.exists ? storedSchema.parse(JSON.parse(await file.text())) : null;
    } catch {
      return null; // an unreadable file or an interrupted write reads as never received, which is on
    }
  }

  async write(stored: StoredSiriCardSwitch): Promise<void> {
    try {
      new Directory(Paths.document, ...directorySegments).create({ idempotent: true, intermediates: true });
      this.file().write(JSON.stringify(stored));
    } catch {
      // The previous answer stays; the next check writes again.
    }
  }
}
