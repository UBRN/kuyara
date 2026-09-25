import assert from 'node:assert/strict';
import test from 'node:test';

import {
  audit,
  composeGarmentBoard,
  detailPreset,
  drawnExtent,
  fitRunwayScale,
  placeOnRunway,
  runwayPreset,
  todayPreset,
} from './compose-garment-board.ts';
import { resolveGarmentSilhouette } from './garment-silhouette-map.ts';

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
      assert.equal(measured.overlap, 0);
      assert.equal(measured.clip, 0);
      assert.ok(result.stageHeight >= min && result.stageHeight <= max, String(result.stageHeight));
      if (result.core.length === 2) assert.ok(Math.abs(measured.parity - 1) <= 1e-9);
      assert.equal(result.boxes.size, pieces.length);
      assert.equal(result.family, pieces.some(({ slot }) => slot.endsWith('_layer')) ? 'column-and-rail' : 'stagger');
      assert.deepEqual(result.order.map(({ slot }) => slot), [
        ...slots.map(([slot]) => slot).filter((slot) => ['primary_top', 'bottom', 'one_piece'].includes(slot)),
        ...['outer_layer', 'mid_layer', 'footwear'].filter((slot) => slots.some(([candidate]) => slot === candidate)),
      ]);
    });
  }
}

// The six Phase 6 README boards on the Phase 6 drawings: the rule is unchanged and reads the
// new outline bounds, so every board still composes without overlap or clipping.
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
    test(`${presetName}: README board ${name} has no overlap and no clip`, () => {
      const pieces = slots.map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot]) }));
      const measured = audit(composeGarmentBoard(pieces, preset));
      assert.equal(measured.overlap, 0, name);
      assert.equal(measured.clip, 0, name);
    });
  }
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
