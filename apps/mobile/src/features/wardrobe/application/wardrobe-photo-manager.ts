import type {
  StagedWardrobePhoto,
  StoredWardrobePhoto,
  WardrobePhotoPicker,
  WardrobePhotoProcessor,
  WardrobePhotoStorage,
} from '@/features/wardrobe/data/wardrobe-photo-adapters';

export type WardrobePhotoChange =
  | Readonly<{ kind: 'unchanged' }>
  | Readonly<{ kind: 'remove' }>
  | Readonly<{ kind: 'replace'; stagedPhoto: StagedWardrobePhoto }>;

export const unchangedWardrobePhoto: WardrobePhotoChange = Object.freeze({
  kind: 'unchanged',
});

export interface WardrobePhotoManager {
  preparePhoto(): Promise<StagedWardrobePhoto | null>;
  commitStagedPhoto(photo: StagedWardrobePhoto): Promise<StoredWardrobePhoto>;
  discardStagedPhoto(photo: StagedWardrobePhoto): Promise<void>;
  deleteStoredPhoto(relativePath: string): Promise<void>;
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

  async preparePhoto(): Promise<StagedWardrobePhoto | null> {
    const picked = await this.picker.pickPhoto();
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
  resolvePhotoUri() {
    return null;
  },
});
