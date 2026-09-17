import { Directory, File, Paths } from 'expo-file-system';

import type { AiRegenerationBudget } from '@/features/recommendation/domain/regeneration-policy';

// A counter for one local day is not durable user data and would cost a migration on the
// released schema, so it lives beside the analytics first-use ledger as a small JSON file in
// app-private storage. A file that names another day reads as zero, so yesterday's entry is
// simply overwritten and no cleanup pass exists.
const directorySegments = ['kuyara', 'recommendation'] as const;
const fileName = 'ai-regenerations.json';

export class ExpoFileAiRegenerationBudget implements AiRegenerationBudget {
  private file(): File {
    return new File(Paths.document, ...directorySegments, fileName);
  }

  /**
   * Never rejects. Both callers fire this without awaiting it, so a rejection would only
   * surface as an unhandled promise warning. An unreadable or malformed file reads as zero,
   * the same answer a file naming another day already gives.
   */
  async usedToday(dayKey: string): Promise<number> {
    try {
      const file = this.file();
      if (!file.exists) return 0;

      const parsed: unknown = JSON.parse(await file.text());
      if (typeof parsed !== 'object' || parsed === null) return 0;
      const record = parsed as Readonly<{ dayKey?: unknown; count?: unknown }>;
      // `>= 0` also rejects NaN, which is the only shape `typeof` lets through.
      return record.dayKey === dayKey && typeof record.count === 'number' && record.count >= 0
        ? record.count
        : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Never rejects either. A lost count only means one more AI regeneration is allowed today,
   * which is the safe direction for a counter that exists to bound spend, not to bill.
   */
  async record(dayKey: string): Promise<void> {
    const count = (await this.usedToday(dayKey)) + 1;
    try {
      new Directory(Paths.document, ...directorySegments).create({
        idempotent: true,
        intermediates: true,
      });
      this.file().write(JSON.stringify({ dayKey, count }));
    } catch {
      // The budget stays where it was; the next tap simply gets one more allowance.
    }
  }
}
