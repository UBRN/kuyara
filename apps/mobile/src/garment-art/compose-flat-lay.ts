import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { spacing } from '@/theme/theme';

import {
  composeGarmentBoard,
  todayPreset,
  type BoardPiece,
  type DrawnExtent,
} from './compose-garment-board';

// Today's primary stage and its tiles lay the outfit out as a flat lay (garment-board.md
// section 10): the worn board's pieces, at the worn board's sizes, side by side and crossing as
// they would on a table. Every other board keeps the worn board.
export const flatLayPreset = {
  // The most of a piece's drawn box the pieces in front of it may cover.
  cover: 0.30,
  // Where each crossing ends. The bottom beside the top: its left edge `overlap` of its width
  // under the top's right edge, its waist `drop` of the top's height down.
  bottom: { overlap: 0.26, drop: 0.52 },
  // The layers fanned out to the top's left: each `tuck` of its width under the left edge of
  // the piece to its right (the top, or the mid layer for the outer layer), its collar `drop` ×
  // the core metric under the top's.
  layers: { tuck: 0.30, drop: 0.08 },
  // The pair beside the lowest hem: `tuck` of its width over the hem's edge, standing `rise` of
  // its height above the hem.
  foot: { tuck: 0.30, rise: 0.90 },
  // Each crossing is tried at whole steps of 1/`steps`, from full to none.
  steps: 20,
  // The stage's margins in points: off each side, and the vertical margin in all. The band
  // reaches both screen edges; a tile keeps the spacing ladder's, which hold the piece shadow.
  band: { side: 24, vertical: 52 },
  tile: { side: spacing.md, vertical: 2 * spacing.lg },
  // The core's widest piece at most, in points.
  coreWidth: 168,
} as const;

// Back to front: the layers lie under the outfit, the top over the bottom's waist and the
// footwear over every hem.
export const flatLayStack: readonly OutfitSlot[] = [
  'outer_layer', 'mid_layer', 'bottom', 'primary_top', 'one_piece', 'footwear',
];

type Outline = Readonly<{ outline: string }>;
type FlatPiece = Readonly<{
  slot: OutfitSlot;
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  groups: readonly Outline[];
}>;
type Box = { x: number; y: number; w: number; h: number };

// A drawing's outline, sampled: lines at their ends, curves at 16 steps.
function outlinePoints(groups: readonly Outline[]) {
  const points: (readonly [number, number])[] = [];
  for (const { outline } of groups) {
    const tokens = outline.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) ?? [];
    let index = 0;
    let cursor: readonly [number, number] = [0, 0];
    let start = cursor;
    const point = () => [Number(tokens[index++]), Number(tokens[index++])] as const;
    while (index < tokens.length) {
      const command = tokens[index++];
      if (command === 'M' || command === 'L') {
        cursor = point();
        if (command === 'M') start = cursor;
        points.push(cursor);
      } else if (command === 'Q' || command === 'C') {
        const from = cursor;
        const control = point();
        const control2 = command === 'C' ? point() : null;
        const end = point();
        for (let step = 1; step <= 16; step++) {
          const t = step / 16;
          const u = 1 - t;
          const at = (axis: 0 | 1) => control2
            ? u ** 3 * from[axis] + 3 * u ** 2 * t * control[axis] + 3 * u * t ** 2 * control2[axis] + t ** 3 * end[axis]
            : u ** 2 * from[axis] + 2 * u * t * control[axis] + t ** 2 * end[axis];
          points.push([at(0), at(1)]);
        }
        cursor = end;
      } else if (command === 'Z') {
        cursor = start;
      }
    }
  }
  return points;
}

export type StructurePoint = Readonly<{ kind: 'collar' | 'waist' | 'sleeve'; x: number; y: number }>;

/**
 * Where a drawing keeps its collar, waist and sleeves, in its own units: the collar is the
 * top of the outline at the drawing's centre, the waist the top of a bottom's waistband, and
 * each sleeve ends at the lowest point of the outline in the outer 10% of the drawing's width
 * (a one-piece's in its upper half, never its hem). Footwear stands in front of every piece,
 * so its sole is never covered.
 */
