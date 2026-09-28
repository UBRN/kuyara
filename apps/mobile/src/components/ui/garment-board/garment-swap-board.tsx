import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, findNodeHandle, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  interpolateColor,
  makeMutable,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { useStableValue } from '@/hooks/use-stable-value';
import { easierToSee as easierToSeeValues, useEasierToSee } from '@/theme/easier-to-see';
import { layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { PRESENCE_TEXT_AFTER } from '../presence';
import {
  composePieces,
  entranceStartBoxes,
  PieceArtwork,
  useGarmentCandidateRoles,
  type ComposedPiece,
  type GarmentBoardPiece,
} from './garment-board';
import {
  garmentRolesBySlot,
  paletteWithGarment,
  type GarmentOutfitPalette,
  type GarmentRoles,
} from './garment-palette';
import { GarmentSwapStrip, type GarmentSwapStripLabels } from './garment-swap-strip';
import {
  SWAP_EDGE_GUARD,
  SWAP_HANDOFF_AFTER,
  SWAP_STEP_BACK,
  SWAP_TOUCH_SLOP,
  swapCommitDirection,
  swapDragOffset,
  swapDragZone,
  swapEntryBox,
  swapExitOffset,
  swapGrownBox,
  swapGrowScale,
  swapHeldStage,
  swapMarkerPosition,
  swapScaledBox,
  swapStride,
  swapStripLayout,
  swapWindow,
  type SwapBox,
} from './swap-gesture';

// Law 7's completion moment, as in `GarmentBoard`.
const SETTLE_TRAVEL = spacing.xs;

type Box = SwapBox;
type Role = 'current' | 'previous' | 'next' | 'leaving';
/** A piece's shared values: created once per piece and carried across every re-layout. */
type PieceValues = Readonly<{
  from: SharedValue<Box>;
  to: SharedValue<Box>;
  p: SharedValue<number>;
  dx: SharedValue<number>;
  op: SharedValue<number>;
  sc: SharedValue<number>;
  drain: SharedValue<number>;
  /** The big drawing's opacity over the resting one. */
  hand: SharedValue<number>;
  /** A shrink's scale span; the big drawing hands back once a quarter of it is travelled. */
  handFrom: SharedValue<number>;
  handTo: SharedValue<number>;
}>;
type Instance = Readonly<{
  key: string;
  slot: OutfitSlot;
  garmentTypeId: GarmentTypeId;
  role: Role;
  piece: ComposedPiece;
  /** The box the drawing is rendered at; the transform maps it onto the animated box. */
  base: Box;
  roles: GarmentRoles;
  /** The colours a re-coloured piece drains off over its new ones (ADR 0026 section 7). */
  drainRoles: GarmentRoles | null;
  values: PieceValues;
  /** The grow scale of the second, big drawing while the piece is (or was just) enlarged. */
  big: number | null;
  /** Paged in the enlarged slot: it slides opaque inside the window instead of fading. */
  paged: boolean;
  /** The scale the piece is moving to: 1 at rest, the grow scale enlarged, 0.9 stepped back. */
  scale: number;
  /** A paged piece keeps the window it slides in, so it can finish a slide after a settle. */
  window: Box | null;
  /** A neighbour's offset behind the window's edge, where it waits for a drag. */
  waits: number | null;
}>;
/** One enlargement: the slot's grow scale and the stage held under it. */
type Grow = Readonly<{ slot: OutfitSlot; scale: number; held: number; width: number; large: boolean }>;
type Pager = Readonly<{
  grown: Box;
  window: Box;
  strideNext: number;
  stridePrevious: number;
  zone: Box;
}>;
/** What a re-layout starts once it has committed: shared values are only written after render. */
type Intent =
  | Readonly<{ kind: 'entrance'; values: PieceValues; reportsSettled: boolean }>
  | Readonly<{ kind: 'retarget'; values: PieceValues; box: Box }>
  | Readonly<{ kind: 'promote'; values: PieceValues; box: Box; fromGesture: boolean; scale: number; paged: boolean }>
  | Readonly<{
      kind: 'enter'; values: PieceValues; previous: PieceValues | null; box: Box; direction: 1 | -1; stride: number;
      paged: boolean;
    }>
  | Readonly<{
      kind: 'leave'; key: string; values: PieceValues; direction: 1 | -1; stride: number; fromGesture: boolean;
      paged: boolean;
    }>
  | Readonly<{ kind: 'scale'; values: PieceValues; scale: number }>
  | Readonly<{ kind: 'wait'; values: PieceValues; box: Box; offset: number; scale: number; created: boolean }>
  | Readonly<{ kind: 'drain'; key: string; values: PieceValues }>
  | Readonly<{ kind: 'retire'; key: string; values: PieceValues; offset: number }>;
type Model = Readonly<{
  signature: string | null;
  instances: readonly Instance[];
  garments: Readonly<Partial<Record<OutfitSlot, GarmentTypeId>>>;
  entered: boolean;
  /** Pieces are still moving after a change or a focus change; captions and badges wait. */
  relayouting: boolean;
  intents: readonly Intent[];
  gestureCommit: Readonly<{ slot: OutfitSlot; garmentTypeId: GarmentTypeId }> | null;
}>;
type Panel = Readonly<{ slot: OutfitSlot; held: number }>;
type Panels = Readonly<{ focus: OutfitSlot | null; current: Panel | null; leaving: Panel | null }>;

export type GarmentSwapCandidate = Readonly<{
  garmentTypeId: GarmentTypeId;
  category: StructuralCategory;
  /** Whether kuyara's pick stays weather-suitable with this piece: the strip's first group. */
  suitable: boolean;
}>;

export type GarmentSwapBoardLabels = GarmentSwapStripLabels & Readonly<{
  slotName: (slot: OutfitSlot) => string;
  /** Spoken when VoiceOver's activate enlarges a piece: the strip has opened below it. */
  stripShown: string;
}>;

export type GarmentSwapBoardProps = Readonly<{
  pieces: readonly GarmentBoardPiece[];
  /** The outfit's palette inputs (O15), kept colours included (Phase 7). */
  palette: GarmentOutfitPalette;
  width: number;
  /** Each changeable slot's candidates in picker order. */
  candidates: Readonly<Partial<Record<OutfitSlot, readonly GarmentSwapCandidate[]>>>;
  focusedSlot: OutfitSlot | null;
  onFocusChange: (slot: OutfitSlot | null) => void;
  /**
   * One step to another candidate: the owner applies it and hands the board the new pieces.
   * `spoken` is true for a tile or a swipe, which the owner announces once the change is
   * known (with the unusual note in the same sentence); an adjustable step speaks its value.
   */
  onStep: (slot: OutfitSlot, garmentTypeId: GarmentTypeId, spoken: boolean) => void;
  /** The plate at rest: the composed stage, or the lowest caption under it. */
  restHeight: number;
  /** Caption rectangles at rest, which also enlarge their piece when tapped. */
  captionRects: Readonly<Partial<Record<OutfitSlot, Box>>>;
  /** The screen's captions and badges; they step back while a piece is enlarged or moving. */
  overlay: ReactNode;
  overlayTestID?: string;
  /** The line under the board at rest; the strip takes its place while a piece is enlarged. */
  hint?: ReactNode;
  hintVisible?: boolean;
  labels: GarmentSwapBoardLabels;
  /** The pieces leave from where Today's fitted stage drew them (ADR 0026 section 7). */
  entrance: Readonly<{ fromStageColor: string; fromStageRadius: number }>;
  /** Law 7's moment: change it and the pieces settle once. */
  settle?: number;
  /** Whether nothing is enlarged, moving or opening: what waits for a still board may show. */
  onRestChange?: (atRest: boolean) => void;
  /** An enlargement asks its owner to bring the strip into view, in board points. */
  onReveal?: (area: Readonly<{ pieceTop: number; panelBottom: number }>) => void;
  testID?: string;
}>;

const emptyModel: Model = {
  signature: null, instances: [], garments: {}, entered: false, relayouting: false, intents: [], gestureCommit: null,
};

const lerp = (a: number, b: number, t: number) => {
  'worklet';
  return a + (b - a) * t;
};
const lerpBox = (a: Box, b: Box, t: number): Box => {
  'worklet';
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
};
const sameBox = (a: Box, b: Box) => Math.abs(a.x - b.x) < 0.25 && Math.abs(a.y - b.y) < 0.25
  && Math.abs(a.w - b.w) < 0.25 && Math.abs(a.h - b.h) < 0.25;
const atLeast = (box: Box, minimum: number): Box => {
  const w = Math.max(box.w, minimum);
  const h = Math.max(box.h, minimum);
  return { x: box.x - (w - box.w) / 2, y: box.y - (h - box.h) / 2, w, h };
};
const inside = (box: Box, x: number, y: number) =>
  x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;

function composeInPoints(pieces: readonly GarmentBoardPiece[], width: number, large: boolean) {
  const result = composePieces(pieces, 'detail', large);
  const bySlot = new Map<OutfitSlot, Readonly<{ piece: ComposedPiece; box: Box }>>();
  for (const piece of result.order) {
    const box = result.boxes.get(piece)!;
    bySlot.set(piece.slot, { piece, box: { x: box.x * width, y: box.y * width, w: box.w * width, h: box.h * width } });
  }
  return { bySlot, order: result.order.map(({ slot }) => slot), height: result.stageHeight * width };
}
type Composed = ReturnType<typeof composeInPoints>;

type Candidates = Readonly<Partial<Record<OutfitSlot, readonly GarmentSwapCandidate[]>>>;

const withGarment = (pieces: readonly GarmentBoardPiece[], slot: OutfitSlot, candidate: GarmentSwapCandidate) =>
  pieces.map((piece) => (piece.slot === slot
    ? { ...piece, garmentTypeId: candidate.garmentTypeId, category: candidate.category } : piece));

/**
 * One enlargement's grow scale and held stage: every candidate of the slot composed with the
 * rest of the outfit (final-spec section 4).
 */
function growFor(
  pieces: readonly GarmentBoardPiece[],
  slot: OutfitSlot,
  order: readonly GarmentSwapCandidate[],
  width: number,
  large: boolean,
  current: Composed,
): Grow {
  const layouts = order.map((candidate) => {
    const composed = composeInPoints(withGarment(pieces, slot, candidate), width, large);
    return {
      box: composed.bySlot.get(slot)!.box,
      others: composed.order.filter((other) => other !== slot).map((other) => composed.bySlot.get(other)!.box),
      stageWidth: width,
      stageHeight: composed.height,
    };
  });
  const own = {
    box: current.bySlot.get(slot)!.box,
    others: current.order.filter((other) => other !== slot).map((other) => current.bySlot.get(other)!.box),
    stageWidth: width,
    stageHeight: current.height,
  };
  const all = [own, ...layouts];
  return {
    slot, width, large,
    scale: swapGrowScale(all),
    held: swapHeldStage(all.map(({ stageHeight }) => stageHeight)),
  };
}

/** Where the slot's two neighbours stand before a drag: each centred on the slot's piece. */
function neighbourBoxes(
  pieces: readonly GarmentBoardPiece[],
  composed: Composed,
  slot: OutfitSlot,
  garmentTypeId: GarmentTypeId | undefined,
  candidates: Candidates,
  width: number,
  large: boolean,
): Readonly<Record<1 | -1, Box | null>> {
  const current = composed.bySlot.get(slot)?.box;
  const boxOf = (direction: 1 | -1) => {
    const neighbour = current && garmentTypeId ? neighbourIn(candidates, slot, garmentTypeId, direction) : null;
    if (!current || !neighbour) return null;
    return swapEntryBox(current, composeInPoints(withGarment(pieces, slot, neighbour), width, large).bySlot.get(slot)!.box);
  };
  return { [1]: boxOf(1), [-1]: boxOf(-1) };
}

function pagerFor(
  composed: Composed,
  slot: OutfitSlot,
  grow: Grow,
  width: number,
  neighbours: Readonly<Record<1 | -1, Box | null>>,
): Pager | null {
  const own = composed.bySlot.get(slot);
  if (!own) return null;
  const grown = swapGrownBox(own.box, grow.scale, width, grow.held);
  const steppedBack = composed.order.filter((other) => other !== slot)
    .map((other) => swapScaledBox(composed.bySlot.get(other)!.box, SWAP_STEP_BACK));
  const window = swapWindow(grown, steppedBack, width, grow.held);
  // Each side's step keeps that side's neighbour, grown, wholly behind the window's edge.
  const incoming = (direction: 1 | -1) => {
    const box = neighbours[direction];
    return box ? swapGrownBox(box, grow.scale, width, grow.held) : grown;
  };
  return {
    grown,
    window,
    strideNext: swapStride(window, incoming(1), 1),
    stridePrevious: swapStride(window, incoming(-1), -1),
    zone: swapDragZone(grown, grow.held),
  };
}

function valuesFor(start: Readonly<{ from: Box; box: Box; p: number; dx: number; op: number; sc: number; hand: number }>):
PieceValues {
  return {
    from: makeMutable<Box>(start.from), to: makeMutable<Box>(start.box), p: makeMutable(start.p),
    dx: makeMutable(start.dx), op: makeMutable(start.op), sc: makeMutable(start.sc), drain: makeMutable(0),
    hand: makeMutable(start.hand), handFrom: makeMutable(1), handTo: makeMutable(Number.NaN),
  };
}

function neighbourIn(candidates: Candidates, slot: OutfitSlot, garmentTypeId: GarmentTypeId, direction: 1 | -1) {
  const order = candidates[slot] ?? [];
  const index = order.findIndex((candidate) => candidate.garmentTypeId === garmentTypeId);
  return index < 0 ? null : order[index + direction] ?? null;
}

type ReconcileInputs = Readonly<{
  signature: string;
  composed: Composed;
  pieces: readonly GarmentBoardPiece[];
  palette: GarmentOutfitPalette;
  roles: ReadonlyMap<OutfitSlot, GarmentRoles>;
  rolesFor: (palette: GarmentOutfitPalette) => ReadonlyMap<OutfitSlot, GarmentRoles>;
  width: number;
  large: boolean;
  focusedSlot: OutfitSlot | null;
  grow: Grow | null;
  pager: Pager | null;
  candidates: Candidates;
}>;

/**
 * The board's pieces after the owner's pieces, focus or layout change: which piece is
 * current, which enters, which leaves, which waits behind the paging window's edge. Pure
 * apart from allocating a new piece's shared values; every animation is an intent started
 * after commit.
 */
function reconcile(model: Model, inputs: ReconcileInputs): Model {
  const { composed, pieces, palette, roles, rolesFor, width, large, focusedSlot, grow, pager, candidates } = inputs;
  const byKey = new Map(model.instances.map((instance) => [instance.key, instance]));
  const intents: Intent[] = [];
  const firstLayout = !model.entered;
  const startBoxes = firstLayout ? entranceStartBoxes(pieces, width, 'today', true, large) : null;
  const gestureCommit = model.gestureCommit;
  const garments: Partial<Record<OutfitSlot, GarmentTypeId>> = { ...model.garments };
  let moved = false;
  const scaleOf = (slot: OutfitSlot) =>
    (focusedSlot === null || !grow ? 1 : slot === focusedSlot ? grow.scale : SWAP_STEP_BACK);

  const withRoles = (instance: Instance, next: GarmentRoles): Instance => {
    if (JSON.stringify(instance.roles) === JSON.stringify(next)) return instance;
    intents.push({ kind: 'drain', key: instance.key, values: instance.values });
    return { ...instance, roles: next, drainRoles: instance.roles };
  };

  composed.order.forEach((slot, index) => {
    const { piece, box } = composed.bySlot.get(slot)!;
    const garmentTypeId = piece.garmentTypeId;
    const key = `${slot}|${garmentTypeId}`;
    const previousId = model.garments[slot];
    const previous = previousId && previousId !== garmentTypeId ? byKey.get(`${slot}|${previousId}`) : undefined;
    const fromGesture = gestureCommit?.slot === slot && gestureCommit.garmentTypeId === garmentTypeId;
    const scale = scaleOf(slot);
    const big = scale > 1 ? scale : null;
    const paged = slot === focusedSlot && pager !== null;
    const existing = byKey.get(key);
    // Which side the new piece comes from: later in the order enters from the right.
    const order = candidates[slot] ?? [];
    const direction: 1 | -1 = previousId
      && order.findIndex((c) => c.garmentTypeId === garmentTypeId)
        < order.findIndex((c) => c.garmentTypeId === previousId) ? -1 : 1;
    const stride = paged
      ? direction === 1 ? pager.strideNext : pager.stridePrevious
      : Math.max(2 * layout.minimumTouchTarget, box.w + spacing.md);
    const pieceRoles = roles.get(slot)!;

    if (firstLayout) {
      const start = startBoxes?.get(slot);
      const from = start ? { x: start.x * width, y: start.y * width, w: start.w * width, h: start.h * width } : box;
      const values = valuesFor({ from, box, p: 0, dx: 0, op: 1, sc: 1, hand: 0 });
      byKey.set(key, {
        key, slot, garmentTypeId, role: 'current', piece, base: box, roles: pieceRoles, drainRoles: null, values,
        big: null, paged: false, scale: 1, window: null, waits: null,
      });
      intents.push({ kind: 'entrance', values, reportsSettled: index === 0 });
    } else if (existing) {
      let next: Instance = {
        ...existing, piece, paged: false, big: big ?? existing.big, scale, window: null, waits: null,
      };
      if (existing.role !== 'current') {
        moved = true;
        next = { ...next, role: 'current', base: box };
        intents.push({ kind: 'promote', values: existing.values, box, fromGesture, scale, paged: existing.paged });
      } else {
        if (!sameBox(existing.base, box)) {
          moved = true;
          next = { ...next, base: box };
          intents.push({ kind: 'retarget', values: existing.values, box });
        }
        if (existing.scale !== scale) {
          moved = true;
          intents.push({ kind: 'scale', values: existing.values, scale });
        }
      }
      byKey.set(key, withRoles(next, pieceRoles));
    } else {
      moved = true;
      // Paged, the piece slides in opaque and already large from behind the window's edge;
      // otherwise it crossfades in beside the piece it replaces (Phase 7).
      const values = valuesFor({
        from: box, box, p: previous ? 0 : 1, dx: 0, op: paged || !previous ? 1 : 0, sc: scale, hand: paged ? 1 : 0,
      });
      byKey.set(key, {
        key, slot, garmentTypeId, role: 'current', piece, base: box, roles: pieceRoles, drainRoles: null, values,
        big: paged ? big : null, paged: false, scale, window: null, waits: null,
      });
      intents.push({ kind: 'enter', values, previous: previous?.values ?? null, box, direction, stride, paged });
    }

    if (previous && previous.role === 'current') {
      byKey.set(previous.key, { ...previous, role: 'leaving', paged, window: paged ? pager.window : null });
      intents.push({ kind: 'leave', key: previous.key, values: previous.values, direction, stride, fromGesture, paged });
    }
    garments[slot] = garmentTypeId;
  });

  // The enlarged slot's two neighbours wait behind the window's edges, already large, so a
  // drag moves them from its first frame. A leaving piece that is now a neighbour stays.
  const wanted = new Set<string>();
  const current = focusedSlot ? garments[focusedSlot] : undefined;
  if (focusedSlot && current && grow && pager && composed.bySlot.has(focusedSlot)) {
    const currentBox = composed.bySlot.get(focusedSlot)!.box;
    for (const direction of [-1, 1] as const) {
      const neighbour = neighbourIn(candidates, focusedSlot, current, direction);
      if (!neighbour) continue;
      const preview = composeInPoints(withGarment(pieces, focusedSlot, neighbour), width, large).bySlot.get(focusedSlot)!;
      const box = swapEntryBox(currentBox, preview.box);
      const offset = direction === 1 ? pager.strideNext : -pager.stridePrevious;
      const previewRoles = rolesFor(paletteWithGarment(palette, focusedSlot, neighbour.garmentTypeId)).get(focusedSlot)!;
      const key = `${focusedSlot}|${neighbour.garmentTypeId}`;
      const role: Role = direction === 1 ? 'next' : 'previous';
      wanted.add(key);
      const existing = byKey.get(key);
      if (existing) {
        byKey.set(key, {
          ...existing, role, piece: preview.piece, roles: previewRoles, base: box, big: grow.scale, paged: true,
          scale: grow.scale, window: pager.window, waits: offset,
        });
        intents.push({ kind: 'wait', values: existing.values, box, offset, scale: grow.scale, created: false });
      } else {
        const values = valuesFor({ from: box, box, p: 1, dx: offset, op: 0, sc: grow.scale, hand: 1 });
        byKey.set(key, {
          key, slot: focusedSlot, garmentTypeId: neighbour.garmentTypeId, role, piece: preview.piece, base: box,
          roles: previewRoles, drainRoles: null, values, big: grow.scale, paged: true, scale: grow.scale,
          window: pager.window, waits: offset,
        });
        intents.push({ kind: 'wait', values, box, offset, scale: grow.scale, created: true });
      }
    }
  }
  // A paged piece still sliding when the enlargement ends or moves (Done or a tile right after
  // a step) finishes its slide inside the window it kept and leaves the tree on landing: a
  // neighbour no longer wanted slides on to where it waits, behind the window's edge.
  const instances = [...byKey.values()].map((instance) => {
    if ((instance.role !== 'previous' && instance.role !== 'next') || wanted.has(instance.key)) return instance;
    intents.push({ kind: 'retire', key: instance.key, values: instance.values, offset: instance.waits ?? 0 });
    return { ...instance, role: 'leaving' as const };
  });

  return {
    signature: inputs.signature,
    instances,
    garments,
    entered: true,
    relayouting: firstLayout ? false : moved || model.relayouting,
    intents,
    gestureCommit: null,
  };
}

function PieceView({ instance, ink, outline, settleTravel, stageWidth, stageLimit, clip, onBigDone, testID }: Readonly<{
  instance: Instance;
  ink: string;
  outline?: number;
  settleTravel: SharedValue<number>;
  stageWidth: number;
  stageLimit: SharedValue<number>;
  /** The paging window this piece is clipped to, in stage points, or null. */
  clip: Box | null;
  onBigDone: (key: string) => void;
  testID: string;
}>) {
  const theme = useKuyaraTheme();
  const { base, values, big, key } = instance;
  const { from, to, p, dx, op, sc, drain, hand, handFrom, handTo } = values;
  const fast = theme.motion.fast;
  const pieceStyle = useAnimatedStyle(() => {
    const box = lerpBox(from.get(), to.get(), p.get());
    const scale = sc.get();
    const w = box.w * scale;
    const h = box.h * scale;
    let centreX = box.x + box.w / 2;
    let centreY = box.y + box.h / 2;
    if (scale > 1) {
      // Grown about its centre, then shifted just enough to stay on the held stage.
      centreX = Math.min(Math.max(centreX - w / 2, 0), stageWidth - w) + w / 2;
      centreY = Math.min(Math.max(centreY - h / 2, 0), stageLimit.get() - h) + h / 2;
    }
    return {
      opacity: op.get(),
      transform: [
        { translateX: centreX + dx.get() - (base.x + base.w / 2) },
        { translateY: centreY - (base.y + base.h / 2) + SETTLE_TRAVEL * settleTravel.get() },
        { scaleX: w / base.w },
        { scaleY: h / base.h },
      ],
    };
  }, [base.h, base.w, base.x, base.y, stageWidth]);
  const drainStyle = useAnimatedStyle(() => ({ opacity: drain.get() }));
  // The resting drawing hides once the big one is fully over it, so no two outlines show.
  const restStyle = useAnimatedStyle(() => ({ opacity: big !== null && hand.get() >= 1 ? 0 : 1 }), [big]);
  const bigStyle = useAnimatedStyle(() => ({ opacity: hand.get() }));
  // A shrinking piece hands back to its resting drawing once its scale is a quarter of the way.
  useAnimatedReaction(() => sc.get(), (scale) => {
    const target = handTo.get();
    if (Number.isNaN(target)) return;
    const start = handFrom.get();
    if (start === target || (scale - start) / (target - start) >= SWAP_HANDOFF_AFTER) {
      handTo.set(Number.NaN);
      hand.set(withTiming(0, { duration: fast }, (finished) => {
        if (finished) runOnJS(onBigDone)(key);
      }));
    }
  }, [fast, key, onBigDone]);

  return (
    <View
      pointerEvents="none"
      style={clip ? [styles.clip, { height: clip.h, left: clip.x, top: clip.y, width: clip.w }] : styles.free}
      testID={testID}>
      <View style={clip ? [styles.free, { left: -clip.x, top: -clip.y }] : styles.free}>
        <Animated.View style={[styles.piece, { height: base.h, left: base.x, top: base.y, width: base.w }, pieceStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, restStyle]}>
            <PieceArtwork height={base.h} ink={ink} outline={outline} piece={instance.piece} roles={instance.roles}
              width={base.w} />
            {instance.drainRoles ? (
              // The ADR 0026 section 7 technique: the old colours drain off over the new.
              <Animated.View style={[StyleSheet.absoluteFill, drainStyle]}>
                <PieceArtwork height={base.h} ink={ink} outline={outline} piece={instance.piece}
                  roles={instance.drainRoles} width={base.w} />
              </Animated.View>
            ) : null}
          </Animated.View>
          {big !== null ? (
            // Drawn once at the grow size and mapped back by a static 1 / G, so the enlarged
            // piece shows a crisp 1.9-point outline instead of an upscaled one.
            <Animated.View
              style={[styles.piece, {
                height: base.h * big,
                left: (base.w - base.w * big) / 2,
                top: (base.h - base.h * big) / 2,
                transform: [{ scale: 1 / big }],
                width: base.w * big,
              }, bigStyle]}
              testID={`${testID}-big`}>
              <PieceArtwork height={base.h * big} ink={ink} outline={outline} piece={instance.piece}
                roles={instance.roles} width={base.w * big} />
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * Phase 7b's directly editable detail board (vault phase-7b final-spec): tap a piece and it
 * grows in place while the others step back; swipe it, or tap a tile in the strip under the
 * stage, to change it while it is large. Every committed set is laid out again by ADR 0025's
 * `compose()`; the enlarged slot pages opaque inside its window, other pieces glide to their
 * new boxes on `springs.spatial`. One block height carries the stage and the hint or the
 * strip, so everything under the board moves once. Feature code hands it pieces, candidates,
 * strings and callbacks and never authors a spring.
 */
export function GarmentSwapBoard({
  pieces: piecesProp,
  palette,
  width,
  candidates: candidatesProp,
  focusedSlot,
  onFocusChange,
  onStep,
  restHeight,
  captionRects: captionRectsProp,
  overlay,
  overlayTestID,
  hint = null,
  hintVisible = false,
  labels,
  entrance,
  settle,
  onRestChange,
  onReveal,
  testID,
}: GarmentSwapBoardProps) {
  const theme = useKuyaraTheme();
  const { colors } = theme;
  const large = useEasierToSee();
  const outline = large ? easierToSeeValues.boardOutline : undefined;
  const spatial = theme.springs.spatial;
  const { fast, normal } = theme.motion;
  const boardTestID = testID ?? 'garment-swap-board';

  const pieces = useStableValue(piecesProp);
  const candidates = useStableValue(candidatesProp);
  const captionRects = useStableValue(captionRectsProp);
  const composed = useMemo(() => (width > 0 ? composeInPoints(pieces, width, large) : null), [large, pieces, width]);
  const rolesFor = useMemo(() => (input: GarmentOutfitPalette) => garmentRolesBySlot({
    ...input,
    appearance: theme.colorScheme,
    stageColor: colors.background,
    accessoryStageColor: colors.background,
    inkColor: colors.textPrimary,
  }), [colors.background, colors.textPrimary, theme.colorScheme]);
  const roles = useMemo(() => rolesFor(palette), [palette, rolesFor]);

  // One enlargement's grow scale and held stage; the stage never shrinks while the
  // enlargement moves between slots.
  const [panels, setPanels] = useState<Panels>({ focus: null, current: null, leaving: null });
  const [grow, setGrow] = useState<Grow | null>(null);
  let activeGrow: Grow | null = null;
  if (focusedSlot && composed && composed.bySlot.has(focusedSlot)) {
    const fresh = grow && grow.slot === focusedSlot && grow.width === width && grow.large === large;
    if (fresh) activeGrow = grow;
    else {
      const computed = growFor(pieces, focusedSlot, candidates[focusedSlot] ?? [], width, large, composed);
      activeGrow = panels.focus !== null && grow ? { ...computed, held: Math.max(computed.held, grow.held) } : computed;
      setGrow(activeGrow);
    }
    activeGrow = { ...activeGrow, held: Math.max(activeGrow.held, composed.height) };
  }
  const pager = focusedSlot && composed && activeGrow
    ? pagerFor(composed, focusedSlot, activeGrow, width,
      neighbourBoxes(pieces, composed, focusedSlot,
        composed.bySlot.get(focusedSlot)?.piece.garmentTypeId, candidates, width, large))
    : null;

  // The strip follows the enlargement: it arrives with it, swaps when it moves, and stays
  // while it fades out after a settle.
  if (panels.focus !== focusedSlot) {
    setPanels({
      focus: focusedSlot,
      current: focusedSlot && activeGrow ? { slot: focusedSlot, held: activeGrow.held } : panels.current,
      leaving: focusedSlot && panels.focus ? panels.current : null,
    });
  }

  const [model, setModel] = useState<Model>(emptyModel);
  const [settled, setSettled] = useState(false);
  const [lastSettle, setLastSettle] = useState(settle);
  const [previewId, setPreviewId] = useState<GarmentTypeId | null>(null);
  // The strip's header before it has measured itself: Done's height.
  const headerMinimum = large ? easierToSeeValues.primaryActionHeight : layout.minimumTouchTarget;
  const [headerHeight, setHeaderHeight] = useState<number>(headerMinimum);
  const [hintHeight, setHintHeight] = useState(0);
  const [hintMounted, setHintMounted] = useState(hintVisible);
  if (hintVisible && !hintMounted) setHintMounted(true);
  // The strip takes touches and VoiceOver's focus only once it is fading in: while its space
  // opens its tiles are not drawn yet, so they are not there to press or read.
  const [liveSlot, setLiveSlot] = useState<OutfitSlot | null>(focusedSlot);
  if (focusedSlot === null && liveSlot !== null) setLiveSlot(null);

  const tint = useSharedValue(0);
  const settleTravel = useSharedValue(0);
  const stageLimit = useSharedValue(0);
  const dragBase = useSharedValue(0);
  const dragPast = useSharedValue(false);
  const dragShown = useSharedValue(0);
  const markerX = useSharedValue(0);
  const markerY = useSharedValue(0);
  const block = useSharedValue(0);
  const blockFrom = useSharedValue(0);
  const blockTo = useSharedValue(0);
  const panelOpacity = useSharedValue(0);
  const leavingPanelOpacity = useSharedValue(0);
  const hintOpacity = useSharedValue(hintVisible ? 1 : 0);
  const panelPending = useSharedValue(0);
  const hintPending = useSharedValue(0);

  // The pieces follow the owner's pieces, focus and layout; a change is derived here, while
  // rendering, and its motion starts once it has committed.
  const signature = composed
    ? JSON.stringify([pieces, palette, width, large, focusedSlot, activeGrow?.scale ?? null,
      focusedSlot ? candidates[focusedSlot] ?? null : null, theme.colorScheme])
    : null;
  if (composed && signature && signature !== model.signature) {
    setModel(reconcile(model, {
      signature, composed, pieces, palette, roles, rolesFor, width, large, focusedSlot, grow: activeGrow, pager,
      candidates,
    }));
  }
  // Law 7's moment: one settle per completing action, never on mount.
  if (settle !== lastSettle) setLastSettle(settle);

  // Every spring a re-layout starts is counted; the captions return once the last one lands.
  const pendingSprings = useRef(0);
  const springLanded = () => {
    pendingSprings.current = Math.max(0, pendingSprings.current - 1);
    if (pendingSprings.current === 0) {
      setModel((current) => (current.relayouting ? { ...current, relayouting: false } : current));
    }
  };
  const removeLeaving = (key: string) => {
    setModel((current) => (current.instances.some((instance) => instance.key === key && instance.role === 'leaving') ? {
      ...current,
      instances: current.instances.filter((instance) => !(instance.key === key && instance.role === 'leaving')),
    } : current));
  };
  const clearDrain = (key: string) => {
    setModel((current) => (current.instances.some((instance) => instance.key === key && instance.drainRoles) ? {
      ...current,
      instances: current.instances.map((instance) =>
        (instance.key === key && instance.drainRoles ? { ...instance, drainRoles: null } : instance)),
    } : current));
  };
  const dropBig = (key: string) => {
    setModel((current) => ({
      ...current,
      instances: current.instances.map((instance) => (instance.key === key && instance.big !== null
        && instance.scale <= 1 ? { ...instance, big: null } : instance)),
    }));
  };
  const onEntranceSettled = () => setSettled(true);

  // Each re-layout's intents start once, however often the effect itself runs.
  const appliedIntents = useRef<readonly Intent[] | null>(null);
  useLayoutEffect(() => {
    if (appliedIntents.current === model.intents) return;
    appliedIntents.current = model.intents;
    const landed = () => {
      'worklet';
      runOnJS(springLanded)();
    };
    const spring = (value: SharedValue<number>, target: number) => {
      pendingSprings.current += 1;
      value.set(withSpring(target, spatial, landed));
    };
    const visualOf = (values: PieceValues) => lerpBox(values.from.get(), values.to.get(), values.p.get());
    const retarget = (values: PieceValues, box: Box) => {
      values.from.set(visualOf(values));
      values.to.set(box);
      values.p.set(0);
      spring(values.p, 1);
    };
    const scaleTo = (values: PieceValues, scale: number) => {
      const now = values.sc.get();
      if (scale > 1) {
        // Growing: the big drawing fades in over the resting one from the tap frame.
        values.handTo.set(Number.NaN);
        values.hand.set(withTiming(1, { duration: fast }));
      } else if (values.hand.get() > 0) {
        values.handFrom.set(now);
        values.handTo.set(scale);
      }
      spring(values.sc, scale);
    };
    for (const intent of model.intents) {
      const { values } = intent;
      switch (intent.kind) {
        case 'entrance':
          // ADR 0026 section 7's entry travel keeps the role it shipped with; the swap does not touch it.
          values.p.set(withSpring(1, theme.springs.arrival, (finished) => {
            if (finished && intent.reportsSettled) runOnJS(onEntranceSettled)();
          }));
          break;
        case 'retarget':
          retarget(values, intent.box);
          break;
        case 'promote':
          retarget(values, intent.box);
          // A paged neighbour is already opaque and large; a piece coming back from leaving fades in.
          values.op.set(intent.paged ? 1 : withTiming(1, { duration: fast }));
          if (!intent.fromGesture) spring(values.dx, 0);
          if (values.sc.get() !== intent.scale) scaleTo(values, intent.scale);
          break;
        case 'enter': {
          if (intent.previous) {
            values.from.set(swapEntryBox(visualOf(intent.previous), intent.box));
            values.to.set(intent.box);
            values.dx.set(intent.previous.dx.get() + intent.direction * intent.stride);
            values.p.set(0);
          }
          spring(values.p, 1);
          spring(values.dx, 0);
          if (!intent.paged) values.op.set(withTiming(1, { duration: fast }));
          break;
        }
        case 'leave': {
          const { key } = intent;
          if (intent.paged) {
            // Opaque and clipped: it slides out of the window and is gone on landing.
            if (!intent.fromGesture) {
              pendingSprings.current += 1;
              values.dx.set(withSpring(swapExitOffset(intent.direction, values.dx.get(), intent.stride), spatial,
                (finished) => {
                  runOnJS(springLanded)();
                  if (finished) runOnJS(removeLeaving)(key);
                }));
            }
            break;
          }
          if (!intent.fromGesture) {
            spring(values.dx, swapExitOffset(intent.direction, values.dx.get(), intent.stride));
            spring(values.sc, 1);
          }
          values.op.set(withTiming(0, { duration: fast }, (finished) => {
            if (finished) runOnJS(removeLeaving)(key);
          }));
          break;
        }
        case 'scale':
          scaleTo(values, intent.scale);
          break;
        case 'wait':
          if (!intent.created) {
            if (!sameBox(values.to.get(), intent.box)) retarget(values, intent.box);
            values.sc.set(intent.scale);
            values.hand.set(1);
            values.handTo.set(Number.NaN);
            pendingSprings.current += 1;
            values.dx.set(withSpring(intent.offset, spatial, (finished) => {
              // Behind the window's edge it waits unseen, so a wider neighbour never peeks.
              if (finished) values.op.set(0);
              runOnJS(springLanded)();
            }));
          }
          break;
        case 'retire': {
          const { key } = intent;
          pendingSprings.current += 1;
          values.dx.set(withSpring(intent.offset, spatial, (finished) => {
            runOnJS(springLanded)();
            if (finished) runOnJS(removeLeaving)(key);
          }));
          break;
        }
        case 'drain': {
          const { key } = intent;
          values.drain.set(1);
          values.drain.set(withTiming(0, { duration: normal }, (finished) => {
            if (finished) runOnJS(clearDrain)(key);
          }));
          break;
        }
      }
    }
  });

  useEffect(() => {
    if (model.entered) tint.set(withTiming(1, { duration: normal }));
  }, [model.entered, normal, tint]);
  useEffect(() => {
    if (!lastSettle) return;
    settleTravel.set(withSequence(
      withTiming(1, { duration: fast }),
      withSpring(0, theme.springs.arrival),
    ));
  }, [fast, lastSettle, settleTravel, theme.springs.arrival]);
  useEffect(() => () => {
    cancelAnimation(tint);
    cancelAnimation(settleTravel);
  }, [settleTravel, tint]);
  const activeHeld = activeGrow?.held ?? null;
  useLayoutEffect(() => {
    if (activeHeld !== null) stageLimit.set(activeHeld);
  }, [activeHeld, stageLimit]);

  const { instances } = model;
  const focused = focusedSlot
    ? instances.find((instance) => instance.slot === focusedSlot && instance.role === 'current') : undefined;
  const nextInstance = focused ? instances.find((instance) => instance.role === 'next') : undefined;
  const previousInstance = focused ? instances.find((instance) => instance.role === 'previous') : undefined;

  // The strip: its candidates, tiles and the marker's tile.
  const stripCandidates = (slot: OutfitSlot) => candidates[slot] ?? [];
  const stripOf = (slot: OutfitSlot) => {
    const order = stripCandidates(slot);
    return swapStripLayout(order.length, order.filter(({ suitable }) => suitable).length, width);
  };
  const panelHeightOf = (slot: OutfitSlot) => headerHeight + spacing.sm + stripOf(slot).height;
  const currentStrip = focusedSlot ? stripOf(focusedSlot) : null;
  const tileOf = (garmentTypeId: GarmentTypeId | undefined) => {
    if (!focusedSlot || !currentStrip || !garmentTypeId) return null;
    const index = stripCandidates(focusedSlot).findIndex((candidate) => candidate.garmentTypeId === garmentTypeId);
    return index < 0 ? null : currentStrip.tiles[index];
  };
  const currentId = focusedSlot ? model.garments[focusedSlot] : undefined;
  const currentTile = tileOf(currentId);
  const panelSlot = panels.current?.slot ?? null;
  const panelRoles = useGarmentCandidateRoles(palette, panelSlot,
    (panelSlot ? stripCandidates(panelSlot) : []).map(({ garmentTypeId }) => garmentTypeId));
  const leavingSlot = panels.leaving?.slot ?? null;
  const leavingRoles = useGarmentCandidateRoles(palette, leavingSlot,
    (leavingSlot ? stripCandidates(leavingSlot) : []).map(({ garmentTypeId }) => garmentTypeId));

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

  // One height for the stage and what stands under it: the hint at rest, the strip while a
  // piece is enlarged. Text enters once its space is 90 per cent open and leaves before it closes.
  const heldStage = panels.current?.held ?? activeGrow?.held ?? restHeight;
  const blockTarget = focusedSlot && activeGrow
    ? activeGrow.held + spacing.md + panelHeightOf(focusedSlot)
    : restHeight + (hintVisible ? hintHeight : 0);
  const latest = useRef({ focus: focusedSlot, target: blockTarget, hint: hintVisible });
  const markPanelLive = () => setLiveSlot(latest.current.focus);
  const flushPending = () => {
    'worklet';
    if (panelPending.get() === 1) {
      panelPending.set(0);
      panelOpacity.set(withTiming(1, { duration: fast }));
      runOnJS(markPanelLive)();
    }
    if (hintPending.get() === 1) {
      hintPending.set(0);
      hintOpacity.set(withTiming(1, { duration: fast }));
    }
  };
  useAnimatedReaction(() => block.get(), (height) => {
    const start = blockFrom.get();
    const end = blockTo.get();
    if (Math.abs(end - start) < 0.5 || (height - start) / (end - start) >= PRESENCE_TEXT_AFTER) flushPending();
  });
  const blockToken = useRef(0);
  // After a settle the strip leaves the tree once the block has closed: until then the board
  // is not still, so nothing waiting for it opens over a closing block.
  const closingPanel = useRef(false);
  const clearPanel = () => {
    closingPanel.current = false;
    setPanels((current) => (current.focus === null ? { ...current, current: null, leaving: null } : current));
  };
  const blockLanded = (token: number) => {
    if (token !== blockToken.current) return;
    flushPending();
    if (closingPanel.current) clearPanel();
  };
  const startBlock = (target: number) => {
    const start = block.get();
    blockFrom.set(start);
    blockTo.set(target);
    blockToken.current += 1;
    const token = blockToken.current;
    if (Math.abs(target - start) < 0.5) {
      block.set(target);
      flushPending();
      return;
    }
    block.set(withSpring(target, spatial, (finished) => {
      if (finished) runOnJS(blockLanded)(token);
    }));
  };
  const afterPanelOut = () => {
    if (latest.current.focus !== null) return;
    if (latest.current.hint) hintPending.set(1);
    else setHintMounted(false);
    closingPanel.current = true;
    startBlock(latest.current.target);
    if (Math.abs(block.get() - latest.current.target) < 0.5) clearPanel();
  };
  const afterLeavingPanelOut = () => {
    setPanels((current) => (current.leaving ? { ...current, leaving: null } : current));
  };
  const afterShorterSwap = () => {
    afterLeavingPanelOut();
    if (latest.current.focus === null) return;
    startBlock(latest.current.target);
    panelOpacity.set(withTiming(1, { duration: normal }));
    markPanelLive();
  };
  const afterHintOut = () => {
    if (latest.current.hint) return;
    setHintMounted(false);
    if (latest.current.focus === null) startBlock(latest.current.target);
  };
  const reveal = (slot: OutfitSlot) => {
    if (!pager || !activeGrow) return;
    onReveal?.({ pieceTop: pager.grown.y, panelBottom: activeGrow.held + spacing.md + panelHeightOf(slot) });
  };

  const blockSeen = useRef<Readonly<{ focus: OutfitSlot | null; hint: boolean; target: number; panel: number }> | null>(null);
  const panelHeight = focusedSlot ? panelHeightOf(focusedSlot) : 0;
  useLayoutEffect(() => {
    const seen = blockSeen.current;
    latest.current = { focus: focusedSlot, target: blockTarget, hint: hintVisible };
    blockSeen.current = { focus: focusedSlot, hint: hintVisible, target: blockTarget, panel: panelHeight };
    if (!seen || !settled) {
      // Before the pieces have arrived nothing under the board animates.
      blockToken.current += 1;
      block.set(blockTarget);
      blockFrom.set(blockTarget);
      blockTo.set(blockTarget);
      hintOpacity.set(hintVisible && focusedSlot === null ? 1 : 0);
      panelOpacity.set(focusedSlot ? 1 : 0);
      return;
    }
    if (focusedSlot !== seen.focus) {
      if (seen.focus === null && focusedSlot) {
        // Enlarge: the block opens in the tap frame, the hint's words leave at once and the
        // strip fades in once 90 per cent of its space is open.
        panelOpacity.set(0);
        panelPending.set(1);
        hintPending.set(0);
        hintOpacity.set(withTiming(0, { duration: fast }));
        startBlock(blockTarget);
        reveal(focusedSlot);
      } else if (focusedSlot === null) {
        // Settle: the strip fades out first, then the block closes in one spring.
        panelPending.set(0);
        panelOpacity.set(withTiming(0, { duration: fast }, (finished) => {
          if (finished) runOnJS(afterPanelOut)();
        }));
      } else {
        // The enlargement moves: the old strip leaves on `fast`; the new one arrives at once
        // on `normal` when it is as tall, after the block opens when taller, and after the
        // old one has gone and the block has closed when shorter.
        leavingPanelOpacity.set(1);
        panelOpacity.set(0);
        if (Math.abs(panelHeight - seen.panel) < 0.5) {
          leavingPanelOpacity.set(withTiming(0, { duration: fast }, (finished) => {
            if (finished) runOnJS(afterLeavingPanelOut)();
          }));
          panelOpacity.set(withTiming(1, { duration: normal }));
          markPanelLive();
          startBlock(blockTarget);
        } else if (panelHeight > seen.panel) {
          leavingPanelOpacity.set(withTiming(0, { duration: fast }, (finished) => {
            if (finished) runOnJS(afterLeavingPanelOut)();
          }));
          panelPending.set(1);
          startBlock(blockTarget);
          reveal(focusedSlot);
        } else {
          panelPending.set(0);
          leavingPanelOpacity.set(withTiming(0, { duration: fast }, (finished) => {
            if (finished) runOnJS(afterShorterSwap)();
          }));
        }
      }
      return;
    }
    if (focusedSlot === null && hintVisible !== seen.hint) {
      if (!hintVisible) {
        // A change: the hint's words leave before its space closes.
        hintPending.set(0);
        hintOpacity.set(withTiming(0, { duration: fast }, (finished) => {
          if (finished) runOnJS(afterHintOut)();
        }));
      } else {
        // Back to kuyara's pick: the space opens, the words follow at 90 per cent.
        hintPending.set(1);
        startBlock(blockTarget);
      }
      return;
    }
    if (Math.abs(blockTarget - seen.target) >= 0.5 && !(focusedSlot === null && panels.current)) startBlock(blockTarget);
  });

  // What waits for a still board: nothing enlarged, no piece moving, the block closed.
  const atRest = focusedSlot === null && !model.relayouting && panels.current === null;
  useEffect(() => {
    onRestChange?.(atRest);
  }, [atRest, onRestChange]);

  const stepSlot = (slot: OutfitSlot, direction: 1 | -1) => {
    const garmentTypeId = model.garments[slot];
    const neighbour = garmentTypeId ? neighbourIn(candidates, slot, garmentTypeId, direction) : null;
    if (neighbour) onStep(slot, neighbour.garmentTypeId, false);
  };
  const chooseTile = (garmentTypeId: GarmentTypeId) => {
    if (!focusedSlot || model.garments[focusedSlot] === garmentTypeId) return;
    onStep(focusedSlot, garmentTypeId, true);
  };
  const commitFromGesture = (slot: OutfitSlot, garmentTypeId: GarmentTypeId) => {
    setModel((current) => ({ ...current, gestureCommit: { slot, garmentTypeId } }));
    setPreviewId(null);
    onStep(slot, garmentTypeId, true);
  };

  // Done, VoiceOver's escape or a tap on the enlarged piece or the empty stage hands
  // VoiceOver's focus back to the piece that opened the strip, whose element stays.
  const pieceTargets = useRef(new Map<OutfitSlot, View>());
  const [focusReturn, setFocusReturn] = useState<OutfitSlot | null>(null);
  const settleToPiece = () => {
    if (!focusedSlot) return;
    setFocusReturn(focusedSlot);
    onFocusChange(null);
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
    if (focusedSlot && pager && composed) {
      // The large piece or empty stage settles; a stepped-back piece takes the enlargement.
      if (inside(atLeast(pager.grown, layout.minimumTouchTarget), x, y)) {
        settleToPiece();
        return;
      }
      let hit: OutfitSlot | null = null;
      let nearest = Infinity;
      for (const slot of composed.order) {
        if (slot === focusedSlot) continue;
        const box = swapScaledBox(composed.bySlot.get(slot)!.box, SWAP_STEP_BACK);
        if (inside(atLeast(box, layout.minimumTouchTarget), x, y)) {
          const distance = Math.hypot(x - (box.x + box.w / 2), y - (box.y + box.h / 2));
          if (distance < nearest) { nearest = distance; hit = slot; }
        }
      }
      if (hit) onFocusChange(hit);
      else settleToPiece();
      return;
    }
    let hit: OutfitSlot | null = null;
    let nearest = Infinity;
    for (const slot of composed?.order ?? []) {
      const box = composed!.bySlot.get(slot)!.box;
      const caption = captionRects[slot];
      if (inside(atLeast(box, layout.minimumTouchTarget), x, y) || (caption && inside(caption, x, y))) {
        const distance = Math.hypot(x - (box.x + box.w / 2), y - (box.y + box.h / 2));
        if (distance < nearest) { nearest = distance; hit = slot; }
      }
    }
    onFocusChange(hit);
  };

  const curDx = focused?.values.dx;
  const curKey = focused?.key ?? null;
  const nextDx = nextInstance?.values.dx;
  const nextOp = nextInstance?.values.op;
  const prevDx = previousInstance?.values.dx;
  const prevOp = previousInstance?.values.op;
  const nextId = nextInstance?.garmentTypeId ?? null;
  const prevId = previousInstance?.garmentTypeId ?? null;
  const nextTile = tileOf(nextId ?? undefined);
  const prevTile = tileOf(prevId ?? undefined);
  const pan = Gesture.Pan()
    .withTestId(`${boardTestID}-pan`)
    .enabled(Boolean(curDx && focusedSlot && pager))
    .maxPointers(1)
    .activeOffsetX([-SWAP_TOUCH_SLOP, SWAP_TOUCH_SLOP])
    // 5 pt of vertical travel first hands the press to the page scroll (final-spec section 4).
    .failOffsetY([-5, 5])
    .onTouchesDown((event, manager) => {
      const touch = event.allTouches[0];
      // The drag starts only on the enlarged piece's zone, and never at the screen's left
      // edge, where the system back swipe lives.
      if (!touch || !pager || touch.absoluteX < SWAP_EDGE_GUARD || touch.x < pager.zone.x
        || touch.x > pager.zone.x + pager.zone.w || touch.y < pager.zone.y
        || touch.y > pager.zone.y + pager.zone.h) manager.fail();
    })
    .onStart(() => {
      if (!curDx) return;
      // A grab mid-settle continues from where the eye last saw the piece.
      dragBase.set(curDx.get());
      curDx.set(curDx.get());
      dragPast.set(false);
      // Both neighbours are opaque while a finger holds the piece; the window clips them.
      nextOp?.set(1);
      prevOp?.set(1);
    })
    .onUpdate((event) => {
      if (!curDx || !pager || !currentTile) return;
      const raw = dragBase.get() + event.translationX - Math.sign(event.translationX) * SWAP_TOUCH_SLOP;
      const direction = raw < 0 ? 1 : raw > 0 ? -1 : 0;
      const stride = direction === -1 ? pager.stridePrevious : pager.strideNext;
      const shown = swapDragOffset(raw, stride, prevDx !== undefined, nextDx !== undefined);
      dragShown.set(shown);
      curDx.set(shown);
      nextDx?.set(shown + pager.strideNext);
      prevDx?.set(shown - pager.stridePrevious);
      const has = direction === 1 ? nextDx !== undefined : direction === -1 ? prevDx !== undefined : false;
      const target = direction === 1 ? nextTile : direction === -1 ? prevTile : null;
      const marker = swapMarkerPosition(currentTile, has ? target : null, Math.abs(shown) / stride);
      markerX.set(marker.x);
      markerY.set(marker.y);
      const past = has && Math.abs(shown) >= stride / 2;
      if (past !== dragPast.get()) {
        dragPast.set(past);
        runOnJS(setPreviewId)(past ? (direction === 1 ? nextId : prevId) : null);
      }
    })
    .onEnd((event, success) => {
      if (!curDx || !focusedSlot || !pager || !currentTile) return;
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
        const key = curKey;
        curDx.set(withSpring(swapExitOffset(direction, shown, stride), { ...spatial, velocity }, (finished) => {
          if (finished && key) runOnJS(removeLeaving)(key);
        }));
        if (incomingTile) {
          markerX.set(withSpring(incomingTile.x, spatial));
          markerY.set(withSpring(incomingTile.y, spatial));
        }
        runOnJS(commitFromGesture)(focusedSlot, incomingId);
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
        markerX.set(withSpring(currentTile.x, spatial));
        markerY.set(withSpring(currentTile.y, spatial));
        if (dragPast.get()) runOnJS(setPreviewId)(null);
      }
      dragShown.set(0);
    });
  const tap = Gesture.Tap()
    .withTestId(`${boardTestID}-tap`)
    .maxDistance(SWAP_TOUCH_SLOP)
    .onEnd((event, success) => {
      if (success) runOnJS(handleTap)(event.x, event.y);
    });
  const gesture = Gesture.Exclusive(pan, tap);

  const blockStyle = useAnimatedStyle(() => ({ height: block.get() }));
  const tintStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(tint.get(), [0, 1], [entrance.fromStageColor, colors.background]),
  }), [colors.background, entrance.fromStageColor]);
  // Captions and badges leave on `fast` and return on `normal` once every piece rests.
  const overlayShown = settled && focusedSlot === null && !model.relayouting;
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: withTiming(overlayShown ? 1 : 0, { duration: overlayShown ? normal : fast }),
  }), [fast, normal, overlayShown]);
  const hintStyle = useAnimatedStyle(() => ({ opacity: hintOpacity.get() }));
  const panelStyle = useAnimatedStyle(() => ({ opacity: panelOpacity.get() }));
  const leavingPanelStyle = useAnimatedStyle(() => ({ opacity: leavingPanelOpacity.get() }));

  // Before the pieces have arrived the strip is drawn at once, so it is live at once.
  const stripLive = panels.current !== null && focusedSlot === panels.current.slot
    && (liveSlot === focusedSlot || !settled);
  const drawOrder: Role[] = ['current', 'leaving', 'previous', 'next'];
  const sortedInstances = [...instances].sort((a, b) =>
    Number(a.slot === focusedSlot) - Number(b.slot === focusedSlot)
    || drawOrder.indexOf(a.role) - drawOrder.indexOf(b.role));
  const stageHeight = focusedSlot && activeGrow ? activeGrow.held : restHeight;
  const stripLabels: GarmentSwapStripLabels = {
    pieceName: labels.pieceName,
    counter: labels.counter,
    pieceValue: labels.pieceValue,
    done: labels.done,
    otherHint: labels.otherHint,
  };

  return (
    <Animated.View style={[styles.block, { width }, blockStyle]} testID={`${boardTestID}-block`}>
      <GestureDetector gesture={gesture}>
        <View
          collapsable={false}
          style={[styles.stage, { height: stageHeight, width }]}
          testID={`${boardTestID}-plate`}>
          {composed ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.tint, { borderRadius: entrance.fromStageRadius, height: composed.height }, tintStyle]}
            />
          ) : null}
          {sortedInstances.map((instance) => (
            <PieceView
              // A leaving piece stays in the window it slid in; the rest of the slot, the current one's.
              clip={instance.role === 'leaving' && instance.window ? instance.window
                : pager && instance.slot === focusedSlot ? pager.window : null}
              ink={colors.textPrimary}
              instance={instance}
              key={instance.key}
              onBigDone={dropBig}
              outline={outline}
              settleTravel={settleTravel}
              stageLimit={stageLimit}
              stageWidth={width}
              testID={`${boardTestID}-drawing-${instance.slot}-${instance.garmentTypeId}`}
            />
          ))}
          {/* The captions and badges are drawn for the eye; each piece's adjustable element
              speaks its slot and name, and the rows under the board carry the Closet state. */}
          <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, overlayStyle]}
            testID={overlayTestID}>
            {overlay}
          </Animated.View>
          {/* One element per piece in the outfit's slot order, the order the rows below read in. */}
          {pieces.map(({ slot }) => {
            const garmentTypeId = model.garments[slot];
            if (!garmentTypeId || !composed?.bySlot.has(slot)) return null;
            const composedBox = composed.bySlot.get(slot)!.box;
            const shownBox = focusedSlot === slot && pager ? pager.grown
              : focusedSlot ? swapScaledBox(composedBox, SWAP_STEP_BACK) : composedBox;
            const box = atLeast(shownBox, layout.minimumTouchTarget);
            const order = candidates[slot] ?? [];
            const position = order.findIndex((c) => c.garmentTypeId === garmentTypeId) + 1;
            return (
              // VoiceOver's focus is the focus: every piece is adjustable without enlarging it.
              <View
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
                accessibilityLabel={labels.slotName(slot)}
                accessibilityRole="adjustable"
                // The enlarged piece reads as expanded: its strip is open under the board.
                accessibilityState={{ expanded: focusedSlot === slot }}
                accessibilityValue={{ text: labels.pieceValue(labels.pieceName(garmentTypeId), position, order.length) }}
                accessible
                key={`piece-${slot}`}
                onAccessibilityAction={({ nativeEvent }) => {
                  if (nativeEvent.actionName === 'increment') stepSlot(slot, 1);
                  else if (nativeEvent.actionName === 'decrement') stepSlot(slot, -1);
                  else if (nativeEvent.actionName === 'activate') {
                    // Focus stays on the piece; one short sentence says the strip is below.
                    if (slot !== focusedSlot) AccessibilityInfo.announceForAccessibility(labels.stripShown);
                    onFocusChange(slot === focusedSlot ? null : slot);
                  }
                }}
                onAccessibilityEscape={settleToPiece}
                pointerEvents="none"
                ref={(node) => {
                  if (node) pieceTargets.current.set(slot, node);
                  else pieceTargets.current.delete(slot);
                }}
                style={[styles.target, { height: box.h, left: box.x, top: box.y, width: box.w }]}
                testID={`${boardTestID}-piece-${slot}`}
              />
            );
          })}
        </View>
      </GestureDetector>
      {hintMounted && hint ? (
        <Animated.View
          accessibilityElementsHidden={!hintVisible || focusedSlot !== null}
          importantForAccessibility={!hintVisible || focusedSlot !== null ? 'no-hide-descendants' : 'auto'}
          onLayout={({ nativeEvent }) => {
            if (nativeEvent.layout.height !== hintHeight) setHintHeight(nativeEvent.layout.height);
          }}
          pointerEvents="none"
          style={[styles.hint, { top: restHeight, width }, hintStyle]}>
          {hint}
        </Animated.View>
      ) : null}
      {panels.leaving ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.panel, { top: panels.leaving.held + spacing.md }, leavingPanelStyle]}>
          <GarmentSwapStrip
            candidates={stripCandidates(panels.leaving.slot)}
            columnWidth={width}
            current={model.garments[panels.leaving.slot] ?? stripCandidates(panels.leaving.slot)[0]?.garmentTypeId}
            interactive={false}
            labels={stripLabels}
            marker={null}
            onChoose={chooseTile}
            onDone={settleToPiece}
            previewId={null}
            roles={leavingRoles}
            testID={`${boardTestID}-strip-leaving`}
          />
        </Animated.View>
      ) : null}
      {panels.current && model.garments[panels.current.slot] ? (
        <Animated.View
          pointerEvents={stripLive ? 'box-none' : 'none'}
          style={[styles.panel, { top: heldStage + spacing.md }, panelStyle]}>
          <GarmentSwapStrip
            candidates={stripCandidates(panels.current.slot)}
            columnWidth={width}
            current={model.garments[panels.current.slot]!}
            interactive={stripLive}
            labels={stripLabels}
            marker={focusedSlot === panels.current.slot ? { x: markerX, y: markerY } : null}
            onChoose={chooseTile}
            onDone={settleToPiece}
            onHeaderLayout={(height) => {
              if (Math.abs(height - headerHeight) >= 0.5) setHeaderHeight(Math.max(headerMinimum, height));
            }}
            previewId={focusedSlot === panels.current.slot ? previewId : null}
            roles={panelRoles}
            testID={`${boardTestID}-strip`}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'relative',
  },
  clip: {
    overflow: 'hidden',
    position: 'absolute',
  },
  free: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  hint: {
    left: 0,
    position: 'absolute',
  },
  panel: {
    left: 0,
    position: 'absolute',
  },
  piece: {
    position: 'absolute',
  },
  stage: {
    position: 'relative',
  },
  target: {
    position: 'absolute',
  },
  tint: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
