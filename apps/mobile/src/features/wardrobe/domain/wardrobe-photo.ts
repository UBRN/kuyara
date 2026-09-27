export const wardrobePhotoPolicy = Object.freeze({
  maximumLongEdge: 1600,
  jpegQuality: 0.8,
  format: 'jpeg' as const,
});

export type WardrobePhotoDimensions = Readonly<{
  width: number;
  height: number;
}>;

export type WardrobePhotoResize = Readonly<{
  width: number | null;
  height: number | null;
  outputWidth: number;
  outputHeight: number;
}>;

/** Where a new Closet photo comes from: the system photo picker or the system camera. */
export type WardrobePhotoSource = 'library' | 'camera';

export class WardrobePhotoValidationError extends Error {
  constructor() {
    super('The wardrobe photo is invalid.');
    this.name = 'WardrobePhotoValidationError';
  }
}

/**
 * The camera could not be used: `denied` when camera access is off (iOS reports a
 * restricted camera the same way), `unavailable` when the device has no camera to open.
 * Neither is a failure of the photo; the library route keeps working.
 */
export class WardrobeCameraAccessError extends Error {
  readonly reason: 'denied' | 'unavailable';

  constructor(reason: 'denied' | 'unavailable') {
    super('The camera cannot be used.');
    this.name = 'WardrobeCameraAccessError';
    this.reason = reason;
  }
}

export function calculateWardrobePhotoResize({
  height,
  width,
}: WardrobePhotoDimensions): WardrobePhotoResize | null {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new WardrobePhotoValidationError();
  }

  const maximumLongEdge = wardrobePhotoPolicy.maximumLongEdge;
  if (Math.max(width, height) <= maximumLongEdge) {
    return null;
  }

  if (width >= height) {
    return {
      width: maximumLongEdge,
      height: null,
      outputWidth: maximumLongEdge,
      outputHeight: Math.max(1, Math.round((height / width) * maximumLongEdge)),
    };
  }

  return {
    width: null,
    height: maximumLongEdge,
    outputWidth: Math.max(1, Math.round((width / height) * maximumLongEdge)),
    outputHeight: maximumLongEdge,
  };
}
