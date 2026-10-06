import { createHistoryWriteWatch } from '@/features/recommendation/application/history-write-watch';
import type {
  OutfitHistoryRecord,
  OutfitHistoryRepository,
  WornOutfit,
  WornPieceColors,
} from '@/features/recommendation/domain/outfit-history';

type HistoryRepository = Pick<OutfitHistoryRepository, 'list' | 'day' | 'log' | 'cleanupPendingPhotos'> &
  Readonly<{ changeKey: (localProfileId: string) => Promise<string> }>;

export type OutfitHistoryAccess = Readonly<{
  list: () => Promise<readonly OutfitHistoryRecord[]>;
  day: (dayKey: string) => Promise<readonly OutfitHistoryRecord[]>;
  log: (dayKey: string, outfit: WornOutfit, pieceColors: WornPieceColors | null) => Promise<OutfitHistoryRecord>;
  /**
   * A new check of History's change key for each subscription to database writes it did not
   * make (see `createHistoryWriteWatch`); a change tells `changed`.
   */
  writeWatch: () => () => void;
}>;

/**
 * One profile's outfit history (ADR 0038) as the recommendation provider offers it. Every look
 * it records, and every change a sync pull lands, tells `changed`, so readers of History and
 * the Closet's worn counts read again.
 */
export function createOutfitHistoryAccess({ localProfileId, loadRepository, changed }: Readonly<{
  localProfileId: string;
  loadRepository: () => Promise<HistoryRepository>;
  changed: () => void;
}>): OutfitHistoryAccess {
  return {
    async list() {
      const history = await loadRepository();
      const records = await history.list(localProfileId);
      // Opening History retries the photos of deleted looks that could not be removed, as
      // opening the Closet does for its pieces.
      void history.cleanupPendingPhotos(localProfileId).catch(() => {
        // A photo still pending keeps its name on the deleted row for the next opening.
      });
      return records;
    },
    day: async (dayKey) => (await loadRepository()).day(localProfileId, dayKey),
    async log(dayKey, outfit, pieceColors) {
      const record = await (await loadRepository()).log(localProfileId, dayKey, outfit, { kind: 'keep' }, pieceColors);
      changed();
      return record;
    },
    writeWatch: () => createHistoryWriteWatch({
      changeKey: async () => (await loadRepository()).changeKey(localProfileId),
      cleanupPendingPhotos: async () => (await loadRepository()).cleanupPendingPhotos(localProfileId),
      changed,
    }),
  };
}
