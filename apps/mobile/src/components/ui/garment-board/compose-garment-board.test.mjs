import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeGarmentBoard,
  detailPreset,
  drawnExtent,
  fitRunwayScale,
  fitTodayStage,
  footwearPair,
  footwearPairBox,
  footwearPairDrawing,
  garmentBoardDressingOrder,
  garmentShadowOf,
  garmentShadowRule,
  placeOnRunway,
  runwayPreset,
  todayPreset,
} from './compose-garment-board.ts';
import { resolveGarmentSilhouette } from './garment-silhouette-map.ts';

// Geometric audit; ink parity needs raster coverage, which vector assets do not carry.
// `overlap` is the deepest any piece reaches into another, as a share of the covered piece's
// drawn extent on the side it enters from; no board lets two drawn boxes touch.
function audit(result) {
  const boxes = [...result.boxes.values()];
  const height = result.stageHeight;
  let overlap = 0;
  for (let i = 0; i < result.stack.length; i++) {
    for (let j = i + 1; j < result.stack.length; j++) {
      const a = result.boxes.get(result.stack[i]);
      const b = result.boxes.get(result.stack[j]);
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox >= 0 && oy >= 0) overlap = Math.max(overlap, Math.min(ox / a.w, oy / a.h));
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
    const box = result.boxes.get(piece);
    return box.w * box.h;
  });
  const parity = Math.max(...areas) / Math.min(...areas);
  return { overlap, clip, parity, quadrants, halves, minHalf: Math.min(...halves) };
}

const categories = {
  primary_top: 'top', bottom: 'bottom', one_piece: 'one_piece',
  mid_layer: 'top', outer_layer: 'outerwear', footwear: 'footwear',
};

// The ten accepted evidence slot lists: every emitted shape, fallback-only and mixed.
const evidence = [
  ['one-piece core', [['one_piece', 'dress'], ['footwear', 'sandals']]],
  ['two anchors', [['primary_top', 't_shirt'], ['bottom', 'jeans'], ['footwear', 'sneakers']]],
  ['one-piece with outer', [['one_piece', 'dress'], ['outer_layer', 'trench_coat'], ['footwear', 'closed_shoes']]],
  ['outer without mid', [['primary_top', 'shirt'], ['bottom', 'trousers'], ['outer_layer', 'light_jacket'], ['footwear', 'closed_shoes']]],
  ['mid without outer', [['primary_top', 'long_sleeve_t_shirt'], ['bottom', 'skirt'], ['mid_layer', 'cardigan'], ['footwear', 'ankle_boots']]],
  ['one-piece with both layers', [['one_piece', 'dress'], ['mid_layer', 'cardigan'], ['outer_layer', 'trench_coat'], ['footwear', 'ankle_boots']]],
  ['full stack', [['primary_top', 'long_sleeve_t_shirt'], ['bottom', 'jeans'], ['mid_layer', 'sweater'], ['outer_layer', 'trench_coat'], ['footwear', 'ankle_boots']]],
  ['winter', [['primary_top', 'long_sleeve_t_shirt'], ['bottom', 'trousers'], ['mid_layer', 'hoodie'], ['outer_layer', 'insulated_jacket'], ['footwear', 'weather_boots']]],
  ['all fallback', [['primary_top', '__none'], ['bottom', '__none'], ['mid_layer', '__none'], ['outer_layer', '__none'], ['footwear', '__none']]],
  ['mixed fallback', [['primary_top', 'sweatshirt'], ['bottom', '__future_type'], ['outer_layer', 'rain_jacket'], ['footwear', 'sneakers']]],
];

