import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  interpolateColor,
  makeMutable,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { easierToSee as easierToSeeValues, useEasierToSee } from '@/theme/easier-to-see';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import {
  composePieces,
  entranceStartBoxes,
  PieceArtwork,
  type ComposedPiece,
  type GarmentBoardPiece,
} from './garment-board';
import {
  garmentRolesBySlot,
  paletteWithGarment,
  type GarmentOutfitPalette,
  type GarmentRoles,
} from './garment-palette';
import {
  SWAP_COMMIT_DISTANCE,
  SWAP_EDGE_GUARD,
  SWAP_FOCUS_SCALE,
  SWAP_TOUCH_SLOP,
  swapCommitDirection,
  swapDragOffset,
  swapDragOpacities,
  swapEntryBox,
  swapExitOffset,
  swapPlateHeight,
  swapStride,
} from './swap-gesture';

// Law 7's completion moment, as in `GarmentBoard`.
const SETTLE_TRAVEL = spacing.xs;
// The focus label takes the core caption cap: the other captions have stepped back.
const FOCUS_LABEL_CAP = 0.42;
const ARROW_GLYPH_SIZE = 20;

type Box = Readonly<{ x: number; y: number; w: number; h: number }>;
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
}>;
/** What a re-layout starts once it has committed: shared values are only written after render. */
type Intent =
  | Readonly<{ kind: 'entrance'; values: PieceValues; reportsSettled: boolean }>
  | Readonly<{ kind: 'retarget'; values: PieceValues; box: Box }>
  | Readonly<{ kind: 'promote'; values: PieceValues; box: Box; fromGesture: boolean; scale: number }>
  | Readonly<{ kind: 'enter'; values: PieceValues; previous: PieceValues | null; box: Box; direction: 1 | -1; stride: number }>
  | Readonly<{ kind: 'leave'; key: string; values: PieceValues; direction: 1 | -1; fromGesture: boolean }>
  | Readonly<{ kind: 'scale'; values: PieceValues; scale: number }>
  | Readonly<{ kind: 'wait'; values: PieceValues; box: Box; direction: 1 | -1; stride: number; created: boolean }>
  | Readonly<{ kind: 'drain'; key: string; values: PieceValues }>;
type Model = Readonly<{
  signature: string | null;
  instances: readonly Instance[];
  garments: Readonly<Partial<Record<OutfitSlot, GarmentTypeId>>>;
  entered: boolean;
  relayouting: boolean;
  intents: readonly Intent[];
  gestureCommit: Readonly<{ slot: OutfitSlot; garmentTypeId: GarmentTypeId }> | null;
  /** The plate at focus start; the plate never shrinks below it while a piece is focused. */
  heldPlate: number | null;
  /** The last focused slot, so the ring and label fade out where they were. */
  lastFocus: OutfitSlot | null;
}>;

export type GarmentSwapCandidate = Readonly<{ garmentTypeId: GarmentTypeId; category: StructuralCategory }>;

export type GarmentSwapBoardLabels = Readonly<{
  pieceName: (garmentTypeId: GarmentTypeId) => string;
  slotName: (slot: OutfitSlot) => string;
  counter: (position: number, total: number) => string;
  pieceValue: (piece: string, position: number, total: number) => string;
  previous: string;
  next: string;
}>;

export type GarmentSwapBoardProps = Readonly<{
  pieces: readonly GarmentBoardPiece[];
  /** The outfit's palette inputs (O15), kept colours included (Phase 7 proposal P1). */
  palette: GarmentOutfitPalette;
  width: number;
  /** Each changeable slot's candidates in picker order. */
  candidates: Readonly<Partial<Record<OutfitSlot, readonly GarmentSwapCandidate[]>>>;
  focusedSlot: OutfitSlot | null;
  onFocusChange: (slot: OutfitSlot | null) => void;
  /** One step to a neighbour: the owner applies it and hands the board the new pieces. */
  onStep: (slot: OutfitSlot, garmentTypeId: GarmentTypeId) => void;
  /** The plate at rest: the composed stage, or the lowest caption under it. */
  restHeight: number;
  /** Caption rectangles at rest, which also focus their piece when tapped. */
  captionRects: Readonly<Partial<Record<OutfitSlot, Box>>>;
  /** The screen's captions and badges; they step back while a piece is focused or moving. */
  overlay: ReactNode;
  overlayTestID?: string;
  labels: GarmentSwapBoardLabels;
  /** The pieces leave from where Today's fitted stage drew them (ADR 0026 section 7). */
  entrance: Readonly<{ fromStageColor: string; fromStageRadius: number }>;
  /** Law 7's moment: change it and the pieces settle once. */
  settle?: number;
  testID?: string;
}>;

