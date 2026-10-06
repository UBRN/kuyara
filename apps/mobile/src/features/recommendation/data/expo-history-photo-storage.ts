import { Directory, File, Paths } from 'expo-file-system';

import type { HistoryPhotoStorage } from '@/features/recommendation/domain/outfit-history';
import {
  createManagedHistoryPhotoPath,
  historyPhotoDirectory,
  isManagedHistoryPhotoPath,
} from '@/features/recommendation/data/history-photo-path';

export class ExpoHistoryPhotoStorage implements HistoryPhotoStorage {
  private readonly createId: () => string;

  constructor(createId: () => string) { this.createId = createId; }

  async copyStaged(stagedUri: string): Promise<string> {
    const source = this.requireStaged(stagedUri);
    const relativePath = createManagedHistoryPhotoPath(this.createId());
    if (relativePath === null) throw new Error('Invalid history photo identifier.');
    const directory = new Directory(Paths.document, ...historyPhotoDirectory);
    directory.create({ idempotent: true, intermediates: true });
    const stored = new File(Paths.document, ...relativePath.split('/'));
    try {
      await source.copy(stored);
    } catch (error) {
      try {
        if (stored.exists) stored.delete();
      } catch {
        // The copy error rethrown below is the one that matters; a failed cleanup must not replace it.
      }
      throw error;
    }
    return relativePath;
  }

  async discardStaged(stagedUri: string): Promise<void> {
    const staged = this.requireStaged(stagedUri);
    staged.delete();
  }

  private requireStaged(stagedUri: string): File {
    const staging = new Directory(Paths.cache, 'kuyara', 'wardrobe', 'staging');
    const source = new File(stagedUri);
    const prefix = staging.uri.endsWith('/') ? staging.uri : `${staging.uri}/`;
    if (!source.exists || !source.uri.startsWith(prefix)) {
      throw new Error('Invalid staged history photo.');
    }
    return source;
  }

  async deleteStored(relativePath: string): Promise<void> {
    if (!isManagedHistoryPhotoPath(relativePath)) return;
    const stored = new File(Paths.document, ...relativePath.split('/'));
    if (stored.exists) stored.delete();
  }

  resolveUri(relativePath: string | null): string | null {
    if (!relativePath || !isManagedHistoryPhotoPath(relativePath)) return null;
    try {
      const stored = new File(Paths.document, ...relativePath.split('/'));
      return stored.exists ? stored.uri : null;
    } catch { return null; }
  }
}