for (const [presetName, preset, min, max] of [
  ['today', todayPreset, 0.66, 1.14],
  ['detail', detailPreset, 0.66, 1.14],
]) {
  for (const [name, slots] of evidence) {
    test(`${presetName}: ${name} preserves clearance, stage limits and anchor parity`, () => {
      const pieces = slots.map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
      const result = composeGarmentBoard(pieces, preset);
      const measured = audit(result);
      // No piece touches another.
      assert.equal(measured.overlap, 0, `${name}: ${measured.overlap}`);
      assert.equal(measured.clip, 0);
      assert.ok(result.stageHeight >= min && result.stageHeight <= max, String(result.stageHeight));
      if (result.core.length === 2) assert.ok(Math.abs(measured.parity - 1) <= 1e-9);
      assert.equal(result.boxes.size, pieces.length);
      assert.deepEqual(result.stack.map(({ slot }) => slot),
        garmentBoardDressingOrder.filter((slot) => slots.some(([candidate]) => slot === candidate)));
      assert.deepEqual(result.order.map(({ slot }) => slot), [
        ...slots.map(([slot]) => slot).filter((slot) => ['primary_top', 'bottom', 'one_piece'].includes(slot)),
        ...['outer_layer', 'mid_layer', 'footwear'].filter((slot) => slots.some(([candidate]) => slot === candidate)),
      ]);
    });
  }
}

// The six Phase 6 README boards on the Phase 6 drawings: every board composes without
// clipping and without two pieces touching.
const readmeBoards = [
  ['warm casual', [['primary_top', 't_shirt'], ['bottom', 'jeans'], ['mid_layer', 'overshirt'], ['footwear', 'sneakers']]],
  ['rainy smart', [['primary_top', 'shirt'], ['bottom', 'trousers'], ['mid_layer', 'sweater'], ['outer_layer', 'rain_jacket'], ['footwear', 'ankle_boots']]],
  ['cold formal', [['primary_top', 'shirt'], ['bottom', 'trousers'], ['mid_layer', 'blazer'], ['outer_layer', 'coat'], ['footwear', 'closed_shoes']]],
  ['hot casual', [['one_piece', 'dress'], ['footwear', 'sandals']]],
  ['night out', [['one_piece', 'jumpsuit'], ['outer_layer', 'blazer'], ['footwear', 'ballet_flats']]],
  ['snow casual', [['primary_top', 'hoodie'], ['bottom', 'jeans'], ['outer_layer', 'insulated_jacket'], ['footwear', 'weather_boots']]],
];

for (const [presetName, preset] of [['today', todayPreset], ['detail', detailPreset]]) {
  for (const [name, slots] of readmeBoards) {
    test(`${presetName}: README board ${name} keeps its pieces apart and does not clip`, () => {
      const pieces = slots.map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
      const measured = audit(composeGarmentBoard(pieces, preset));
      assert.equal(measured.overlap, 0, name);
      assert.equal(measured.clip, 0, name);
    });
  }
}

// The worn board (ADR 0025 section 3): the core is one column with the bottom under the top,
// the footwear stands under the core's hem, and every layer stands beside the core, each
// `clearance` apart. The detail is the same board.
const boxOfSlot = (result, slot) => [...result.boxes].find(([piece]) => piece.slot === slot)?.[1];
for (const [name, slots] of evidence) {
  test(`today: ${name} is laid out as worn`, () => {
    const pieces = slots.map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
    const result = composeGarmentBoard(pieces, todayPreset);
    const box = (slot) => boxOfSlot(result, slot);
    const core = result.core.map((piece) => result.boxes.get(piece));
    const low = core[core.length - 1];
    if (core.length === 2) {
      // The waist stands `clearance.waist` of the top's height under its hem.
      assert.ok(Math.abs(core[1].y - core[0].y - core[0].h - todayPreset.clearance.waist * core[0].h) < 1e-9, name);
    }
    const foot = box('footwear');
    assert.ok(Math.abs(foot.y - low.y - low.h - todayPreset.clearance.foot * foot.h) < 1e-9, name);
    assert.ok(foot.x < low.x + low.w / 2 && foot.x + foot.w > low.x + low.w / 2, name);
    for (const slot of ['outer_layer', 'mid_layer']) {
      const layer = box(slot);
      if (!layer) continue;
      const coreRight = Math.max(...core.map((piece) => piece.x + piece.w));
      const narrowest = Math.min(...core.map((piece) => piece.w));
      assert.ok(Math.abs(layer.x - coreRight - todayPreset.clearance.side * narrowest) < 1e-9, `${name}: ${slot}`);
    }
  });
}

