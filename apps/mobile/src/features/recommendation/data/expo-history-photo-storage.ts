import { Directory, File, Paths } from 'expo-file-system';

import type { HistoryPhotoStorage } from '@/features/recommendation/domain/outfit-history';
import { isManagedHistoryPhotoPath } from '@/features/recommendation/data/history-photo-path';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const photoDirectory = ['kuyara', 'history', 'photos'] as const;

export class ExpoHistoryPhotoStorage implements HistoryPhotoStorage {
  private readonly createId: () => string;

  constructor(createId: () => string) { this.createId = createId; }

  async copyStaged(stagedUri: string): Promise<string> {
    const source = this.requireStaged(stagedUri);
    const id = this.createId();
    if (!uuidV4.test(id)) throw new Error('Invalid history photo identifier.');
    const relativePath = `${photoDirectory.join('/')}/${id.toLowerCase()}.jpg`;
    const directory = new Directory(Paths.document, ...photoDirectory);
    directory.create({ idempotent: true, intermediates: true });
    const stored = new File(Paths.document, ...relativePath.split('/'));
    try {
      await source.copy(stored);
    } catch (error) {
      if (stored.exists) stored.delete();
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
