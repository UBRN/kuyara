import assert from 'node:assert/strict';
import test from 'node:test';

import { clothingPreferences } from '../domain/preferences.ts';
import { getGarmentType } from '../features/catalog/domain/garment-catalog.ts';
import { garmentTypeIds, structuralCategories } from '../features/catalog/domain/garment-taxonomy.ts';
import {
  categoryGlyphIds,
  colorwayKeyOf,
  garmentSilhouetteIdFor,
  garmentSilhouetteIds,
  resolveGarmentSilhouette,
} from './garment-silhouette-map.ts';
import { resolveGarmentPalette } from './garment-palette.ts';
import { silhouettes } from './silhouettes.ts';

const bodyTypes = garmentTypeIds.filter((id) => getGarmentType(id).structuralCategory !== 'accessory');
const inBothCatalogs = (id) => getGarmentType(id).apparelPreferenceApplicability.length === clothingPreferences.length;

test('every catalog type resolves to an existing silhouette in both cuts', () => {
  assert.equal(bodyTypes.length, 41);
  for (const cut of clothingPreferences) {
    for (const id of garmentTypeIds) {
      assert.ok(silhouettes[garmentSilhouetteIdFor(id, cut)], `${cut} ${id}`);
      assert.equal(resolveGarmentSilhouette(id, getGarmentType(id).structuralCategory, cut),
        silhouettes[garmentSilhouetteIds[cut][id]], `${cut} ${id}`);
    }
  }
});

test('each structural category has a usable fallback glyph', () => {
  for (const cut of clothingPreferences) {
    for (const category of structuralCategories) {
      assert.ok(silhouettes[categoryGlyphIds[category]], category);
      assert.equal(resolveGarmentSilhouette('__future_type', category, cut), silhouettes[categoryGlyphIds[category]]);
    }
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

  for (const cut of clothingPreferences) {
    for (const [garmentTypeId, silhouetteId] of Object.entries(accessoryMappings)) {
      assert.equal(colorwayKeyOf(garmentSilhouetteIdFor(garmentTypeId, cut)), silhouetteId);
      assert.notEqual(resolveGarmentSilhouette(garmentTypeId, 'accessory', cut), silhouettes['g-cat-accessory']);
    }
  }
});

// Phase 6's eight approved additions: each type that shared a drawing now has its own.
test('the eight Phase 6 types draw their own silhouettes', () => {
  const additions = {
    polo_shirt: 'x-polo', turtleneck: 'x-turtleneck', blouse: 'x-blouse', bomber_jacket: 'x-bomber',
    leather_jacket: 'x-leather', coat: 'x-coat', loafers: 'x-loafer', rain_boots: 'x-rainboot',
  };
  for (const cut of clothingPreferences) {
    for (const [garmentTypeId, silhouetteId] of Object.entries(additions)) {
      assert.equal(colorwayKeyOf(garmentSilhouetteIdFor(garmentTypeId, cut)), silhouetteId);
    }
  }
});

// A type takes one colourway in both cuts: the base of the drawing it resolves to, so a cut's
// own drawing (`<base>-f`, `<base>-m`) is coloured from the same list as the other cut's.
test('every type is coloured by the base colourway of the drawing it resolves to, in both cuts', () => {
  for (const garmentTypeId of garmentTypeIds) {
    const [colours] = resolveGarmentPalette({
      optionId: 'map', pieces: [{ slot: 'primary_top', garmentTypeId }], temperatureC: 15,
      condition: 'clear', isNight: false, formality: 'casual', appearance: 'light',
      stageColor: '#F4F6F5', inkColor: '#142F3B',
    });
    for (const cut of clothingPreferences) {
      assert.equal(colorwayKeyOf(garmentSilhouetteIdFor(garmentTypeId, cut)), colours.colorwayId, `${cut} ${garmentTypeId}`);
    }
  }
});

test('a cut drawing shares its base colourway; a base id keeps its own', () => {
  assert.equal(colorwayKeyOf('g-shirt-f'), 'g-shirt');
  assert.equal(colorwayKeyOf('x-loafer-m'), 'x-loafer');
  assert.equal(colorwayKeyOf('g-shirt'), 'g-shirt');
  assert.equal(colorwayKeyOf('g-cat-footwear'), 'g-cat-footwear');
});

// A women's-only type has one drawing, the women's, in both cuts, so a piece a profile keeps
// after its gender changes is still drawn.
test('a women\'s-only type draws the same drawing in both cuts', () => {
  for (const id of garmentTypeIds.filter((type) => !inBothCatalogs(type))) {
    assert.equal(garmentSilhouetteIdFor(id, 'mens'), garmentSilhouetteIdFor(id, 'womens'), id);
  }
});

// A type both catalogs carry is drawn masculine for men and feminine
// for women, never one drawing for both, and no drawing serves two types of one cut.
test('a body type both catalogs carry resolves to a women\'s and a men\'s drawing', () => {
  for (const id of bodyTypes.filter(inBothCatalogs)) {
    assert.match(garmentSilhouetteIdFor(id, 'womens'), /-f$/, id);
    assert.match(garmentSilhouetteIdFor(id, 'mens'), /-m$/, id);
  }
  for (const id of bodyTypes.filter((type) => !inBothCatalogs(type))) {
    assert.match(garmentSilhouetteIdFor(id, 'womens'), /-f$/, id);
  }
  for (const cut of clothingPreferences) {
    const drawn = bodyTypes.filter((id) => getGarmentType(id).apparelPreferenceApplicability.includes(cut))
      .map((id) => garmentSilhouetteIdFor(id, cut));
    assert.equal(new Set(drawn).size, drawn.length, cut);
  }
});
