import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';

export const garmentBoardSlotOrder: readonly OutfitSlot[] = [
  'primary_top', 'bottom', 'one_piece', 'outer_layer', 'mid_layer', 'footwear',
];

// The order an outfit is put on, back to front: where pieces overlap, a later piece lies
// over an earlier one. The bottom's waist lies over the top's hem (tucked), the layers over
// the body core, the outer layer over the mid layer, and the footwear over the core's foot.
export const garmentBoardDressingOrder: readonly OutfitSlot[] = [
  'primary_top', 'bottom', 'one_piece', 'mid_layer', 'outer_layer', 'footwear',
];

export const todayPreset = {
  weight: { anchor: 1, outer_layer: 0.74, mid_layer: 0.56 },
  footWidth: 0.58,
  coreCap: 0.235,
  soloCap: 0.300,
  railCap: 0.170,
  coreGapK: 0,
  railGap: 0.10,
  footClear: 0.55,
  midInset: 0,
  footRise: 0.20,
  gutter: 0,
  // Today's stage holds nothing but the board: the temperature and the condition symbol
  // live in the title above it, so both insets are the tint's own edge and match the detail
  // preset's. Neither is board geometry: the ladder, the caps and the gaps above are
  // ADR 0025's and do not move.
  topInset: 0.045,
  botInset: 0.055,
  stageMin: 0.66,
  stageMax: 1.14,
  centroid: 0.47,
  sideMin: 0.09,
  stagDrop: 0.60,
  lap: 0.12,
};

export const detailPreset = {
  ...todayPreset,
  coreGapK: 1.35,
  railGap: 1.15,
  footClear: 1.10,
  footRise: 0.10,
  coreCap: 0.215,
  railCap: 0.150,
  gutter: 0.135,
  midInset: 0.16,
  topInset: 0.045,
  botInset: 0.055,
  stageMin: 0.60,
  stageMax: 1.45,
  lap: 0,
};

/**
 * O13's "Easier to see" board (owner decisions 5 and 9): every size cap of section 7 x 1.3
 * and the side minimum 0.09 to 0.05. The ladder, the gaps and the placement families are
 * unchanged; the gaps follow the core metric, so the whole composition grows with the caps.
 */
export function easierToSeeRule<Rule extends typeof todayPreset>(rule: Rule, scale: number, sideMin: number): Rule {
  return { ...rule, coreCap: rule.coreCap * scale, soloCap: rule.soloCap * scale, railCap: rule.railCap * scale, sideMin };
}

