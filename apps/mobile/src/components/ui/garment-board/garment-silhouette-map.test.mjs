import assert from 'node:assert/strict';
import test from 'node:test';

import { getGarmentType } from '../../../features/catalog/domain/garment-catalog.ts';
import { garmentTypeIds, structuralCategories } from '../../../features/catalog/domain/garment-taxonomy.ts';
import { categoryGlyphIds, garmentSilhouetteIds, resolveGarmentSilhouette } from './garment-silhouette-map.ts';
import { silhouettes } from './silhouettes.ts';

test('every outfit-eligible catalog type resolves to an existing silhouette', () => {
  const eligible = garmentTypeIds.filter((id) => getGarmentType(id).structuralCategory !== 'accessory');
  assert.equal(eligible.length, 27);
  for (const id of eligible) {
    assert.ok(garmentSilhouetteIds[id], id);
    assert.ok(silhouettes[garmentSilhouetteIds[id]], id);
  }
  for (const id of Object.values(garmentSilhouetteIds)) assert.ok(silhouettes[id], id);
});

test('each structural category has a usable fallback glyph', () => {
  for (const category of structuralCategories) {
    assert.ok(silhouettes[categoryGlyphIds[category]], category);
    assert.equal(resolveGarmentSilhouette('__future_type', category), silhouettes[categoryGlyphIds[category]]);
  }
});
