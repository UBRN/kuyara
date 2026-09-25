import type { ColorFamily, GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';

import { categoryGlyphIds, resolveGarmentSilhouette } from './garment-silhouette-map';
import { silhouettes, type Silhouette } from './silhouettes';

// O9, the open rack on Profile (ADR 0028 section 1): an approved visual metaphor, drawn in
// one fixed 361 x 240 frame and scaled to the content column. Each catalogue category has
// its own zone, so the six category cells under it read as its legend: accessories hang
// from the hooks under the top bar, outerwear, one-piece and tops share the upper rail,
// bottoms hang from clip hangers on the lower rail, and shoes stand on the bottom shelf.
// This module is the fill rule only, in frame units and without colour, so it can be tested
// without a renderer; `closet-rack.tsx` paints it.
export const RACK_WIDTH = 361;
export const RACK_HEIGHT = 240;

export type RackPiece = Readonly<{
  id: string;
  garmentTypeId: GarmentTypeId | null;
  category: StructuralCategory;
  colorFamily: ColorFamily | null;
  wanted: boolean;
  /** Milliseconds since the epoch; the newest owned pieces face out. */
  addedAt: number;
}>;

/** A piece with the OKLCH lightness of its fill, 0 dark to 1 light, for the tidy colour run. */
export type RackLayoutPiece = RackPiece & Readonly<{ lightness: number }>;

export type RackGarment = Readonly<{
  kind: 'garment';
  piece: RackLayoutPiece;
  silhouette: Silhouette;
  /** The drawing's transform: translate(x y) scale(scale), in frame units. */
  x: number;
  y: number;
  scale: number;
  /** The ink edge in frame units; a small drawing thins it, as the board does below 40. */
  outline: number;
}>;

export type RackHanger = Readonly<{
  kind: 'hanger';
  d: string;
  /** A clip hanger's two jaws, filled in ink. */
  jaws: readonly Readonly<{ x: number; y: number }>[];
  /** An empty hanger waits in the secondary ink; a carrying one is drawn in the main ink. */
  empty: boolean;
}>;

export type RackSlice = Readonly<{
  kind: 'slice';
  piece: RackLayoutPiece;
  hook: string;
  body: string;
  shade: string;
}>;

export type RackMark = RackGarment | RackHanger | RackSlice;

/** "+N" hangs at a zone's end once it holds more pieces than fit; drawn as text by the view. */
export type RackOverflowTag = Readonly<{
  count: number;
  /** Right edge in frame units. */
  right: number;
  /** Top edge in frame units, or bottom edge when `fromBottom`. */
  y: number;
  fromBottom: boolean;
}>;

export type RackLayout = Readonly<{ marks: readonly RackMark[]; tags: readonly RackOverflowTag[] }>;

export const RACK_HOOKS: readonly Readonly<{ x: number; y: number }>[] = Array.from(
  { length: 8 },
  (_, index) => ({ x: 32 + index * 42.4, y: 15 }),
);
export const RACK_UPPER_RAIL_Y = 52;
export const RACK_LOWER_RAIL_Y = 134;
export const RACK_SHELF_Y = 220;

type RailZone = Readonly<{ x0: number; x1: number; ry: number; box: number; clip: boolean; maxLength: number }>;

const UPPER: RailZone = { x0: 20, x1: 342, ry: RACK_UPPER_RAIL_Y, box: 80, clip: false, maxLength: 72 };
const LOWER: RailZone = { x0: 20, x1: 342, ry: RACK_LOWER_RAIL_Y, box: 62, clip: true, maxLength: 50 };
const FLOOR = { x0: 22, x1: 340, y: 219.5, box: 38 } as const;
const HOOK_BOX = 30;

const UPPER_CATEGORIES: readonly StructuralCategory[] = ['outerwear', 'one_piece', 'top'];
// Long pieces hang together: coats, then dresses, then tops.
const GROUP_ORDER: Readonly<Record<StructuralCategory, number>> = {
  outerwear: 0, one_piece: 1, top: 2, bottom: 0, footwear: 0, accessory: 0,
};
// A side-on piece is as long as the garment; the zone's own cap keeps it off the next zone.
const SLICE_LENGTH: Readonly<Partial<Record<StructuralCategory, number>>> = {
  outerwear: 72, one_piece: 78, top: 50, bottom: 54,
};
const SLICE_WIDTH = 8.5;
const SLICE_STEP_MAX = 8;
const SLICE_STEP_MIN = 4.8;
const MAX_FACE_OUT = 3;
// Room kept at a zone's end for its "+N" tag.
const TAG_ROOM = 34;

const f = (n: number) => Math.round(n * 100) / 100;

export function rackSilhouette(piece: Pick<RackPiece, 'garmentTypeId' | 'category'>): Silhouette {
  return piece.garmentTypeId
    ? resolveGarmentSilhouette(piece.garmentTypeId, piece.category)
    : silhouettes[categoryGlyphIds[piece.category]];
}

// Owned pieces grouped by category and run dark to light, so a full rail reads as a colour
// gradient; wanted pieces hang at the end of their zone.
function tidy(pieces: readonly RackLayoutPiece[]): RackLayoutPiece[] {
  const order = (a: RackLayoutPiece, b: RackLayoutPiece) =>
    GROUP_ORDER[a.category] - GROUP_ORDER[b.category] || a.lightness - b.lightness;
  return [
    ...pieces.filter((piece) => !piece.wanted).sort(order),
    ...pieces.filter((piece) => piece.wanted).sort(order),
  ];
}

function newestFirst(pieces: readonly RackLayoutPiece[]): RackLayoutPiece[] {
  return [...pieces].sort((a, b) => b.addedAt - a.addedAt);
}

/** One drawing in a box of `box` frame units, centred on `cx`, its drawn top (or bottom) at `y`. */
function garment(piece: RackLayoutPiece, box: number, cx: number, y: number, fromBottom = false): RackGarment {
  const silhouette = rackSilhouette(piece);
  const { bounds } = silhouette;
  const scale = box / 64;
  return {
    kind: 'garment',
    piece,
    silhouette,
    x: f(cx - (bounds.x + bounds.width / 2) * scale),
    y: f(fromBottom ? y - (bounds.y + bounds.height) * scale : y - bounds.y * scale),
    scale,
    outline: box < 40 ? 1.35 : 1.9,
  };
}

function hanger(cx: number, ry: number, halfWidth: number, clip: boolean, empty: boolean): RackHanger {
  const hook = `M${f(cx - 2.6)} ${f(ry - 1)} Q${f(cx - 2.8)} ${f(ry - 5.4)} ${f(cx)} ${f(ry - 5.2)} `
    + `Q${f(cx + 2.8)} ${f(ry - 5)} ${f(cx + 2.4)} ${f(ry - 2.2)} L${f(cx)} ${f(ry + 2.4)}`;
  const body = clip
    ? ` M${f(cx - halfWidth)} ${f(ry + 4.4)} L${f(cx + halfWidth)} ${f(ry + 4.4)} M${f(cx)} ${f(ry + 2.4)} L${f(cx)} ${f(ry + 4.4)}`
    : ` L${f(cx - halfWidth)} ${f(ry + 8.6)} L${f(cx + halfWidth)} ${f(ry + 8.6)} Z`;
  return {
    kind: 'hanger',
    d: hook + body,
    jaws: clip ? [{ x: f(cx - halfWidth - 1), y: f(ry + 3.4) }, { x: f(cx + halfWidth - 2), y: f(ry + 3.4) }] : [],
    empty,
  };
}

// A piece seen side-on: a hook and a slice as long as the garment, in its own colour.
function slice(piece: RackLayoutPiece, x: number, ry: number, length: number, clip: boolean): RackSlice {
  const w = SLICE_WIDTH;
  const top = ry + (clip ? 6.5 : 3.2);
  const r = 2.6;
  const end = top + length;
  const body = clip
    ? `M${f(x)} ${f(top)} L${f(x + w)} ${f(top)} L${f(x + w)} ${f(end - r)} Q${f(x + w)} ${f(end)} ${f(x + w - r)} ${f(end)} `
      + `L${f(x + r)} ${f(end)} Q${f(x)} ${f(end)} ${f(x)} ${f(end - r)} Z`
    : `M${f(x + 2.2)} ${f(top)} Q${f(x + w / 2)} ${f(top - 1.4)} ${f(x + w - 2.2)} ${f(top)} L${f(x + w)} ${f(top + 5)} `
      + `L${f(x + w)} ${f(end - r)} Q${f(x + w)} ${f(end)} ${f(x + w - r)} ${f(end)} L${f(x + r)} ${f(end)} `
      + `Q${f(x)} ${f(end)} ${f(x)} ${f(end - r)} L${f(x)} ${f(top + 5)} Z`;
  const cx = x + w / 2;
  return {
    kind: 'slice',
    piece,
    hook: `M${f(cx)} ${f(ry - 4.4)} Q${f(cx + 2.6)} ${f(ry - 4.2)} ${f(cx + 2)} ${f(ry - 1.6)} M${f(cx)} ${f(ry - 4.4)} L${f(cx)} ${f(top)}`,
    body,
    shade: `M${f(x + w - 3)} ${f(top + 1)} L${f(x + w - 0.5)} ${f(top + 4)} L${f(x + w - 0.5)} ${f(end - 2)} L${f(x + w - 3)} ${f(end - 0.5)} Z`,
  };
}

function faceOut(piece: RackLayoutPiece, zone: RailZone, cx: number): RackMark[] {
  const drawn = garment(piece, zone.box, cx, zone.ry + (zone.clip ? 6.8 : 5.4));
  const drawnWidth = drawn.silhouette.bounds.width * drawn.scale;
  return [hanger(cx, zone.ry, Math.min(drawnWidth * 0.36, 13), zone.clip, false), drawn];
}

function rail(pieces: readonly RackLayoutPiece[], zone: RailZone): Readonly<{ marks: RackMark[]; tag: RackOverflowTag | null }> {
  const { box, clip, ry, x0, x1 } = zone;
  const width = x1 - x0;
  const count = pieces.length;
  const marks: RackMark[] = [];

  // Empty: bare hangers wait on the rail.
  if (count === 0) {
    for (let index = 0; index < (clip ? 2 : 3); index += 1) {
      marks.push(hanger(x0 + 16 + index * 28, ry, clip ? 9 : 12, clip, true));
    }
    return { marks, tag: null };
  }

  const order = tidy(pieces);
  const spreadStep = box * 0.8;
  // Sparse: every piece hangs face-out, side by side, and up to two empty hangers wait after it.
  if ((count - 1) * spreadStep + box * 0.9 <= width) {
    order.forEach((piece, index) => marks.push(...faceOut(piece, zone, x0 + box * 0.5 + index * spreadStep)));
    const used = (count - 1) * spreadStep + box * 0.9;
    const room = Math.floor((width - used - 8) / 26);
    for (let index = 0; index < Math.min(2, room); index += 1) {
      marks.push(hanger(x0 + used + 18 + index * 26, ry, clip ? 8 : 11, clip, true));
    }
    return { marks, tag: null };
  }

  // Dense: the newest owned pieces face out, up to three, as many as leave room; every other
  // piece hangs side-on as a slice in its own colour.
  const owned = newestFirst(pieces.filter((piece) => !piece.wanted));
  let faces = Math.min(MAX_FACE_OUT, Math.max(1, owned.length));
  while (faces > 1 && (faces - 1) * spreadStep + box * 0.9 + 6 + (count - faces) * SLICE_STEP_MAX > width) {
    faces -= 1;
  }
  const facing = (owned.length > 0 ? owned : newestFirst(pieces)).slice(0, faces);
  const rest = order.filter((piece) => !facing.includes(piece));
  const faceWidth = (faces - 1) * spreadStep + box * 0.9;
  const available = width - faceWidth - 6;
  let step = Math.min(SLICE_STEP_MAX, (available - SLICE_WIDTH) / Math.max(1, rest.length - 1));
  let visible = rest.length;
  if (step < SLICE_STEP_MIN) {
    step = SLICE_STEP_MIN;
    visible = Math.floor((available - SLICE_WIDTH - TAG_ROOM) / step) + 1;
  }
  rest.slice(0, visible).forEach((piece, index) => {
    const length = Math.min(zone.maxLength, clip ? SLICE_LENGTH.bottom ?? 54 : SLICE_LENGTH[piece.category] ?? 50);
    marks.push(slice(piece, x0 + faceWidth + 6 + index * step, ry, length, clip));
  });
  // The first face is drawn last, so it sits in front.
  for (let index = faces - 1; index >= 0; index -= 1) {
    marks.push(...faceOut(facing[index], zone, x0 + box / 2 + index * spreadStep));
  }
  const hidden = rest.length - visible;
  return { marks, tag: hidden > 0 ? { count: hidden, right: x1 - 2, y: ry + 12, fromBottom: false } : null };
}

function floor(pieces: readonly RackLayoutPiece[]): Readonly<{ marks: RackMark[]; tag: RackOverflowTag | null }> {
  const { box, x0, x1, y } = FLOOR;
  const width = x1 - x0;
  if (pieces.length === 0) return { marks: [], tag: null };
  const order = tidy(pieces);
  let step = Math.min(box * 1.02, (width - box) / Math.max(1, order.length - 1));
  let visible = order.length;
  if (step < box * 0.5) {
    step = box * 0.5;
    visible = Math.floor((width - box - TAG_ROOM) / step) + 1;
  }
  const marks = order.slice(0, visible).map((piece, index) => garment(piece, box, x0 + box / 2 + index * step, y, true));
  const hidden = order.length - visible;
  return { marks, tag: hidden > 0 ? { count: hidden, right: x1 - 2, y: y - 2, fromBottom: true } : null };
}

// Accessories hang one per hook; the last hook carries "+N" when they overflow.
function hooks(pieces: readonly RackLayoutPiece[]): Readonly<{ marks: RackMark[]; tag: RackOverflowTag | null }> {
  const order = tidy(pieces);
  const capacity = RACK_HOOKS.length;
  const overflow = order.length > capacity;
  const shown = overflow ? order.slice(0, capacity - 1) : order;
  const marks = shown.map((piece, index) => garment(piece, HOOK_BOX, RACK_HOOKS[index].x, RACK_HOOKS[index].y + 1.2));
  const last = RACK_HOOKS[capacity - 1];
  return {
    marks,
    tag: overflow ? { count: order.length - shown.length, right: last.x + 14, y: last.y + 6, fromBottom: false } : null,
  };
}

/**
 * Where every piece hangs. `null` is the bare rack (loading, error): hooks and rails only,
 * with no hangers. An empty list is the empty Closet: bare hangers wait on both rails.
 */
export function layoutClosetRack(pieces: readonly RackLayoutPiece[] | null): RackLayout {
  if (pieces === null) return { marks: [], tags: [] };
  const zones = [
    hooks(pieces.filter((piece) => piece.category === 'accessory')),
    rail(pieces.filter((piece) => UPPER_CATEGORIES.includes(piece.category)), UPPER),
    rail(pieces.filter((piece) => piece.category === 'bottom'), LOWER),
    floor(pieces.filter((piece) => piece.category === 'footwear')),
  ];
  return {
    marks: zones.flatMap((zone) => zone.marks),
    tags: zones.flatMap((zone) => (zone.tag ? [zone.tag] : [])),
  };
}