type ArtworkPiece = Readonly<{
  slot: OutfitSlot;
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
}>;

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
  const family = rail.length || rule.lap > 0 ? 'column-and-rail' : 'stagger';

  const cap = family === 'stagger' || core.length === 1 ? rule.soloCap : rule.coreCap;
  const metric = cap / Math.max(...core.map((piece) => ratios(piece).w));
  const boxOf = (piece: Piece, size: number) => ({
    w: size * ratios(piece).w, h: size * ratios(piece).h,
  });
  const coreBox = (piece: Piece) => boxOf(piece, metric);
  const footBox = (w: number) => ({ w, h: w * ratios(foot).h / ratios(foot).w });
  const boxes = new Map<Piece, DrawnBox>();
  let stageHeight: number;

  // Worn (a lap above 0, Today): the outfit is laid out as it is worn. The core stands as one
  // column, the bottom's waist over the top's hem, the footwear at its foot and the layers
  // over its side. Every piece that lies over another covers `lap` of the covered piece's
  // drawn extent at most, on the side it enters from, so a collar, a waist and a sole stay in
  // view. A lap of 0 is the open board (the detail), whose pieces never touch.
  const lap = rule.lap;
  const worn = lap > 0;

  if (family === 'column-and-rail') {
    const cb = core.map(coreBox);
    const coreGap = rule.coreGapK * metric - (core.length > 1 ? lap * cb[0].h : 0);
    const coreW = Math.max(...cb.map((box) => box.w));

    let rb = rail.map((piece) => boxOf(piece,
      rule.weight[piece.slot === 'outer_layer' ? 'outer_layer' : 'mid_layer'] * metric));
    let bf = footBox(rule.footWidth * coreW);
    const railScale = Math.min(1, rule.railCap / Math.max(...rb.concat(bf).map((box) => box.w)));
    rb = rb.map((box) => ({ w: box.w * railScale, h: box.h * railScale }));
    // The layers share one scale so their ladder holds. Footwear is sized on width, not on the
    // ladder, so on the open board, where it stands in the rail, it takes the cap on its own
    // width: a wide layer no longer shrinks a flat shoe below legibility.
    const footScale = worn ? railScale : Math.min(1, rule.railCap / bf.w);
    bf = { w: bf.w * footScale, h: bf.h * footScale };
    // Worn, the rail carries the layers alone: the footwear stands under the core.
    const railW = Math.max(0, ...(worn ? rb : rb.concat(bf)).map((box) => box.w));
    const railH = rb.reduce((sum, box) => sum + box.h, 0) + rule.railGap * metric * (rb.length - 1);
    const coreH = cb.reduce((sum, box) => sum + box.h, 0) + coreGap * (cb.length - 1)
      + (worn ? bf.h * (1 - lap) : 0);

    const envelope = worn
      ? Math.max(coreH, railH)
      : Math.max(coreH, railH + rule.footClear * metric + bf.h + rule.footRise * metric);
    stageHeight = Math.min(rule.stageMax, Math.max(rule.stageMin, rule.topInset + envelope + rule.botInset));
    const span = stageHeight - rule.topInset - rule.botInset;
    const top = rule.topInset + (span - envelope) / 2;

    let y = top + (envelope - coreH) / 2;
    const placedCore = core.map((piece, index) => {
      const box = { x: -cb[index].w / 2, y, ...cb[index] };
      boxes.set(piece, box);
      y += box.h + coreGap;
      return box;
    });
    // Worn, every layer's left edge lies `lap` of the narrowest core piece's width over the core.
    const railX = coreW / 2 + rule.gutter - lap * Math.min(...cb.map((box) => box.w)) + railW / 2;
    y = top;
    rail.forEach((piece, index) => {
      const box = rb[index];
      const inset = piece.slot === 'mid_layer' && rail.length > 1 ? rule.midInset * metric : 0;
      boxes.set(piece, { x: railX - (worn ? railW : box.w) / 2 + inset, y, ...box });
      y += box.h + rule.railGap * metric;
    });
    // Worn, the footwear's heel stands a quarter of its length left of the core's axis and its
    // opening lies over the lowest piece's hem by `lap` of its own height.
    const low = placedCore[placedCore.length - 1];
    boxes.set(foot, worn
      ? { x: -bf.w / 4, y: low.y + low.h - lap * bf.h, ...bf }
      : { x: railX - bf.w / 2, y: top + envelope - rule.footRise * metric - bf.h, ...bf });
  } else {
    const first = core[0];
    const second = core[1];
    const b1 = coreBox(first);
    const bf = footBox(rule.footWidth * b1.w);
    boxes.set(first, { x: 0, y: 0, ...b1 });
    if (second) {
      const b2 = coreBox(second);
      boxes.set(second, { x: b1.w + rule.gutter, y: b1.h * rule.stagDrop, ...b2 });
      boxes.set(foot, { x: 0, y: b1.h * rule.stagDrop + b2.h - bf.h, ...bf });
    } else {
      boxes.set(foot, { x: b1.w + rule.gutter, y: b1.h - bf.h, ...bf });
    }
    const height = Math.max(...[...boxes.values()].map((box) => box.y + box.h));
    stageHeight = Math.min(rule.stageMax, Math.max(rule.stageMin, rule.topInset + height + rule.botInset));
    const dy = rule.topInset + (stageHeight - rule.topInset - rule.botInset - height) / 2;
    for (const box of boxes.values()) box.y += dy;
  }

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

  const inOrder = (slots: readonly OutfitSlot[]) => slots.flatMap((slot) => {
    const piece = by(slot);
    return piece && boxes.has(piece) ? [piece] : [];
  });
  return {
    boxes, stageHeight, family, metric, core,
    order: inOrder(garmentBoardSlotOrder),
    stack: inOrder(garmentBoardDressingOrder),
  };
}

// The runway preset (owner decision O17, P6). The runway has no stage box, so a
// composition is trimmed to its drawn extent and scaled, uniformly, to the free area:
// `side` keeps the pieces off the band's edges, `vertical` off its top and bottom, and
// `maxScale` stops a short outfit on a tall phone from growing past one and a quarter
// area widths. ADR 0025's ladder, caps and placement families are the composition's own
// and do not move; only the one scale does.
export const runwayPreset = { side: 28, vertical: 24, maxScale: 1.25 } as const;

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

// Today's primary stage (owner decisions O17 and P2) takes the runway fit: the composition
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