const emptyModel: Model = {
  signature: null, instances: [], garments: {}, entered: false, relayouting: false, intents: [],
  gestureCommit: null, heldPlate: null, lastFocus: null,
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

/** The focus ring around a piece at the focus scale, never under a touch target. */
function ringFor(box: Box): Box {
  const w = box.w * SWAP_FOCUS_SCALE;
  const h = box.h * SWAP_FOCUS_SCALE;
  return atLeast({
    x: box.x - (w - box.w) / 2 - spacing.sm,
    y: box.y - (h - box.h) / 2 - spacing.sm,
    w: w + 2 * spacing.sm,
    h: h + 2 * spacing.sm,
  }, layout.minimumTouchTarget);
}

/** The two arrow targets beside the ring, kept inside the content column. */
function arrowsFor(ring: Box, width: number) {
  const size = layout.minimumTouchTarget;
  const y = ring.y + ring.h / 2 - size / 2;
  return {
    previous: { x: Math.max(0, ring.x - size), y, w: size, h: size },
    next: { x: Math.min(width - size, ring.x + ring.w), y, w: size, h: size },
  };
}

function valuesFor(start: Readonly<{ from: Box; box: Box; p: number; dx: number; op: number; sc: number }>): PieceValues {
  return {
    from: makeMutable<Box>(start.from), to: makeMutable<Box>(start.box), p: makeMutable(start.p),
    dx: makeMutable(start.dx), op: makeMutable(start.op), sc: makeMutable(start.sc), drain: makeMutable(0),
  };
}

type Candidates = Readonly<Partial<Record<OutfitSlot, readonly GarmentSwapCandidate[]>>>;

type ReconcileInputs = Readonly<{
  signature: string;
  composed: ReturnType<typeof composeInPoints>;
  pieces: readonly GarmentBoardPiece[];
  palette: GarmentOutfitPalette;
  roles: ReadonlyMap<OutfitSlot, GarmentRoles>;
  rolesFor: (palette: GarmentOutfitPalette) => ReadonlyMap<OutfitSlot, GarmentRoles>;
  width: number;
  large: boolean;
  focusedSlot: OutfitSlot | null;
  candidates: Candidates;
  restHeight: number;
}>;

function neighbourIn(candidates: Candidates, slot: OutfitSlot, garmentTypeId: GarmentTypeId, direction: 1 | -1) {
  const order = candidates[slot] ?? [];
  const index = order.findIndex((candidate) => candidate.garmentTypeId === garmentTypeId);
  return index < 0 ? null : order[index + direction] ?? null;
}

/**
 * The board's pieces after the owner's pieces, focus or layout change: which piece is
 * current, which enters, which leaves, which waits beside the focused one. Pure apart from
 * allocating a new piece's shared values; every animation is an intent started after commit.
 */
function reconcile(model: Model, inputs: ReconcileInputs): Model {
  const { composed, pieces, palette, roles, rolesFor, width, large, focusedSlot, candidates } = inputs;
  const byKey = new Map(model.instances.map((instance) => [instance.key, instance]));
  const intents: Intent[] = [];
  const firstLayout = !model.entered;
  const startBoxes = firstLayout ? entranceStartBoxes(pieces, width, 'today', true, large) : null;
  const gestureCommit = model.gestureCommit;
  const garments: Partial<Record<OutfitSlot, GarmentTypeId>> = { ...model.garments };
  let moved = false;

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
    const scale = slot === focusedSlot ? SWAP_FOCUS_SCALE : 1;
    const existing = byKey.get(key);
    // Which side the new piece comes from: later in the order enters from the right.
    const order = candidates[slot] ?? [];
    const direction: 1 | -1 = previousId
      && order.findIndex((c) => c.garmentTypeId === garmentTypeId)
        < order.findIndex((c) => c.garmentTypeId === previousId) ? -1 : 1;
    const pieceRoles = roles.get(slot)!;

    if (firstLayout) {
      const start = startBoxes?.get(slot);
      const from = start ? { x: start.x * width, y: start.y * width, w: start.w * width, h: start.h * width } : box;
      const values = valuesFor({ from, box, p: 0, dx: 0, op: 1, sc: 1 });
      byKey.set(key, { key, slot, garmentTypeId, role: 'current', piece, base: box, roles: pieceRoles, drainRoles: null, values });
      intents.push({ kind: 'entrance', values, reportsSettled: index === 0 });
    } else if (existing) {
      let next: Instance = { ...existing, piece };
      if (existing.role !== 'current') {
        moved = true;
        next = { ...next, role: 'current', base: box };
        intents.push({ kind: 'promote', values: existing.values, box, fromGesture, scale });
      } else {
        if (!sameBox(existing.base, box)) {
          moved = true;
          next = { ...next, base: box };
          intents.push({ kind: 'retarget', values: existing.values, box });
        }
        intents.push({ kind: 'scale', values: existing.values, scale });
      }
      byKey.set(key, withRoles(next, pieceRoles));
    } else {
      moved = true;
      // Invisible until its intent places it beside the piece it replaces.
      const values = valuesFor({ from: box, box, p: previous ? 0 : 1, dx: 0, op: previous ? 0 : 1, sc: scale });
      byKey.set(key, { key, slot, garmentTypeId, role: 'current', piece, base: box, roles: pieceRoles, drainRoles: null, values });
      intents.push({
        kind: 'enter', values, previous: previous?.values ?? null, box, direction, stride: swapStride(box.w),
      });
    }

    if (previous && previous.role === 'current') {
      byKey.set(previous.key, { ...previous, role: 'leaving' });
      intents.push({ kind: 'leave', key: previous.key, values: previous.values, direction, fromGesture });
    }
    garments[slot] = garmentTypeId;
  });

  // The focused slot's two neighbours wait beside it, invisible, so a drag moves them from
  // its first frame. A leaving piece that is now a neighbour simply stays.
  const wanted = new Set<string>();
  const current = focusedSlot ? garments[focusedSlot] : undefined;
  if (focusedSlot && current && composed.bySlot.has(focusedSlot)) {
    const currentBox = composed.bySlot.get(focusedSlot)!.box;
    const stride = swapStride(currentBox.w);
    for (const direction of [-1, 1] as const) {
      const neighbour = neighbourIn(candidates, focusedSlot, current, direction);
      if (!neighbour) continue;
      const previewPieces = pieces.map((piece) => (piece.slot === focusedSlot
        ? { ...piece, garmentTypeId: neighbour.garmentTypeId, category: neighbour.category } : piece));
      const preview = composeInPoints(previewPieces, width, large).bySlot.get(focusedSlot)!;
      const box = swapEntryBox(currentBox, preview.box);
      const previewRoles = rolesFor(paletteWithGarment(palette, focusedSlot, neighbour.garmentTypeId)).get(focusedSlot)!;
      const key = `${focusedSlot}|${neighbour.garmentTypeId}`;
      const role: Role = direction === 1 ? 'next' : 'previous';
      wanted.add(key);
      const existing = byKey.get(key);
      if (existing) {
        byKey.set(key, { ...existing, role, piece: preview.piece, roles: previewRoles, base: box });
        intents.push({ kind: 'wait', values: existing.values, box, direction, stride, created: false });
      } else {
        const values = valuesFor({ from: box, box, p: 1, dx: direction * stride, op: 0, sc: SWAP_FOCUS_SCALE });
        byKey.set(key, {
          key, slot: focusedSlot, garmentTypeId: neighbour.garmentTypeId, role, piece: preview.piece, base: box,
          roles: previewRoles, drainRoles: null, values,
        });
        intents.push({ kind: 'wait', values, box, direction, stride, created: true });
      }
    }
  }
  const instances = [...byKey.values()].filter((instance) =>
    (instance.role !== 'previous' && instance.role !== 'next') || wanted.has(instance.key));

  return {
    signature: inputs.signature,
    instances,
    garments,
    entered: true,
    relayouting: firstLayout ? false : moved || model.relayouting,
    intents,
    gestureCommit: null,
    heldPlate: focusedSlot ? model.heldPlate ?? inputs.restHeight : null,
    lastFocus: focusedSlot ?? model.lastFocus,
  };
}

