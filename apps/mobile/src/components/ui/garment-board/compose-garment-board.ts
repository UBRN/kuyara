import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';

export const garmentBoardSlotOrder: readonly OutfitSlot[] = [
  'primary_top', 'bottom', 'one_piece', 'outer_layer', 'mid_layer', 'footwear',
];

// The order an outfit is put on, back to front. No piece touches another on a board, so
// this is the order the pieces are drawn in and the order the detail names them.
export const garmentBoardDressingOrder: readonly OutfitSlot[] = [
  'primary_top', 'bottom', 'one_piece', 'mid_layer', 'outer_layer', 'footwear',
];

// ADR 0025's one board rule. Every composed board draws the outfit as it is worn: Today's
// stage, the detail, the alternates, History and the share card.
export const todayPreset = {
  weight: { anchor: 1, outer_layer: 0.74, mid_layer: 0.56 },
  footWidth: 0.58,
  coreCap: 0.235,
  soloCap: 0.300,
  railCap: 0.170,
  railGap: 0.10,
  // The stage holds nothing but the board, so both insets are the tint's own edge. Neither
  // is board geometry: the ladder, the caps and the gaps above are ADR 0025's and do not move.
  topInset: 0.045,
  botInset: 0.055,
  stageMin: 0.66,
  stageMax: 1.14,
  centroid: 0.47,
  sideMin: 0.09,
  // The clear space between neighbouring pieces: under the top before the bottom's waist,
  // × the top's height; beside the core before the layers, × the narrowest core piece's
  // width; under the core's hem before the footwear, × the footwear's height.
  clearance: { waist: 0.05, side: 0.10, foot: 0.06 },
};

// A board draws its footwear as a pair, the way a flat lay shows shoes (ADR 0025
// section 2): the near shoe whole, the far one behind it, `toe` of a shoe's length toward the toe
// and raised so the pair stands exactly one shoe tall, each shoe `scale` of the single shoe the
// width rule sizes. The near shoe's heel sits `back` of that shoe's length behind the single
// shoe's, so the pair's footprint stays near one shoe's. A Closet tile and a category glyph
// draw one shoe; only a composed board draws the pair.
export const footwearPair = { scale: 0.86, toe: 0.30, back: 0.04 } as const;

type Bounds = Readonly<{ x: number; y: number; width: number; height: number }>;

/** The box a pair takes, from the box its single shoe would take, in the same units. */
export function footwearPairBox<Box extends Readonly<{ x: number; y: number; w: number; h: number }>>(single: Box) {
  const { scale, toe, back } = footwearPair;
  return { x: single.x - back * single.w, y: single.y, w: scale * (1 + toe) * single.w, h: single.h };
}

/**
 * The pair drawn in a shoe drawing's own units: the pair's bounds, and where each shoe's
 * drawing lands, far shoe first, as a translation after scaling the drawing by `scale`.
 */
export function footwearPairDrawing(single: Bounds) {
  const box = footwearPairBox({ x: single.x, y: single.y, w: single.width, h: single.height });
  const { scale, toe } = footwearPair;
  const shoe = (x: number, y: number) => ({ dx: x - scale * single.x, dy: y - scale * single.y });
  return {
    bounds: { x: box.x, y: box.y, width: box.w, height: box.h },
    scale,
    shoes: [
      shoe(box.x + toe * scale * single.width, box.y),
      shoe(box.x, box.y + (1 - scale) * single.height),
    ],
  } as const;
}

/**
 * O13's "Easier to see" board: every size cap of section 7 x 1.3
 * and the side minimum 0.09 to 0.05. The ladder, the gaps and the placement families are
 * unchanged; the gaps follow the core metric, so the whole composition grows with the caps.
 */
export function easierToSeeRule<Rule extends typeof todayPreset>(rule: Rule, scale: number, sideMin: number): Rule {
  return { ...rule, coreCap: rule.coreCap * scale, soloCap: rule.soloCap * scale, railCap: rule.railCap * scale, sideMin };
}

type ArtworkPiece = Readonly<{
  slot: OutfitSlot;
  bounds: Bounds;
}>;

/** A composed piece: footwear carries `single`, the one shoe's bounds its pair is drawn from. */
export type BoardPiece<Piece extends ArtworkPiece> = Piece & Readonly<{ single?: Bounds }>;

type DrawnBox = { x: number; y: number; w: number; h: number };

const ratios = ({ bounds }: ArtworkPiece) => ({
  w: Math.sqrt(bounds.width / bounds.height),
  h: Math.sqrt(bounds.height / bounds.width),
});

