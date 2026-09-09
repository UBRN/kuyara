import assert from 'node:assert/strict';
import test from 'node:test';

import { audit, composeGarmentBoard, detailPreset, todayPreset } from './compose-garment-board.ts';
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
  ['today', todayPreset, 0.80, 1.16],
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
