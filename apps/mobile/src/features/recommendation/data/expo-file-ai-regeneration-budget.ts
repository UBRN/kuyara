import { Directory, File, Paths } from 'expo-file-system';

import { regenerationPolicy, type AiRegenerationBudget } from '@/features/recommendation/domain/regeneration-policy';

// A counter for one local day is not durable user data and would cost a migration on the
// released schema, so it lives beside the analytics first-use ledger as a small JSON file in
// app-private storage. A file that names another day reads as zero, so yesterday's entry is
// simply overwritten and no cleanup pass exists. Content that no longer parses (an interrupted
// write) reads as zero too and is overwritten by the next reservation, so it cannot lock the
// re-ask out of the AI for good; a file that cannot be read at all still denies the slot.
const directorySegments = ['kuyara', 'recommendation'] as const;
const fileName = 'ai-regenerations.json';

function storedCount(text: string, dayKey: string): number {
  try {
    // Null, an array or a primitive fails the day check or throws on the read, and reads as zero.
    const parsed: unknown = JSON.parse(text);
    const { dayKey: storedDay, count } = parsed as Readonly<{ dayKey?: unknown; count?: unknown }>;
    return storedDay === dayKey && typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
      ? count : 0;
  } catch {
    return 0;
  }
}

export class ExpoFileAiRegenerationBudget implements AiRegenerationBudget {
  private static pending: Promise<void> = Promise.resolve();

  private file(): File {
    return new File(Paths.document, ...directorySegments, fileName);
  }

  private async countFor(dayKey: string): Promise<number | null> {
    let text: string | null;
    try {
      const file = this.file();
      text = file.exists ? await file.text() : null;
    } catch {
      return null;
    }
    return text === null ? 0 : storedCount(text, dayKey);
  }

  private async reserveOnce(dayKey: string, dailyLimit: number): Promise<boolean> {
    const count = await this.countFor(dayKey);
    if (count === null || count >= dailyLimit) return false;
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

  private async releaseOnce(dayKey: string): Promise<void> {
    const count = await this.countFor(dayKey);
    if (count === null || count === 0) return;
    try {
      this.file().write(JSON.stringify({ dayKey, count: count - 1 }));
    } catch {
      // Not given back: the slot stays spent, as it was before the release.
    }
  }

  /** One file operation at a time across instances, so a release and a reservation never interleave. */
  private static serialized<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = ExpoFileAiRegenerationBudget.pending.then(operation);
    ExpoFileAiRegenerationBudget.pending = result.then(() => undefined, () => undefined);
    return result;
  }

  reserve(dayKey: string, dailyLimit: number = regenerationPolicy.dailyAiRegenerations): Promise<boolean> {
    return ExpoFileAiRegenerationBudget.serialized(() => this.reserveOnce(dayKey, dailyLimit));
  }

  release(dayKey: string): Promise<void> {
    return ExpoFileAiRegenerationBudget.serialized(() => this.releaseOnce(dayKey));
  }
}
