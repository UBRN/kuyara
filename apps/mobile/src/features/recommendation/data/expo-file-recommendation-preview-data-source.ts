import { Directory, File, Paths } from 'expo-file-system';

import type {
  RecommendationLocalDataSource,
  RecommendationSnapshotRecord,
} from '@/features/recommendation/data/recommendation-local-data-source';

// Tomorrow's preview is one cached recommendation for one dressing day, replaced every evening
// and worth at most one selection if lost, so like the re-ask counter it lives as a small JSON
// file in app-private storage instead of costing a migration on the released schema. The file
// names the day it was claimed for, which is what bounds the preview to one selection a day.
const directorySegments = ['kuyara', 'recommendation'] as const;
const fileName = 'tomorrow-preview.json';

// The chain only orders the file operations; each caller still receives its own result or error.
function settle(): void {}

type PreviewFile = Readonly<{
  localProfileId: string;
  dayKey: string;
  record: RecommendationSnapshotRecord | null;
}>;

function isPreviewFile(value: unknown): value is PreviewFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const file = value as Record<string, unknown>;
  return typeof file.localProfileId === 'string' && typeof file.dayKey === 'string' &&
    (file.record === null || (typeof file.record === 'object' && !Array.isArray(file.record)));
}

/**
 * The record half is validated by `LocalRecommendationRepository`, which wraps this source
 * exactly as it wraps the SQLite one; this class only keeps the file and the day's claim.
 */
export class ExpoFileRecommendationPreviewDataSource implements RecommendationLocalDataSource {
  private static pending: Promise<unknown> = Promise.resolve();

  private file(): File {
    return new File(Paths.document, ...directorySegments, fileName);
  }

  // A file that cannot be read throws; one that reads but holds no valid preview is null.
  private async read(): Promise<PreviewFile | null> {
    const file = this.file();
    if (!file.exists) return null;
    const text = await file.text();
    try {
      const parsed: unknown = JSON.parse(text);
      return isPreviewFile(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private write(value: PreviewFile): void {
    new Directory(Paths.document, ...directorySegments).create({ idempotent: true, intermediates: true });
    this.file().write(JSON.stringify(value));
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = ExpoFileRecommendationPreviewDataSource.pending.then(operation);
    ExpoFileRecommendationPreviewDataSource.pending = result.then(settle, settle);
    return result;
  }

  /**
   * Claims the day's one selection: true once per profile and day key. A malformed file holds
   * no claim and is overwritten; a file that cannot be read or written denies, so a store that
   * cannot keep the claim never lets the selection run again.
   */
  claim(localProfileId: string, dayKey: string): Promise<boolean> {
    return this.serialized(async () => {
      try {
        const current = await this.read();
        if (current?.localProfileId === localProfileId && current.dayKey === dayKey) return false;
        this.write({ localProfileId, dayKey, record: null });
        return true;
      } catch {
        return false;
      }
    });
  }

  getSnapshot(localProfileId: string): Promise<RecommendationSnapshotRecord | null> {
    return this.serialized(async () => {
      const current = await this.read();
      return current?.localProfileId === localProfileId ? current.record : null;
    });
  }

  replaceSnapshot(record: RecommendationSnapshotRecord): Promise<RecommendationSnapshotRecord> {
    return this.serialized(async () => {
      const current = await this.read().catch(() => null);
      this.write({
        localProfileId: record.localProfileId,
        dayKey: current?.localProfileId === record.localProfileId ? current.dayKey : '',
        record,
      });
      return record;
    });
  }
}
