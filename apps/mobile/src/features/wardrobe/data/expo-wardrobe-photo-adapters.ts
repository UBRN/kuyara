import * as Device from 'expo-device';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

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
} from '@/features/wardrobe/domain/wardrobe-photo-path';
import {
  normalizeWardrobePhotoRelativePath,
} from '@/features/wardrobe/domain/wardrobe-item';
import {
  calculateWardrobePhotoResize,
  WardrobeCameraAccessError,
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

    return pickedPhotoFrom(result);
  }

  async capturePhoto(): Promise<PickedWardrobePhoto | null> {
    // Asked on the tap, never earlier. iOS answers a restricted camera as denied.
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new WardrobeCameraAccessError('denied');
    }

    // UIImagePickerController raises an uncatchable exception for a camera the device
    // lacks (the iOS Simulator), and expo-image-picker does not check first. Every
    // supported iPhone has a camera. Android resolves the camera app itself and rejects.
    if (Platform.OS === 'ios' && !Device.isDevice) {
      throw new WardrobeCameraAccessError('unavailable');
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        base64: false,
        exif: false,
        quality: 1,
      });
      return pickedPhotoFrom(result);
    } catch (error) {
      // expo-image-picker's Android `MissingActivityToHandleIntent`: no camera app to open.
      if ((error as { code?: unknown } | null)?.code === 'ERR_MISSING_ACTIVITY_TO_HANDLE_INTENT') {
        throw new WardrobeCameraAccessError('unavailable');
      }
      throw error;
    }
  }
}

function pickedPhotoFrom(
  result: ImagePicker.ImagePickerResult,
): PickedWardrobePhoto | null {
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

export class ExpoWardrobePhotoProcessor implements WardrobePhotoProcessor {
  async processPhoto(photo: PickedWardrobePhoto): Promise<ProcessedWardrobePhoto> {
    let processedUri: string | null = null;
    try {
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
      processedUri = result.uri;
      return { uri: result.uri, width: result.width, height: result.height };
    } finally {
      // The picker's full-size original is spent either way; only the processed copy
      // goes on to staging. Only a file in the app's own cache is ever deleted.
      if (processedUri !== photo.uri) {
        deleteCachedFile(photo.uri);
      }
    }
  }
}

function isInPrivateCache(file: File): boolean {
  return file.uri.startsWith(Paths.cache.uri);
}

function deleteCachedFile(uri: string): void {
  try {
    const file = new File(uri);
    if (isInPrivateCache(file) && file.exists) {
      file.delete();
    }
  } catch {
    // A cache file that cannot be removed is left for the system to purge; the Closet does not depend on it.
  }
}

export class ExpoPrivateWardrobePhotoStorage implements WardrobePhotoStorage {
  private readonly createId: () => string;

  constructor(createId: () => string) {
    this.createId = createId;
  }

  async stagePhoto(photo: ProcessedWardrobePhoto): Promise<StagedWardrobePhoto> {
    const source = new File(photo.uri);
    if (!source.exists || !isInPrivateCache(source)) {
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
    try {
      await staged.copy(stored);
    } catch (error) {
      try {
        if (stored.exists) {
          stored.delete();
        }
      } catch {
        // The copy error rethrown below is the one that matters; a failed cleanup must not replace it.
      }
      throw error;
    }

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
