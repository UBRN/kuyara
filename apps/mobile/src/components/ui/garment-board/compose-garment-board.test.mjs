import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeGarmentBoard,
  detailPreset,
  drawnExtent,
  fitRunwayScale,
  fitTodayStage,
  garmentBoardDressingOrder,
  garmentShadowOf,
  garmentShadowRule,
  placeOnRunway,
  runwayPreset,
  todayPreset,
} from './compose-garment-board.ts';
import { resolveGarmentSilhouette } from './garment-silhouette-map.ts';

// Geometric audit; ink parity needs raster coverage, which vector assets do not carry.
// `overlap` is the deepest any piece reaches into one under it in the dressing order, as a
// share of the covered piece's drawn extent on the side it enters from.
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
      if (ox > 0 && oy > 0) overlap = Math.max(overlap, Math.min(ox / a.w, oy / a.h));
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
  ['detail', detailPreset, 0.60, 1.45],
]) {
  for (const [name, slots] of evidence) {
    test(`${presetName}: ${name} preserves clearance, stage limits and anchor parity`, () => {
      const pieces = slots.map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
      const result = composeGarmentBoard(pieces, preset);
      const measured = audit(result);
      // The open detail board never touches; the worn Today board laps by at most `lap`.
      assert.ok(measured.overlap <= preset.lap + 1e-9, `${name}: ${measured.overlap}`);
      assert.equal(measured.clip, 0);
      assert.ok(result.stageHeight >= min && result.stageHeight <= max, String(result.stageHeight));
      if (result.core.length === 2) assert.ok(Math.abs(measured.parity - 1) <= 1e-9);
      assert.equal(result.boxes.size, pieces.length);
      assert.equal(result.family, preset.lap > 0 || pieces.some(({ slot }) => slot.endsWith('_layer'))
        ? 'column-and-rail' : 'stagger');
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
// clipping, the detail board without overlap and Today's within its lap.
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
    test(`${presetName}: README board ${name} laps within the preset and does not clip`, () => {
      const pieces = slots.map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
      const measured = audit(composeGarmentBoard(pieces, preset));
      assert.ok(measured.overlap <= preset.lap + 1e-9, name);
      assert.equal(measured.clip, 0, name);
    });
  }
}

// The worn board (ADR 0025 section 3): the core is one column whose bottom's waist lies over
// the top's hem, the footwear stands at the core's foot with its sole below the hem, and every
// layer lies over the core's side. Only the detail board, which never laps, keeps the stagger.
for (const [name, slots] of evidence) {
  test(`today: ${name} is laid out as worn`, () => {
    const pieces = slots.map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
    const result = composeGarmentBoard(pieces, todayPreset);
    const box = (slot) => result.boxes.get(pieces.find((piece) => piece.slot === slot));
    const core = result.core.map((piece) => result.boxes.get(piece));
    const low = core[core.length - 1];
    if (core.length === 2) {
      // The waist covers the top's lowest `lap` of its height, never its collar.
      assert.ok(Math.abs(core[0].y + core[0].h - core[1].y - todayPreset.lap * core[0].h) < 1e-9, name);
    }
    const foot = box('footwear');
    assert.ok(foot.y + foot.h > low.y + low.h, name);
    assert.ok(Math.abs(low.y + low.h - foot.y - todayPreset.lap * foot.h) < 1e-9, name);
    assert.ok(foot.x < low.x + low.w / 2 && foot.x + foot.w > low.x + low.w / 2, name);
    for (const slot of ['outer_layer', 'mid_layer']) {
      const layer = box(slot);
      if (!layer) continue;
      const coreRight = Math.max(...core.map((piece) => piece.x + piece.w));
      assert.ok(layer.x < coreRight && layer.x + layer.w > coreRight, `${name}: ${slot}`);
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

test('detail pixel boxes stay inside the board with the rail right of the core and footwear lowest', () => {
  const width = 349;
  const pieces = evidence[6][1].map(([slot, type]) => ({
    slot,
    garmentTypeId: type,
    ...resolveGarmentSilhouette(type, categories[slot]),
  }));
  const result = composeGarmentBoard(pieces, detailPreset);
  const height = result.stageHeight * width;
  const boxes = result.order.map((piece) => {
    const box = result.boxes.get(piece);
    return {
      slot: piece.slot,
      x: box.x * width,
      y: box.y * width,
      width: box.w * width,
      height: box.h * width,
    };
  });
  const bySlot = new Map(boxes.map((box) => [box.slot, box]));
  const core = [bySlot.get('primary_top'), bySlot.get('bottom')];
  const rail = [bySlot.get('outer_layer'), bySlot.get('mid_layer')];
  const footwear = bySlot.get('footwear');

  assert.equal(boxes.length, pieces.length);
  assert.equal(boxes.every((box) =>
    box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height
  ), true);
  assert.ok(Math.min(...rail.map(({ x }) => x)) > Math.max(...core.map(({ x, width: boxWidth }) => x + boxWidth)));
  assert.ok(footwear.y + footwear.height > Math.max(
    ...boxes.filter(({ slot }) => slot !== 'footwear').map(({ y, height: boxHeight }) => y + boxHeight),
  ));
});

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
    { height: 236.8, extentW: 142.5, extentH: 212.8 }],
  ['rainy smart', [['primary_top', 'shirt'], ['bottom', 'trousers'], ['mid_layer', 'sweater'], ['outer_layer', 'rain_jacket'], ['footwear', 'ankle_boots']],
    { height: 289.1, extentW: 162.0, extentH: 265.1 }],
  ['cold formal', [['primary_top', 'shirt'], ['bottom', 'trousers'], ['mid_layer', 'blazer'], ['outer_layer', 'trench_coat'], ['footwear', 'closed_shoes']],
    { height: 258.2, extentW: 162.6, extentH: 234.2 }],
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

test('on the open board a wide layer never shrinks the footwear below its own width rule', () => {
  const categories = { one_piece: 'one_piece', outer_layer: 'outerwear', footwear: 'footwear' };
  const pieces = [['one_piece', 'knit_dress'], ['outer_layer', 'rain_jacket'], ['footwear', 'loafers']]
    .map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
  const result = composeGarmentBoard(pieces, detailPreset);
  const box = (slot) => result.boxes.get(pieces.find((piece) => piece.slot === slot));
  const expected = Math.min(detailPreset.footWidth * box('one_piece').w, detailPreset.railCap);
  assert.ok(Math.abs(box('footwear').w - expected) < 1e-9);
  // The jacket alone still takes the shared rail scale.
  assert.ok(box('outer_layer').w <= detailPreset.railCap + 1e-9);
});
