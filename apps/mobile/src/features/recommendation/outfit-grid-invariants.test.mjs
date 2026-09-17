// What the deterministic engine actually shows a user, measured over a weather grid instead
// of over a handful of profiles. The A2 evaluation of 2026-09-17 ran this grid once as a
// throwaway script and found the answers far less varied and far less wearable than the
// validity gate suggested; the numbers it produced are worth nothing unless a later change
// has to walk past them, so they live here as assertions.
//
// The grid: temperature {-5,0,5,10,15,18,22,27,32} x precipitation {dry, rain, snow}
// x wind {2, 11 m/s} x clothing preference {womens, mens} = 108 cells, minus the 24 snow
// cells above 5 C, which no sky produces and which A2 counted as a robustness probe rather
// than a measurement. That leaves 84 realistic cells, each with the full offered pool and
// the six deterministic trios {casual, smart, formal} x {weekday, weekend}: 1512 shown
// outfits. Everything comes from the functions the application itself calls, offline, with
// no Worker, no AI and no network.
import assert from 'node:assert/strict';
import test from 'node:test';

import { formalityLevels, formalityOrderByDressStyle } from '@kuyara/contracts';

import { listGarmentTypesForPreference, getGarmentType } from '@/features/catalog/domain/garment-catalog';

import {
  assignFallbackArchetypes,
  fallbackArchetypeOrderFor,
  recommendOutfits,
} from './application/recommend-outfits.ts';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
} from './domain/garment-eligibility.ts';
import { composeOutfitOptions } from './domain/outfit-composition.ts';
import { deriveClothingRequirements } from './domain/weather-to-clothing-requirements.ts';

const gridNow = '2026-09-14T12:00:00.000Z';
const temperatures = [-5, 0, 5, 10, 15, 18, 22, 27, 32];
const precipitations = {
  dry: { condition: 'clear', precipitationProbability: 0 },
  rain: { condition: 'rain', precipitationProbability: 0.7 },
  snow: { condition: 'snow', precipitationProbability: 0.7 },
};
const windSpeeds = [2, 11];
const clothingPreferences = ['womens', 'mens'];
const dressStyles = ['casual', 'smart', 'formal'];
const dayKinds = ['weekday', 'weekend'];

/**
 * The everyday wardrobe A2 measured against, ported from its `analyze.mjs`: the garment types
 * that answer to "t-shirt, shirt, sweater, jeans, trousers, sneakers, boots, coat, jacket".
 * It is a yardstick, not a product decision, and nothing in the engine ranks by it.
 */
const basicWardrobe = new Set([
  't_shirt', 'long_sleeve_t_shirt', 'shirt', 'sweater', 'sweatshirt', 'hoodie',
  'jeans', 'trousers',
  'sneakers', 'closed_shoes', 'ankle_boots', 'weather_boots',
  'coat', 'light_jacket',
]);

function weatherSnapshot(temperature, precipitation, windSpeed) {
  const measurements = {
    temperatureCelsius: temperature,
    apparentTemperatureCelsius: temperature,
    condition: precipitation.condition,
    precipitationProbability: precipitation.precipitationProbability,
    windSpeedMetersPerSecond: windSpeed,
    humidity: 0.6,
    uvIndex: 1,
  };
  return Object.freeze({
    source: { sourceId: 'sample', attributionId: null },
    observedAt: gridNow,
    timeZone: 'Europe/Istanbul',
    location: { latitude: 41, longitude: 29, placeNameKey: null },
    current: { observedAt: gridNow, ...measurements },
    hourly: [1, 2, 3].map((hour) => ({
      forecastAt: new Date(Date.parse(gridNow) + hour * 3600000).toISOString(),
      ...measurements,
    })),
    minimumTemperatureCelsius: temperature,
    maximumTemperatureCelsius: temperature,
  });
}

/** One cell's requirements and its offered pool, composed once and read by all six trios. */
function composeCell(temperature, precipitation, windSpeed, clothingPreference) {
  const snapshot = weatherSnapshot(temperature, precipitation, windSpeed);
  const requirements = deriveClothingRequirements(snapshot, gridNow);
  const composition = composeOutfitOptions(
    requirements,
    listGarmentTypesForPreference(clothingPreference).map((type) =>
      evaluateGarmentEligibility(
        requirements,
        projectCatalogEffectiveGarment(type.typeId, clothingPreference),
      )),
    0,
  );
  return { snapshot, requirements, composition };
}

/**
 * `recommendOutfits`' own deterministic tail, applied to a pool composed once. The pool does
 * not depend on dress style or day kind, so composing it per trio would compose each of the
 * 84 cells six times; `T0` asserts that this shortcut still answers what `recommendOutfits`
 * answers, so the grid cannot quietly drift away from the application's path.
 */