export function structurePoints(piece: FlatPiece): readonly StructurePoint[] {
  if (piece.slot === 'footwear') return [];
  const known = structure.get(piece.groups)?.get(piece.slot);
  if (known) return known;
  const found = findStructure(piece);
  structure.set(piece.groups, new Map(structure.get(piece.groups)).set(piece.slot, found));
  return found;
}

// Found once per drawing and slot.
const structure = new WeakMap<readonly Outline[], ReadonlyMap<OutfitSlot, readonly StructurePoint[]>>();
function findStructure(piece: FlatPiece): readonly StructurePoint[] {
  const { bounds } = piece;
  const points = outlinePoints(piece.groups);
  const centre = bounds.x + bounds.width / 2;
  const topOf = (list: readonly (readonly [number, number])[]) => list.reduce((a, b) => (b[1] < a[1] ? b : a));
  const lowOf = (list: readonly (readonly [number, number])[]) => list.reduce((a, b) => (b[1] > a[1] ? b : a));
  const [cx, cy] = topOf(points.filter(([x]) => Math.abs(x - centre) <= 0.1 * bounds.width));
  if (piece.slot === 'bottom') return [{ kind: 'waist', x: cx, y: cy }];
  const reach = piece.slot === 'one_piece' ? bounds.y + bounds.height / 2 : Infinity;
  const sleeve = (inBand: (x: number) => boolean): StructurePoint => {
    const [x, y] = lowOf(points.filter(([px, py]) => inBand(px) && py <= reach));
    return { kind: 'sleeve', x, y };
  };
  return [
    { kind: 'collar', x: cx, y: cy },
    sleeve((x) => x <= bounds.x + 0.10 * bounds.width),
    sleeve((x) => x >= bounds.x + 0.90 * bounds.width),
  ];
}

const clipped = (a: Box, b: Box): Box | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
};