// ADR 0025's composition rule. All lengths are fractions of the stage width.
export function composeGarmentBoard<Piece extends ArtworkPiece>(
  pieces: readonly Piece[],
  rule = todayPreset,
) {
  const by = (slot: OutfitSlot) => pieces.find((piece) => piece.slot === slot);
  const onePiece = by('one_piece');
  const core = onePiece ? [onePiece] : [by('primary_top'), by('bottom')]
    .filter((piece): piece is Piece => piece !== undefined);
  const rail = [by('outer_layer'), by('mid_layer')]
    .filter((piece): piece is Piece => piece !== undefined);
  const foot = by('footwear');
  if (!core.length || !foot) throw new Error('A garment board requires a body core and footwear.');

  const metric = (core.length === 1 ? rule.soloCap : rule.coreCap) / Math.max(...core.map((piece) => ratios(piece).w));
  const boxOf = (piece: Piece, size: number) => ({
    w: size * ratios(piece).w, h: size * ratios(piece).h,
  });
  const boxes = new Map<BoardPiece<Piece>, DrawnBox>();

  // The outfit is laid out in the order it is worn. The core stands as one column, the
  // bottom under the top, the footwear under its hem and the layers beside it, each apart
  // from its neighbours by `clearance`, so no piece covers any part of another.
  const { clearance } = rule;
  let cb = core.map((piece) => boxOf(piece, metric));
  let coreGap = core.length > 1 ? clearance.waist * cb[0].h : 0;
  let coreW = Math.max(...cb.map((box) => box.w));

  let rb = rail.map((piece) => boxOf(piece,
    rule.weight[piece.slot === 'outer_layer' ? 'outer_layer' : 'mid_layer'] * metric));
  // Footwear is sized on width, not on the ladder, and shares the layers' one scale.
  let bf = { w: rule.footWidth * coreW, h: rule.footWidth * coreW * ratios(foot).h / ratios(foot).w };
  const railScale = Math.min(1, rule.railCap / Math.max(...rb.concat(bf).map((box) => box.w)));
  rb = rb.map((box) => ({ w: box.w * railScale, h: box.h * railScale }));
  bf = { w: bf.w * railScale, h: bf.h * railScale };
  let railGap = rule.railGap * metric;
  let railH = rb.reduce((sum, box) => sum + box.h, 0) + railGap * (rb.length - 1);
  let coreH = cb.reduce((sum, box) => sum + box.h, 0) + coreGap * (cb.length - 1) + bf.h * (1 + clearance.foot);

  // A composition taller than the stage's ceiling (Easier to see on the detail's larger caps)
  // is scaled down once, uniformly, until it fits, the way Today's fitted stage scales its
  // board: every size and every gap keeps its ratio to the others.
  const fit = (rule.stageMax - rule.topInset - rule.botInset) / Math.max(coreH, railH);
  if (fit < 1) {
    const scaled = (box: { w: number; h: number }) => ({ w: box.w * fit, h: box.h * fit });
    cb = cb.map(scaled);
    rb = rb.map(scaled);
    bf = scaled(bf);
    [coreGap, coreW, railGap, railH, coreH] = [coreGap, coreW, railGap, railH, coreH].map((length) => length * fit);
  }

  const envelope = Math.max(coreH, railH);
  const stageHeight = Math.min(rule.stageMax, Math.max(rule.stageMin, rule.topInset + envelope + rule.botInset));
  const top = rule.topInset + (stageHeight - rule.topInset - rule.botInset - envelope) / 2;

  let y = top + (envelope - coreH) / 2;
  const placedCore = core.map((piece, index) => {
    const box = { x: -cb[index].w / 2, y, ...cb[index] };
    boxes.set(piece, box);
    y += box.h + coreGap;
    return box;
  });
  // Every layer's left edge stands `clearance.side` of the narrowest core piece's width
  // clear of the core.
  const railX = coreW / 2 + clearance.side * Math.min(...cb.map((box) => box.w));
  y = top;
  rail.forEach((piece, index) => {
    boxes.set(piece, { x: railX, y, ...rb[index] });
    y += rb[index].h + railGap;
  });
  // The footwear's heel stands a quarter of its length left of the core's axis and its opening
  // stands `clearance.foot` of its own height under the lowest piece's hem. It is drawn as a
  // pair, which stands exactly one shoe tall, so the far shoe's opening keeps that clearance.
  const low = placedCore[placedCore.length - 1];
  const pair: BoardPiece<Piece> = { ...foot, bounds: footwearPairDrawing(foot.bounds).bounds, single: foot.bounds };
  boxes.set(pair, footwearPairBox({ x: -bf.w / 4, y: low.y + low.h + clearance.foot * bf.h, ...bf }));

  // Position the finished group once, by its area-weighted drawn-box centroid.
  const bs = [...boxes.values()];
  const area = bs.reduce((sum, box) => sum + box.w * box.h, 0);
  const centroid = bs.reduce((sum, box) => sum + box.w * box.h * (box.x + box.w / 2), 0) / area;
  const left = Math.min(...bs.map((box) => box.x));
  const right = Math.max(...bs.map((box) => box.x + box.w));
  let dx = rule.centroid - centroid;
  dx = Math.max(dx, rule.sideMin - left);
  dx = Math.min(dx, 1 - rule.sideMin - right);
  for (const box of bs) box.x += dx;

  const drawn = [...boxes.keys()];
  const inOrder = (slots: readonly OutfitSlot[]) => slots.flatMap((slot) => drawn.filter((piece) => piece.slot === slot));
  return {
    boxes, stageHeight, metric, core,
    order: inOrder(garmentBoardSlotOrder),
    stack: inOrder(garmentBoardDressingOrder),
  };
}

