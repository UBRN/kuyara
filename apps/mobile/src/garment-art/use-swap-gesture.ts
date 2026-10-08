import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AccessibilityInfo, findNodeHandle, type View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { makeMutable, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { layout } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { fadeEasing } from '@/components/ui/fade';
import { haptics } from '@/components/ui/haptics';
import {
  SWAP_EDGE_GUARD,
  SWAP_STEP_BACK,
  SWAP_TOUCH_SLOP,
  swapCommitDirection,
  swapDragOffset,
  swapExitOffset,
  swapHitSlot,
  swapMarkerPosition,
  swapScaledBox,
  swapTouchBox,
  type SwapStripLayout,
} from './swap-gesture';
import { insideBox } from './swap-layout';
import { DRESS_LIFT } from './swap-motion';
import {
  neighbourIn,
  type Box,
  type Candidates,
  type Composed,
  type GarmentSwapCandidate,
  type Instance,
  type Model,
  type Pager,
} from './swap-reconcile';

/** The enlarged slot's current piece and the neighbours waiting on either side of it. */
export type PagedInstances = Readonly<{ focused?: Instance; next?: Instance; previous?: Instance }>;

/** The pieces the enlarged slot's pager drives, or none while no piece is enlarged. */
export function pagedInstances(instances: readonly Instance[], focusedSlot: OutfitSlot | null): PagedInstances {
  const focused = focusedSlot
    ? instances.find((instance) => instance.slot === focusedSlot && instance.role === 'current') : undefined;
  return {
    focused,
    next: focused ? instances.find((instance) => instance.role === 'next') : undefined,
    previous: focused ? instances.find((instance) => instance.role === 'previous') : undefined,
  };
}

/**
 * What the reader asks of the swap board: a tap enlarges, moves or settles a piece, a drag
 * pages the enlarged piece to a neighbouring candidate, a tile or an adjustable action steps
 * it, and a settle hands VoiceOver's focus back to the piece. The strip's marker follows the
 * drag and every committed change.
 */
export function useSwapGesture({
  boardTestID, focusedSlot, composed, pager, captionRects, candidates, model, setModel, setPreviewId,
  removeLeaving, paged, stripOf, stripCandidates, hintGrabbed, onFocusChange, onStep,
}: Readonly<{
  boardTestID: string;
  focusedSlot: OutfitSlot | null;
  composed: Composed | null;
  pager: Pager | null;
  captionRects: Readonly<Partial<Record<OutfitSlot, Box>>>;
  candidates: Candidates;
  model: Model;
  setModel: Dispatch<SetStateAction<Model>>;
  setPreviewId: Dispatch<SetStateAction<GarmentTypeId | null>>;
  removeLeaving: (key: string) => void;
  paged: PagedInstances;
  stripOf: (slot: OutfitSlot) => SwapStripLayout;
  stripCandidates: (slot: OutfitSlot) => readonly GarmentSwapCandidate[];
  /** Set as a drag starts, so the swipe hint does not play under the finger. */
  hintGrabbed: SharedValue<boolean>;
  onFocusChange: (slot: OutfitSlot | null) => void;
  onStep: (slot: OutfitSlot, garmentTypeId: GarmentTypeId, spoken: boolean) => void;
}>) {
  const theme = useKuyaraTheme();
  const fadeEase = useMemo(() => fadeEasing(theme.motion), [theme.motion]);
  const spatial = theme.springs.spatial;
  const { fast } = theme.motion;
  const { focused, next: nextInstance, previous: previousInstance } = paged;

  const dragBase = useSharedValue(0);
  const dragPast = useSharedValue(false);
  const dragShown = useSharedValue(0);
  // The slot a drag started on: when the enlargement moves mid-drag, the rest of that drag is
  // dropped rather than moving the newly enlarged piece from the old piece's offset.
  const dragSlot = useSharedValue<OutfitSlot | null>(null);
  // The piece a swipe has just stepped away from. Until the owner's new pieces render, the
  // gesture's handlers still name it, so a touch then must neither drag it nor step again.
  // Made once and held in state like each piece's values, so every render and both sets of
  // handlers read the same value.
  const [steppedFrom] = useState(() => makeMutable<string | null>(null));
  const markerX = useSharedValue(0);
  const markerY = useSharedValue(0);

  const currentStrip = focusedSlot ? stripOf(focusedSlot) : null;
  const tileOf = (garmentTypeId: GarmentTypeId | undefined) => {
    if (!focusedSlot || !currentStrip || !garmentTypeId) return null;
    const index = stripCandidates(focusedSlot).findIndex((candidate) => candidate.garmentTypeId === garmentTypeId);
    return index < 0 ? null : currentStrip.tiles[index];
  };
  const currentId = focusedSlot ? model.garments[focusedSlot] : undefined;
  const currentTile = tileOf(currentId);

  // The marker stands on the current tile when a strip arrives and springs to a new one after
  // any committed change.
  const markerSeen = useRef<Readonly<{ slot: OutfitSlot | null; id: GarmentTypeId | undefined }>>({
    slot: null, id: undefined,
  });
  useLayoutEffect(() => {
    const seen = markerSeen.current;
    markerSeen.current = { slot: focusedSlot, id: currentId };
    if (!currentTile) return;
    if (seen.slot !== focusedSlot) {
      markerX.set(currentTile.x);
      markerY.set(currentTile.y);
    } else if (seen.id !== currentId) {
      markerX.set(withSpring(currentTile.x, spatial));
      markerY.set(withSpring(currentTile.y, spatial));
    }
  }, [currentId, currentTile, focusedSlot, markerX, markerY, spatial]);

  // A swiped step the owner has not applied is spent once another step is asked for, so a
  // later tile or adjustable step to the same garment is never taken for the swipe.
  const forgetGestureCommit = () => setModel((current) => (current.gestureCommit
    ? { ...current, gestureCommit: null } : current));
  const stepSlot = (slot: OutfitSlot, direction: 1 | -1) => {
    const garmentTypeId = model.garments[slot];
    const neighbour = garmentTypeId ? neighbourIn(candidates, slot, garmentTypeId, direction) : null;
    if (!neighbour) return;
    forgetGestureCommit();
    onStep(slot, neighbour.garmentTypeId, false);
  };
  const chooseTile = (garmentTypeId: GarmentTypeId) => {
    if (!focusedSlot || model.garments[focusedSlot] === garmentTypeId) return;
    forgetGestureCommit();
    onStep(focusedSlot, garmentTypeId, true);
  };
  // An owner that has not applied a swiped step by the time the enlargement ends or moves
  // leaves nothing pending.
  useEffect(() => {
    steppedFrom.set(null);
  }, [focusedSlot, steppedFrom]);
  const commitFromGesture = (slot: OutfitSlot, garmentTypeId: GarmentTypeId) => {
    setModel((current) => ({ ...current, gestureCommit: { slot, garmentTypeId } }));
    setPreviewId(null);
    onStep(slot, garmentTypeId, true);
  };

  // Done, VoiceOver's escape or a tap on the enlarged piece or the empty stage hands
  // VoiceOver's focus back to the piece that opened the strip, whose element stays.
  const pieceTargets = useRef(new Map<OutfitSlot, View>());
  const [focusReturn, setFocusReturn] = useState<OutfitSlot | null>(null);
  // The focus a tap last asked for. The owner's answer arrives a render later, and a quick
  // second tap reaches handlers built before it, so a tap reads the request, not the prop.
  const requestedFocus = useSharedValue<OutfitSlot | null>(focusedSlot);
  useLayoutEffect(() => {
    requestedFocus.set(focusedSlot);
  }, [focusedSlot, requestedFocus]);
  const requestFocus = (slot: OutfitSlot | null) => {
    requestedFocus.set(slot);
    onFocusChange(slot);
  };
  const settleToPiece = () => {
    if (!focusedSlot) return;
    setFocusReturn(focusedSlot);
    requestFocus(null);
  };
  useEffect(() => {
    if (focusedSlot !== null || focusReturn === null) return undefined;
    const frame = requestAnimationFrame(() => {
      setFocusReturn(null);
      const node = findNodeHandle(pieceTargets.current.get(focusReturn) ?? null);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusReturn, focusedSlot]);
  const handleTap = (x: number, y: number) => {
    if (!composed) return;
    const minimum = layout.minimumTouchTarget;
    if (focusedSlot && pager) {
      // The large piece or empty stage settles; a stepped-back piece takes the enlargement.
      if (insideBox(swapTouchBox(pager.grown, minimum), x, y)) {
        settleToPiece();
        return;
      }
      const hit = swapHitSlot(composed.stack.filter((slot) => slot !== focusedSlot).map((slot) => ({
        slot, box: swapScaledBox(composed.bySlot.get(slot)!.box, SWAP_STEP_BACK),
      })), x, y, minimum);
      if (hit) requestFocus(hit);
      else settleToPiece();
      return;
    }
    const hit = swapHitSlot(composed.stack.map((slot) => ({
      slot, box: composed.bySlot.get(slot)!.box, button: captionRects[slot] ?? null,
    })), x, y, minimum);
    // A tap on the piece it just enlarged, before the enlargement has rendered, shrinks it.
    requestFocus(hit !== null && hit === requestedFocus.get() ? null : hit);
  };

  const curDx = focused?.values.dx;
  const curOp = focused?.values.op;
  const curDy = focused?.values.dy;
  // Handed to the UI runtime as a plain function, as the other callbacks the drag schedules.
  const selectionTick = haptics.selection;
  const curKey = focused?.key ?? null;
  const nextDx = nextInstance?.values.dx;
  const nextOp = nextInstance?.values.op;
  const prevDx = previousInstance?.values.dx;
  const prevOp = previousInstance?.values.op;
  const nextId = nextInstance?.garmentTypeId ?? null;
  const prevId = previousInstance?.garmentTypeId ?? null;
  const nextTile = tileOf(nextId ?? undefined);
  const prevTile = tileOf(prevId ?? undefined);
  // Whether these handlers still name the piece a swipe stepped away from; handlers built
  // after the step clear the mark.
  const stepPending = () => {
    'worklet';
    const from = steppedFrom.get();
    if (from === null) return false;
    if (from === curKey) return true;
    steppedFrom.set(null);
    return false;
  };
  const pan = Gesture.Pan()
    .withTestId(`${boardTestID}-pan`)
    .enabled(Boolean(curDx && focusedSlot && pager))
    .maxPointers(1)
    .activeOffsetX([-SWAP_TOUCH_SLOP, SWAP_TOUCH_SLOP])
    // 8 pt of vertical travel first hands the press to the page scroll.
    .failOffsetY([-8, 8])
    .onTouchesDown((event, manager) => {
      const touch = event.allTouches[0];
      // The drag starts only on the enlarged piece's zone, and never at the screen's left
      // edge, where the system back swipe lives.
      if (stepPending() || !touch || !pager || touch.absoluteX < SWAP_EDGE_GUARD || touch.x < pager.zone.x
        || touch.x > pager.zone.x + pager.zone.w || touch.y < pager.zone.y
        || touch.y > pager.zone.y + pager.zone.h) manager.fail();
    })
    .onStart(() => {
      // A grab during the hint's wait takes the piece, and the hint does not play.
      hintGrabbed.set(true);
      // A drag that bails here leaves no slot behind for a later handler to read.
      dragSlot.set(null);
      if (!curDx || !focusedSlot || !pager || stepPending()) return;
      // A grab mid-settle continues from where the eye last saw the piece.
      dragSlot.set(focusedSlot);
      dragBase.set(curDx.get());
      curDx.set(curDx.get());
      dragShown.set(curDx.get());
      dragPast.set(false);
      // Both neighbours are opaque while a finger holds the piece; the window clips them.
      nextOp?.set(1);
      prevOp?.set(1);
    })
    .onUpdate((event) => {
      if (!curDx || !pager || stepPending() || dragSlot.get() !== focusedSlot) return;
      // The handler counts the translation from where the drag activated, already past the
      // slop, so the piece follows the finger from that point on.
      const raw = dragBase.get() + event.translationX;
      const direction = raw < 0 ? 1 : raw > 0 ? -1 : 0;
      const stride = direction === -1 ? pager.stridePrevious : pager.strideNext;
      const shown = swapDragOffset(raw, stride, prevDx !== undefined, nextDx !== undefined);
      dragShown.set(shown);
      curDx.set(shown);
      nextDx?.set(shown + pager.strideNext);
      prevDx?.set(shown - pager.stridePrevious);
      const has = direction === 1 ? nextDx !== undefined : direction === -1 ? prevDx !== undefined : false;
      if (currentTile) {
        const target = direction === 1 ? nextTile : direction === -1 ? prevTile : null;
        const marker = swapMarkerPosition(currentTile, has ? target : null, Math.abs(shown) / stride);
        markerX.set(marker.x);
        markerY.set(marker.y);
      }
      const past = has && Math.abs(shown) >= stride / 2;
      if (past !== dragPast.get()) {
        dragPast.set(past);
        // Law 8: half a step toward a candidate is a threshold crossed under the finger.
        if (past) scheduleOnRN(selectionTick);
        scheduleOnRN(setPreviewId, past ? (direction === 1 ? nextId : prevId) : null);
      }
    })
    .onEnd((event, success) => {
      const slot = dragSlot.get();
      dragSlot.set(null);
      if (!curDx || !focusedSlot || !pager || stepPending() || slot !== focusedSlot) return;
      const shown = dragShown.get();
      const velocity = success ? event.velocityX : 0;
      const stride = shown > 0 ? pager.stridePrevious : pager.strideNext;
      const direction = success
        ? swapCommitDirection(shown, velocity, stride, prevDx !== undefined, nextDx !== undefined) : 0;
      const incomingId = direction === 1 ? nextId : direction === -1 ? prevId : null;
      const incomingDx = direction === 1 ? nextDx : prevDx;
      const incomingTile = direction === 1 ? nextTile : prevTile;
      if (incomingId && incomingDx && direction !== 0) {
        incomingDx.set(withSpring(0, { ...spatial, velocity }));
        // The piece swiped away fades and lifts off from the release, as a paged-out piece
        // does, instead of sliding out opaque until the owner has applied the step.
        curOp?.set(withTiming(0, { duration: fast, easing: fadeEase }));
        curDy?.set(withTiming(-DRESS_LIFT, { duration: fast }));
        const key = curKey;
        curDx.set(withSpring(swapExitOffset(direction, shown, stride), { ...spatial, velocity }, (finished) => {
          if (finished && key) scheduleOnRN(removeLeaving, key);
        }));
        if (incomingTile) {
          markerX.set(withSpring(incomingTile.x, spatial));
          markerY.set(withSpring(incomingTile.y, spatial));
        }
        steppedFrom.set(key);
        scheduleOnRN(commitFromGesture, focusedSlot, incomingId);
      } else {
        curDx.set(withSpring(0, { ...spatial, velocity }));
        if (nextDx && nextOp) {
          nextDx.set(withSpring(pager.strideNext, { ...spatial, velocity }, (finished) => {
            if (finished) nextOp.set(0);
          }));
        }
        if (prevDx && prevOp) {
          prevDx.set(withSpring(-pager.stridePrevious, { ...spatial, velocity }, (finished) => {
            if (finished) prevOp.set(0);
          }));
        }
        if (currentTile) {
          markerX.set(withSpring(currentTile.x, spatial));
          markerY.set(withSpring(currentTile.y, spatial));
        }
        if (dragPast.get()) scheduleOnRN(setPreviewId, null);
      }
      dragShown.set(0);
    });
  const tap = Gesture.Tap()
    .withTestId(`${boardTestID}-tap`)
    .maxDistance(SWAP_TOUCH_SLOP)
    .onEnd((event, success) => {
      if (success) scheduleOnRN(handleTap, event.x, event.y);
    });
  const gesture = Gesture.Exclusive(pan, tap);

  return { gesture, markerX, markerY, settleToPiece, stepSlot, chooseTile, pieceTargets };
}
