import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendOutfits } from '../features/recommendation/application/recommend-outfits.ts';
import { outfitGarments } from '../features/recommendation/domain/manual-mix.ts';
import { getGarmentType } from '../features/catalog/domain/garment-catalog.ts';
import {
  composeGarmentBoard,
  drawnExtent,
  easierToSeeRule,
  garmentShadowRule,
  placeOnRunway,
  todayPreset,
} from './compose-garment-board.ts';
import { composeFlatLay, fitTodayStage, flatLayPreset, flatLayStack, structurePoints } from './compose-flat-lay.ts';
import { spacing } from '../theme/theme.ts';
import { resolveGarmentSilhouette } from './garment-silhouette-map.ts';

const categories = {
  primary_top: 'top', bottom: 'bottom', one_piece: 'one_piece',
  mid_layer: 'top', outer_layer: 'outerwear', footwear: 'footwear',
};
const piecesOf = (slots) => slots.map(([slot, type]) => ({ slot, ...resolveGarmentSilhouette(type, categories[slot], 'womens') }));

// The six README boards and the ten evidence slot lists of garment-board.md.
const boards = [
  ['warm casual', [['primary_top', 't_shirt'], ['bottom', 'jeans'], ['mid_layer', 'overshirt'], ['footwear', 'sneakers']]],
  ['rainy smart', [['primary_top', 'shirt'], ['bottom', 'trousers'], ['mid_layer', 'sweater'], ['outer_layer', 'rain_jacket'], ['footwear', 'ankle_boots']]],
  ['cold formal', [['primary_top', 'shirt'], ['bottom', 'trousers'], ['mid_layer', 'blazer'], ['outer_layer', 'coat'], ['footwear', 'closed_shoes']]],
  ['hot casual', [['one_piece', 'dress'], ['footwear', 'sandals']]],
  ['night out', [['one_piece', 'jumpsuit'], ['outer_layer', 'blazer'], ['footwear', 'ballet_flats']]],
  ['snow casual', [['primary_top', 'hoodie'], ['bottom', 'jeans'], ['outer_layer', 'insulated_jacket'], ['footwear', 'weather_boots']]],
  ['sunny', [['primary_top', 't_shirt'], ['bottom', 'shorts'], ['footwear', 'sneakers']]],
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

// Every unique outfit the recommender composes across a sweep of days, both catalogues and
// every day variant.
function day(temperature, condition, precipitation) {
  const now = {
    temperatureCelsius: temperature, apparentTemperatureCelsius: temperature, condition,
    precipitationProbability: precipitation, windSpeedMetersPerSecond: 3, humidity: 0.6, uvIndex: 1,
  };
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4', localProfileId: 'profile-one', locationKey: 'manual:sample.istanbul',
    timeZone: 'Europe/Istanbul', fetchedAt: '2026-08-13T06:05:00.000Z', origin: { kind: 'sample', sourceId: 'sample' },
    current: { observedAt: '2026-08-13T06:00:00.000Z', ...now },
    minimumTemperatureCelsius: temperature - 1, maximumTemperatureCelsius: temperature + 1,
    hourly: [{ forecastAt: '2026-08-13T07:00:00.000Z', ...now }],
  };
}
function recommendedOutfits() {
  const seen = new Map();
  for (const temperature of [-15, -8, -2, 4, 8, 12, 16, 20, 24, 28, 32]) {
    for (const [condition, precipitation] of [['clear', 0], ['rain', 0.8], ['snow', 0.6], ['cloudy', 0.2]]) {
      for (const clothingPreference of ['womens', 'mens']) {
        for (const dayVariant of [0, 1, 2, 3]) {
          const snapshot = day(temperature, condition, precipitation);
          const result = recommendOutfits({ snapshot, now: snapshot.current.observedAt, clothingPreference, dayVariant });
          if (result.status !== 'recommended') continue;
          for (const outfit of result.outfits) {
            const slots = Object.entries(outfitGarments(outfit));
            // Each catalogue's outfits in its own cut.
            seen.set(`${clothingPreference} ${slots.map((entry) => entry.join(':')).join(' ')}`,
              slots.map(([slot, id]) => ({ slot, ...resolveGarmentSilhouette(id, getGarmentType(id).structuralCategory, clothingPreference) })));
          }
        }
      }
    }
  }
  return seen;
}

