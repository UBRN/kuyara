import { useState } from 'react';

import { closetSeedOffer, type ClosetSeedProgress } from '@/features/today/application/outfit-detail-state';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import { closetSeedInputs, type ClosetSeedPiece } from '@/features/wardrobe/application/closet-seed';
import type { WardrobeEntryState } from '@/features/wardrobe/domain/wardrobe-item';

/**
 * The empty Closet's one tap on outfit detail: it adds the outfit's pieces with the one
 * ownership asked. The controller reads the Closet again inside its one change, so a second
 * tap, or a tap from a stale screen, adds nothing; no analytics event.
 */
export function useClosetSeed(onAdded: (count: number) => void) {
  const wardrobe = useWardrobeApplication();
  const [progress, setProgress] = useState<ClosetSeedProgress | null>(null);
  const closetEmpty = wardrobe.state.status === 'ready' && wardrobe.state.items.length === 0;
  const seed = (pieces: readonly ClosetSeedPiece[], entryState: WardrobeEntryState) => {
    if (progress?.status === 'busy') return;
    setProgress({ status: 'busy' });
    void wardrobe.seedEmptyCloset(closetSeedInputs(pieces, entryState)).then((created) => {
      setProgress(created.length > 0 ? { status: 'added', count: created.length } : null);
      if (created.length > 0) onAdded(created.length);
    }, () => setProgress({ status: 'failed' }));
  };
  return closetSeedOffer(progress, closetEmpty, seed);
}
