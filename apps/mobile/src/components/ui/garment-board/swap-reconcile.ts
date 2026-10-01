import type { SharedValue } from 'react-native-reanimated';

import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { layout, spacing } from '@/theme/theme';

import type { ComposedPiece, GarmentBoardPiece } from './garment-board';
import { paletteWithGarment, type GarmentOutfitPalette, type GarmentRoles } from './garment-palette';
import { SWAP_STEP_BACK, swapEntryBox, type SwapBox } from './swap-gesture';

export type Box = SwapBox;
export type Role = 'current' | 'previous' | 'next' | 'leaving';
/** A piece's shared values: created once per piece and carried across every re-layout. */
export type PieceValues = Readonly<{
  from: SharedValue<Box>;
  to: SharedValue<Box>;
  p: SharedValue<number>;
  dx: SharedValue<number>;
  /** The dressing lift: a leaving piece rises off the board, an arriving one is hung on. */
  dy: SharedValue<number>;
  op: SharedValue<number>;
  sc: SharedValue<number>;
  drain: SharedValue<number>;
  /** The big drawing's opacity over the resting one. */
  hand: SharedValue<number>;
  /** A shrink's scale span; the big drawing hands back once a quarter of it is travelled. */
  handFrom: SharedValue<number>;
  handTo: SharedValue<number>;
}>;
/** Where a new piece's shared values start. */
export type PieceStart = Readonly<{ from: Box; box: Box; p: number; dx: number; op: number; sc: number; hand: number }>;
export type Instance = Readonly<{
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
/** One enlargement: the slot's grow scale and the stage held under it, at the board's `fit`. */
export type Grow = Readonly<{ slot: OutfitSlot; scale: number; held: number; width: number; large: boolean; fit: number }>;
export type Pager = Readonly<{
  grown: Box;
  window: Box;
  strideNext: number;
  stridePrevious: number;
  zone: Box;
}>;
/** What a re-layout starts once it has committed: shared values are only written after render. */
export type Intent =
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
  | Readonly<{ kind: 'retire'; key: string; values: PieceValues; offset: number }>
  | Readonly<{ kind: 'home'; values: PieceValues }>;
export type Model = Readonly<{
  signature: string | null;
  instances: readonly Instance[];
  garments: Readonly<Partial<Record<OutfitSlot, GarmentTypeId>>>;
  entered: boolean;
  /** Pieces are still moving after a change or a focus change; captions and badges wait. */
  relayouting: boolean;
  intents: readonly Intent[];
  gestureCommit: Readonly<{ slot: OutfitSlot; garmentTypeId: GarmentTypeId }> | null;
  /** The enlarged slot this model was laid out for. */
  focus: OutfitSlot | null;
}>;

export type GarmentSwapCandidate = Readonly<{
  garmentTypeId: GarmentTypeId;
  category: StructuralCategory;
  /** Whether kuyara's pick stays weather-suitable with this piece: the strip's first group. */
  suitable: boolean;
}>;
export type Candidates = Readonly<Partial<Record<OutfitSlot, readonly GarmentSwapCandidate[]>>>;

/** A composition in board points: each slot's piece and box, the draw order and the stage height. */
export type Composed = Readonly<{
  bySlot: ReadonlyMap<OutfitSlot, Readonly<{ piece: ComposedPiece; box: Box }>>;
  order: readonly OutfitSlot[];
  height: number;
}>;

export const emptyModel: Model = {
  signature: null, instances: [], garments: {}, entered: false, relayouting: false, intents: [], gestureCommit: null,
  focus: null,
};

/**
 * The identity a piece's view is drawn under: its drawn size is part of it. A view's first
 * transform is computed from the piece's motion only when it mounts, and a new size reaches the
 * screen a frame before the motion does: kept under one view, a piece drawn at a new size showed
 * for a frame at that size with the old transform. A fresh view starts where the piece stands.
 * A move alone keeps the view: the piece's position lives only in its transform. The size is read
 * to a hundredth of a point, so arithmetic noise in a re-layout never counts as a new size.
 */
const drawnSize = (value: number) => value.toFixed(2);
export const drawingKey = ({ key, base }: Instance) => `${key}@${drawnSize(base.w)}x${drawnSize(base.h)}`;

export const sameBox = (a: Box, b: Box) => Math.abs(a.x - b.x) < 0.25 && Math.abs(a.y - b.y) < 0.25
  && Math.abs(a.w - b.w) < 0.25 && Math.abs(a.h - b.h) < 0.25;

export const withGarment = (pieces: readonly GarmentBoardPiece[], slot: OutfitSlot, candidate: GarmentSwapCandidate) =>
  pieces.map((piece) => (piece.slot === slot
    ? { ...piece, garmentTypeId: candidate.garmentTypeId, category: candidate.category } : piece));

export function neighbourIn(candidates: Candidates, slot: OutfitSlot, garmentTypeId: GarmentTypeId, direction: 1 | -1) {
  const order = candidates[slot] ?? [];
  const index = order.findIndex((candidate) => candidate.garmentTypeId === garmentTypeId);
  return index < 0 ? null : order[index + direction] ?? null;
}

/**
 * Whether a piece composed again draws exactly as before: the same slot, garment and
 * silhouette. Composing makes a new object each time, and a drawing's memo holds only while
 * its piece keeps its identity, so an unchanged piece keeps the one it has.
 */
function samePiece(a: ComposedPiece, b: ComposedPiece) {
  const keys = Object.keys(a) as (keyof ComposedPiece)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/** What reconciling needs from the board that is not a plain value. */
export type ReconcileTools = Readonly<{
  /** A new piece's shared values. */
  values: (start: PieceStart) => PieceValues;
  /** The pieces composed at the board's width and size, `fit` that much narrower. */
  compose: (pieces: readonly GarmentBoardPiece[], fit: number) => Composed;
  /** Where the first layout's pieces start, by slot, in stage-width units. */
  entranceBoxes: (pieces: readonly GarmentBoardPiece[]) => ReadonlyMap<OutfitSlot, Box>;
}>;

export type ReconcileInputs = Readonly<{
  signature: string;
  composed: Composed;
  pieces: readonly GarmentBoardPiece[];
  palette: GarmentOutfitPalette;
  roles: ReadonlyMap<OutfitSlot, GarmentRoles>;
  rolesFor: (palette: GarmentOutfitPalette) => ReadonlyMap<OutfitSlot, GarmentRoles>;
  width: number;
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
export function reconcile(model: Model, inputs: ReconcileInputs, tools: ReconcileTools): Model {
  const { composed, pieces, palette, roles, rolesFor, width, focusedSlot, grow, pager, candidates } = inputs;
  const byKey = new Map(model.instances.map((instance) => [instance.key, instance]));
  const intents: Intent[] = [];
  const firstLayout = !model.entered;
  const startBoxes = firstLayout ? tools.entranceBoxes(pieces) : null;
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
      const values = tools.values({ from, box, p: 0, dx: 0, op: 1, sc: 1, hand: 0 });
      byKey.set(key, {
        key, slot, garmentTypeId, role: 'current', piece, base: box, roles: pieceRoles, drainRoles: null, values,
        big: null, paged: false, scale: 1, window: null, waits: null,
      });
      intents.push({ kind: 'entrance', values, reportsSettled: index === 0 });
    } else if (existing) {
      let next: Instance = {
        ...existing, piece: samePiece(existing.piece, piece) ? existing.piece : piece, paged: false,
        big: big ?? existing.big, scale, window: null, waits: null,
      };
      if (existing.role !== 'current') {
        moved = true;
        next = { ...next, role: 'current', base: box };
        // A paged neighbour is opaque behind the window's edge; a leaving piece may have faded.
        intents.push({
          kind: 'promote', values: existing.values, box, fromGesture, scale,
          paged: existing.paged && existing.role !== 'leaving',
        });
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
      // otherwise it crossfades in beside the piece it replaces (Phase 7). Either way it starts
      // unseen: its first frame would draw it where the piece it replaces still stands.
      const values = tools.values({
        from: box, box, p: previous ? 0 : 1, dx: 0, op: previous ? 0 : 1, sc: scale, hand: paged ? 1 : 0,
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
      const preview = tools.compose(withGarment(pieces, focusedSlot, neighbour), grow.fit).bySlot.get(focusedSlot)!;
      const box = swapEntryBox(currentBox, preview.box);
      const offset = direction === 1 ? pager.strideNext : -pager.stridePrevious;
      const previewRoles = rolesFor(paletteWithGarment(palette, focusedSlot, neighbour.garmentTypeId)).get(focusedSlot)!;
      const key = `${focusedSlot}|${neighbour.garmentTypeId}`;
      const role: Role = direction === 1 ? 'next' : 'previous';
      wanted.add(key);
      const existing = byKey.get(key);
      if (existing) {
        byKey.set(key, {
          ...existing, role,
          piece: samePiece(existing.piece, preview.piece) ? existing.piece : preview.piece,
          roles: JSON.stringify(existing.roles) === JSON.stringify(previewRoles) ? existing.roles : previewRoles,
          base: box, big: grow.scale, paged: true, scale: grow.scale, window: pager.window, waits: offset,
        });
        intents.push({ kind: 'wait', values: existing.values, box, offset, scale: grow.scale, created: false });
      } else {
        const values = tools.values({ from: box, box, p: 1, dx: offset, op: 0, sc: grow.scale, hand: 1 });
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
  // When the enlargement ends or moves, a drag it cancelled may have left the slot's piece
  // off-centre; it comes home unless its own entry already takes it there.
  const left = model.focus !== null && model.focus !== focusedSlot
    ? byKey.get(`${model.focus}|${garments[model.focus]}`) : undefined;
  if (left?.role === 'current' && !intents.some((intent) => intent.values === left.values
    && (intent.kind === 'enter' || intent.kind === 'promote'))) {
    moved = true;
    intents.push({ kind: 'home', values: left.values });
  }
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
    focus: focusedSlot,
  };
}
