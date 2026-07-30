import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type {
  PickedWardrobePhoto,
  ProcessedWardrobePhoto,
  StagedWardrobePhoto,
  StoredWardrobePhoto,
  WardrobePhotoPicker,
  WardrobePhotoProcessor,
  WardrobePhotoStorage,
} from '@/features/wardrobe/data/wardrobe-photo-adapters';
import {
  createManagedWardrobePhotoRelativePath,
  isManagedWardrobePhotoRelativePath,
  managedWardrobePhotoDirectorySegments,
  requireWardrobePhotoUuidV4,
} from '@/features/wardrobe/data/wardrobe-photo-path';
import {
  normalizeWardrobePhotoRelativePath,
} from '@/features/wardrobe/domain/wardrobe-item';
import {
  calculateWardrobePhotoResize,
  wardrobePhotoPolicy,
  WardrobePhotoValidationError,
} from '@/features/wardrobe/domain/wardrobe-photo';

const stagingDirectorySegments = ['kuyara', 'wardrobe', 'staging'] as const;

export class ExpoSystemWardrobePhotoPicker implements WardrobePhotoPicker {
  async pickPhoto(): Promise<PickedWardrobePhoto | null> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      selectionLimit: 1,
      base64: false,
      exif: false,
      quality: 1,
    });

    if (result.canceled) {
      return null;
    }

    if (result.assets.length !== 1) {
      throw new WardrobePhotoValidationError();
    }

    const [asset] = result.assets;
    if (!asset || (asset.type !== null && asset.type !== undefined && asset.type !== 'image')) {
      throw new WardrobePhotoValidationError();
    }

    calculateWardrobePhotoResize(asset);
    return { uri: asset.uri, width: asset.width, height: asset.height };
  }
}

export class ExpoWardrobePhotoProcessor implements WardrobePhotoProcessor {
  async processPhoto(photo: PickedWardrobePhoto): Promise<ProcessedWardrobePhoto> {
    const resize = calculateWardrobePhotoResize(photo);
    const context = ImageManipulator.manipulate(photo.uri);
    if (resize) {
      context.resize({ width: resize.width, height: resize.height });
    }

    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      base64: false,
      compress: wardrobePhotoPolicy.jpegQuality,
      format: SaveFormat.JPEG,
    });

    return { uri: result.uri, width: result.width, height: result.height };
  }
}

export class ExpoPrivateWardrobePhotoStorage implements WardrobePhotoStorage {
  private readonly createId: () => string;

  constructor(createId: () => string) {
    this.createId = createId;
  }

  async stagePhoto(photo: ProcessedWardrobePhoto): Promise<StagedWardrobePhoto> {
    const source = new File(photo.uri);
    if (!source.exists || !source.uri.startsWith(Paths.cache.uri)) {
      throw new WardrobePhotoValidationError();
    }

    const directory = new Directory(Paths.cache, ...stagingDirectorySegments);
    directory.create({ idempotent: true, intermediates: true });
    const id = requireWardrobePhotoUuidV4(this.createId());
    const staged = new File(directory, `${id}.jpg`);

    try {
      await source.move(staged);
    } catch (error) {
      if (source.exists) {
        source.delete();
      }
      throw error;
    }

    return { id, previewUri: staged.uri };
  }

  async commitStagedPhoto(
    photo: StagedWardrobePhoto,
  ): Promise<StoredWardrobePhoto> {
    const stagingId = requireWardrobePhotoUuidV4(photo.id);
    const staged = new File(Paths.cache, ...stagingDirectorySegments, `${stagingId}.jpg`);
    if (!staged.exists) {
      throw new WardrobePhotoValidationError();
    }

    const directory = new Directory(
      Paths.document,
      ...managedWardrobePhotoDirectorySegments,
    );
    directory.create({ idempotent: true, intermediates: true });
    const relativePath = createManagedWardrobePhotoRelativePath(this.createId());
    const stored = new File(Paths.document, ...relativePath.split('/'));
    await staged.copy(stored);

    return { relativePath, previewUri: stored.uri };
  }

  async discardStagedPhoto(photo: StagedWardrobePhoto): Promise<void> {
    const id = requireWardrobePhotoUuidV4(photo.id);
    const staged = new File(Paths.cache, ...stagingDirectorySegments, `${id}.jpg`);
    if (staged.exists) {
      staged.delete();
    }
  }

  async deleteStoredPhoto(relativePath: string): Promise<void> {
    if (!isManagedWardrobePhotoRelativePath(relativePath)) {
      return;
    }

    const stored = new File(Paths.document, ...relativePath.split('/'));
    if (stored.exists) {
      stored.delete();
    }
  }

  resolvePhotoUri(relativePath: string): string | null {
    try {
      const normalized = normalizeWardrobePhotoRelativePath(relativePath);
      if (!normalized) {
        return null;
      }

      const stored = new File(Paths.document, ...normalized.split('/'));
      return stored.exists ? stored.uri : null;
    } catch {
      return null;
    }
  }
}
