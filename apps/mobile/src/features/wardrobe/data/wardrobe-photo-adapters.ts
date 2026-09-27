import type { WardrobePhotoDimensions } from '@/features/wardrobe/domain/wardrobe-photo';

export type PickedWardrobePhoto = WardrobePhotoDimensions &
  Readonly<{
    uri: string;
  }>;

export type ProcessedWardrobePhoto = PickedWardrobePhoto;

export type StagedWardrobePhoto = Readonly<{
  id: string;
  previewUri: string;
}>;

export type StoredWardrobePhoto = Readonly<{
  relativePath: string;
  previewUri: string;
}>;

export interface WardrobePhotoPicker {
  /** The system photo picker; `null` when the user cancels. */
  pickPhoto(): Promise<PickedWardrobePhoto | null>;
  /**
   * The system camera, asking for camera access first; `null` when the user cancels.
   * Rejects with `WardrobeCameraAccessError` when access is off or there is no camera.
   */
  capturePhoto(): Promise<PickedWardrobePhoto | null>;
}

export interface WardrobePhotoProcessor {
  processPhoto(photo: PickedWardrobePhoto): Promise<ProcessedWardrobePhoto>;
}

export interface WardrobePhotoStorage {
  stagePhoto(photo: ProcessedWardrobePhoto): Promise<StagedWardrobePhoto>;
  commitStagedPhoto(photo: StagedWardrobePhoto): Promise<StoredWardrobePhoto>;
  discardStagedPhoto(photo: StagedWardrobePhoto): Promise<void>;
  deleteStoredPhoto(relativePath: string): Promise<void>;
  resolvePhotoUri(relativePath: string): string | null;
}
