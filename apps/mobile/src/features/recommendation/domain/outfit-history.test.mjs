import assert from 'node:assert/strict';
import test from 'node:test';

import { historyDayKey, historyDays, sameWornGarments, wornAlready, wornOutfitFrom } from './outfit-history.ts';

const assigned = (slot, garmentTypeId) => ({ slot, garment: { garmentTypeId } });
const outfit = {
  body: { kind: 'separates', primaryTop: assigned('primary_top', 't_shirt'), bottom: assigned('bottom', 'jeans') },
  midLayer: null,
  outerLayer: assigned('outer_layer', 'rain_jacket'),
  footwear: assigned('footwear', 'sneakers'),
  accessories: { head: null, neck: null, hands: null, handheld: assigned('handheld', 'umbrella') },
  formality: 'casual',
  archetypeId: 'rain_ready',
};

test('a recommended outfit becomes one worn record with every assigned piece by slot', () => {
  assert.deepEqual(wornOutfitFrom(outfit), {
    garments: { primary_top: 't_shirt', bottom: 'jeans', outer_layer: 'rain_jacket',
      footwear: 'sneakers', handheld: 'umbrella' },
    archetypeId: 'rain_ready',
    formality: 'casual',
    source: 'recommended',
  });
});

test('the evening records under its bare date, beside the morning of the same day', () => {
  assert.equal(historyDayKey('2026-09-25:evening'), '2026-09-25');
  assert.equal(historyDayKey('2026-09-25'), '2026-09-25');
  assert.throws(() => historyDayKey('tomorrow'));
});

test('same garments compares pieces by slot, not archetype or source', () => {
  const worn = wornOutfitFrom(outfit);
  assert.equal(sameWornGarments(worn, { ...worn, archetypeId: 'everyday_easy', source: 'manual' }), true);
  const { handheld: _handheld, ...withoutUmbrella } = worn.garments;
  assert.equal(sameWornGarments(worn, { ...worn, garments: withoutUmbrella }), false);
});

test('a day already holds a look when one of its looks wears the same pieces', () => {
  const worn = wornOutfitFrom(outfit);
  const { handheld: _handheld, ...withoutUmbrella } = worn.garments;
  const other = { ...worn, garments: withoutUmbrella };
  assert.equal(wornAlready([], worn), false);
  assert.equal(wornAlready([other], worn), false);
  assert.equal(wornAlready([other, { ...worn, source: 'manual' }], worn), true);
});

test('History days run newest date first, and a date lists its looks morning first', () => {
  const look = (id, dayKey, wornAt) => ({ id, dayKey, wornAt });
  const days = historyDays([
    look('a-evening', '2026-10-02', '2026-10-02T17:30:00.000Z'),
    look('b', '2026-10-03', '2026-10-03T06:00:00.000Z'),
    look('a-morning', '2026-10-02', '2026-10-02T05:10:00.000Z'),
    look('a-noon', '2026-10-02', '2026-10-02T10:00:00.000Z'),
    look('c', '2026-09-30', '2026-09-30T08:00:00.000Z'),
  ]);
  assert.deepEqual(days.map(({ dayKey, looks }) => [dayKey, looks.map(({ id }) => id)]), [
    ['2026-10-03', ['b']],
    ['2026-10-02', ['a-morning', 'a-noon', 'a-evening']],
    ['2026-09-30', ['c']],
  ]);
  assert.deepEqual(historyDays([]), []);
});

// Migration 24: a day's piece colours are parsed once at the boundary against the swatch
// vocabulary and the day's own slots; anything else is no colour, never an error.
test('piece colours fit the worn day or are null', async () => {
  const { wornPieceColorsFor } = await import('./outfit-history.ts');
  const day = wornOutfitFrom(outfit);
  const colors = { primary_top: 'ecru', bottom: 'indigo', outer_layer: 'rainyellow', footwear: 'white', handheld: 'black' };
  assert.deepEqual(wornPieceColorsFor(day, colors), colors);
  assert.deepEqual(wornPieceColorsFor(day, { primary_top: 'ecru' }), { primary_top: 'ecru' });
  for (const invalid of [null, undefined, 'navy', [], {}, { primary_top: 'neon' }, { head: 'navy' },
    { primary_top: 'ecru', shoes: 'white' }, { primary_top: 7 }]) {
    assert.equal(wornPieceColorsFor(day, invalid), null, JSON.stringify(invalid));
  }
});
