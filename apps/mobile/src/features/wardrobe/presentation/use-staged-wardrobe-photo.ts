import { useEffect, useRef, useState } from 'react';

import {
  unchangedWardrobePhoto,
  type WardrobePhotoChange,
} from '@/features/wardrobe/application/wardrobe-photo-manager';
import type { StagedWardrobePhoto } from '@/features/wardrobe/data/wardrobe-photo-adapters';

function discardQuietly(
  discard: (photo: StagedWardrobePhoto) => Promise<void>,
  photo: StagedWardrobePhoto,
) {
  void discard(photo).catch(() => {
    // A file left behind sits in the cache directory, which the system reclaims.
  });
}

/**
 * The photo a Closet form holds before it is saved. A picked file that is never saved is
 * always discarded: when another change replaces it, when it arrives after the form has
 * left, and when the form leaves. A file a save has committed is never discarded.
 */
export function useStagedWardrobePhoto(
  discardStagedPhoto: (photo: StagedWardrobePhoto) => Promise<void>,
  storedPreviewUri: string | null,
) {
  const [photoChange, setPhotoChange] = useState<WardrobePhotoChange>(unchangedWardrobePhoto);
  const staged = useRef<StagedWardrobePhoto | null>(null);
  const mounted = useRef(true);
  const discardRef = useRef(discardStagedPhoto);
  useEffect(() => {
    discardRef.current = discardStagedPhoto;
  }, [discardStagedPhoto]);
  const discard = (photo: StagedWardrobePhoto) => discardQuietly(discardRef.current, photo);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (staged.current) discardQuietly(discardRef.current, staged.current);
      staged.current = null;
    };
  }, []);

  /** Applies the change; false when the form has already left and the change was dropped. */
  const changePhoto = (next: WardrobePhotoChange): boolean => {
    const incoming = next.kind === 'replace' ? next.stagedPhoto : null;
    if (!mounted.current) {
      if (incoming) discard(incoming);
      return false;
    }
    const previous = staged.current;
    if (previous && previous !== incoming) discard(previous);
    staged.current = incoming;
    setPhotoChange(next);
    return true;
  };

  /** A save has taken the staged file, so leaving must not discard it. */
  const commitPhoto = () => {
    staged.current = null;
  };

  const previewUri =
    photoChange.kind === 'replace'
      ? photoChange.stagedPhoto.previewUri
      : photoChange.kind === 'remove'
        ? null
        : storedPreviewUri;

  return { photoChange, previewUri, changePhoto, commitPhoto };
}
