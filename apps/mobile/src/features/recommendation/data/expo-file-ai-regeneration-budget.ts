import { Directory, File, Paths } from 'expo-file-system';

import { regenerationPolicy, type AiRegenerationBudget } from '@/features/recommendation/domain/regeneration-policy';

// A counter for one local day is not durable user data and would cost a migration on the
// released schema, so it lives beside the analytics first-use ledger as a small JSON file in
// app-private storage. A file that names another day reads as zero, so yesterday's entry is
// simply overwritten and no cleanup pass exists.
const directorySegments = ['kuyara', 'recommendation'] as const;
const fileName = 'ai-regenerations.json';

export class ExpoFileAiRegenerationBudget implements AiRegenerationBudget {
  private static pending: Promise<void> = Promise.resolve();

  private file(): File {
    return new File(Paths.document, ...directorySegments, fileName);
  }

  private async countFor(dayKey: string): Promise<number | null> {
    try {
      const file = this.file();
      if (!file.exists) return 0;

      const parsed: unknown = JSON.parse(await file.text());
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
      const record = parsed as Readonly<{ dayKey?: unknown; count?: unknown }>;
      if (typeof record.dayKey !== 'string' || typeof record.count !== 'number' ||
          !Number.isSafeInteger(record.count) || record.count < 0) return null;
      return record.dayKey === dayKey ? record.count : 0;
    } catch {
      return null;
    }
  }

  private async reserveOnce(dayKey: string): Promise<boolean> {
    const count = await this.countFor(dayKey);
    if (count === null || count >= regenerationPolicy.dailyAiRegenerations) return false;
    try {
      new Directory(Paths.document, ...directorySegments).create({
        idempotent: true,
        intermediates: true,
      });
      this.file().write(JSON.stringify({ dayKey, count: count + 1 }));
      return true;
    } catch {
      return false;
    }
  }

  reserve(dayKey: string): Promise<boolean> {
    const result = ExpoFileAiRegenerationBudget.pending.then(() => this.reserveOnce(dayKey));
    ExpoFileAiRegenerationBudget.pending = result.then(() => undefined, () => undefined);
    return result;
  }
}
