import { garmentPaletteContrast, type GarmentRoles } from './garment-palette';
import type { Silhouette, SilhouetteGroup } from './silhouettes';

// One drawing as plain data: the element tree `garment-painting.tsx` hands to the vector
// library, and the one an offline renderer serialises, so both draw exactly the same art.

export type GarmentLevelOfDetail = 'full' | 'caption';

// A drawing whose longer side is drawn below 32 points (the 16-point caption) keeps its
// fills, shade planes and construction lines and drops tone lines, stitches, zips, hardware
// and the cloth's weave, which would only speckle at that size.
const CAPTION_BELOW = 32;

export function garmentLevelOfDetail(drawnSize: number): GarmentLevelOfDetail {
  return drawnSize < CAPTION_BELOW ? 'caption' : 'full';
}

// Stroke weights in points, whatever the drawing's scale: the board outline, then the
// construction, tone, stitch and zip lines inside it. A caption scales its outline (M21) and
// draws construction at 0.55 of it.
export const GARMENT_OUTLINE = 1.9;
const CONSTRUCTION = 1.1;
const TONE = 0.9;
const STITCH = 0.8;
const ZIP = CONSTRUCTION * 1.25;
const STITCH_DASH = [1.8, 1.5] as const;
// The wanted edge (O9), in points: long enough to read as a line at tile size, short enough
// to read as dashed on a rack piece.
export const WANTED_OUTLINE_DASH = [3.2, 2.4] as const;
const CAPTION_CONSTRUCTION = 0.55;
// Non-text contrast (WCAG 1.4.11): an ink construction line under 3:1 on its fill switches
// to the piece's own tone line.
const CONSTRUCTION_CONTRAST = 3;

const partFill = {
  fs: 'shade', fl: 'light', fk: 'darkTrim', fa: 'material', fas: 'materialShade', fm: 'main', fh: 'hardware',
} as const satisfies Record<string, keyof GarmentRoles>;
const detailOnly = new Set(['T', 'Ta', 'S', 'Sh', 'Sa', 'Dh', 'fh', 'L']);

export type PaintTag = 'G' | 'Defs' | 'ClipPath' | 'Path' | 'Rect' | 'LinearGradient' | 'Stop';
export type PaintAttrs = Readonly<Record<string, string | number | readonly number[]>>;
export type PaintNode = Readonly<{ tag: PaintTag; attrs: PaintAttrs; children?: readonly PaintNode[] }>;

export type GarmentPaintInput = Readonly<{
  silhouette: Silhouette;
  roles: GarmentRoles;
  ink: string;
  /** Points per drawing unit, so every stroke keeps its weight in points. */
  scale: number;
  lod: GarmentLevelOfDetail;
  /** The outline weight in points; the board's 1.9 unless a caption scales it. */
  outline?: number;
  /** `fill` draws everything but the ink edge and `outline` only the edge. */
  layer?: 'all' | 'fill' | 'outline';
  /** A paint server for the main fill (the Closet's multicolour gradient or a pattern). */
  mainPaint?: string;
  /** Dash and gap of the ink edge in points (a wanted Closet piece, O9). */
  outlineDash?: readonly [number, number];
  /** A document-unique prefix for the drawing's clip paths and gradients. */
  uid: string;
}>;

const node = (tag: PaintTag, attrs: PaintAttrs, children?: readonly PaintNode[]): PaintNode =>
  children === undefined ? { tag, attrs } : { tag, attrs, children };

