import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { gridRecommendationInput } from '../../../../test/recommendation-grid.mjs';
import { listGarmentTypesForPreference } from '../../catalog/domain/garment-catalog.ts';
import { evaluateGarmentEligibility, projectCatalogEffectiveGarment } from './garment-eligibility.ts';
import {
  accessoryOutfitSlots,
  assignedOutfitGarments,
  collectValidOutfits,
  composeOutfitOptions,
  composeOutfitsAroundPins,
  evaluateArrangement,
} from './outfit-composition.ts';
import { deriveClothingRequirements } from './weather-to-clothing-requirements.ts';

// What the composer hands back over a broad grid of days, digested. The composer is tuned for
// speed and split into modules over time; none of that may change one offered outfit, one
// score, one evaluation or the order they come in. A digest that moves means the output did.
//
// Every value is serialised with sorted keys and a mark on anything left unfrozen, so the
// digest reads what callers can observe and not the order a property was written in.
function canonical(value) {
  if (value === undefined) return '"~undefined"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const open = Object.isFrozen(value) ? '' : '~open';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]${open}`;
  return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}${open}`;
}

const now = '2026-08-01T08:00:00.000Z';

function snapshot({ temperature, condition, precipitation, wind, minimum, maximum }) {
  const measurements = {
    temperatureCelsius: temperature,
    apparentTemperatureCelsius: temperature - (wind > 8 ? 4 : 0),
    condition,
    precipitationProbability: precipitation,
    windSpeedMetersPerSecond: wind,
    humidity: 0.5,
    uvIndex: 3,
  };
  return {
    id: 'weather-output-grid',
    localProfileId: 'profile-output-grid',
    locationKey: 'manual:sample.istanbul',
    timeZone: 'UTC',
    fetchedAt: now,
    origin: { kind: 'sample', sourceId: 'output-grid' },
    current: { observedAt: now, ...measurements },
    minimumTemperatureCelsius: minimum ?? temperature - 3,
    maximumTemperatureCelsius: maximum ?? temperature + 3,
    hourly: Array.from({ length: 12 }, (_, hour) => ({
      forecastAt: new Date(Date.parse(now) + (hour + 1) * 3_600_000).toISOString(),
      ...measurements,
    })),
  };
}

const skies = [
  { sky: 'clear', condition: 'clear', precipitation: 0, wind: 1 },
  { sky: 'rain', condition: 'rain', precipitation: 0.8, wind: 5 },
  { sky: 'snow', condition: 'snow', precipitation: 0.7, wind: 3 },
  { sky: 'storm', condition: 'thunderstorm', precipitation: 0.95, wind: 13 },
];
const temperatures = [-14, 2, 13, 21, 30];

// Every cell is a day and a clothing preference: the temperature and sky grid, a day whose
// heat and cold collide, and the shared recommendation grid's own profiles.
function cells() {
  const days = [
    ...temperatures.flatMap((temperature) => skies.map(({ sky, ...weather }) => ({
      name: `${temperature}C ${sky}`,
      requirements: deriveClothingRequirements(snapshot({ temperature, ...weather }), now),
    }))),
    {
      name: 'hot noon, cold night',
      requirements: deriveClothingRequirements(snapshot({
        temperature: 29, condition: 'clear', precipitation: 0, wind: 2, minimum: 3, maximum: 31,
      }), now),
    },
    ...['hot', 'mild', 'cold_rain', 'freezing', 'windy', 'boundary_wind_rain', 'boundary_conflicting_day']
      .map((weather) => {
        const input = gridRecommendationInput(weather, 'womens', 'smart');
        return { name: weather, requirements: deriveClothingRequirements(input.snapshot, input.now) };
      }),
  ];
  return days.flatMap((day) => ['womens', 'mens'].map((preference) => ({
    ...day,
    name: `${day.name} ${preference}`,
    preference,
    candidates: listGarmentTypesForPreference(preference).map(({ typeId }) =>
      evaluateGarmentEligibility(day.requirements, projectCatalogEffectiveGarment(typeId, preference))),
  })));
}

const grid = cells();

// Today's offer at the first day variant, which several tests read.
const firstOffers = new Map();
function firstOffer(cell) {
  if (!firstOffers.has(cell)) firstOffers.set(cell, composeOutfitOptions(cell.requirements, cell.candidates, 0));
  return firstOffers.get(cell);
}

function digestOf(each) {
  const hash = createHash('sha256');
  grid.forEach((cell, index) => hash.update(`${cell.name}\n${each(cell, index)}\n`));
  return hash.digest('hex');
}

/** The worn record of an outfit as "Wore this today" writes it, accessories included. */
function wornRecord(outfit) {
  const pieces = [
    ...assignedOutfitGarments(outfit),
    ...accessoryOutfitSlots.map((slot) => outfit.accessories[slot]).filter((piece) => piece !== null),
  ];
  return {
    garments: Object.fromEntries(pieces.map(({ slot, garment }) => [slot, garment.garmentTypeId])),
    archetypeId: 'everyday_easy',
    formality: outfit.formality,
    source: 'recommended',
  };
}

test('the offered outfits are unchanged across day variants and recent wear', () => {
  const digest = digestOf((cell) => {
    const first = firstOffer(cell);
    const worn = first.status === 'composed'
      ? [0, 2, 5].flatMap((index) => first.outfits[index] ? [wornRecord(first.outfits[index])] : [])
      : [];
    return canonical([first, composeOutfitOptions(cell.requirements, cell.candidates, 7, worn)]);
  });
  assert.equal(digest, '652046fe5a393a9c2d1f5222842da6731f0834a8e3a2ffa9d874a8c448db6673');
});

test('every valid outfit keeps its place, score and evaluations', () => {
  const digest = digestOf(({ requirements, candidates }) => {
    const result = collectValidOutfits(requirements, candidates);
    if (result.status === 'failure') return canonical(result);
    return canonical([
      result.outfits.length,
      Object.isFrozen(result.outfits),
      result.outfits.map((outfit) => [outfit.compositionKey, outfit.score, outfit.penaltyPoints]),
      // Every 61st outfit in full, from the best one on: evaluations, aggregates, accessories.
      result.outfits.filter((_outfit, index) => index % 61 === 0),
    ]);
  });
  assert.equal(digest, '658cf3688b32822eb94b45567886bfa23b59de52e86e27308490e66aa57c5748');
});

const pinSets = [
  [{ slot: 'footwear', garmentTypeId: 'sneakers' }],
  [{ slot: 'primary_top', garmentTypeId: 't_shirt' }, { slot: 'bottom', garmentTypeId: 'jeans' }],
  [{ slot: 'one_piece', garmentTypeId: 'dress' }, { slot: 'outer_layer', garmentTypeId: 'blazer' }, { slot: 'footwear', garmentTypeId: 'sandals' }],
  [{ slot: 'mid_layer', garmentTypeId: 'sweater' }],
  [{ slot: 'primary_top', garmentTypeId: 'sweater' }, { slot: 'bottom', garmentTypeId: 'skirt' }, { slot: 'footwear', garmentTypeId: 'sneakers' }],
  [{ slot: 'outer_layer', garmentTypeId: 'parka' }, { slot: 'footwear', garmentTypeId: 'sandals' }],
  [{ slot: 'bottom', garmentTypeId: 'shorts' }, { slot: 'outer_layer', garmentTypeId: 'rain_jacket' }, { slot: 'mid_layer', garmentTypeId: 'cardigan' }],
  [{ slot: 'one_piece', garmentTypeId: 'jumpsuit' }],
  [{ slot: 'footwear', garmentTypeId: 'weather_boots' }, { slot: 'primary_top', garmentTypeId: 'shirt' }],
];

test('the picks around pinned pieces are unchanged, kept and dropped pins included', () => {
  // Two pin sets a cell, taken in turn, so every set meets every kind of day.
  const digest = digestOf(({ requirements, candidates }, index) => canonical([0, 1].map((step) => {
    const set = (2 * index + step) % pinSets.length;
    return composeOutfitsAroundPins(requirements, candidates, set, pinSets[set]);
  })));
  assert.equal(digest, 'ec97b419e91758498356e0b8c6e367fbd735068610f45f5573886e80a8c84bbd');
});

/** An arrangement from a composed outfit, with pieces looked up in the day's candidates. */
function arrangementOf(outfit, candidates) {
  const result = (assigned) => assigned === null
    ? null
    : candidates.find(({ candidateKey }) => candidateKey === assigned.garment.candidateKey);
  return {
    body: outfit.body.kind === 'separates'
      ? { kind: 'separates', primaryTop: result(outfit.body.primaryTop), bottom: result(outfit.body.bottom) }
      : { kind: 'one_piece', onePiece: result(outfit.body.onePiece) },
    midLayer: result(outfit.midLayer),
    outerLayer: result(outfit.outerLayer),
    footwear: result(outfit.footwear),
  };
}

test('an arrangement a person put together is judged as before, unsuitable pieces included', () => {
  const digest = digestOf((cell) => {
    const { requirements, candidates } = cell;
    const offered = firstOffer(cell);
    if (offered.status === 'failure') return 'failure';
    const withGarment = candidates.filter(({ garment }) => garment !== null);
    const ofCategory = (category) => withGarment.filter(({ garment }) => garment.properties.category === category);
    const base = arrangementOf(offered.outfits[0], candidates);
    const arrangements = [
      ...offered.outfits.slice(0, 3).map((outfit) => arrangementOf(outfit, candidates)),
      ...ofCategory('footwear').map((footwear) => ({ ...base, footwear })),
      ...ofCategory('outerwear').map((outerLayer) => ({ ...base, outerLayer })),
      { ...base, midLayer: null, outerLayer: null },
    ];
    return canonical(arrangements.map((arrangement) => evaluateArrangement(requirements, arrangement)));
  });
  assert.equal(digest, 'a8a4e6365ea939bc153f48ae4a97eeb37cafc04eaf278ba28e78ccb9211d00fd');
});

test('the failures stay the same: a conflicting key, no footwear, no body, no outer layer', () => {
  const digest = digestOf(({ requirements, candidates }) => {
    const without = (...categories) => candidates.filter(({ garment }) =>
      !categories.includes(garment?.properties.category));
    // Without coats and jackets a cold, wet or windy day composes nothing and says how close it came.
    const noOuterLayer = candidates.filter(({ garment }) =>
      !garment?.properties.supportedLayerRoles.includes('outer'));
    return canonical([
      collectValidOutfits(requirements, [...candidates, candidates[0]]),
      composeOutfitOptions(requirements, without('footwear'), 0),
      composeOutfitsAroundPins(requirements, without('top', 'one_piece'), 0, pinSets[0]),
      composeOutfitOptions(requirements, noOuterLayer, 0),
      composeOutfitsAroundPins(requirements, noOuterLayer, 1, pinSets[1]),
    ]);
  });
  assert.equal(digest, 'da58db714736aea4257c934758f5cd6e8072e2ff8dc3ce552bc4bc2362ad0c10');
});
