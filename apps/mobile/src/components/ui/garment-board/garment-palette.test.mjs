import assert from 'node:assert/strict';
import test from 'node:test';

import { colorFamilies, garmentTypeIds } from '../../../features/catalog/domain/garment-taxonomy.ts';
import { darkTheme, lightTheme } from '../../../theme/theme.ts';
import {
  garmentColorFamiliesBySlot, garmentFillForAppearance, garmentPaletteMood, garmentPaletteRoutes,
  garmentSwatchColorFamilies, garmentSwatches, legalizeGarmentFill,
  resolveGarmentPalette, toGarmentOklch,
} from './garment-palette.ts';

const piece = (slot, garmentTypeId, recordedSwatchId) => ({ slot, garmentTypeId, recordedSwatchId });
const input = (overrides = {}) => ({
  optionId: 'test-option', pieces: [], temperatureC: 20, condition: 'clear',
  isNight: false, formality: 'casual', appearance: 'light',
  stageColor: lightTheme.atmosphere.clearDay,
  accessoryStageColor: lightTheme.colors.background,
  inkColor: lightTheme.colors.textPrimary,
  ...overrides,
});
const boards = [
  ['warm casual', 'opt-0925-a1', 22, 'clear', false, 'casual',
    [['primary_top','t_shirt'],['bottom','jeans'],['mid_layer','overshirt'],['footwear','sneakers'],['head','cap']],
    ['white','midwash','terracotta','white','stone']],
  ['rainy smart', 'opt-0925-b1', 12, 'rain', false, 'smart',
    [['primary_top','shirt'],['bottom','trousers'],['mid_layer','sweater'],['outer_layer','rain_jacket'],['footwear','ankle_boots'],['handheld','umbrella']],
    ['oxford','navy','charcoal','rainyellow','black','black']],
  ['cold formal', 'opt-0925-c1', 3, 'cloudy', false, 'formal',
    [['primary_top','shirt'],['bottom','trousers'],['mid_layer','blazer'],['outer_layer','coat'],['footwear','closed_shoes'],['neck','scarf'],['hands','gloves']],
    ['white','navy','charcoal','stone','black','burgundy','chocolate']],
  ['hot casual', 'opt-0925-d1', 30, 'clear', false, 'casual',
    [['one_piece','dress'],['footwear','sandals'],['head','brimmed_hat']],
    ['dustyrose','tan','camel']],
  ['night out', 'opt-0925-e1', 14, 'clear', true, 'smart',
    [['one_piece','jumpsuit'],['outer_layer','blazer'],['footwear','ballet_flats']],
    ['forest','charcoal','black']],
  ['snow casual', 'opt-0925-f1', -2, 'snow', false, 'casual',
    [['primary_top','hoodie'],['bottom','jeans'],['outer_layer','insulated_jacket'],['footwear','weather_boots'],['head','beanie'],['hands','gloves']],
    ['forest','indigo','black','black','ecru','camel']],
];
for (const [name, optionId, temperatureC, condition, isNight, formality, tuples, expected] of boards) {
  test(`${name}: README swatches and deterministic roles`, () => {
    const args = input({ optionId, temperatureC, condition, isNight, formality,
      pieces: tuples.map(([slot, type]) => piece(slot, type)) });
    const actual = resolveGarmentPalette(args);
    assert.deepEqual(actual.map(({ swatchId }) => swatchId), expected);
    assert.deepEqual(resolveGarmentPalette(args), actual);
    assert.ok(actual.every(({ legibility }) => legibility.A || legibility.B));
    assert.ok(actual.every(({ roles }) => Object.values(roles).every((hex) => /^#[0-9A-F]{6}$/.test(hex))));
    assert.ok(actual.filter(({ swatchId }) => garmentSwatches[swatchId].kind === 'accent').length <= 1);
  });
}

test('six boards in both appearances match README legibility counts', (context) => {
  const planes = ['clearDay', 'fallingDay', 'veiledDay', 'clearDay', 'clearNight', 'fallingDay'];
  const count = { A: 0, B: 0, moved: 0, largestMove: 0 };
  for (const [index, board] of boards.entries()) {
    const [, optionId, temperatureC, condition, isNight, formality, tuples] = board;
    for (const theme of [lightTheme, darkTheme]) {
      const appearance = theme.colorScheme;
      const pieces = tuples.map(([slot, type]) => piece(slot, type));
      const result = resolveGarmentPalette(input({ optionId, temperatureC, condition, isNight,
        formality, pieces, appearance, stageColor: theme.atmosphere[planes[index]],
        accessoryStageColor: theme.colors.background, inkColor: theme.colors.textPrimary }));
      for (const { legibility } of result) {
        count[legibility.route] += 1;
        if (legibility.moved !== 0) count.moved += 1;
        count.largestMove = Math.max(count.largestMove, Math.abs(legibility.moved));
      }
    }
  }
  assert.deepEqual({ A: count.A, B: count.B, moved: count.moved,
    largestMove: Number(count.largestMove.toFixed(3)) },
  { A: 32, B: 28, moved: 10, largestMove: 0.055 });
  context.diagnostic(`60 pieces: A ${count.A}, B ${count.B}, moved ${count.moved}, max |dL| ${count.largestMove.toFixed(3)}`);
});

test('weather mood uses approved thresholds and night override', () => {
  const mood = (temperatureC, condition, isNight = false) => garmentPaletteMood({ temperatureC, condition, isNight });
  assert.equal(mood(24, 'clear'), 'light');
  assert.equal(mood(10, 'clear'), 'mild');
  assert.equal(mood(9.9, 'rain'), 'cold');
  assert.equal(mood(20, 'drizzle'), 'wet');
  assert.equal(mood(20, 'sleet'), 'cold');
  assert.equal(mood(30, 'clear', true), 'night');
});

test('recorded swatch wins and suppresses a derived accent', () => {
  const [, optionId, temperatureC, condition, isNight, formality, tuples] = boards[0];
  const pieces = tuples.map(([slot, type]) => piece(slot, type, slot === 'bottom' ? 'cobalt' : undefined));
  const actual = resolveGarmentPalette(input({ optionId, temperatureC, condition, isNight, formality, pieces }));
  assert.equal(actual[1].swatchId, 'cobalt');
  assert.equal(actual[1].reason, 'recorded');
  assert.equal(actual[2].reason, 'neutral');
  assert.equal(actual.filter(({ swatchId }) => garmentSwatches[swatchId].kind === 'accent').length, 1);
});

test('formal derives deep accent on accessory only', () => {
  const [, optionId, temperatureC, condition, isNight, formality, tuples] = boards[2];
  const pieces = tuples.map(([slot, type]) => piece(slot, type));
  const actual = resolveGarmentPalette(input({ optionId, temperatureC, condition, isNight, formality, pieces }));
  const accents = actual.filter(({ swatchId }) => garmentSwatches[swatchId].kind === 'accent');
  assert.deepEqual(accents.map(({ swatchId, piece: { slot } }) => [swatchId, slot]), [['burgundy', 'neck']]);
});

test('all catalog types resolve and all 31 swatches have a closed colorFamily', () => {
  assert.equal(Object.keys(garmentSwatches).length, 31);
  assert.deepEqual(Object.keys(garmentSwatchColorFamilies).sort(), Object.keys(garmentSwatches).sort());
  for (const family of Object.values(garmentSwatchColorFamilies)) assert.ok(colorFamilies.includes(family));
  for (const garmentTypeId of garmentTypeIds) {
    const actual = resolveGarmentPalette(input({ pieces: [piece('primary_top', garmentTypeId)] }));
    assert.equal(actual.length, 1, garmentTypeId);
    assert.ok(garmentSwatches[actual[0].swatchId], garmentTypeId);
    assert.ok(Object.values(actual[0].roles).every((hex) => /^#[0-9A-F]{6}$/.test(hex)), garmentTypeId);
  }
});

test('31 x 8 swatch-stage matrix matches the approved clamp metrics', (context) => {
  const stages = [
    ...Object.entries(lightTheme.atmosphere).map(([name, stageColor]) => ({ name, stageColor,
      inkColor: lightTheme.colors.textPrimary, dark: false })),
    { name: 'dark', stageColor: darkTheme.atmosphere.neutral,
      inkColor: darkTheme.colors.textPrimary, dark: true },
  ];
  let moved = 0;
  let largestMove = 0;
  let minimumStep = Infinity;
  for (const [swatchId, swatch] of Object.entries(garmentSwatches)) {
    for (const stage of stages) {
      const transformed = garmentFillForAppearance(swatch.hex, stage.dark);
      const result = legalizeGarmentFill(transformed, stage.stageColor, stage.inkColor);
      const routes = garmentPaletteRoutes(result.hex, stage.stageColor, stage.inkColor);
      assert.ok(routes.A || routes.B, `${swatchId} on ${stage.name}`);
      const beforeHue = toGarmentOklch(transformed).H;
      const afterHue = toGarmentOklch(result.hex).H;
      const hueDrift = Math.abs(((afterHue - beforeHue + 540) % 360) - 180);
      assert.ok(hueDrift < 3, `${swatchId} on ${stage.name}: hue drift ${hueDrift}`);
      if (result.moved !== 0) moved += 1;
      largestMove = Math.max(largestMove, Math.abs(result.moved));
      minimumStep = Math.min(minimumStep, routes.cs);
    }
  }
  assert.equal(stages.length, 8);
  assert.equal(moved, 58);
  assert.equal(Number(largestMove.toFixed(3)), 0.060);
  assert.ok(minimumStep >= 1.2);
  context.diagnostic(`248 cells passed; moved ${moved}; max |dL| ${largestMove.toFixed(3)}; minimum fill:stage ${minimumStep.toFixed(3)}`);
});

test('an outfit piece keeps one colour family in both appearances (O7)', () => {
  const pieces = [piece('primary_top', 't_shirt'), piece('bottom', 'jeans'), piece('footwear', 'sneakers')];
  const palette = { optionId: 'o7', pieces, temperatureC: 18, condition: 'clear', isNight: false, formality: 'casual' };
  const families = garmentColorFamiliesBySlot(palette);
  for (const appearance of ['light', 'dark']) {
    const resolved = resolveGarmentPalette(input({ ...palette, appearance }));
    assert.deepEqual(resolved.map(({ piece: { slot }, colorFamily }) => [slot, colorFamily]),
      pieces.map(({ slot }) => [slot, families.get(slot)]));
  }
});
