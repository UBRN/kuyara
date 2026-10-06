import { useEffect, useLayoutEffect, useRef } from 'react';
import { useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { useKuyaraTheme } from '@/theme/theme-context';

import { SWAP_HINT_PEEK } from './swap-gesture';
import type { Pager } from './swap-reconcile';
import type { PagedInstances } from './use-swap-gesture';

/**
 * Plays the swipe hint once and returns whether a finger has grabbed the piece since the
 * enlargement began, which the drag sets so the hint does not play under it.
 */
export function useSwipeHint({
  focusedSlot, swipeHint, settled, pager, paged, onSwipeHintShown,
}: Readonly<{
  focusedSlot: OutfitSlot | null;
  /** The owner still asks for the hint. */
  swipeHint: boolean;
  /** Whether the pieces have arrived: an enlargement before then plays no hint. */
  settled: boolean;
  pager: Pager | null;
  paged: PagedInstances;
  onSwipeHintShown?: () => void;
}>) {
  const spatial = useKuyaraTheme().springs.spatial;

  // The swipe hint: one `springs.spatial` duration after the first enlargement, once its growth
  // has landed, the piece and its neighbour move one `SWAP_HINT_PEEK` the way a swipe to that
  // neighbour would, on the spatial spring, and come back on it. The neighbour is opaque only
  // while it is out, in the same window clip a drag uses, so it never covers a stepped-back
  // piece. The owner hears that it played as the motion starts: a settle, a moved
  // enlargement, a grab or leaving the screen during the wait cancels it unplayed and
  // unrecorded. It moves nothing a screen reader is on, and a finger that grabs the piece
  // mid-hint takes over its values.
  const swipeHinted = useRef(false);
  const hintFocus = useRef(focusedSlot);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintStart = useRef<() => void>(() => undefined);
  const hintGrabbed = useSharedValue(false);
  useEffect(() => () => {
    if (hintTimer.current !== null) clearTimeout(hintTimer.current);
  }, []);
  useLayoutEffect(() => {
    hintStart.current = () => {
      hintTimer.current = null;
      const neighbour = paged.next ?? paged.previous;
      const piece = paged.focused?.values.dx;
      if (!pager || !neighbour || !piece || hintGrabbed.get()) return;
      swipeHinted.current = true;
      const direction = paged.next ? 1 : -1;
      const rest = direction === 1 ? pager.strideNext : -pager.stridePrevious;
      const peek = -direction * SWAP_HINT_PEEK;
      const { dx, op } = neighbour.values;
      op.set(1);
      dx.set(withSequence(
        withSpring(rest + peek, spatial),
        withSpring(rest, spatial, (finished) => {
          if (finished) op.set(0);
        }),
      ));
      piece.set(withSequence(withSpring(peek, spatial), withSpring(0, spatial)));
      onSwipeHintShown?.();
    };
    const was = hintFocus.current;
    hintFocus.current = focusedSlot;
    if (was === focusedSlot) return;
    if (hintTimer.current !== null) {
      clearTimeout(hintTimer.current);
      hintTimer.current = null;
    }
    if (was !== null || focusedSlot === null || !swipeHint || swipeHinted.current || !settled) return;
    hintGrabbed.set(false);
    hintTimer.current = setTimeout(() => hintStart.current(), spatial.duration);
  });

  return hintGrabbed;
}
