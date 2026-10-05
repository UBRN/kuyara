import type {
  StagedWardrobePhoto,
  StoredWardrobePhoto,
  WardrobePhotoPicker,
  WardrobePhotoProcessor,
  WardrobePhotoStorage,
} from '@/features/wardrobe/data/wardrobe-photo-adapters';
import type { WardrobePhotoSource } from '@/features/wardrobe/domain/wardrobe-photo';
import type { ManagedWardrobePhotoFile } from '@/features/wardrobe/domain/wardrobe-photo-sweep';

export type WardrobePhotoChange =
  | Readonly<{ kind: 'unchanged' }>
  | Readonly<{ kind: 'remove' }>
  | Readonly<{ kind: 'replace'; stagedPhoto: StagedWardrobePhoto }>;

export const unchangedWardrobePhoto: WardrobePhotoChange = Object.freeze({
  kind: 'unchanged',
});

export interface WardrobePhotoManager {
  preparePhoto(source?: WardrobePhotoSource): Promise<StagedWardrobePhoto | null>;
  commitStagedPhoto(photo: StagedWardrobePhoto): Promise<StoredWardrobePhoto>;
  discardStagedPhoto(photo: StagedWardrobePhoto): Promise<void>;
  deleteStoredPhoto(relativePath: string): Promise<void>;
  listManagedPhotos(): Promise<readonly ManagedWardrobePhotoFile[]>;
  discardStaleStagedPhotos(modifiedBeforeMs: number): Promise<void>;
  resolvePhotoUri(relativePath: string | null): string | null;
}

export class LocalWardrobePhotoManager implements WardrobePhotoManager {
  private readonly picker: WardrobePhotoPicker;
  private readonly processor: WardrobePhotoProcessor;
  private readonly storage: WardrobePhotoStorage;

  constructor(
    picker: WardrobePhotoPicker,
    processor: WardrobePhotoProcessor,
    storage: WardrobePhotoStorage,
  ) {
    this.picker = picker;
    this.processor = processor;
    this.storage = storage;
  }

  // Both sources run the same resize, compression and private staging.
  async preparePhoto(
    source: WardrobePhotoSource = 'library',
  ): Promise<StagedWardrobePhoto | null> {
    const picked = source === 'camera'
      ? await this.picker.capturePhoto()
      : await this.picker.pickPhoto();
    if (!picked) {
      return null;
    }

    const processed = await this.processor.processPhoto(picked);
    return this.storage.stagePhoto(processed);
  }

  commitStagedPhoto(photo: StagedWardrobePhoto): Promise<StoredWardrobePhoto> {
    return this.storage.commitStagedPhoto(photo);
  }

  discardStagedPhoto(photo: StagedWardrobePhoto): Promise<void> {
    return this.storage.discardStagedPhoto(photo);
  }

  deleteStoredPhoto(relativePath: string): Promise<void> {
    return this.storage.deleteStoredPhoto(relativePath);
  }

  listManagedPhotos(): Promise<readonly ManagedWardrobePhotoFile[]> {
    return this.storage.listManagedPhotos();
  }

  discardStaleStagedPhotos(modifiedBeforeMs: number): Promise<void> {
    return this.storage.discardStaleStagedPhotos(modifiedBeforeMs);
  }

  resolvePhotoUri(relativePath: string | null): string | null {
    return relativePath ? this.storage.resolvePhotoUri(relativePath) : null;
  }
}

export const unavailableWardrobePhotoManager: WardrobePhotoManager = Object.freeze({
  async preparePhoto() {
    throw new Error('Wardrobe photos are unavailable.');
  },
  async commitStagedPhoto() {
    throw new Error('Wardrobe photos are unavailable.');
  },
  async discardStagedPhoto() {},
  async deleteStoredPhoto() {},
  async listManagedPhotos() {
    return [];
  },
  async discardStaleStagedPhotos() {},
  resolvePhotoUri() {
    return null;
  },
});