// An audit independent of the composer's own: each piece's drawn box is sampled on a grid and a
// sample counts as covered when a piece stacked in front of it holds it; a structure point is
// hidden when a piece in front of it holds it.
function audit(result) {
  const stack = result.stack.map((piece) => [piece, result.boxes.get(piece)]);
  let worst = 0;
  const hidden = [];
  const holds = (box, x, y) => x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h;
  stack.forEach(([piece, box], index) => {
    const front = stack.slice(index + 1).map(([, other]) => other);
    let covered = 0;
    const n = 80;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = box.x + (i + 0.5) / n * box.w;
        const y = box.y + (j + 0.5) / n * box.h;
        if (front.some((other) => holds(other, x, y))) covered++;
      }
    }
    worst = Math.max(worst, covered / n / n);
    const k = box.w / piece.bounds.width;
    for (const point of structurePoints(piece)) {
      const x = box.x + (point.x - piece.bounds.x) * k;
      const y = box.y + (point.y - piece.bounds.y) * k;
      if (front.some((other) => holds(other, x, y))) hidden.push(`${piece.slot} ${point.kind}`);
    }
  });
  return { worst, hidden };
}

const overlaps = (a, b) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

/** The fitted stage in points and how far any piece leaves it or its margins. */
function fitted(result, width, large, stage = flatLayPreset.band) {
  const core = Math.max(...result.core.map((piece) => result.boxes.get(piece).w));
  const coreCap = flatLayPreset.coreWidth * (large ? 1.3 : 1);
  const extent = drawnExtent(result.boxes.values());
  const { scale, height } = fitTodayStage(extent, width, core, coreCap, stage);
  const placed = [...result.boxes.values()].map((box) => placeOnRunway(box, extent, scale, width, height));
  const clip = Math.max(0,
    stage.side - Math.min(...placed.map((box) => box.x)),
    Math.max(...placed.map((box) => box.x + box.w)) - (width - stage.side),
    stage.vertical / 2 - Math.min(...placed.map((box) => box.y)),
    Math.max(...placed.map((box) => box.y + box.h)) - (height - stage.vertical / 2));
  return { scale, height, clip, coreWidth: core * scale, coreCap };
}

const presets = [['plain', todayPreset, false], ['Easier to see', easierToSeeRule(todayPreset, 1.3, 0.05), true]];
const widths = [375, 393, 402, 440];
// Today's tiles: tomorrow's board, an Easier to see row, an idea, the alternates, and an
// alternate at full width with large text.
const tileWidths = [88, 128, 132, 164, 170, 358];
const stages = [...widths.map((width) => [width, flatLayPreset.band]), ...tileWidths.map((width) => [width, flatLayPreset.tile])];

for (const [presetName, preset, large] of presets) {
  for (const [name, slots] of boards) {
    test(`flat lay, ${presetName}: ${name} covers at most 30% of a piece, keeps every structure point and does not clip`, () => {
      const pieces = piecesOf(slots);
      const result = composeFlatLay(pieces, preset);
      const measured = audit(result);
      assert.ok(measured.worst <= flatLayPreset.cover + 0.01, `${name}: ${measured.worst}`);
      assert.deepEqual(measured.hidden, [], name);
      for (const [width, margins] of stages) {
        const stage = fitted(result, width, large, margins);
        assert.ok(stage.clip <= 1e-9, `${name} at ${width}: ${stage.clip}`);
        assert.ok(stage.coreWidth <= stage.coreCap + 1e-9, `${name} at ${width}`);
        assert.ok(stage.height >= todayPreset.stageMin * width - 1e-9 && stage.height <= todayPreset.stageMax * width + 1e-9);
      }
    });
  }
}

