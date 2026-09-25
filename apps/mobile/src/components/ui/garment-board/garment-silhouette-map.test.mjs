import assert from 'node:assert/strict';
import test from 'node:test';

import { getGarmentType } from '../../../features/catalog/domain/garment-catalog.ts';
import { garmentTypeIds, structuralCategories } from '../../../features/catalog/domain/garment-taxonomy.ts';
import { categoryGlyphIds, garmentSilhouetteIds, resolveGarmentSilhouette } from './garment-silhouette-map.ts';
import { resolveGarmentPalette } from './garment-palette.ts';
import { silhouettes } from './silhouettes.ts';

test('every outfit-eligible catalog type resolves to an existing silhouette', () => {
  const eligible = garmentTypeIds.filter((id) => getGarmentType(id).structuralCategory !== 'accessory');
  assert.equal(eligible.length, 41);
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

test('each accessory type resolves to its own silhouette instead of the category glyph', () => {
  const accessoryMappings = {
    beanie: 'g-beanie',
    brimmed_hat: 'g-hat',
    cap: 'g-cap',
    balaclava: 'g-balaclava',
    scarf: 'g-scarf',
    neck_gaiter: 'g-scarf',
    gloves: 'g-gloves',
    umbrella: 'g-umbrella',
  };

  for (const [garmentTypeId, silhouetteId] of Object.entries(accessoryMappings)) {
    assert.equal(garmentSilhouetteIds[garmentTypeId], silhouetteId);
    assert.equal(resolveGarmentSilhouette(garmentTypeId, 'accessory'), silhouettes[silhouetteId]);
    assert.notEqual(resolveGarmentSilhouette(garmentTypeId, 'accessory'), silhouettes['g-cat-accessory']);
  }
});

// Phase 6's eight approved additions: each type that shared a drawing now has its own.
test('the eight Phase 6 types draw their own silhouettes', () => {
  const additions = {
    polo_shirt: 'x-polo', turtleneck: 'x-turtleneck', blouse: 'x-blouse', bomber_jacket: 'x-bomber',
    leather_jacket: 'x-leather', coat: 'x-coat', loafers: 'x-loafer', rain_boots: 'x-rainboot',
  };
  for (const [garmentTypeId, silhouetteId] of Object.entries(additions)) {
    assert.equal(garmentSilhouetteIds[garmentTypeId], silhouetteId);
    assert.equal(silhouettes[silhouetteId].id, silhouetteId);
  }
});

// The drawing and the palette's colourway are the same id for every mapped type, so a piece
// is coloured in the colours its own drawing comes in. The exceptions borrow a related
// colourway (garment-palette.ts); `coat` keeps the trench's, which the README boards measured.
test('every mapped type is coloured by the colourway of the drawing it resolves to', () => {
  for (const [garmentTypeId, silhouetteId] of Object.entries(garmentSilhouetteIds)) {
    const [colours] = resolveGarmentPalette({
      optionId: 'map', pieces: [{ slot: 'primary_top', garmentTypeId }], temperatureC: 15,
      condition: 'clear', isNight: false, formality: 'casual', appearance: 'light',
      stageColor: '#F4F6F5', inkColor: '#142F3B',
    });
    const shared = ['coat', 'fleece', 'sweatshirt', 'overshirt', 'long_skirt', 'track_pants', 'knit_dress', 'neck_gaiter'];
    if (!shared.includes(garmentTypeId)) assert.equal(colours.colorwayId, silhouetteId, garmentTypeId);
  }
});