function shownTrio(cell, dressStyle, dayKind) {
  const order = formalityOrderByDressStyle[dressStyle];
  const outfits = cell.composition.outfits;
  return assignFallbackArchetypes(
    [...outfits].sort(
      (left, right) => order.indexOf(left.formality) - order.indexOf(right.formality),
    ),
    Math.min(3, outfits.length),
    dayKind,
    fallbackArchetypeOrderFor(cell.requirements),
  );
}

function garmentTypeIds(outfit) {
  const body = outfit.body.kind === 'separates'
    ? [outfit.body.primaryTop, outfit.body.bottom]
    : [outfit.body.onePiece];
  return [...body, outfit.midLayer, outfit.outerLayer, outfit.footwear]
    .filter((assigned) => assigned !== null)
    .map(({ garment }) => garment.garmentTypeId);
}

let gridCells;

/** The 84 realistic cells, each with its pool and its six shown trios. Built once. */
function grid() {
  gridCells ??= clothingPreferences.flatMap((clothingPreference) =>
    temperatures.flatMap((temperature) =>
      Object.entries(precipitations).flatMap(([precipitationName, precipitation]) =>
        // Snow above 5 C is not a day anyone gets; A2 dropped those cells from its
        // percentages and this suite never composes them.
        precipitationName === 'snow' && temperature > 5
          ? []
          : windSpeeds.map((windSpeed) => {
            const cell = composeCell(
              temperature, precipitation, windSpeed, clothingPreference,
            );
            return Object.freeze({
              name: `${clothingPreference}/${temperature}C/${precipitationName}/${windSpeed}`,
              temperature,
              precipitationName,
              windSpeed,
              clothingPreference,
              ...cell,
              trios: Object.freeze(dressStyles.flatMap((dressStyle) =>
                dayKinds.map((dayKind) => Object.freeze({
                  name: `${dressStyle}/${dayKind}`,
                  outfits: shownTrio(cell, dressStyle, dayKind),
                })))),
            });
          }))));
  return gridCells;
}

function shownOutfits() {
  return grid().flatMap((cell) =>
    cell.trios.flatMap(({ outfits }) => outfits.map((outfit) => ({ cell, outfit }))));
}

test('T0 the grid has the shape A2 measured, and its shortcut answers what recommendOutfits answers', () => {
  assert.equal(grid().length, 84);
  for (const cell of grid()) {
    assert.equal(cell.composition.status, 'composed', `${cell.name} composed nothing`);
    assert.equal(cell.trios.length, 6, cell.name);
    for (const trio of cell.trios) {
      assert.equal(trio.outfits.length, 3, `${cell.name} ${trio.name}`);
    }
  }
  assert.equal(shownOutfits().length, 1512);

  // One cell is enough to catch a drift: the shortcut differs from `recommendOutfits` only
  // in reusing the pool, and the pool is the same object for all six trios.
  const cell = grid().find(({ name }) => name === 'womens/15C/dry/2');
  for (const dressStyle of dressStyles) {
    for (const dayKind of dayKinds) {
      const direct = recommendOutfits({
        snapshot: cell.snapshot,
        now: gridNow,
        clothingPreference: cell.clothingPreference,
        dressStyle,
        dayVariant: 0,
        dayKind,
      });
      assert.deepEqual(
        shownTrio(cell, dressStyle, dayKind).map((outfit) =>
          `${outfit.optionId}/${outfit.archetypeId}`),
        direct.outfits.map((outfit) => `${outfit.optionId}/${outfit.archetypeId}`),
        `${cell.name} ${dressStyle}/${dayKind}`,
      );
    }
  }
});

test('T1 every shown outfit is valid, formality-consistent and shown once in its trio', () => {
  // A2's counter-evidence section: the validity gate held everywhere it looked, and this
  // Goal reorders the offer without touching it. A failure here is a validity regression,
  // not a diversity one.
  for (const { cell, outfit } of shownOutfits()) {
    for (const { requirement, status } of outfit.requirementEvaluations) {
      assert.ok(
        requirement.priority === 'optional' || status === 'met' || status === 'tradeoff',
        `${cell.name} showed an outfit with an unmet ${requirement.kind} requirement`,
      );
    }

    const ranks = garmentTypeIds(outfit).map((typeId) =>
      formalityLevels.indexOf(getGarmentType(typeId).formality));
    assert.ok(
      Math.max(...ranks) - Math.min(...ranks) <= 1,
      `${cell.name} showed an outfit spanning more than one formality step`,
    );
    assert.equal(
      outfit.formality,
      formalityLevels[Math.min(...ranks)],
      `${cell.name} showed an outfit whose formality is not its least formal garment`,
    );
  }

  for (const cell of grid()) {
    for (const trio of cell.trios) {
      const keys = trio.outfits.map(({ compositionKey }) => compositionKey);
      assert.equal(
        new Set(keys).size, keys.length,
        `${cell.name} ${trio.name} repeated an outfit`,
      );
    }
  }
});