// P2: Today's stage holds only the board, so its top inset is the detail preset's.
test('the Today and detail presets share the stage insets', () => {
  assert.equal(todayPreset.topInset, detailPreset.topInset);
  assert.equal(todayPreset.botInset, detailPreset.botInset);
});

test('layout does not mutate artwork or depend on the input ordering', () => {
  const pieces = evidence[6][1].map(([slot, type]) => Object.freeze({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
  const first = composeGarmentBoard(Object.freeze(pieces));
  const reversed = composeGarmentBoard([...pieces].reverse());
  assert.deepEqual(first, reversed);
});

// ADR 0026 section 3: the detail draws Today's worn board at the scale Today's fitted stage
// reaches, so every piece keeps its place relative to the others and only grows.
for (const [name, slots] of evidence) {
  test(`detail: ${name} is Today's worn board at the fitted scale`, () => {
    const pieces = slots.map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
    const today = composeGarmentBoard(pieces, todayPreset);
    const detail = composeGarmentBoard(pieces, detailPreset);
    const origin = (result) => boxOfSlot(result, result.core[0].slot);
    for (const piece of today.order) {
      const a = boxOfSlot(today, piece.slot);
      const b = boxOfSlot(detail, piece.slot);
      const k = runwayPreset.maxScale;
      assert.ok(Math.abs(b.w - k * a.w) < 1e-9 && Math.abs(b.h - k * a.h) < 1e-9, `${name}: ${piece.slot}`);
      assert.ok(Math.abs(b.x - origin(detail).x - k * (a.x - origin(today).x)) < 1e-9, `${name}: ${piece.slot}`);
      assert.ok(Math.abs(b.y - origin(detail).y - k * (a.y - origin(today).y)) < 1e-9, `${name}: ${piece.slot}`);
    }
  });
}

// ADR 0025 section 2: a board's footwear is a flat-lay pair. Each shoe is `scale` of the one
// shoe, the far one `toe` of a shoe toward the toe and raised so the pair is one shoe tall.
test('the footwear pair box keeps one shoe height and stays near one shoe wide', () => {
  const single = { x: 0.3, y: 0.7, w: 0.2, h: 0.1 };
  const pair = footwearPairBox(single);
  assert.equal(pair.y, single.y);
  assert.equal(pair.h, single.h);
  assert.ok(Math.abs(pair.x - (single.x - footwearPair.back * single.w)) < 1e-12);
  assert.ok(Math.abs(pair.w - footwearPair.scale * (1 + footwearPair.toe) * single.w) < 1e-12);
  assert.ok(pair.w > single.w && pair.w < 1.15 * single.w);
});

test('both shoes of a pair land inside the pair bounds, the near one low at the heel, the far one high at the toe', () => {
  const { bounds: single } = resolveGarmentSilhouette('ankle_boots', 'footwear');
  const drawing = footwearPairDrawing(single);
  const { bounds } = drawing;
  const shoes = drawing.shoes.map(({ dx, dy }) => ({
    x: dx + drawing.scale * single.x, y: dy + drawing.scale * single.y,
    w: drawing.scale * single.width, h: drawing.scale * single.height,
  }));
  const [far, near] = shoes;
  for (const shoe of shoes) {
    assert.ok(shoe.x >= bounds.x - 1e-9 && shoe.x + shoe.w <= bounds.x + bounds.width + 1e-9);
    assert.ok(shoe.y >= bounds.y - 1e-9 && shoe.y + shoe.h <= bounds.y + bounds.height + 1e-9);
  }
  assert.ok(Math.abs(near.x - bounds.x) < 1e-9 && Math.abs(near.y + near.h - bounds.y - bounds.height) < 1e-9);
  assert.ok(Math.abs(far.y - bounds.y) < 1e-9 && Math.abs(far.x + far.w - bounds.x - bounds.width) < 1e-9);
  assert.ok(Math.abs(far.x - near.x - footwearPair.toe * near.w) < 1e-9);
});

for (const [name, slots] of evidence) {
  test(`pair: ${name} feeds the pair's drawn bounds to the composer`, () => {
    const pieces = slots.map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
    const result = composeGarmentBoard(pieces, todayPreset);
    const [foot, box] = [...result.boxes].find(([piece]) => piece.slot === 'footwear');
    const shoe = pieces.find(({ slot }) => slot === 'footwear');
    // The drawing keeps one shoe's bounds to draw twice; the composed piece is the pair.
    assert.deepEqual(foot.single, shoe.bounds);
    assert.deepEqual(foot.bounds, footwearPairDrawing(shoe.bounds).bounds);
    // The box keeps the pair's aspect, so the pair is drawn unstretched, and the drawn extent,
    // the centroid and the stage all read the pair.
    assert.ok(Math.abs(box.w / box.h - foot.bounds.width / foot.bounds.height) < 1e-9, name);
    const extent = drawnExtent(result.boxes.values());
    assert.ok(box.x + box.w <= extent.x + extent.w + 1e-12 && box.y + box.h <= extent.y + extent.h + 1e-12);
    assert.ok(box.x + box.w <= 1 - todayPreset.sideMin + 1e-9);
  });
}

// The runway preset (O17, P6): one uniform scale, the ladder untouched.
for (const [name, slots] of evidence) {
  test(`runway: ${name} fits its drawn extent to the free area without changing the ladder`, () => {
    const pieces = slots.map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
    const result = composeGarmentBoard(pieces, todayPreset);
    const extent = drawnExtent(result.boxes.values());
    for (const [width, height] of [[339, 516], [339, 490], [343, 200], [300, 900]]) {
      const scale = fitRunwayScale([extent], width, height);
      assert.ok(scale > 0);
      const placed = [...result.boxes.values()].map((box) => placeOnRunway(box, extent, scale, width, height));
      const left = Math.min(...placed.map((box) => box.x));
      const right = Math.max(...placed.map((box) => box.x + box.w));
      const top = Math.min(...placed.map((box) => box.y));
      const bottom = Math.max(...placed.map((box) => box.y + box.h));
      // Inside the area with the preset's margins, centred on the drawn extent.
      assert.ok(left >= runwayPreset.side - 1e-9 && right <= width - runwayPreset.side + 1e-9, name);
      assert.ok(top >= runwayPreset.vertical / 2 - 1e-9 && bottom <= height - runwayPreset.vertical / 2 + 1e-9, name);
      assert.ok(Math.abs(left + right - width) < 1e-9 && Math.abs(top + bottom - height) < 1e-9, name);
      // The limiting axis is filled exactly, unless the width cap stops the growth.
      const fillsWidth = Math.abs(right - left - (width - 2 * runwayPreset.side)) < 1e-9;
      const fillsHeight = Math.abs(bottom - top - (height - runwayPreset.vertical)) < 1e-9;
      assert.ok(fillsWidth || fillsHeight || scale === runwayPreset.maxScale * width, name);
      // Uniform scale: every box keeps its ADR 0025 size relative to every other.
      const boxes = [...result.boxes.values()];
      placed.forEach((box, index) => {
        assert.ok(Math.abs(box.w / boxes[index].w - scale) < 1e-9);
        assert.ok(Math.abs(box.h / boxes[index].h - scale) < 1e-9);
      });
    }
  });
}

test('runway: several compositions share the scale of the one that needs the least', () => {
  const small = { x: 0, y: 0, w: 0.5, h: 0.5 };
  const tall = { x: 0.1, y: 0.1, w: 0.5, h: 1 };
  assert.equal(fitRunwayScale([small, tall], 339, 516), fitRunwayScale([tall], 339, 516));
  assert.equal(fitRunwayScale([small], 0, 516), 0);
  assert.equal(fitRunwayScale([], 339, 516), 0);
});

// P2: Today's primary stage is the runway fit with the tight height. The three reference
// boards on a 339-point stage, laid out as worn, within half a point.
const p2Boards = [
  ['warm casual', [['primary_top', 't_shirt'], ['bottom', 'jeans'], ['mid_layer', 'overshirt'], ['footwear', 'sneakers']],
    { height: 255.7, extentW: 157.9, extentH: 231.7 }],
  ['rainy smart', [['primary_top', 'shirt'], ['bottom', 'trousers'], ['mid_layer', 'sweater'], ['outer_layer', 'rain_jacket'], ['footwear', 'ankle_boots']],
    { height: 316.2, extentW: 178.5, extentH: 292.2 }],
  ['cold formal', [['primary_top', 'shirt'], ['bottom', 'trousers'], ['mid_layer', 'blazer'], ['outer_layer', 'trench_coat'], ['footwear', 'closed_shoes']],
    { height: 279.0, extentW: 179.1, extentH: 255.0 }],
];

for (const [name, slots, expected] of p2Boards) {
  test(`Today stage: ${name} keeps its measured tight stage`, (context) => {
    const pieces = slots.map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
    const extent = drawnExtent(composeGarmentBoard(pieces, todayPreset).boxes.values());
    const { scale, height } = fitTodayStage(extent, 339);
    // The 1.25 cap binds on all three boards.
    assert.equal(scale, runwayPreset.maxScale * 339);
    assert.ok(Math.abs(height - expected.height) <= 0.5, `${name}: ${height}`);
    assert.ok(Math.abs(extent.w * scale - expected.extentW) <= 0.5, `${name}: ${extent.w * scale}`);
    assert.ok(Math.abs(extent.h * scale - expected.extentH) <= 0.5, `${name}: ${extent.h * scale}`);
    context.diagnostic(`${name}: stage ${height.toFixed(1)} pt, scale x${(scale / 339).toFixed(3)}`);
  });
}

for (const [name, slots] of evidence) {
  test(`Today stage: ${name} is the fitted board plus its margin, inside ADR 0025's clamp`, () => {
    const pieces = slots.map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
    const result = composeGarmentBoard(pieces, todayPreset);
    const extent = drawnExtent(result.boxes.values());
    for (const width of [339, 358, 402]) {
      const { scale, height } = fitTodayStage(extent, width);
      assert.ok(height >= todayPreset.stageMin * width - 1e-9 && height <= todayPreset.stageMax * width + 1e-9, name);
      // Tight: the stage never carries more than the vertical margin, unless the clamp's floor lifts it.
      assert.ok(height <= Math.max(todayPreset.stageMin * width, extent.h * scale + runwayPreset.vertical) + 1e-9, name);
      assert.ok(scale <= runwayPreset.maxScale * width + 1e-9, name);
      const placed = [...result.boxes.values()].map((box) => placeOnRunway(box, extent, scale, width, height));
      assert.ok(Math.min(...placed.map((box) => box.x)) >= runwayPreset.side - 1e-9, name);
      assert.ok(Math.max(...placed.map((box) => box.x + box.w)) <= width - runwayPreset.side + 1e-9, name);
      assert.ok(Math.min(...placed.map((box) => box.y)) >= runwayPreset.vertical / 2 - 1e-9, name);
      assert.ok(Math.max(...placed.map((box) => box.y + box.h)) <= height - runwayPreset.vertical / 2 + 1e-9, name);
    }
  });
}

// The piece shadow (ADR 0025 section 9) grows with the board's unit, and its visible reach,
// the drop plus two standard deviations of blur, stays inside every board's lower margin: the
// plain presets' bottom inset and, at Today's largest fit on a 440-point stage, half the
// runway preset's vertical margin.
test('the piece shadow scales with its board and stays inside the lower margin', () => {
  const shadow = garmentShadowOf(400);
  assert.ok(Math.abs(shadow.dx - garmentShadowRule.dx * 400) < 1e-9);
  assert.ok(Math.abs(shadow.dy - garmentShadowRule.dy * 400) < 1e-9);
  assert.ok(Math.abs(shadow.blur - garmentShadowRule.blur * 400) < 1e-9);
  assert.ok(Math.abs(shadow.margin - shadow.dy - garmentShadowRule.reach * shadow.blur) < 1e-9);
  const reach = garmentShadowRule.dy + 2 * garmentShadowRule.blur;
  assert.ok(reach < Math.min(todayPreset.botInset, detailPreset.botInset));
  assert.ok(reach * runwayPreset.maxScale * 440 < runwayPreset.vertical / 2);
  // Darker than the plane in both appearances, by more in light, where the plane is lighter.
  assert.ok(garmentShadowRule.step.light < garmentShadowRule.step.dark && garmentShadowRule.step.dark < 0);
});
