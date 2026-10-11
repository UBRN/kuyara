// The geometry of the worn moment's celebration (ADR 0020, "A moment"): where each small
// garment shape is thrown and the path the stitch runs. Pure, so the scatter is the same for a
// day on every run and testable without a renderer.

export const celebrationShapes = ['button', 'tee', 'hanger', 'spool'] as const;
export type CelebrationShape = (typeof celebrationShapes)[number];

/**
 * One thrown shape. `angle` is radians from straight up, within 60 degrees either way; `rise`,
 * `size`, `spin` and `color` are unit values the renderer scales to its plate and palette.
 */
export type CelebrationPiece = Readonly<{
  shape: CelebrationShape;
  angle: number;
  rise: number;
  size: number;
  spin: number;
  color: number;
}>;

const MIN_PIECES = 18;
const MAX_PIECES = 24;
const SPREAD = Math.PI / 3;

// FNV-1a: a day key becomes the seed, so each day scatters its own way.
function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619) >>> 0;
  }
  return value;
}

function seeded(seed: string): () => number {
  let state = (hash(seed) % 2147483646) + 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function celebrationScatter(seed: string): readonly CelebrationPiece[] {
  const random = seeded(seed);
  const count = MIN_PIECES + Math.floor(random() * (MAX_PIECES - MIN_PIECES + 1));
  return Array.from({ length: count }, () => ({
    shape: celebrationShapes[Math.floor(random() * celebrationShapes.length)],
    angle: (random() * 2 - 1) * SPREAD,
    rise: random(),
    size: random(),
    spin: random() * 2 - 1,
    color: random(),
  }));
}

/** A straight run or a quarter turn of the stitch, clockwise; `a0` is an arc's start angle. */
export type StitchSegment = Readonly<{
  arc: boolean; x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; a0: number; length: number;
}>;

/**
 * The stitch's path inside a `width` by `height` plate, `inset` from its edge and rounded by
 * `radius`: it starts where the top edge leaves the top-left corner and runs clockwise.
 */
export function stitchSegments(width: number, height: number, inset: number, radius: number): readonly StitchSegment[] {
  const [left, top, right, bottom] = [inset, inset, width - inset, height - inset];
  const line = (x0: number, y0: number, x1: number, y1: number): StitchSegment => ({
    arc: false, x0, y0, x1, y1, cx: 0, cy: 0, a0: 0, length: Math.hypot(x1 - x0, y1 - y0),
  });
  const arc = (cx: number, cy: number, a0: number): StitchSegment => ({
    arc: true, x0: cx + radius * Math.cos(a0), y0: cy + radius * Math.sin(a0),
    x1: cx + radius * Math.cos(a0 + Math.PI / 2), y1: cy + radius * Math.sin(a0 + Math.PI / 2),
    cx, cy, a0, length: (Math.PI / 2) * radius,
  });
  return [
    line(left + radius, top, right - radius, top),
    arc(right - radius, top + radius, -Math.PI / 2),
    line(right, top + radius, right, bottom - radius),
    arc(right - radius, bottom - radius, 0),
    line(right - radius, bottom, left + radius, bottom),
    arc(left + radius, bottom - radius, Math.PI / 2),
    line(left, bottom - radius, left, top + radius),
    arc(left + radius, top + radius, Math.PI),
  ];
}

/**
 * The SVG path of the first `drawn` points of the stitch: whole segments, then the part of the
 * one it is in. A worklet, so the stitch draws on the UI thread.
 */
export function stitchPath(segments: readonly StitchSegment[], drawn: number, radius: number): string {
  'worklet';
  let path = `M ${segments[0].x0} ${segments[0].y0}`;
  let left = drawn;
  for (const segment of segments) {
    if (left <= 0) break;
    const share = Math.min(1, left / segment.length);
    left -= segment.length;
    if (segment.arc) {
      const angle = segment.a0 + (Math.PI / 2) * share;
      path += ` A ${radius} ${radius} 0 0 1 ${segment.cx + radius * Math.cos(angle)} ${segment.cy + radius * Math.sin(angle)}`;
    } else {
      path += ` L ${segment.x0 + (segment.x1 - segment.x0) * share} ${segment.y0 + (segment.y1 - segment.y0) * share}`;
    }
  }
  return path;
}
