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

  async usedToday(dayKey: string): Promise<number> {
    const file = this.file();
    if (!file.exists) return 0;

    try {
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

  async record(dayKey: string): Promise<void> {
    const count = (await this.usedToday(dayKey)) + 1;
    new Directory(Paths.document, ...directorySegments).create({
      idempotent: true,
      intermediates: true,
    });
    this.file().write(JSON.stringify({ dayKey, count }));
  }
}
