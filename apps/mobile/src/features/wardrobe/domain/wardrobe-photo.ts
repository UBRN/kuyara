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

export class WardrobePhotoValidationError extends Error {
  constructor() {
    super('The wardrobe photo is invalid.');
    this.name = 'WardrobePhotoValidationError';
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
