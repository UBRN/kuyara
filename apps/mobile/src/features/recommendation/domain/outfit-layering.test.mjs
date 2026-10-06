import assert from 'node:assert/strict';
import test from 'node:test';

import { getGarmentType, listGarmentTypesForPreference } from '../../catalog/domain/garment-catalog.ts';
import { evaluateGarmentEligibility, projectCatalogEffectiveGarment } from './garment-eligibility.ts';
import { collectValidOutfits, composeOutfitOptions } from './outfit-composition.ts';
import { offeredOutfitLimit } from './outfit-offer.ts';
import { deriveClothingRequirements } from './weather-to-clothing-requirements.ts';

// Layers go on in order: a mid layer is worn over a top that can be worn underneath, unless the
// mid layer is itself jacket-like (an overshirt, hoodie or puffer vest over a sweater). A
// turtleneck is never pulled over another top.

const now = '2026-10-07T12:00:00.000Z';

const days = Object.freeze({
  hot: { temperature: 31, apparent: 33, condition: 'clear', precipitation: 0, wind: 2 },
  warm: { temperature: 24, apparent: 24, condition: 'partly_cloudy', precipitation: 0.05, wind: 3 },
  mild: { temperature: 17, apparent: 17, condition: 'partly_cloudy', precipitation: 0.1, wind: 3 },
  windy: { temperature: 12, apparent: 8, condition: 'cloudy', precipitation: 0.1, wind: 11 },
  rain: { temperature: 11, apparent: 10, condition: 'rain', precipitation: 0.8, wind: 5 },
  cold_rain: { temperature: 6, apparent: 4, condition: 'rain', precipitation: 0.75, wind: 6 },
  cold: { temperature: 3, apparent: 0, condition: 'cloudy', precipitation: 0.1, wind: 4 },
  snow: { temperature: -3, apparent: -7, condition: 'snow', precipitation: 0.7, wind: 4 },
  deep_cold: { temperature: -15, apparent: -22, condition: 'snow', precipitation: 0.6, wind: 8 },
});

function snapshot({ temperature, apparent, condition, precipitation, wind }) {
  const measurements = {
    temperatureCelsius: temperature,
    apparentTemperatureCelsius: apparent,
    condition,
    precipitationProbability: precipitation,
    windSpeedMetersPerSecond: wind,
    humidity: 0.6,
    uvIndex: 2,
  };
  return {
    id: 'weather-layering',
    localProfileId: 'profile-layering',
    locationKey: 'manual:sample.istanbul',
    timeZone: 'UTC',
    fetchedAt: now,
    origin: { kind: 'sample', sourceId: 'layering' },
    current: { observedAt: now, ...measurements },
    minimumTemperatureCelsius: temperature - 3,
    maximumTemperatureCelsius: temperature + 2,
    hourly: Array.from({ length: 12 }, (_, hour) => ({
      forecastAt: new Date(Date.parse(now) + (hour + 1) * 3_600_000).toISOString(),
      ...measurements,
    })),
  };
}

const grid = ['womens', 'mens'].flatMap((preference) => Object.entries(days).map(([name, weather]) => {
  const requirements = deriveClothingRequirements(snapshot(weather), now);
  return {
    name: `${name} ${preference}`,
    requirements,
    candidates: listGarmentTypesForPreference(preference).map(({ typeId }) =>
      evaluateGarmentEligibility(requirements, projectCatalogEffectiveGarment(typeId, preference))),
  };
}));

function layeringFault(outfit) {
  if (outfit.midLayer === null || outfit.body.kind !== 'separates') return null;
  const top = outfit.body.primaryTop.garment.garmentTypeId;
  const mid = outfit.midLayer.garment.garmentTypeId;
  if (mid === 'turtleneck') return `turtleneck over ${top}`;
  const underneath = getGarmentType(top).supportedLayerRoles.includes('base');
  const jacketLike = getGarmentType(mid).supportedLayerRoles.includes('outer');
  return underneath || jacketLike ? null : `${mid} over ${top}`;
}

// A full offer is 24 outfits. A hot men's day wears no layers and its few pieces leave the
// diversity rule 15 meaningfully different outfits, layer order or not.
const offerSize = (name) => name === 'hot mens' ? 15 : offeredOutfitLimit;

function faultsOf(outfits) {
  return [...new Set(outfits.map(layeringFault).filter((fault) => fault !== null))];
}

for (const { name, requirements, candidates } of grid) {
  test(`${name}: every valid outfit layers in order`, () => {
    const result = collectValidOutfits(requirements, candidates);
    assert.equal(result.status, 'composed');
    assert.deepEqual(faultsOf(result.outfits), []);
  });

  test(`${name}: the offer layers in order and stays full`, () => {
    const offer = composeOutfitOptions(requirements, candidates, 0);
    assert.equal(offer.status, 'composed');
    assert.equal(offer.outfits.length, offerSize(name));
    assert.deepEqual(faultsOf(offer.outfits), []);
  });
}