function PieceView({ instance, ink, outline, settleTravel }: Readonly<{
  instance: Instance;
  ink: string;
  outline?: number;
  settleTravel: SharedValue<number>;
}>) {
  const { base, values } = instance;
  const { from, to, p, dx, op, sc, drain } = values;
  const pieceStyle = useAnimatedStyle(() => {
    const box = lerpBox(from.get(), to.get(), p.get());
    const scale = sc.get();
    const w = box.w * scale;
    const h = box.h * scale;
    return {
      opacity: op.get(),
      transform: [
        { translateX: box.x + box.w / 2 + dx.get() - (base.x + base.w / 2) },
        { translateY: box.y + box.h / 2 - (base.y + base.h / 2) + SETTLE_TRAVEL * settleTravel.get() },
        { scaleX: w / base.w },
        { scaleY: h / base.h },
      ],
    };
  }, [base.h, base.w, base.x, base.y]);
  const drainStyle = useAnimatedStyle(() => ({ opacity: drain.get() }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.piece, { height: base.h, left: base.x, top: base.y, width: base.w }, pieceStyle]}>
      <PieceArtwork height={base.h} ink={ink} outline={outline} piece={instance.piece} roles={instance.roles} width={base.w} />
      {instance.drainRoles ? (
        // The ADR 0026 section 7 technique: the old colours drain off over the new.
        <Animated.View style={[StyleSheet.absoluteFill, drainStyle]}>
          <PieceArtwork height={base.h} ink={ink} outline={outline} piece={instance.piece} roles={instance.drainRoles}
            width={base.w} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/**
 * Phase 7's directly editable detail board (vault motion-spec): tap a piece to focus it,
 * then drag it sideways, use its arrows, or its adjustable actions to step through the
 * slot's candidates. Every committed set is laid out again by ADR 0025's `compose()`; pieces
 * glide to their new boxes on `springs.spatial`, the incoming piece enters from the side it
 * came from and the outgoing one leaves the other way. Feature code hands it pieces,
 * candidates, strings and callbacks and never authors a spring.
 */
export function GarmentSwapBoard({
  pieces,
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
  labels,
  entrance,
  settle,
  testID,
}: GarmentSwapBoardProps) {
  const theme = useKuyaraTheme();
  const { colors } = theme;
  const large = useEasierToSee();
  const outline = large ? easierToSeeValues.boardOutline : undefined;
  const spatial = theme.springs.spatial;
  const fast = theme.motion.fast;

  // The owner rebuilds its props on every render; the board follows their values.
  const piecesKey = JSON.stringify(pieces);
  const candidatesKey = JSON.stringify(candidatesProp);
  const captionKey = JSON.stringify(captionRectsProp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const candidates = useMemo(() => candidatesProp, [candidatesKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const captionRects = useMemo(() => captionRectsProp, [captionKey]);
  const composed = useMemo(
    () => (width > 0 ? composeInPoints(pieces, width, large) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [large, piecesKey, width],
  );
  const rolesFor = useCallback((input: GarmentOutfitPalette) => garmentRolesBySlot({
    ...input,
    appearance: theme.colorScheme,
    stageColor: colors.background,
    accessoryStageColor: colors.background,
    inkColor: colors.textPrimary,
  }), [colors.background, colors.textPrimary, theme.colorScheme]);
  const roles = useMemo(() => rolesFor(palette), [palette, rolesFor]);

  const [model, setModel] = useState<Model>(emptyModel);
  const [settled, setSettled] = useState(false);
  const [labelHeight, setLabelHeight] = useState(0);
  const [lastSettle, setLastSettle] = useState(settle);
  const tint = useSharedValue(0);
  const settleTravel = useSharedValue(0);
  const arrowsDrag = useSharedValue(1);
  const dragBase = useSharedValue(0);
  const dragShown = useSharedValue(0);
  const dragPast = useSharedValue(false);
  const ringOpacity = useSharedValue(0);
  // Which name the focus label shows: -1 the previous candidate, 0 the piece, 1 the next.
  // During a drag past the commit distance it already names the piece a release lands on.
  const labelChoice = useSharedValue(0);

  // The pieces follow the owner's pieces, focus and layout; a change is derived here, while
  // rendering, and its motion starts once it has committed.
  const signature = composed
    ? JSON.stringify([piecesKey, palette, width, large, focusedSlot,
      focusedSlot ? candidates[focusedSlot] ?? null : null, theme.colorScheme])
    : null;
  if (composed && signature && signature !== model.signature) {
    setModel(reconcile(model, {
      signature, composed, pieces, palette, roles, rolesFor, width, large, focusedSlot, candidates, restHeight,
    }));
  }
  // Law 7's moment: one settle per completing action, never on mount.
  if (settle !== lastSettle) setLastSettle(settle);

  const removeLeaving = useCallback((key: string) => {
    setModel((current) => (current.instances.some((instance) => instance.key === key && instance.role === 'leaving') ? {
      ...current,
      instances: current.instances.filter((instance) => !(instance.key === key && instance.role === 'leaving')),
    } : current));
  }, []);
  const clearDrain = useCallback((key: string) => {
    setModel((current) => (current.instances.some((instance) => instance.key === key && instance.drainRoles) ? {
      ...current,
      instances: current.instances.map((instance) =>
        (instance.key === key && instance.drainRoles ? { ...instance, drainRoles: null } : instance)),
    } : current));
  }, []);
  const onRelayoutSettled = useCallback(() => {
    setModel((current) => (current.relayouting ? { ...current, relayouting: false } : current));
  }, []);
  const onEntranceSettled = useCallback(() => setSettled(true), []);

  // Each re-layout's intents start once, however often the effect itself runs.
  const appliedIntents = useRef<readonly Intent[] | null>(null);
  useLayoutEffect(() => {
    if (appliedIntents.current === model.intents) return;
    appliedIntents.current = model.intents;
    const visualOf = (values: PieceValues) => lerpBox(values.from.get(), values.to.get(), values.p.get());
    const retarget = (values: PieceValues, box: Box) => {
      values.from.set(visualOf(values));
      values.to.set(box);
      values.p.set(0);
      values.p.set(withSpring(1, spatial, (finished) => {
        if (finished) runOnJS(onRelayoutSettled)();
      }));
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
          if (!intent.fromGesture) {
            values.dx.set(withSpring(0, spatial));
            values.op.set(withTiming(1, { duration: fast }));
          }
          values.sc.set(withSpring(intent.scale, spatial));
          break;
        case 'enter': {
          if (intent.previous) {
            values.from.set(swapEntryBox(visualOf(intent.previous), intent.box));
            values.to.set(intent.box);
            values.dx.set(intent.previous.dx.get() + intent.direction * intent.stride);
            values.op.set(0);
            values.p.set(0);
          }
          values.p.set(withSpring(1, spatial, (finished) => {
            if (finished) runOnJS(onRelayoutSettled)();
          }));
          values.dx.set(withSpring(0, spatial));
          values.op.set(withTiming(1, { duration: fast }));
          break;
        }
        case 'leave': {
          if (!intent.fromGesture) {
            values.dx.set(withSpring(swapExitOffset(intent.direction, values.dx.get(), swapStride(values.to.get().w)),
              spatial));
            values.sc.set(withSpring(1, spatial));
          }
          const { key } = intent;
          values.op.set(withTiming(0, { duration: fast }, (finished) => {
            if (finished) runOnJS(removeLeaving)(key);
          }));
          break;
        }
        case 'scale':
          if (values.sc.get() !== intent.scale) values.sc.set(withSpring(intent.scale, spatial));
          break;
        case 'wait':
          if (!intent.created) {
            if (!sameBox(values.to.get(), intent.box)) retarget(values, intent.box);
            values.sc.set(SWAP_FOCUS_SCALE);
            values.dx.set(withSpring(intent.direction * intent.stride, spatial));
            values.op.set(withTiming(0, { duration: fast }));
          }
          break;
        case 'drain': {
          const { key } = intent;
          values.drain.set(1);
          values.drain.set(withTiming(0, { duration: theme.motion.normal }, (finished) => {
            if (finished) runOnJS(clearDrain)(key);
          }));
          break;
        }
      }
    }
    // A committed drag left the label naming the incoming piece; it is the piece now.
    labelChoice.set(0);
  }, [clearDrain, fast, labelChoice, model.intents, onEntranceSettled, onRelayoutSettled, removeLeaving, spatial,
    theme.motion.normal, theme.springs.arrival]);

  useEffect(() => {
    if (model.entered) tint.set(withTiming(1, { duration: theme.motion.normal }));
  }, [model.entered, theme.motion.normal, tint]);
  useEffect(() => {
    if (!lastSettle) return;
    settleTravel.set(withSequence(
      withTiming(1, { duration: theme.motion.fast }),
      withSpring(0, theme.springs.arrival),
    ));
  }, [lastSettle, settleTravel, theme.motion.fast, theme.springs.arrival]);
  useEffect(() => {
    ringOpacity.set(withTiming(focusedSlot ? 1 : 0, { duration: fast }));
  }, [fast, focusedSlot, ringOpacity]);
  useEffect(() => () => {
    cancelAnimation(tint);
    cancelAnimation(settleTravel);
  }, [settleTravel, tint]);

  const { instances } = model;
  const focused = focusedSlot
    ? instances.find((instance) => instance.slot === focusedSlot && instance.role === 'current') : undefined;
  const nextInstance = focused ? instances.find((instance) => instance.role === 'next') : undefined;
  const previousInstance = focused ? instances.find((instance) => instance.role === 'previous') : undefined;
  const ringSlot = focusedSlot ?? model.lastFocus;
  const ringBox = ringSlot ? composed?.bySlot.get(ringSlot)?.box : undefined;
  const ringKey = ringBox ? `${ringBox.x}|${ringBox.y}|${ringBox.w}|${ringBox.h}` : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shownRing = useMemo(() => (ringBox ? ringFor(ringBox) : null), [ringKey]);
  const ring = focused ? shownRing : null;
  const arrows = useMemo(() => (shownRing ? arrowsFor(shownRing, width) : null), [shownRing, width]);
  const stride = focused ? swapStride(focused.base.w) : 0;
  const strip = useMemo(() => (ring && arrows ? {
    x: arrows.previous.x,
    y: Math.min(ring.y, arrows.previous.y),
    w: arrows.next.x + arrows.next.w - arrows.previous.x,
    h: Math.max(ring.y + ring.h, arrows.previous.y + arrows.previous.h) - Math.min(ring.y, arrows.previous.y),
  } : null), [arrows, ring]);

  // The plate is held while a piece is focused, so the content under the board stays put.
  const plateHeight = swapPlateHeight(restHeight, ring && composed ? {
    held: model.heldPlate ?? restHeight,
    stage: composed.height,
    ringBottom: ring.y + ring.h,
    labelHeight,
  } : null);

  const stepSlot = useCallback((slot: OutfitSlot, direction: 1 | -1) => {
    const garmentTypeId = model.garments[slot];
    const neighbour = garmentTypeId ? neighbourIn(candidates, slot, garmentTypeId, direction) : null;
    if (neighbour) onStep(slot, neighbour.garmentTypeId);
  }, [candidates, model.garments, onStep]);
  const commitFromGesture = useCallback((slot: OutfitSlot, garmentTypeId: GarmentTypeId) => {
    setModel((current) => ({ ...current, gestureCommit: { slot, garmentTypeId } }));
    onStep(slot, garmentTypeId);
  }, [onStep]);
  const handleTap = useCallback((x: number, y: number) => {
    if (focusedSlot && ring && arrows) {
      if (inside(arrows.previous, x, y)) { stepSlot(focusedSlot, -1); return; }
      if (inside(arrows.next, x, y)) { stepSlot(focusedSlot, 1); return; }
      if (inside(ring, x, y)) { onFocusChange(null); return; }
    }
    let hit: OutfitSlot | null = null;
    let nearest = Infinity;
    for (const slot of composed?.order ?? []) {
      const box = composed!.bySlot.get(slot)!.box;
      const caption = focusedSlot ? undefined : captionRects[slot];
      if (inside(atLeast(box, layout.minimumTouchTarget), x, y) || (caption && inside(caption, x, y))) {
        const distance = Math.hypot(x - (box.x + box.w / 2), y - (box.y + box.h / 2));
        if (distance < nearest) { nearest = distance; hit = slot; }
      }
    }
    onFocusChange(hit && hit !== focusedSlot ? hit : null);
  }, [arrows, captionRects, composed, focusedSlot, onFocusChange, ring, stepSlot]);

  const gesture = useMemo(() => {
    const curDx = focused?.values.dx;
    const curOp = focused?.values.op;
    const nextDx = nextInstance?.values.dx;
    const nextOp = nextInstance?.values.op;
    const prevDx = previousInstance?.values.dx;
    const prevOp = previousInstance?.values.op;
    const nextId = nextInstance?.garmentTypeId ?? null;
    const prevId = previousInstance?.garmentTypeId ?? null;
    const hasNext = nextDx !== undefined;
    const hasPrevious = prevDx !== undefined;
    const slot = focusedSlot;
    const stripBox = strip;
    const pan = Gesture.Pan()
      .withTestId(`${testID ?? 'garment-swap-board'}-pan`)
      .enabled(Boolean(curDx && slot && stripBox))
      .maxPointers(1)
      .activeOffsetX([-SWAP_TOUCH_SLOP, SWAP_TOUCH_SLOP])
      .failOffsetY([-SWAP_TOUCH_SLOP, SWAP_TOUCH_SLOP])
      .onTouchesDown((event, manager) => {
        const touch = event.allTouches[0];
        // The horizontal gesture starts only on the focused piece's strip, and never at the
        // screen's left edge, where the system back swipe lives.
        if (!touch || !stripBox || touch.absoluteX < SWAP_EDGE_GUARD
          || touch.x < stripBox.x || touch.x > stripBox.x + stripBox.w
          || touch.y < stripBox.y || touch.y > stripBox.y + stripBox.h) manager.fail();
      })
      .onStart(() => {
        if (!curDx) return;
        // A grab mid-settle continues from where the eye last saw the piece.
        dragBase.set(curDx.get());
        curDx.set(curDx.get());
        dragPast.set(false);
        arrowsDrag.set(withTiming(0, { duration: fast }));
      })
      .onUpdate((event) => {
        if (!curDx || !curOp) return;
        const raw = dragBase.get() + event.translationX - Math.sign(event.translationX) * SWAP_TOUCH_SLOP;
        const shown = swapDragOffset(raw, stride, hasPrevious, hasNext);
        dragShown.set(shown);
        const direction = shown < 0 ? 1 : shown > 0 ? -1 : 0;
        const has = direction === 1 ? hasNext : direction === -1 ? hasPrevious : false;
        const opacities = swapDragOpacities(shown, stride);
        curDx.set(shown);
        curOp.set(has ? opacities.outgoing : 1);
        if (nextDx && nextOp) { nextDx.set(shown + stride); nextOp.set(direction === 1 ? opacities.incoming : 0); }
        if (prevDx && prevOp) { prevDx.set(shown - stride); prevOp.set(direction === -1 ? opacities.incoming : 0); }
        const past = has && Math.abs(shown) >= stride * SWAP_COMMIT_DISTANCE;
        if (past !== dragPast.get()) {
          dragPast.set(past);
          labelChoice.set(past ? direction : 0);
        }
      })
      .onEnd((event, success) => {
        if (!curDx || !curOp || !slot) return;
        const shown = dragShown.get();
        const velocity = success ? event.velocityX : 0;
        const direction = success ? swapCommitDirection(shown, velocity, stride, hasPrevious, hasNext) : 0;
        arrowsDrag.set(withTiming(1, { duration: fast }));
        const incomingId = direction === 1 ? nextId : direction === -1 ? prevId : null;
        if (incomingId) {
          const incomingDx = direction === 1 ? nextDx! : prevDx!;
          const incomingOp = direction === 1 ? nextOp! : prevOp!;
          incomingDx.set(withSpring(0, { ...spatial, velocity }));
          incomingOp.set(withTiming(1, { duration: fast }));
          curDx.set(withSpring(swapExitOffset(direction === 1 ? 1 : -1, shown, stride), { ...spatial, velocity }));
          curOp.set(withTiming(0, { duration: fast }));
          runOnJS(commitFromGesture)(slot, incomingId);
        } else {
          labelChoice.set(0);
          curDx.set(withSpring(0, { ...spatial, velocity }));
          curOp.set(withTiming(1, { duration: fast }));
          if (nextDx && nextOp) {
            nextDx.set(withSpring(stride, { ...spatial, velocity }));
            nextOp.set(withTiming(0, { duration: fast }));
          }
          if (prevDx && prevOp) {
            prevDx.set(withSpring(-stride, { ...spatial, velocity }));
            prevOp.set(withTiming(0, { duration: fast }));
          }
        }
        dragShown.set(0);
      });
    const tap = Gesture.Tap()
      .withTestId(`${testID ?? 'garment-swap-board'}-tap`)
      .maxDistance(SWAP_TOUCH_SLOP)
      .onEnd((event, success) => {
        if (success) runOnJS(handleTap)(event.x, event.y);
      });
    return Gesture.Exclusive(pan, tap);
  }, [arrowsDrag, commitFromGesture, dragBase, dragPast, dragShown, fast, focused, focusedSlot, handleTap, labelChoice,
    nextInstance, previousInstance, spatial, stride, strip, testID]);

  const plateStyle = useAnimatedStyle(() => ({
    height: settled ? withSpring(plateHeight, spatial) : plateHeight,
  }), [plateHeight, settled, spatial]);
  const tintStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(tint.get(), [0, 1], [entrance.fromStageColor, colors.background]),
  }), [colors.background, entrance.fromStageColor]);
  const overlayShown = settled && focusedSlot === null && !model.relayouting;
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: withTiming(overlayShown ? 1 : 0, { duration: settled ? theme.motion.normal : theme.motion.fast }),
  }), [overlayShown, settled, theme.motion.fast, theme.motion.normal]);
  const ringStyle = useAnimatedStyle(() => {
    const box = shownRing ?? { x: 0, y: 0, w: 0, h: 0 };
    // The ring appears in place and glides only while it is already on screen: between
    // pieces, and after a re-layout moves the focused one.
    const glide = (value: number) => (ringOpacity.get() > 0.01 ? withSpring(value, spatial) : value);
    return {
      height: glide(box.h),
      opacity: ringOpacity.get(),
      transform: [{ translateX: glide(box.x) }, { translateY: glide(box.y) }],
      width: glide(box.w),
    };
  }, [shownRing, spatial]);
  const chromeStyle = useAnimatedStyle(() => ({ opacity: ringOpacity.get() }));
  const arrowsStyle = useAnimatedStyle(() => ({ opacity: arrowsDrag.get() }));
  const labelCurrentStyle = useAnimatedStyle(() => ({ opacity: labelChoice.get() === 0 ? 1 : 0 }));
  const labelPreviousStyle = useAnimatedStyle(() => ({ opacity: labelChoice.get() === -1 ? 1 : 0 }));
  const labelNextStyle = useAnimatedStyle(() => ({ opacity: labelChoice.get() === 1 ? 1 : 0 }));

  const labelWidth = width * FOCUS_LABEL_CAP;
  const labelGarment = ringSlot ? model.garments[ringSlot] : undefined;
  const labelOrder = ringSlot ? candidates[ringSlot] ?? [] : [];
  const labelFor = (garmentTypeId: GarmentTypeId) => ({
    name: labels.pieceName(garmentTypeId),
    counter: labels.counter(labelOrder.findIndex((c) => c.garmentTypeId === garmentTypeId) + 1, labelOrder.length),
  });

  const drawOrder: Role[] = ['current', 'leaving', 'previous', 'next'];
  const sortedInstances = [...instances].sort((a, b) =>
    Number(a.slot === focusedSlot) - Number(b.slot === focusedSlot)
    || drawOrder.indexOf(a.role) - drawOrder.indexOf(b.role));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        collapsable={false}
        style={[styles.plate, { width }, plateStyle]}
        testID={testID ? `${testID}-plate` : undefined}>
        {composed ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.tint, { borderRadius: entrance.fromStageRadius, height: composed.height }, tintStyle]}
          />
        ) : null}
        {sortedInstances.map((instance) => (
          <PieceView
            ink={colors.textPrimary}
            instance={instance}
            key={instance.key}
            outline={outline}
            settleTravel={settleTravel}
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
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { borderColor: colors.focusRing }, ringStyle]}
          testID={testID ? `${testID}-ring` : undefined}
        />
        {shownRing && ringSlot && labelGarment ? (
          <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onLayout={({ nativeEvent }) => {
              if (nativeEvent.layout.height !== labelHeight) setLabelHeight(nativeEvent.layout.height);
            }}
            pointerEvents="none"
            style={[styles.label, {
              left: Math.min(Math.max(0, shownRing.x + shownRing.w / 2 - labelWidth / 2), Math.max(0, width - labelWidth)),
              top: shownRing.y + shownRing.h + spacing.xs,
              width: labelWidth,
            }, chromeStyle]}
            testID={testID ? `${testID}-focus-label` : undefined}>
            {([
              ['current', labelGarment, labelCurrentStyle],
              ['previous', previousInstance?.garmentTypeId, labelPreviousStyle],
              ['next', nextInstance?.garmentTypeId, labelNextStyle],
            ] as const).map(([name, garmentTypeId, style]) => {
              if (!garmentTypeId) return null;
              const text = labelFor(garmentTypeId);
              return (
                <Animated.View key={name} style={[name === 'current' ? styles.labelLine : styles.labelPreview, style]}>
                  <AppText style={styles.centred} variant="bodyStrong">{text.name}</AppText>
                  <AppText colorRole="textSecondary" style={styles.centred} tabularNumbers variant="caption">
                    {text.counter}
                  </AppText>
                </Animated.View>
              );
            })}
          </Animated.View>
        ) : null}
        {/* One element per piece in the outfit's slot order, the order the rows below read in. */}
        {pieces.map(({ slot }) => {
          const garmentTypeId = model.garments[slot];
          if (!garmentTypeId || !composed?.bySlot.has(slot)) return null;
          const box = atLeast(composed.bySlot.get(slot)!.box, layout.minimumTouchTarget);
          const order = candidates[slot] ?? [];
          const position = order.findIndex((c) => c.garmentTypeId === garmentTypeId) + 1;
          const showsArrows = slot === focusedSlot && arrows !== null;
          const hasPrevious = neighbourIn(candidates, slot, garmentTypeId, -1) !== null;
          const hasNext = neighbourIn(candidates, slot, garmentTypeId, 1) !== null;
          return [
            // VoiceOver's focus is the focus: every piece is adjustable without the ring.
            <View
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
              accessibilityLabel={labels.slotName(slot)}
              accessibilityRole="adjustable"
              accessibilityValue={{ text: labels.pieceValue(labels.pieceName(garmentTypeId), position, order.length) }}
              accessible
              key={`piece-${slot}`}
              onAccessibilityAction={({ nativeEvent }) => {
                if (nativeEvent.actionName === 'increment') stepSlot(slot, 1);
                else if (nativeEvent.actionName === 'decrement') stepSlot(slot, -1);
                else if (nativeEvent.actionName === 'activate') onFocusChange(slot === focusedSlot ? null : slot);
              }}
              pointerEvents="none"
              style={[styles.target, { height: box.h, left: box.x, top: box.y, width: box.w }]}
              testID={testID ? `${testID}-piece-${slot}` : undefined}
            />,
            showsArrows && arrows ? (
              <Animated.View key={`arrows-${slot}`} pointerEvents="none" style={[StyleSheet.absoluteFill, arrowsStyle]}>
                {([['previous', -1, hasPrevious], ['next', 1, hasNext]] as const).map(([name, direction, enabled]) => (
                  <View
                    accessibilityActions={[{ name: 'activate' }]}
                    accessibilityLabel={labels[name]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !enabled }}
                    accessible
                    key={name}
                    onAccessibilityAction={({ nativeEvent }) => {
                      if (nativeEvent.actionName === 'activate' && enabled) stepSlot(slot, direction);
                    }}
                    style={[styles.arrow, {
                      height: arrows[name].h, left: arrows[name].x, top: arrows[name].y, width: arrows[name].w,
                      opacity: enabled ? 1 : interaction.disabledOpacity,
                    }]}
                    testID={testID ? `${testID}-${name}` : undefined}>
                    <Icon color={colors.brandAccent} name={direction === 1 ? 'chevronRight' : 'chevronLeft'}
                      size={ARROW_GLYPH_SIZE} />
                  </View>
                ))}
              </Animated.View>
            ) : null,
          ];
        })}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  arrow: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  centred: {
    textAlign: 'center',
  },
  label: {
    position: 'absolute',
  },
  labelLine: {
    alignItems: 'center',
  },
  labelPreview: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  piece: {
    position: 'absolute',
  },
  plate: {
    position: 'relative',
  },
  ring: {
    borderRadius: radii.control,
    borderWidth: borderWidths.strong,
    left: 0,
    position: 'absolute',
    top: 0,
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