// The family lays the pieces over each other: on every board the footwear stands over a hem,
// and the layers reach under the core, the outer layer under the mid layer. A blazer next to
// the core stays beside it: in night out its right cuff is the drawing's right edge, and in
// cold formal it ends level with the shirt's hem, so any tuck under the core would cover it.
const layersApart = ['night out', 'cold formal'];
for (const [name, slots] of boards) {
  test(`flat lay: ${name} crosses its pieces where the worn board keeps them apart`, () => {
    const result = composeFlatLay(piecesOf(slots));
    const box = (slot) => [...result.boxes].find(([piece]) => piece.slot === slot)?.[1];
    const core = result.core.map((piece) => result.boxes.get(piece));
    const lowest = box('bottom') ?? core[0];
    assert.ok(overlaps(box('footwear'), lowest), `${name}: footwear`);
    const inner = box('mid_layer') ?? box('outer_layer');
    if (inner) assert.equal(overlaps(inner, core[0]), !layersApart.includes(name), `${name}: layers`);
    if (box('mid_layer') && box('outer_layer')) assert.ok(overlaps(box('outer_layer'), box('mid_layer')), `${name}: outer`);
  });
}

// One shape from two to five pieces: the bottom always beside the top, its waist above the
// top's hem, and the layers fanned out to the top's left, read outside in from left to right:
// outer layer, mid layer, top, bottom.
for (const [name, slots] of boards) {
  test(`flat lay: ${name} lays the bottom beside the top and the layers to its left`, () => {
    const result = composeFlatLay(piecesOf(slots));
    const box = (slot) => [...result.boxes].find(([piece]) => piece.slot === slot)?.[1];
    const top = result.boxes.get(result.core[0]);
    const row = [box('outer_layer'), box('mid_layer'), top, box('bottom')].filter(Boolean);
    for (let index = 1; index < row.length; index++) {
      const [left, right] = [row[index - 1], row[index]];
      assert.ok(left.x < right.x && left.x + left.w < right.x + right.w, `${name}: ${index}`);
    }
    if (box('bottom')) assert.ok(box('bottom').y < top.y + top.h, `${name}: bottom beside`);
  });
}

test('flat lay: the pieces stack outer layer, mid layer, bottom, top, footwear', () => {
  const result = composeFlatLay(piecesOf(boards[1][1]));
  assert.deepEqual(result.stack.map(({ slot }) => slot), ['outer_layer', 'mid_layer', 'bottom', 'primary_top', 'footwear']);
  assert.deepEqual(flatLayStack, ['outer_layer', 'mid_layer', 'bottom', 'primary_top', 'one_piece', 'footwear']);
  // The reading order is the worn board's.
  assert.deepEqual(result.order.map(({ slot }) => slot), ['primary_top', 'bottom', 'outer_layer', 'mid_layer', 'footwear']);
});

// ADR 0025's ladder and proportions: only the gaps close, so every piece keeps the size the
// worn board gives it.
for (const [presetName, preset] of presets) {
  test(`flat lay, ${presetName}: every piece keeps the worn board's size`, () => {
    for (const [name, slots] of boards) {
      const pieces = piecesOf(slots);
      const worn = composeGarmentBoard(pieces, preset);
      const flat = composeFlatLay(pieces, preset);
      for (const piece of worn.order) {
        const a = worn.boxes.get(piece);
        const b = [...flat.boxes].find(([candidate]) => candidate.slot === piece.slot)[1];
        assert.equal(b.w, a.w, `${name}: ${piece.slot}`);
        assert.equal(b.h, a.h, `${name}: ${piece.slot}`);
      }
    }
  });
}

test('flat lay: the recommender sweep stays within the cover limit, keeps every structure point and does not clip', (context) => {
  const outfits = recommendedOutfits();
  assert.ok(outfits.size >= 100, String(outfits.size));
  let worst = 0;
  let clipped = 0;
  for (const [presetName, preset, large] of presets) {
    for (const [key, pieces] of outfits) {
      const result = composeFlatLay(pieces, preset);
      const measured = audit(result);
      worst = Math.max(worst, measured.worst);
      assert.deepEqual(measured.hidden, [], `${presetName}: ${key}`);
      for (const [width, margins] of stages) if (fitted(result, width, large, margins).clip > 1e-9) clipped++;
    }
  }
  assert.ok(worst <= flatLayPreset.cover + 0.01, String(worst));
  assert.equal(clipped, 0);
  context.diagnostic(`${outfits.size} outfits, most covered piece ${(100 * worst).toFixed(1)}%, ${clipped} clipped`);
});

