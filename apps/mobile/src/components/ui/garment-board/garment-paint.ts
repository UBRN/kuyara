import { garmentPaletteContrast, type GarmentRoles } from './garment-palette';
import type { Silhouette, SilhouetteGroup } from './silhouettes';

// One drawing as plain data: the element tree `garment-painting.tsx` hands to the vector
// library, and the one an offline renderer serialises, so both draw exactly the same art.

export type GarmentLevelOfDetail = 'full' | 'caption';

// A drawing whose longer side is drawn below 32 points (the 16-point caption) keeps its
// fills, light, one band of edge shade, shade planes and construction lines and drops tone
// lines, stitches, quilt seams, zips, hardware, highlights, the rim light, cast shadows and
// the cloth's weave, which would only speckle at that size.
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
const detailOnly = new Set(['T', 'Ta', 'S', 'Sh', 'Sa', 'Dh', 'fh', 'L', 'Q']);
const lineKinds = new Set(['D', 'T', 'Ta']);

export type PaintTag = 'G' | 'Defs' | 'ClipPath' | 'Path' | 'Rect' | 'LinearGradient' | 'RadialGradient' | 'Stop';
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

const r = (value: number) => Math.round(value * 1000) / 1000;
const node = (tag: PaintTag, attrs: PaintAttrs, children?: readonly PaintNode[]): PaintNode =>
  children === undefined ? { tag, attrs } : { tag, attrs, children };
const shift = (dx: number, dy: number) => `translate(${r(dx)} ${r(dy)})`;

