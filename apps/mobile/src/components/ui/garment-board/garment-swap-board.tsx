import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, findNodeHandle, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  interpolateColor,
  makeMutable,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { useStableValue } from '@/hooks/use-stable-value';
import { easierToSee as easierToSeeValues, useEasierToSee } from '@/theme/easier-to-see';
import { layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { haptics } from '../haptics';
import { PRESENCE_TEXT_AFTER } from '../presence';
import {
  composePieces,
  entranceStartBoxes,
  PieceArtwork,
  pieceShadowOf,
  useGarmentCandidateRoles,
  type ComposedPiece,
  type GarmentBoardPiece,
  type PieceShadow,
} from './garment-board';
import { garmentRolesBySlot, type GarmentOutfitPalette } from './garment-palette';
import { GARMENT_OUTLINE } from './garment-painting';
import { GarmentSwapStrip, type GarmentSwapStripLabels } from './garment-swap-strip';
import {
  SWAP_EDGE_GUARD,
  SWAP_HANDOFF_AFTER,
  SWAP_HINT_PEEK,
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
  swapStageFit,
  swapStride,
  swapStripLayout,
  swapWindow,
} from './swap-gesture';
import {
  drawingKey,
  emptyModel,
  neighbourIn,
  reconcile,
  sameBox,
  withGarment,
  type Box,
  type Candidates,
  type Composed,
  type GarmentSwapCandidate,
  type Grow,
  type Instance,
  type Intent,
  type Model,
  type Pager,
  type PieceStart,
  type PieceValues,
  type ReconcileTools,
  type Role,
} from './swap-reconcile';

export type { GarmentSwapCandidate } from './swap-reconcile';

// Law 7's completion moment, as in `GarmentBoard`.
const SETTLE_TRAVEL = spacing.xs;
// Law 7's dressing: a piece taken off rises one `md` step as it fades on `fast`, and a piece
// put on is hung from that height onto its place on the arrival spring.
const DRESS_LIFT = spacing.md;

/** A grow with the strip height and the visible height it was fitted to. */
type Enlargement = Grow & Readonly<{ panel: number; visible: number }>;
type Panel = Readonly<{ slot: OutfitSlot; held: number }>;
type Panels = Readonly<{ focus: OutfitSlot | null; current: Panel | null; leaving: Panel | null }>;

export type GarmentSwapBoardLabels = GarmentSwapStripLabels & Readonly<{
  slotName: (slot: OutfitSlot) => string;
  /** Spoken when VoiceOver's activate enlarges a piece: the strip has opened below it. */
  stripShown: string;
  /** Spoken after a board piece's value: where the reader's Closet already has it, if anywhere. */
  pieceState?: (garmentTypeId: GarmentTypeId) => string | null;
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
  /** An enlargement asks its owner to bring the strip into view, in board points. */
  onReveal?: (area: Readonly<{ pieceTop: number; panelBottom: number }>) => void;
  /**
   * The page's height between its bars. An enlarged board whose stage and strip are taller
   * composes narrower until they fit (ADR 0026 section 6). Left out, the board keeps its width.
   */
  visibleHeight?: number;
  /**
   * The first enlargement shows the next candidate at the window's edge once, telling the
   * piece pages sideways. The owner passes true until the hint has played for good.
   */
  swipeHint?: boolean;
  /** Called once, as the hint starts, so the owner can store that it played. */
  onSwipeHintShown?: () => void;
  testID?: string;
}>;

const lerp = (a: number, b: number, t: number) => {
  'worklet';
  return a + (b - a) * t;
};
const lerpBox = (a: Box, b: Box, t: number): Box => {
  'worklet';
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
};
const atLeast = (box: Box, minimum: number): Box => {
  const w = Math.max(box.w, minimum);
  const h = Math.max(box.h, minimum);
  return { x: box.x - (w - box.w) / 2, y: box.y - (h - box.h) / 2, w, h };
};
const inside = (box: Box, x: number, y: number) =>
  x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;

/** The composition in points; `fit` composes it that much narrower, centred in `width`. */
function composeInPoints(pieces: readonly GarmentBoardPiece[], width: number, large: boolean, fit = 1): Composed {
  const result = composePieces(pieces, 'detail', large);
  const size = width * fit;
  const left = (width - size) / 2;
  const bySlot = new Map<OutfitSlot, Readonly<{ piece: ComposedPiece; box: Box }>>();
  for (const piece of result.order) {
    const box = result.boxes.get(piece)!;
    bySlot.set(piece.slot, { piece, box: { x: left + box.x * size, y: box.y * size, w: box.w * size, h: box.h * size } });
  }
  return { bySlot, order: result.order.map(({ slot }) => slot), height: result.stageHeight * size };
}

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
  fit: number,
): Grow {
  const layouts = order.map((candidate) => {
    const composed = composeInPoints(withGarment(pieces, slot, candidate), width, large, fit);
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
    slot, width, large, fit,
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
  fit: number,
): Readonly<Record<1 | -1, Box | null>> {
  const current = composed.bySlot.get(slot)?.box;
  const boxOf = (direction: 1 | -1) => {
    const neighbour = current && garmentTypeId ? neighbourIn(candidates, slot, garmentTypeId, direction) : null;
    if (!current || !neighbour) return null;
    return swapEntryBox(current, composeInPoints(withGarment(pieces, slot, neighbour), width, large, fit).bySlot.get(slot)!.box);
  };
  return { [1]: boxOf(1), [-1]: boxOf(-1) };
}

function pagerFor(
  composed: Composed,
  slot: OutfitSlot,
  grow: Grow,
  width: number,
  neighbours: Readonly<Record<1 | -1, Box | null>>,
  outline: number,
): Pager | null {
  const own = composed.bySlot.get(slot);
  if (!own) return null;
  const grown = swapGrownBox(own.box, grow.scale, width, grow.held);
  const steppedBack = composed.order.filter((other) => other !== slot)
    .map((other) => swapScaledBox(composed.bySlot.get(other)!.box, SWAP_STEP_BACK));
  const window = swapWindow(grown, steppedBack, width, grow.held);
  // Each side's step keeps that side's neighbour, grown and outlined, wholly behind the window's edge.
  const incoming = (direction: 1 | -1) => {
    const box = neighbours[direction];
    return box ? swapGrownBox(box, grow.scale, width, grow.held) : grown;
  };
  return {
    grown,
    window,
    strideNext: swapStride(window, incoming(1), 1, outline),
    stridePrevious: swapStride(window, incoming(-1), -1, outline),
    zone: swapDragZone(grown, grow.held),
  };
}

function valuesFor(start: PieceStart): PieceValues {
  return {
    from: makeMutable<Box>(start.from), to: makeMutable<Box>(start.box), p: makeMutable(start.p),
    dx: makeMutable(start.dx), dy: makeMutable(0), op: makeMutable(start.op), sc: makeMutable(start.sc),
    drain: makeMutable(0),
    hand: makeMutable(start.hand), handFrom: makeMutable(1), handTo: makeMutable(Number.NaN),
  };
}

function PieceView({
  instance, ink, outline, shadow, settleTravel, stageWidth, stageLimit, clip, onBigDone, testID,
}: Readonly<{
  instance: Instance;
  ink: string;
  outline?: number;
  shadow: PieceShadow;
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
  const { from, to, p, dx, dy, op, sc, drain, hand, handFrom, handTo } = values;
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
    // The view stands at the stage's origin and the transform alone places it, so a re-layout
    // that only moves the piece changes nothing React draws: no frame shows the new place
    // before the motion that travels there.
    return {
      opacity: op.get(),
      transform: [
        { translateX: centreX + dx.get() - base.w / 2 },
        { translateY: centreY - base.h / 2 + SETTLE_TRAVEL * settleTravel.get() + dy.get() },
        { scaleX: w / base.w },
        { scaleY: h / base.h },
      ],
    };
  }, [base.h, base.w, stageWidth]);
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
        if (finished) scheduleOnRN(onBigDone, key);
      }));
    }
  }, [fast, key, onBigDone]);

  return (
    <View
      pointerEvents="none"
      style={clip ? [styles.clip, { height: clip.h, left: clip.x, top: clip.y, width: clip.w }] : styles.free}
      testID={testID}>
      <View style={clip ? [styles.free, { left: -clip.x, top: -clip.y }] : styles.free}>
        <Animated.View style={[styles.piece, styles.origin, { height: base.h, width: base.w }, pieceStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, restStyle]}>
            <PieceArtwork height={base.h} ink={ink} outline={outline} piece={instance.piece} roles={instance.roles}
              shadow={shadow} width={base.w} />
            {instance.drainRoles ? (
              // The ADR 0026 section 7 technique: the old colours drain off over the new. The
              // shadow under them is the resting drawing's, so it does not darken twice.
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
                roles={instance.roles} shadow={{
                  ...shadow,
                  dx: shadow.dx * big,
                  dy: shadow.dy * big,
                  blur: shadow.blur * big,
                  margin: shadow.margin * big,
                }} width={base.w * big} />
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
  onReveal,
  visibleHeight = 0,
  swipeHint = false,
  onSwipeHintShown,
  testID,
}: GarmentSwapBoardProps) {
  const theme = useKuyaraTheme();
  const { colors } = theme;
  const large = useEasierToSee();
  const outline = large ? easierToSeeValues.boardOutline : undefined;
  const drawnOutline = outline ?? GARMENT_OUTLINE;
  const shadow = pieceShadowOf(width, colors.background, theme.colorScheme);
  const spatial = theme.springs.spatial;
  const { fast, normal } = theme.motion;
  const boardTestID = testID ?? 'garment-swap-board';

  const pieces = useStableValue(piecesProp);
  const candidates = useStableValue(candidatesProp);
  const captionRects = useStableValue(captionRectsProp);
  const rest = useMemo(() => (width > 0 ? composeInPoints(pieces, width, large) : null), [large, pieces, width]);
  const rolesFor = useMemo(() => (input: GarmentOutfitPalette) => garmentRolesBySlot({
    ...input,
    appearance: theme.colorScheme,
    stageColor: colors.background,
    accessoryStageColor: colors.background,
    inkColor: colors.textPrimary,
  }), [colors.background, colors.textPrimary, theme.colorScheme]);
  const roles = useMemo(() => rolesFor(palette), [palette, rolesFor]);

  // The strip's header before it has measured itself: Done's height.
  const headerMinimum = large ? easierToSeeValues.primaryActionHeight : layout.minimumTouchTarget;
  const [headerHeight, setHeaderHeight] = useState<number>(headerMinimum);
  // The strip: its candidates, tiles and the marker's tile.
  const stripCandidates = (slot: OutfitSlot) => candidates[slot] ?? [];
  const stripOf = (slot: OutfitSlot) => {
    const order = stripCandidates(slot);
    return swapStripLayout(order.length, order.filter(({ suitable }) => suitable).length, width);
  };
  const panelHeightOf = (slot: OutfitSlot) => headerHeight + spacing.sm + stripOf(slot).height;

  // One enlargement's grow scale and held stage; the stage never shrinks while the
  // enlargement moves between slots. Where the stage and the strip would not fit the visible
  // height, the whole board composes just narrow enough while the piece is enlarged.
  const [panels, setPanels] = useState<Panels>({ focus: null, current: null, leaving: null });
  const [grow, setGrow] = useState<Enlargement | null>(null);
  let enlargement: Enlargement | null = null;
  if (focusedSlot && rest && rest.bySlot.has(focusedSlot)) {
    const panel = panelHeightOf(focusedSlot);
    const fresh = grow && grow.slot === focusedSlot && grow.width === width && grow.large === large
      && grow.panel === panel && grow.visible === visibleHeight;
    if (fresh) enlargement = grow;
    else {
      const order = stripCandidates(focusedSlot);
      const full = growFor(pieces, focusedSlot, order, width, large, rest, 1);
      const fullHeld = Math.max(full.held, rest.height, panels.focus !== null && grow ? grow.held / grow.fit : 0);
      const fit = swapStageFit(fullHeld, panel, visibleHeight);
      const fitted = fit < 1
        ? growFor(pieces, focusedSlot, order, width, large, composeInPoints(pieces, width, large, fit), fit) : full;
      enlargement = { ...fitted, held: fullHeld * fit, panel, visible: visibleHeight };
      setGrow(enlargement);
    }
  }
  const fit = enlargement?.fit ?? 1;
  const composed = useMemo(() => (width > 0 && fit < 1 ? composeInPoints(pieces, width, large, fit) : rest),
    [fit, large, pieces, rest, width]);
  const activeGrow = enlargement && composed
    ? { ...enlargement, held: Math.max(enlargement.held, composed.height) } : null;
  const pager = focusedSlot && composed && activeGrow
    ? pagerFor(composed, focusedSlot, activeGrow, width,
      neighbourBoxes(pieces, composed, focusedSlot,
        composed.bySlot.get(focusedSlot)?.piece.garmentTypeId, candidates, width, large, fit), drawnOutline)
    : null;

  // The strip follows the enlargement: it arrives with it, swaps when it moves, and stays
  // while it fades out after a settle. A drag the change cancelled names no piece any more.
  const [previewId, setPreviewId] = useState<GarmentTypeId | null>(null);
  if (panels.focus !== focusedSlot) {
    if (previewId !== null) setPreviewId(null);
    setPanels({
      focus: focusedSlot,
      current: focusedSlot && activeGrow ? { slot: focusedSlot, held: activeGrow.held } : panels.current,
      leaving: focusedSlot && panels.focus ? panels.current : null,
    });
  }

  const [model, setModel] = useState<Model>(emptyModel);
  const [settled, setSettled] = useState(false);
  const [lastSettle, setLastSettle] = useState(settle);
  const [hintHeight, setHintHeight] = useState(0);
  const [hintMounted, setHintMounted] = useState(hintVisible);
  if (hintVisible && !hintMounted) setHintMounted(true);
  // The strip takes touches and VoiceOver's focus only once it is fading in: while its space
  // opens its tiles are not drawn yet, so they are not there to press or read.
  const [liveSlot, setLiveSlot] = useState<OutfitSlot | null>(focusedSlot);
  if (focusedSlot === null && liveSlot !== null) setLiveSlot(null);

  const tint = useSharedValue(0);
  const arrival = useSharedValue(0);
  const settleTravel = useSharedValue(0);
  const stageLimit = useSharedValue(0);
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
    ? JSON.stringify([pieces, palette, width, large, focusedSlot, activeGrow?.scale ?? null, fit,
      focusedSlot ? candidates[focusedSlot] ?? null : null, theme.colorScheme])
    : null;
  if (composed && signature && signature !== model.signature) {
    const tools: ReconcileTools = {
      values: valuesFor,
      compose: (next, nextFit) => composeInPoints(next, width, large, nextFit),
      entranceBoxes: (next) => entranceStartBoxes(next, width, 'today', true, large),
    };
    setModel(reconcile(model, {
      signature, composed, pieces, palette, roles, rolesFor, width, focusedSlot, grow: activeGrow, pager, candidates,
    }, tools));
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

  // Each re-layout's intents start once, however often the effect itself runs.
  const appliedIntents = useRef<readonly Intent[] | null>(null);
  useLayoutEffect(() => {
    if (appliedIntents.current === model.intents) return;
    appliedIntents.current = model.intents;
    const landed = () => {
      'worklet';
      scheduleOnRN(springLanded);
    };
    const spring = (value: SharedValue<number>, target: number, config = spatial) => {
      pendingSprings.current += 1;
      value.set(withSpring(target, config, landed));
    };
    // Law 7's dressing, with the piece's shadow drawn in the same view: the piece taken off
    // lifts away as it fades, the one put on is hung on from above, and one the finger has
    // already carried in catches its weight with the moment's settle.
    const liftOff = (values: PieceValues) => values.dy.set(withTiming(-DRESS_LIFT, { duration: fast }));
    const hangOn = (values: PieceValues) => {
      values.dy.set(-DRESS_LIFT);
      spring(values.dy, 0, theme.springs.arrival);
    };
    const catchWeight = (values: PieceValues) => {
      pendingSprings.current += 1;
      values.dy.set(withSequence(
        withTiming(SETTLE_TRAVEL, { duration: fast }),
        withSpring(0, theme.springs.arrival, landed),
      ));
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
          values.p.set(withSpring(1, theme.springs.arrival));
          // The same arrival, read once nine tenths of it is travelled; its landing settles too.
          if (intent.reportsSettled) {
            arrival.set(withSpring(1, theme.springs.arrival, (finished) => {
              if (finished) scheduleOnRN(setSettled, true);
            }));
          }
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
          if (intent.fromGesture) catchWeight(values);
          else hangOn(values);
          break;
        case 'enter': {
          if (intent.previous) {
            values.from.set(swapEntryBox(visualOf(intent.previous), intent.box));
            values.to.set(intent.box);
            values.dx.set(intent.previous.dx.get() + intent.direction * intent.stride);
            values.p.set(0);
            // Shown with its offset in one batch, so it never draws at the window's centre.
            if (intent.paged) values.op.set(1);
          }
          spring(values.p, 1);
          spring(values.dx, 0);
          hangOn(values);
          if (!intent.paged) values.op.set(withTiming(1, { duration: fast }));
          break;
        }
        case 'leave': {
          const { key } = intent;
          liftOff(values);
          if (intent.paged) {
            // Clipped, it fades out on `fast` as it slides out of the window, so it never rests
            // cut at the window's edge, and is gone on landing.
            values.op.set(withTiming(0, { duration: fast }));
            if (!intent.fromGesture) {
              pendingSprings.current += 1;
              values.dx.set(withSpring(swapExitOffset(intent.direction, values.dx.get(), intent.stride), spatial,
                (finished) => {
                  scheduleOnRN(springLanded);
                  if (finished) scheduleOnRN(removeLeaving, key);
                }));
            }
            break;
          }
          if (!intent.fromGesture) {
            spring(values.dx, swapExitOffset(intent.direction, values.dx.get(), intent.stride));
            spring(values.sc, 1);
          }
          values.op.set(withTiming(0, { duration: fast }, (finished) => {
            if (finished) scheduleOnRN(removeLeaving, key);
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
              scheduleOnRN(springLanded);
            }));
          }
          break;
        case 'retire': {
          const { key } = intent;
          pendingSprings.current += 1;
          values.dx.set(withSpring(intent.offset, spatial, (finished) => {
            scheduleOnRN(springLanded);
            if (finished) scheduleOnRN(removeLeaving, key);
          }));
          break;
        }
        case 'home':
          if (values.dx.get() !== 0) spring(values.dx, 0);
          break;
        case 'drain': {
          const { key } = intent;
          values.drain.set(1);
          values.drain.set(withTiming(0, { duration: normal }, (finished) => {
            if (finished) scheduleOnRN(clearDrain, key);
          }));
          break;
        }
      }
    }
  });

  // The captions, and what waits for the pieces to arrive, follow once the arrival is nine
  // tenths travelled, as Presence's text follows its container, instead of waiting out the
  // spring's overshoot.
  useAnimatedReaction(() => arrival.get() >= PRESENCE_TEXT_AFTER, (reached, was) => {
    if (reached && !was) scheduleOnRN(setSettled, true);
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
    cancelAnimation(arrival);
    cancelAnimation(settleTravel);
  }, [arrival, settleTravel, tint]);
  const activeHeld = activeGrow?.held ?? null;
  useLayoutEffect(() => {
    if (activeHeld !== null) stageLimit.set(activeHeld);
  }, [activeHeld, stageLimit]);

  const { instances } = model;
  const focused = focusedSlot
    ? instances.find((instance) => instance.slot === focusedSlot && instance.role === 'current') : undefined;
  const nextInstance = focused ? instances.find((instance) => instance.role === 'next') : undefined;
  const previousInstance = focused ? instances.find((instance) => instance.role === 'previous') : undefined;

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
      scheduleOnRN(markPanelLive);
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
  // After a settle the strip leaves the tree once the block has closed over it.
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
      if (finished) scheduleOnRN(blockLanded, token);
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
          if (finished) scheduleOnRN(afterPanelOut);
        }));
      } else {
        // The enlargement moves: the old strip leaves on `fast`; the new one arrives at once
        // on `normal` when it is as tall, after the block opens when taller, and after the
        // old one has gone and the block has closed when shorter.
        leavingPanelOpacity.set(1);
        panelOpacity.set(0);
        if (Math.abs(panelHeight - seen.panel) < 0.5) {
          leavingPanelOpacity.set(withTiming(0, { duration: fast }, (finished) => {
            if (finished) scheduleOnRN(afterLeavingPanelOut);
          }));
          panelOpacity.set(withTiming(1, { duration: normal }));
          markPanelLive();
          startBlock(blockTarget);
        } else if (panelHeight > seen.panel) {
          leavingPanelOpacity.set(withTiming(0, { duration: fast }, (finished) => {
            if (finished) scheduleOnRN(afterLeavingPanelOut);
          }));
          panelPending.set(1);
          startBlock(blockTarget);
          reveal(focusedSlot);
        } else {
          panelPending.set(0);
          leavingPanelOpacity.set(withTiming(0, { duration: fast }, (finished) => {
            if (finished) scheduleOnRN(afterShorterSwap);
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
          if (finished) scheduleOnRN(afterHintOut);
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
      const neighbour = nextInstance ?? previousInstance;
      const piece = focused?.values.dx;
      if (!pager || !neighbour || !piece || hintGrabbed.get()) return;
      swipeHinted.current = true;
      const direction = nextInstance ? 1 : -1;
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
      if (hit) requestFocus(hit);
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
    // 8 pt of vertical travel first hands the press to the page scroll (final-spec section 4).
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
        curOp?.set(withTiming(0, { duration: fast }));
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

  const blockStyle = useAnimatedStyle(() => ({ height: block.get() }));
  const tintStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(tint.get(), [0, 1], [entrance.fromStageColor, colors.background]),
  }), [colors.background, entrance.fromStageColor]);
  // Captions and badges leave at once when a piece starts to move: the commit that hands the
  // board new pieces or a focus hides them, so none is drawn over a moving piece and none is
  // renamed before its piece changes. They return on `normal` once every piece rests, and stay
  // laid out while away, so the plate keeps their measured height.
  const overlayShown = settled && focusedSlot === null && !model.relayouting;
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayShown ? withTiming(1, { duration: normal }) : 0,
  }), [normal, overlayShown]);
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
              key={drawingKey(instance)}
              onBigDone={dropBig}
              outline={outline}
              settleTravel={settleTravel}
              shadow={shadow}
              stageLimit={stageLimit}
              stageWidth={width}
              testID={`${boardTestID}-drawing-${instance.slot}-${instance.garmentTypeId}`}
            />
          ))}
          {/* The captions and badges are drawn for the eye; each piece's adjustable element
              speaks its slot, its name and its Closet state. */}
          <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, overlayStyle]}
            testID={overlayTestID}>
            <View style={[StyleSheet.absoluteFill, !overlayShown && styles.away]}>{overlay}</View>
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
            const value = labels.pieceValue(labels.pieceName(garmentTypeId), position, order.length);
            const state = labels.pieceState?.(garmentTypeId) ?? null;
            return (
              // VoiceOver's focus is the focus: every piece is adjustable without enlarging it.
              <View
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
                accessibilityLabel={labels.slotName(slot)}
                accessibilityRole="adjustable"
                // The enlarged piece reads as expanded: its strip is open under the board.
                accessibilityState={{ expanded: focusedSlot === slot }}
                accessibilityValue={{ text: state ? `${value}, ${state}` : value }}
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
  away: {
    opacity: 0,
  },
  block: {
    position: 'relative',
  },
  clip: {
    overflow: 'hidden',
    position: 'absolute',
  },
  // Spans its parent: React Native reuses a closed screen's native view for a new one and skips
  // writing a zero-size frame at the origin, so a zero-size wrapper keeps its earlier position.
  free: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
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
  origin: {
    left: 0,
    top: 0,
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
