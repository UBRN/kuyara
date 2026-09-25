import assert from 'node:assert/strict';
import test from 'node:test';

import { historyDayKey, sameWornGarments, wornOutfitFrom } from './outfit-history.ts';

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

test('the evening records under its bare date, so one dressing day has one row', () => {
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
