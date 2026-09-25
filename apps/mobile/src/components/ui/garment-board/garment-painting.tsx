import { memo, useId } from 'react';
import { ClipPath, Defs, G, Path } from 'react-native-svg';

import { garmentPaletteContrast, type GarmentRoles } from './garment-palette';
import type { Silhouette, SilhouetteGroup } from './silhouettes';

export type GarmentLevelOfDetail = 'full' | 'caption';

// Phase 6's level of detail: a drawing whose longer side is drawn below 32 points (the
// 16-point caption) keeps its fills, shade planes and construction lines and drops tone
// lines, stitches, zips and hardware, which would only speckle at that size.
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
const CAPTION_CONSTRUCTION = 0.55;
// Non-text contrast (WCAG 1.4.11): an ink construction line under 3:1 on its fill switches
// to the piece's own tone line.
const CONSTRUCTION_CONTRAST = 3;

const partFill = {
  fs: 'shade', fl: 'light', fk: 'darkTrim', fa: 'material', fas: 'materialShade', fm: 'main', fh: 'hardware',
} as const satisfies Record<string, keyof GarmentRoles>;
const detailOnly = new Set(['T', 'Ta', 'S', 'Sh', 'Sa', 'Dh', 'fh']);

type GarmentPaintingProps = Readonly<{
  silhouette: Silhouette;
  roles: GarmentRoles;
  ink: string;
  /** Points per drawing unit, so every stroke keeps its weight in points. */
  scale: number;
  lod: GarmentLevelOfDetail;
  /** The outline weight in points; the board's 1.9 unless a caption scales it. */
  outline?: number;
  /**
   * `fill` draws everything but the ink edge and `outline` only the edge, so the runway can
   * pour the colour and fade the outline in separately.
   */
  layer?: 'all' | 'fill' | 'outline';
  /** A paint server for the main fill (the Closet's multicolour gradient). */
  mainPaint?: string;
}>;

/**
 * One drawing, painted in drawing units inside whatever transform the caller sets. Style A:
 * one ink edge, flat fills, no gradient, no alpha. Memoised on its props, so a board that
 * re-renders with the same outfit, size, colours and level of detail repaints nothing.
 */
export const GarmentPainting = memo(function GarmentPainting({
  silhouette,
  roles,
  ink,
  scale,
  lod,
  outline = GARMENT_OUTLINE,
  layer = 'all',
  mainPaint,
}: GarmentPaintingProps) {
  const uid = useId().replace(/[^A-Za-z0-9]/g, '');
  const caption = lod === 'caption';
  const unit = 1 / scale;
  const line = (stroke: string, width: number, dashed = false) => ({
    fill: 'none',
    stroke,
    strokeWidth: width * unit,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...(dashed ? { strokeDasharray: STITCH_DASH.map((dash) => dash * unit) } : {}),
  });
  const construction = caption ? outline * CAPTION_CONSTRUCTION : CONSTRUCTION;
  const paintOf = (role: keyof GarmentRoles) => (role === 'main' && mainPaint ? mainPaint : roles[role]);

  const part = (group: SilhouetteGroup, kind: string, d: string, key: string) => {
    if (caption && detailOnly.has(kind)) return null;
    if (kind in partFill) return <Path d={d} fill={paintOf(partFill[kind as keyof typeof partFill])} key={key} />;
    switch (kind) {
      case 'D': {
        const fill = roles[group.fill];
        const stroke = garmentPaletteContrast(ink, fill) >= CONSTRUCTION_CONTRAST ? ink : roles.toneLine;
        return <Path d={d} key={key} {...line(stroke, construction)} />;
      }
      case 'Dh': return <Path d={d} key={key} {...line(roles.hardware, ZIP)} />;
      case 'T': return <Path d={d} key={key} {...line(roles.toneLine, TONE)} />;
      case 'Ta': return <Path d={d} key={key} {...line(roles.materialTone, TONE)} />;
      case 'S': return <Path d={d} key={key} {...line(roles.toneLine, STITCH, true)} />;
      case 'Sh': return <Path d={d} key={key} {...line(roles.hardware, STITCH, true)} />;
      default: return <Path d={d} key={key} {...line(roles.materialTone, STITCH, true)} />;
    }
  };

  const clipped = layer !== 'outline'
    ? silhouette.groups.filter((group) => group.parts.length > 0)
    : [];

  return (
    <G>
      {clipped.length > 0 ? (
        <Defs>
          {silhouette.groups.map((group, index) => (group.parts.length > 0 ? (
            <ClipPath id={`${uid}-${index}`} key={index}>
              <Path d={group.outline} />
            </ClipPath>
          ) : null))}
        </Defs>
      ) : null}
      {silhouette.groups.map((group, index) => (
        <G key={index}>
          {layer !== 'outline' ? <Path d={group.outline} fill={paintOf(group.fill)} /> : null}
          {layer !== 'outline' && group.parts.length > 0 ? (
            <G clipPath={`url(#${uid}-${index})`}>
              {group.parts.map(([kind, d], partIndex) => part(group, kind, d, String(partIndex)))}
            </G>
          ) : null}
          {layer !== 'fill' && group.stroked !== false ? (
            <Path d={group.outline} {...line(ink, outline)} />
          ) : null}
        </G>
      ))}
    </G>
  );
});