/** The area of a union of boxes, by vertical strips between their edges. */
function unionArea(boxes: readonly Box[]) {
  const xs = [...new Set(boxes.flatMap((box) => [box.x, box.x + box.w]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const middle = (xs[i] + xs[i + 1]) / 2;
    const spans = boxes.filter((box) => box.x < middle && box.x + box.w > middle)
      .map((box) => [box.y, box.y + box.h]).sort((a, b) => a[0] - b[0]);
    let length = 0;
    let run: number[] | null = null;
    for (const span of spans) {
      if (run && span[0] <= run[1]) run[1] = Math.max(run[1], span[1]);
      else {
        if (run) length += run[1] - run[0];
        run = [...span];
      }
    }
    if (run) length += run[1] - run[0];
    area += length * (xs[i + 1] - xs[i]);
  }
  return area;
}

/** Whether no piece covers more than the cover limit of a piece behind it, or any structure point. */
function withinLimits(entries: readonly (readonly [FlatPiece & { single?: unknown }, Box])[]) {
  const list = [...entries].sort((a, b) => flatLayStack.indexOf(a[0].slot) - flatLayStack.indexOf(b[0].slot));
  return list.every(([piece, box], index) => {
    const front = list.slice(index + 1).map(([, other]) => other);
    const covered = unionArea(front.flatMap((other) => clipped(other, box) ?? []));
    if (covered > flatLayPreset.cover * box.w * box.h) return false;
    if (piece.single) return true;
    const k = box.w / piece.bounds.width;
    return structurePoints(piece).every(({ x, y }) => {
      const px = box.x + (x - piece.bounds.x) * k;
      const py = box.y + (y - piece.bounds.y) * k;
      return !front.some((other) => px > other.x && px < other.x + other.w && py > other.y && py < other.y + other.h);
    });
  });
}

/**
 * Today's flat lay: the worn board's pieces side by side. Each crossing (the bottom beside the
 * top, each layer under the left edge of the piece to its right, the pair over the lowest hem)
 * moves its piece from where it stands apart toward where the crossing ends, as far as the
 * cover limit and the structure points allow. The layers stand apart in a row to the top's
 * left, the worn board's clearance between them, every other piece where the worn board puts
 * it, touching nothing, so a crossing always exists.
 */
export function composeFlatLay<Piece extends FlatPiece>(pieces: readonly Piece[], rule = todayPreset) {
  const worn = composeGarmentBoard(pieces, rule);
  const top = worn.boxes.get(worn.core[0])!;
  const { bottom, layers, foot } = flatLayPreset;
  // The layers from the top outward, each to the left of the piece before it, so the board reads
  // outside in from left to right: the outer layer, the mid layer, the top.
  const fan = ['mid_layer', 'outer_layer'] as const;
  const gap = rule.clearance.side * Math.min(...worn.core.map((piece) => worn.boxes.get(piece)!.w));

  // Each crossing holds the limits against the pieces already crossed. A crossing that stops at
  // none leaves its piece where it stood apart, which a piece crossed before may now cover; then
  // the outfit is laid again with every crossing also holding the limits against the pieces
  // still standing apart, so stopping at none touches nothing it covers.
  const layOut = (strict: boolean) => {
    const entries = [...worn.boxes].map(([piece, box]) => [piece, { ...box }] as [BoardPiece<Piece>, Box]);
    const find = (slot: OutfitSlot) => entries.find(([piece]) => piece.slot === slot);
    const placed = [find(worn.core[0].slot)!];
    let left = top.x;
    for (const slot of fan) {
      const box = find(slot)?.[1];
      if (!box) continue;
      [box.x, box.y] = [left - gap - box.w, top.y + layers.drop * worn.metric];
      left = box.x;
    }

    const cross = (slot: OutfitSlot, to: (box: Box) => readonly [number, number]) => {
      const moving = find(slot);
      if (!moving) return;
      const [, box] = moving;
      const [dx, dy] = to(box);
      const from = { x: box.x, y: box.y };
      const others = (strict ? entries : placed).filter((entry) => entry !== moving);
      for (let step: number = flatLayPreset.steps; step >= 0; step--) {
        const t = step / flatLayPreset.steps;
        box.x = from.x + t * dx;
        box.y = from.y + t * dy;
        if (step === 0 || withinLimits([...others, moving])) break;
      }
      placed.push(moving);
    };

    cross('bottom', (box) => [top.x + top.w - bottom.overlap * box.w - box.x, top.y + bottom.drop * top.h - box.y]);
    let right = top;
    for (const slot of fan) {
      cross(slot, (box) => [right.x - (1 - layers.tuck) * box.w - box.x, 0]);
      right = find(slot)?.[1] ?? right;
    }
    // The pair stands over the lowest hem: on the bottom's left, or on a one-piece's right.
    const low = find('bottom')?.[1] ?? top;
    cross('footwear', (box) => [
      (low === top ? low.x + low.w - foot.tuck * box.w : low.x - (1 - foot.tuck) * box.w) - box.x,
      low.y + low.h - foot.rise * box.h - box.y,
    ]);
    return entries;
  };
  const free = layOut(false);
  const entries = withinLimits(free) ? free : layOut(true);

  const boxes = new Map(entries);
  return {
    ...worn,
    boxes,
    stack: flatLayStack.flatMap((slot) => entries.filter(([piece]) => piece.slot === slot).map(([piece]) => piece)),
  };
}

/**
 * Today's band, or one of its tiles: the flat lay trimmed to its drawn extent and
 * scaled once, uniformly, so it keeps `side` points off each edge and half of
 * `vertical` above and below, and its core's widest piece is never wider than `coreCap`
 * points. The stage is the fitted composition plus `vertical`, within ADR 0025's clamp, so an
 * Easier to see composition still fits. `coreWidth` is the core's widest piece in composition
 * units.
 */
export function fitTodayStage(
  extent: DrawnExtent,
  width: number,
  coreWidth: number,
  coreCap: number,
  { side, vertical }: Readonly<{ side: number; vertical: number }> = flatLayPreset.band,
) {
  const max = todayPreset.stageMax * width;
  const scale = Math.max(0, Math.min((width - 2 * side) / extent.w, (max - vertical) / extent.h, coreCap / coreWidth));
  const height = Math.min(max, Math.max(todayPreset.stageMin * width, extent.h * scale + vertical));
  return { scale, height };
}