test('T2 the shown outfits are built from everyday garments often enough', () => {
  // Mean share of everyday garments per shown outfit. A2 measured 37% over the whole grid on
  // 065cd22 and this Goal asked for 50%; the two ordering rules G1 owns carry it from 39.9%
  // on main f5d28e2 to 43.9% and no further, so the total is floored where the reordering
  // left it and G2 re-measures it once the thermal ladder changes which outfits are valid.
  //
  // Split by precipitation, because the three classes have different ceilings. A rain or a
  // snow day makes a waterproof outer layer mandatory, and the only waterproof outer layers
  // in the catalog are the rain jacket and the parka, neither of them in A2's everyday set,
  // so that slot is always outside it and a four-piece wet outfit tops out at 3 of 4. Its
  // footwear is not excluded the same way: weather boots are waterproof and are in the set,
  // and the best wet arrangement the engine offers at 10 C reaches 75%. Today's 30.6% is
  // therefore score order, not a hard ceiling, which is why the wet floors only lock the
  // present value while the dry cells are held to the Goal's own 50%.
  const shareOf = (measured) => measured.reduce((total, { outfit }) => {
    const typeIds = garmentTypeIds(outfit);
    return total + typeIds.filter((typeId) => basicWardrobe.has(typeId)).length /
      typeIds.length;
  }, 0) / measured.length;

  const shown = shownOutfits();
  const inClass = (precipitationName) =>
    shown.filter(({ cell }) => cell.precipitationName === precipitationName);

  // Measured after G1 on the 84-cell grid: dry 54.8% of 648, rain 30.6% of 648,
  // snow 51.4% of 216, total 43.9% of 1512.
  assert.ok(shareOf(shown) >= 0.43, `total share fell to ${(100 * shareOf(shown)).toFixed(1)}%`);
  for (const [precipitationName, floor] of [['dry', 0.5], ['rain', 0.3], ['snow', 0.51]]) {
    const share = shareOf(inClass(precipitationName));
    assert.ok(
      share >= floor,
      `${precipitationName} share fell to ${(100 * share).toFixed(1)}%`,
    );
  }
});

test('T3 sneakers reach the shown trio on mild dry days', () => {
  // A2/B6: `sneakers` appeared in 0 of 1512 shown outfits, because the comparator's last
  // tie-breaker was the composition key itself and `catalog:loafers` sorts before
  // `catalog:sneakers`. Mild dry cells are the 15, 18, 22 and 27 C dry ones, both winds and
  // both clothing preferences: 16 cells, the band where a sneaker is an obvious answer and
  // nothing about the weather rules it out. A cell counts when any of its six trios shows
  // one. Measured after the digest tie-breaker: 16 of 16, against 1 of 16 on main f5d28e2.
  const mildDry = grid().filter((cell) =>
    cell.precipitationName === 'dry' && [15, 18, 22, 27].includes(cell.temperature));
  assert.equal(mildDry.length, 16);

  const withSneakers = mildDry.filter((cell) =>
    cell.trios.some(({ outfits }) => outfits.some((outfit) =>
      outfit.footwear.garment.garmentTypeId === 'sneakers')));
  assert.ok(
    withSneakers.length >= mildDry.length / 2,
    `sneakers reached ${withSneakers.length} of ${mildDry.length} mild dry cells`,
  );
});

test('T4 the answer keeps changing as the temperature does', () => {
  // A2/B2: over a 45 C span the engine gave 5 different answers. Measured here on main
  // f5d28e2: 6, and 5 after G1, because the reordering merged two neighbouring bands. G2
  // owns this counter and takes it to 8 or more by putting real steps in the thermal
  // ladder; G1 only promises not to fall below what it leaves behind.
  const answers = new Set();
  for (let temperature = -10; temperature <= 35; temperature += 1) {
    const cell = composeCell(temperature, precipitations.dry, 2, 'womens');
    answers.add(cell.composition.status === 'composed'
      ? shownTrio(cell, 'smart', 'weekday')
        .map((outfit) => garmentTypeIds(outfit).join('+')).join(' | ')
      : 'unavailable');
  }

  assert.ok(answers.size >= 5, `only ${answers.size} distinct answers over -10..35 C`);
});

test('T5 archetype labels contradict the day no more often than they already do', () => {
  // A2/B8's definition: `snow_day` on a day that is not snowing, `rain_ready` on a dry or a
  // snowy day, `light_and_airy` at or below 10 C. A2 counted 430 of 1512; main f5d28e2 is
  // at 232 after the snow-day ordering fix, and G1 leaves 228. G3 owns this counter and
  // drives it to 0 by giving the archetype predicates the day; the ceiling here only stops
  // a reordering from making the labels worse on the way.
  const contradictions = shownOutfits().filter(({ cell, outfit }) =>
    (outfit.archetypeId === 'snow_day' && cell.precipitationName !== 'snow') ||
    (outfit.archetypeId === 'rain_ready' && cell.precipitationName !== 'rain') ||
    (outfit.archetypeId === 'light_and_airy' && cell.temperature <= 10));

  assert.ok(
    contradictions.length <= 228,
    `${contradictions.length} shown outfits carry a label the day contradicts`,
  );
});
