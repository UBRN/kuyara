import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';

export const garmentBoardSlotOrder: readonly OutfitSlot[] = [
  'primary_top', 'bottom', 'one_piece', 'outer_layer', 'mid_layer', 'footwear',
];

export const todayPreset = {
  weight: { anchor: 1, outer_layer: 0.74, mid_layer: 0.56 },
  footWidth: 0.58,
  coreCap: 0.235,
  soloCap: 0.300,
  railCap: 0.170,
  coreGapK: 0.60,
  railGap: 0.45,
  footClear: 0.55,
  midInset: 0.20,
  footRise: 0.20,
  gutter: 0.095,
  topInset: 0.235,
  botInset: 0.125,
  stageMin: 0.80,
  stageMax: 1.16,
  centroid: 0.47,
  sideMin: 0.09,
  stagDrop: 0.60,
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
};

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
  const family = rail.length ? 'column-and-rail' : 'stagger';

  const cap = family === 'stagger' || core.length === 1 ? rule.soloCap : rule.coreCap;
  const metric = cap / Math.max(...core.map((piece) => ratios(piece).w));
  const boxOf = (piece: Piece, size: number) => ({
    w: size * ratios(piece).w, h: size * ratios(piece).h,
  });
  const coreBox = (piece: Piece) => boxOf(piece, metric);
  const footBox = (w: number) => ({ w, h: w * ratios(foot).h / ratios(foot).w });
  const boxes = new Map<Piece, DrawnBox>();
  let stageHeight: number;

  if (family === 'column-and-rail') {
    const cb = core.map(coreBox);
    const coreGap = rule.coreGapK * metric;
    const coreW = Math.max(...cb.map((box) => box.w));
    const coreH = cb.reduce((sum, box) => sum + box.h, 0) + coreGap * (cb.length - 1);

    let rb = rail.map((piece) => boxOf(piece,
      rule.weight[piece.slot === 'outer_layer' ? 'outer_layer' : 'mid_layer'] * metric));
    let bf = footBox(rule.footWidth * coreW);
    const railScale = Math.min(1, rule.railCap / Math.max(...rb.concat(bf).map((box) => box.w)));
    rb = rb.map((box) => ({ w: box.w * railScale, h: box.h * railScale }));
    bf = { w: bf.w * railScale, h: bf.h * railScale };
    const railW = Math.max(...rb.concat(bf).map((box) => box.w));
    const railH = rb.reduce((sum, box) => sum + box.h, 0) + rule.railGap * metric * (rb.length - 1);

    const envelope = Math.max(coreH, railH + rule.footClear * metric + bf.h + rule.footRise * metric);
    stageHeight = Math.min(rule.stageMax, Math.max(rule.stageMin, rule.topInset + envelope + rule.botInset));
    const span = stageHeight - rule.topInset - rule.botInset;
    const top = rule.topInset + (span - envelope) / 2;

    let y = top + (envelope - coreH) / 2;
    core.forEach((piece, index) => {
      const box = cb[index];
      boxes.set(piece, { x: -box.w / 2, y, ...box });
      y += box.h + coreGap;
    });
    const railX = coreW / 2 + rule.gutter + railW / 2;
    y = top;
    rail.forEach((piece, index) => {
      const box = rb[index];
      const inset = piece.slot === 'mid_layer' && rail.length > 1 ? rule.midInset * metric : 0;
      boxes.set(piece, { x: railX + inset - box.w / 2, y, ...box });
      y += box.h + rule.railGap * metric;
    });
    boxes.set(foot, {
      x: railX - bf.w / 2, y: top + envelope - rule.footRise * metric - bf.h, ...bf,
    });
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

  const order = garmentBoardSlotOrder.flatMap((slot) => {
    const piece = by(slot);
    return piece && boxes.has(piece) ? [piece] : [];
  });
  return { boxes, stageHeight, family, metric, core, order };
}

// Geometric audit; ink parity needs raster coverage, which vector assets do not carry.
export function audit<Piece extends ArtworkPiece>(result: ReturnType<typeof composeGarmentBoard<Piece>>) {
  const boxes = [...result.boxes.values()];
  const height = result.stageHeight;
  let overlap = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0 && oy > 0) overlap = Math.max(overlap, Math.min(ox, oy));
    }
  }
  const clip = Math.max(0,
    -Math.min(...boxes.map((box) => box.x)),
    Math.max(...boxes.map((box) => box.x + box.w)) - 1,
    -Math.min(...boxes.map((box) => box.y)),
    Math.max(...boxes.map((box) => box.y + box.h)) - height);
  const quadrants = [0, 0, 0, 0];
  for (const box of boxes) {
    for (let k = 0; k < 4; k++) {
      const qx = k % 2 ? [0.5, 1] : [0, 0.5];
      const qy = k > 1 ? [height / 2, height] : [0, height / 2];
      const ox = Math.max(0, Math.min(box.x + box.w, qx[1]) - Math.max(box.x, qx[0]));
      const oy = Math.max(0, Math.min(box.y + box.h, qy[1]) - Math.max(box.y, qy[0]));
      quadrants[k] += ox * oy / (0.5 * height / 2);
    }
  }
  const halves = [quadrants[0] + quadrants[2], quadrants[1] + quadrants[3],
    quadrants[0] + quadrants[1], quadrants[2] + quadrants[3]];
  const areas = result.core.map((piece) => {
    const box = result.boxes.get(piece)!;
    return box.w * box.h;
  });
  const parity = Math.max(...areas) / Math.min(...areas);
  return { overlap, clip, parity, quadrants, halves, minHalf: Math.min(...halves) };
}