// The runway preset (O17, P6). The runway has no stage box, so a
// composition is trimmed to its drawn extent and scaled, uniformly, to the free area:
// `side` keeps the pieces off the band's edges, `vertical` off its top and bottom, and
// `maxScale` stops a short outfit on a tall phone from growing past one and a quarter
// area widths. ADR 0025's ladder, caps and placement families are the composition's own
// and do not move; only the one scale does.
export const runwayPreset = { side: 28, vertical: 24, maxScale: 1.25 } as const;

// The detail draws the same worn board at the scale Today's fitted stage reaches, so a piece
// leaving Today's stage for the detail keeps its size.
export const detailPreset = easierToSeeRule(todayPreset, runwayPreset.maxScale, todayPreset.sideMin);

export type DrawnExtent = Readonly<{ x: number; y: number; w: number; h: number }>;

export function drawnExtent(boxes: Iterable<DrawnBox>): DrawnExtent {
  const list = [...boxes];
  const x = Math.min(...list.map((box) => box.x));
  const y = Math.min(...list.map((box) => box.y));
  return {
    x,
    y,
    w: Math.max(...list.map((box) => box.x + box.w)) - x,
    h: Math.max(...list.map((box) => box.y + box.h)) - y,
  };
}

/** The one scale, in points per stage width, at which every extent fits the area. */
export function fitRunwayScale(extents: readonly DrawnExtent[], width: number, height: number): number {
  if (!extents.length || width <= 0 || height <= 0) return 0;
  const w = Math.max(...extents.map((extent) => extent.w));
  const h = Math.max(...extents.map((extent) => extent.h));
  return Math.max(0, Math.min(
    (width - 2 * runwayPreset.side) / w,
    (height - runwayPreset.vertical) / h,
    runwayPreset.maxScale * width,
  ));
}

/** A composed box in area points, the composition centred on its own drawn extent. */
export function placeOnRunway(
  box: DrawnBox,
  extent: DrawnExtent,
  scale: number,
  width: number,
  height: number,
): DrawnBox {
  return {
    x: (width - extent.w * scale) / 2 + (box.x - extent.x) * scale,
    y: (height - extent.h * scale) / 2 + (box.y - extent.y) * scale,
    w: box.w * scale,
    h: box.h * scale,
  };
}

// Today's primary stage (O17 and P2) takes the runway fit: the composition
// is trimmed to its drawn extent and scaled once, uniformly, with the runway preset. The
// stage is then only as tall as the fitted composition plus the preset's vertical margin,
// within ADR 0025's clamp, so it depends on the outfit and the width alone and nothing
// above it (a badge, a wrapped title) moves it. The alternates keep the plain Today preset.
export function fitTodayStage(extent: DrawnExtent, width: number) {
  const max = todayPreset.stageMax * width;
  const scale = fitRunwayScale([extent], width, max);
  const height = Math.min(max, Math.max(todayPreset.stageMin * width, extent.h * scale + runwayPreset.vertical));
  return { scale, height };
}

// The soft shadow each piece casts on the plane it lies on, on every board: the piece's own
// drawn shape, blurred and dropped down and slightly right, so it follows any drawing that
// declares its drawn bounds. Lengths are fractions of the board's unit, the points one
// composition unit is drawn at (the stage width, or Today's fitted scale), so the shadow
// grows and shrinks with its piece. `reach` standard deviations of blur past the offset is
// where the shadow is spent; the board's margins hold it. Its colour is the plane's own,
// moved down in OKLCH lightness by `step`, so it adds no hue and no new colour.
export const garmentShadowRule = {
  dx: 0.0025, dy: 0.0075, blur: 0.0065, reach: 3, step: { light: -0.13, dark: -0.10 },
} as const;

/** One board's piece shadow in points, and the margin it reaches past a piece's drawn box. */
export function garmentShadowOf(unit: number) {
  const dx = garmentShadowRule.dx * unit;
  const dy = garmentShadowRule.dy * unit;
  const blur = garmentShadowRule.blur * unit;
  return { dx, dy, blur, margin: Math.max(dx, dy) + garmentShadowRule.reach * blur };
}