// A collar, a waist, a sleeve and a sole: where each drawing keeps them.
test('structure points sit on the collar, the waistband and the sleeve ends', () => {
  const at = (slot, type) => {
    const piece = { slot, ...resolveGarmentSilhouette(type, categories[slot], 'womens') };
    return Object.fromEntries(structurePoints(piece).map(({ kind, x, y }, index) => [`${kind}${index}`, [x, y]]));
  };
  const tee = at('primary_top', 't_shirt');
  // The tee's neckline at its top centre, its short sleeves ending under the shoulders, not at
  // the corners of its hem.
  assert.ok(Math.abs(tee.collar0[0] - 32) < 3.5 && tee.collar0[1] < 15, JSON.stringify(tee));
  assert.ok(tee.sleeve1[1] > 22 && tee.sleeve1[1] < 28 && tee.sleeve1[0] < 22, JSON.stringify(tee));
  assert.ok(tee.sleeve2[1] > 22 && tee.sleeve2[1] < 28 && tee.sleeve2[0] > 42, JSON.stringify(tee));
  // A long sleeve ends at its cuff, low on the drawing.
  const long = at('outer_layer', 'rain_jacket');
  const { bounds } = resolveGarmentSilhouette('rain_jacket', 'outerwear', 'womens');
  assert.ok(long.sleeve1[1] > bounds.y + 0.8 * bounds.height, JSON.stringify(long));
  // A bottom keeps its waistband, at the top centre.
  const [waist] = structurePoints({ slot: 'bottom', ...resolveGarmentSilhouette('jeans', 'bottom', 'womens') });
  assert.equal(waist.kind, 'waist');
  // A one-piece's sleeves sit in its upper half, never at a flared hem.
  const dress = at('one_piece', 'dress');
  const dressBounds = resolveGarmentSilhouette('dress', 'one_piece', 'womens').bounds;
  assert.ok(dress.sleeve1[1] < dressBounds.y + dressBounds.height / 2, JSON.stringify(dress));
  // Footwear stands in front of every piece, so its sole is never covered.
  assert.equal(flatLayStack.at(-1), 'footwear');
});

// The stage: one shared scale, the core never wider than 168 points (x 1.3 with Easier to see),
// the band's own margins, and ADR 0025's height clamp.
test('Today\'s stage fits the flat lay with the core capped at 168 points', () => {
  const result = composeFlatLay(piecesOf(boards[7][1]));
  const stage = fitted(result, 393, false);
  assert.ok(Math.abs(stage.coreWidth - 168) < 1e-9, String(stage.coreWidth));
  const large = fitted(composeFlatLay(piecesOf(boards[3][1]), easierToSeeRule(todayPreset, 1.3, 0.05)), 393, true);
  assert.ok(large.coreWidth > 168 && large.coreWidth <= 168 * 1.3 + 1e-9, String(large.coreWidth));
  // The piece shadow's reach stays inside the band's lower margin at the largest scale.
  const unit = (168 * 1.3) / (todayPreset.coreCap * 1.3);
  assert.ok((garmentShadowRule.dy + 2 * garmentShadowRule.blur) * unit < flatLayPreset.band.vertical / 2);
});

// A tile fits the same flat lay with the same core cap inside margins on the spacing ladder.
// They hold the piece shadow's reach below and to the right at the largest scale, so a tile's
// clipped edge never cuts a shadow. The tile is as tall as its fitted flat lay, within the clamp.
test('Today\'s tiles fit the flat lay inside margins on the spacing ladder', () => {
  assert.deepEqual(flatLayPreset.tile, { side: spacing.md, vertical: 2 * spacing.lg });
  const unit = (168 * 1.3) / (todayPreset.coreCap * 1.3);
  assert.ok((garmentShadowRule.dy + 2 * garmentShadowRule.blur) * unit < flatLayPreset.tile.vertical / 2);
  assert.ok((garmentShadowRule.dx + 2 * garmentShadowRule.blur) * unit < flatLayPreset.tile.side);
  // The full stack, wider than tall, fills the tile's width.
  const result = composeFlatLay(piecesOf(boards[12][1]));
  const extent = drawnExtent(result.boxes.values());
  const tile = fitted(result, 164, false, flatLayPreset.tile);
  assert.ok(Math.abs(tile.height - Math.max(todayPreset.stageMin * 164, extent.h * tile.scale + flatLayPreset.tile.vertical)) < 1e-9);
  assert.ok(Math.abs(extent.w * tile.scale - (164 - 2 * flatLayPreset.tile.side)) < 1e-9, String(tile.scale));
});