/** The element tree of one drawing, in drawing units inside whatever transform the caller sets. */
export function paintGarment({
  silhouette,
  roles,
  ink,
  scale,
  lod,
  outline = GARMENT_OUTLINE,
  layer = 'all',
  mainPaint,
  outlineDash,
  uid,
}: GarmentPaintInput): PaintNode {
  const caption = lod === 'caption';
  const unit = 1 / scale;
  const line = (stroke: string, width: number, dashed = false): PaintAttrs => ({
    fill: 'none',
    stroke,
    strokeWidth: width * unit,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ...(dashed ? { strokeDasharray: STITCH_DASH.map((dash) => dash * unit) } : {}),
  });
  const construction = caption ? outline * CAPTION_CONSTRUCTION : CONSTRUCTION;
  const paintOf = (role: keyof GarmentRoles) => (role === 'main' && mainPaint ? mainPaint : roles[role]);

  const part = (group: SilhouetteGroup, kind: string, d: string): PaintNode | null => {
    if (caption && detailOnly.has(kind)) return null;
    if (kind in partFill) return node('Path', { d, fill: paintOf(partFill[kind as keyof typeof partFill]) });
    switch (kind) {
      case 'D': {
        const fill = roles[group.fill];
        const stroke = garmentPaletteContrast(ink, fill) >= CONSTRUCTION_CONTRAST ? ink : roles.toneLine;
        return node('Path', { d, ...line(stroke, construction) });
      }
      case 'Dh': return node('Path', { d, ...line(roles.hardware, ZIP) });
      case 'T': return node('Path', { d, ...line(roles.toneLine, TONE) });
      case 'L': return node('Path', { d, ...line(roles.highlight, TONE) });
      case 'Ta': return node('Path', { d, ...line(roles.materialTone, TONE) });
      case 'S': return node('Path', { d, ...line(roles.toneLine, STITCH, true) });
      case 'Sh': return node('Path', { d, ...line(roles.hardware, STITCH, true) });
      default: return node('Path', { d, ...line(roles.materialTone, STITCH, true) });
    }
  };

  // Light falls from the upper left across the whole drawing, so one garment has one light:
  // each plain-coloured surface is repainted with a gradient between its own light and shade
  // tones, and a glossy cloth carries a highlight band. A pattern or the multicolour fill
  // keeps its own paint.
  const litRoles = (['main', 'material'] as const).filter((role) => silhouette.groups.some(
    (group) => group.fill === role && !(role === 'main' && mainPaint)));
  const lit = (group: SilhouetteGroup) => litRoles.includes(group.fill as 'main' | 'material');
  const clipped = (index: number) => silhouette.groups[index].parts.length > 0 || lit(silhouette.groups[index]);
  const fills = layer !== 'outline';
  const sheen = silhouette.cloth === 'sheen';
  const lightOf = (role: 'main' | 'material') => {
    const stops = (role === 'material'
      ? [[0, roles.material], [1, roles.materialShade]]
      : sheen
        ? [[0, roles.main], [0.2, roles.highlight], [0.36, roles.main], [0.75, roles.shade], [1, roles.deep]]
        : [[0, roles.highlight], [0.35, roles.light], [0.65, roles.main], [1, roles.deep]]
    ).map(([offset, color]) => node('Stop', { offset, stopColor: color }));
    return node('LinearGradient', { id: `${uid}-lit-${role}`, x1: '12%', y1: '0%', x2: '88%', y2: '100%' }, stops);
  };
  const { bounds } = silhouette;
  const weave = !caption && silhouette.cloth !== undefined ? clothWeave(silhouette) : null;
  const defs = fills
    ? [
      ...litRoles.map(lightOf),
      ...silhouette.groups.flatMap((group, index) => (clipped(index)
        ? [node('ClipPath', { id: `${uid}-${index}` }, [node('Path', { d: group.outline })])]
        : [])),
    ]
    : [];

  const children: PaintNode[] = defs.length > 0 ? [node('Defs', {}, defs)] : [];
  silhouette.groups.forEach((group, index) => {
    const layers: PaintNode[] = [];
    if (fills) layers.push(node('Path', { d: group.outline, fill: paintOf(group.fill) }));
    if (fills && clipped(index)) {
      const surface: PaintNode[] = [];
      if (lit(group)) {
        surface.push(node('Rect', { ...bounds, fill: `url(#${uid}-lit-${group.fill})` }));
        if (weave !== null && group.fill === 'main') {
          surface.push(node('Path', {
            d: weave.d,
            ...line(roles[weave.role], weave.width),
            ...(weave.dash ? { strokeDasharray: weave.dash } : {}),
          }));
        }
      }
      const parts = group.parts.map(([kind, d]) => part(group, kind, d))
        .filter((painted): painted is PaintNode => painted !== null);
      layers.push(node('G', { clipPath: `url(#${uid}-${index})` }, [...surface, ...parts]));
    }
    if (layer !== 'fill' && group.stroked !== false) {
      layers.push(node('Path', {
        d: group.outline,
        ...line(ink, outline),
        ...(outlineDash ? { strokeDasharray: outlineDash.map((dash) => dash * unit) } : {}),
      }));
    }
    children.push(node('G', {}, layers));
  });
  return node('G', {}, children);
}

type Weave = Readonly<{ d: string; role: 'shade' | 'light'; width: number; dash?: readonly number[] }>;

// The cloth's own weave as one path over the drawing's bounds, clipped by each surface: knit
// stitches in columns, denim's light diagonal twill, a fine suiting twill and straw's
// cross-weave. Spacing is in drawing units, so the weave scales with the garment; widths are
// in points. Built once per drawing.
const weaves = new Map<string, Weave | null>();
const r = (value: number) => Math.round(value * 100) / 100;

function clothWeave(silhouette: Silhouette): Weave | null {
  const cached = weaves.get(silhouette.id);
  if (cached !== undefined) return cached;
  const { x, y, width, height } = silhouette.bounds;
  const verticals = (step: number) => {
    let d = '';
    for (let at = x + step / 2; at < x + width; at += step) d += `M${r(at)} ${r(y)} L${r(at)} ${r(y + height)} `;
    return d;
  };
  // Diagonals rising to the right (sign 1) or falling (sign -1), spaced `step` apart along x.
  const diagonals = (step: number, sign: 1 | -1) => {
    let d = '';
    for (let at = x - height; at < x + width; at += step) {
      d += sign === 1
        ? `M${r(at)} ${r(y + height)} L${r(at + height)} ${r(y)} `
        : `M${r(at)} ${r(y)} L${r(at + height)} ${r(y + height)} `;
    }
    return d;
  };
  const weave: Weave | null = (() => {
    switch (silhouette.cloth) {
      case 'knit': return { d: verticals(1.5), role: 'shade', width: 0.55, dash: [0.85, 0.55] };
      case 'denim': return { d: diagonals(1.15, 1), role: 'light', width: 0.4 };
      case 'twill': return { d: diagonals(1.3, 1), role: 'shade', width: 0.25 };
      case 'straw': return { d: diagonals(1.7, 1) + diagonals(1.7, -1), role: 'shade', width: 0.35 };
      default: return null;
    }
  })();
  weaves.set(silhouette.id, weave);
  return weave;
}