// How strongly the modelling reads, as opacities of the piece's own shade and light tones:
// the turning edge of the form, the light catching the upper-left rim, a piece's shadow on
// the one beneath it, the soft valley beside a quilt seam, and a button's or rivet's shadow.
const FORM_EDGE = 0.55;
// Nested bands step the edge shade inward, so it falls off rather than ending in a line: eight
// on a body or a leg, where a board draws them large enough for a coarser step to show as a
// contour, five on a sleeve-sized part.
const FORM_STEPS_LARGE = [1, 0.86, 0.73, 0.6, 0.47, 0.34, 0.22, 0.1];
const FORM_STEPS = [1, 0.76, 0.54, 0.34, 0.16];
// A strap, cuff or collar point is too small to show five steps; two read the same.
const FORM_STEPS_SMALL = [1, 0.45];
const RIM_LIGHT = 0.7;
const CAST = 0.36;
const QUILT_VALLEY = 0.6;
const HARDWARE_SHADOW = 0.6;
const SEAM_LIGHT = 0.75;
const GLOW = 0.6;

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
  const sheen = silhouette.cloth === 'sheen';
  const glint = sheen ? roles.specular : roles.highlight;

  const part = (group: SilhouetteGroup, kind: string, d: string): PaintNode[] => {
    if (caption && detailOnly.has(kind)) return [];
    if (kind === 'fh') {
      // Buttons, rivets and pulls stand off the cloth: a small shadow below and to the right.
      return [
        node('Path', { d, fill: roles.deep, fillOpacity: HARDWARE_SHADOW, transform: shift(0.4 * unit, 0.6 * unit) }),
        node('Path', { d, fill: roles.hardware }),
      ];
    }
    if (kind in partFill) return [node('Path', { d, fill: paintOf(partFill[kind as keyof typeof partFill]) })];
    switch (kind) {
      case 'D': {
        const fill = roles[group.fill];
        const stroke = garmentPaletteContrast(ink, fill) >= CONSTRUCTION_CONTRAST ? ink : roles.toneLine;
        return [node('Path', { d, ...line(stroke, construction) })];
      }
      case 'Dh': return [
        node('Path', { d, ...line(roles.deep, ZIP * 2.2), strokeOpacity: 0.45 }),
        node('Path', { d, ...line(roles.hardware, ZIP), strokeDasharray: [0.5 * unit, 0.45 * unit] }),
      ];
      case 'T': return [node('Path', { d, ...line(roles.toneLine, TONE) })];
      // A highlight is a soft broad gleam with a crisp core, so a fold or ridge catches the light.
      case 'L': return [
        node('Path', { d, ...line(glint, TONE * 3.4), strokeOpacity: 0.42 }),
        node('Path', { d, ...line(glint, TONE * 1.1), strokeOpacity: sheen ? 0.95 : 0.8 }),
      ];
      // A quilt seam pulls the fill in: a soft valley either side, the stitched seam, and the
      // light catching the baffle's upper edge just below it.
      case 'Q': return [
        ...[5.2, 3.4, 1.8].map((width) => node('Path', {
          d, ...line(roles.deep, 0), strokeWidth: width, strokeOpacity: QUILT_VALLEY / 3,
        })),
        node('Path', { d, ...line(roles.deep, TONE * 1.3) }),
        node('Path', { d, ...line(roles.highlight, TONE * 2.6), strokeOpacity: 0.55, transform: shift(0, 1.3) }),
      ];
      case 'Ta': return [node('Path', { d, ...line(roles.materialTone, TONE) })];
      case 'S': return [node('Path', { d, ...line(roles.toneLine, STITCH, true) })];
      case 'Sh': return [node('Path', { d, ...line(roles.hardware, STITCH * 1.15, true) })];
      default: return [node('Path', { d, ...line(roles.materialTone, STITCH, true) })];
    }
  };

  // Light falls from the upper left across the whole drawing, so one garment has one light:
  // each plain-coloured surface is repainted with a gradient between its own light and shade
  // tones, and a glossy cloth carries a highlight band. A pattern or the multicolour fill
  // keeps its own paint. Every translucent layer below lies inside a group's clip, over its
  // opaque fill, so nothing behind the garment ever shows through it.
  const litRoles = (['main', 'material'] as const).filter((role) => silhouette.groups.some(
    (group) => group.fill === role && !(role === 'main' && mainPaint)));
  const lit = (group: SilhouetteGroup) => litRoles.includes(group.fill as 'main' | 'material');
  const modelled = (group: SilhouetteGroup) => group.fill === 'main' || group.fill === 'shade' || group.fill === 'material';
  const clipped = (index: number) => silhouette.groups[index].parts.length > 0 || lit(silhouette.groups[index])
    || modelled(silhouette.groups[index]);
  const fills = layer !== 'outline';
  const lightOf = (role: 'main' | 'material') => {
    const stops = (role === 'material'
      ? [[0, roles.materialLight], [0.45, roles.material], [1, roles.materialShade]]
      : sheen
        ? [[0, roles.light], [0.18, roles.highlight], [0.3, roles.main], [0.62, roles.shade], [1, roles.deep]]
        : [[0, roles.highlight], [0.3, roles.light], [0.58, roles.main], [1, roles.deep]]
    ).map(([offset, color]) => node('Stop', { offset, stopColor: color }));
    return node('LinearGradient', { id: `${uid}-lit-${role}`, x1: '8%', y1: '0%', x2: '92%', y2: '100%' }, stops);
  };
  // A soft bloom of light where the form turns toward the upper-left light.
  const glow = node('RadialGradient', { id: `${uid}-glow`, cx: '36%', cy: '26%', r: '62%' }, [
    node('Stop', { offset: 0, stopColor: roles.highlight, stopOpacity: GLOW }),
    node('Stop', { offset: 1, stopColor: roles.highlight, stopOpacity: 0 }),
  ]);
  const glows = !caption && litRoles.includes('main');
  const { bounds } = silhouette;
  const weave = !caption && silhouette.cloth !== undefined ? clothWeave(silhouette) : null;
  const defs = fills
    ? [
      ...litRoles.map(lightOf),
      ...(glows ? [glow] : []),
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
      const size = groupSize(silhouette, index);
      const shadeTone = group.fill === 'material' ? roles.materialDeep : roles.deep;
      const lightTone = group.fill === 'material' ? roles.materialLight : roles.highlight;
      if (lit(group)) {
        surface.push(node('Rect', { ...bounds, fill: `url(#${uid}-lit-${group.fill})` }));
        if (glows && group.fill === 'main') surface.push(node('Rect', { ...bounds, fill: `url(#${uid}-glow)` }));
        if (weave !== null && group.fill === 'main') {
          surface.push(node('Path', {
            d: weave.d,
            ...line(roles[weave.role], weave.width),
            ...(weave.dash ? { strokeDasharray: weave.dash } : {}),
            strokeOpacity: weave.opacity,
          }));
        }
      }
      const parts = group.parts.flatMap(([kind, d]) => part(group, kind, d));
      const form: PaintNode[] = [];
      if (modelled(group)) {
        // The form turns away from the eye at its edge: a broad soft band of the piece's own
        // deepest tone inside the outline, darkest at the edge, so cloth reads as rounded.
        const edge = Math.min(5, Math.max(1.2, size * 0.15));
        const steps = caption ? [1] : size < 8 ? FORM_STEPS_SMALL : size < 20 ? FORM_STEPS : FORM_STEPS_LARGE;
        for (const step of steps) {
          form.push(node('Path', {
            d: group.outline, ...line(shadeTone, 0), strokeWidth: edge * 2 * step,
            strokeOpacity: caption ? FORM_EDGE * 0.6 : FORM_EDGE / steps.length,
          }));
        }
        if (!caption) {
          // The rim nearest the light catches it: the outline nudged down and right shows a
          // thin bright band inside the upper and left edges only.
          const offset = Math.min(1.1, Math.max(0.35, size * 0.035));
          form.push(node('Path', {
            d: group.outline, ...line(lightTone, 0), strokeWidth: offset * 1.5, strokeOpacity: RIM_LIGHT,
            transform: shift(offset, offset * 1.2),
          }));
        }
      }
      // Seams and pocket edges are sewn into the cloth, so each carries a fine light line
      // beside it, on the side that faces the light's far wall.
      const seams = caption ? [] : group.parts.filter(([kind]) => lineKinds.has(kind)).map(([, d]) => d);
      if (seams.length > 0 && group.fill !== 'toneLine' && group.fill !== 'hardware') {
        parts.push(node('Path', {
          d: seams.join(' '), ...line(lightTone, TONE * 0.9), strokeOpacity: SEAM_LIGHT,
          transform: shift(0.6 * unit, 0.75 * unit),
        }));
      }
      // Every piece laid over this one casts a soft shadow onto it, down and to the right.
      const above = caption ? [] : silhouette.groups.slice(index + 1)
        .filter((over) => over.stroked !== false).map((over) => over.outline);
      const cast = above.length > 0
        ? [node('Path', { d: above.join(' '), fill: roles.deep, fillOpacity: CAST, transform: shift(0.45, 0.95) })]
        : [];
      layers.push(node('G', { clipPath: `url(#${uid}-${index})` }, [...surface, ...form, ...parts, ...cast]));
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

// The smaller side of a group's outline box in drawing units (control points included, which
// is close enough to size its modelling). Built once per drawing and group.
const sizes = new Map<string, number>();
function groupSize(silhouette: Silhouette, index: number): number {
  const key = `${silhouette.id}:${index}`;
  const cached = sizes.get(key);
  if (cached !== undefined) return cached;
  const values = (silhouette.groups[index].outline.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = values.filter((_, at) => at % 2 === 0);
  const ys = values.filter((_, at) => at % 2 === 1);
  const measured = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  // The pairing reads absolute coordinates only; an outline it cannot measure (no numbers, or
  // a lone H or V) takes the drawing's own bounds rather than an infinite or zero size.
  const size = Number.isFinite(measured) && measured > 0
    ? measured
    : Math.min(silhouette.bounds.width, silhouette.bounds.height);
  sizes.set(key, size);
  return size;
}

type Weave = Readonly<{ d: string; role: 'deep' | 'highlight'; width: number; opacity: number; dash?: readonly number[] }>;

// The cloth's own weave as one path over the drawing's bounds, clipped by each surface: knit
// stitches in columns, denim's light diagonal twill, a fine suiting twill and straw's
// cross-weave. Spacing is in drawing units, so the weave scales with the garment; widths are
// in points. Built once per drawing.
const weaves = new Map<string, Weave | null>();

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
      case 'knit': return { d: verticals(1.5), role: 'deep', width: 0.6, opacity: 0.55, dash: [0.85, 0.55] };
      case 'denim': return { d: diagonals(1.05, 1), role: 'highlight', width: 0.45, opacity: 0.6 };
      case 'twill': return { d: diagonals(1.2, 1), role: 'deep', width: 0.3, opacity: 0.45 };
      case 'straw': return { d: diagonals(1.7, 1) + diagonals(1.7, -1), role: 'deep', width: 0.4, opacity: 0.55 };
      default: return null;
    }
  })();
  weaves.set(silhouette.id, weave);
  return weave;
}
