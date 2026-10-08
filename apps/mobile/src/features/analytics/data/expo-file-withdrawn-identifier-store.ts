import { Directory, File, Paths } from 'expo-file-system';

import type { WithdrawnIdentifierStore } from '@/features/analytics/domain/withdrawn-identifier-store';

const directorySegments = ['kuyara', 'analytics'] as const;
const fileName = 'withdrawn-identifier.txt';

export class ExpoFileWithdrawnIdentifierStore implements WithdrawnIdentifierStore {
  private file(): File {
    return new File(Paths.document, ...directorySegments, fileName);
  }

  read(): string | null {
    try {
      const file = this.file();
      return file.exists ? file.textSync().trim() || null : null;
    } catch {
      return null;
    }
  }

  keep(identifier: string): void {
    new Directory(Paths.document, ...directorySegments).create({
      idempotent: true,
      intermediates: true,
    });
    this.file().write(identifier);
  }

  clear(): void {
    const file = this.file();
    if (file.exists) file.delete();
  }
}
