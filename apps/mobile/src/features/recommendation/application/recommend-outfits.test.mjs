import assert from 'node:assert/strict';
import test from 'node:test';

import { archetypeDayFromRequirements, outfitArchetypeIds } from '@kuyara/contracts';

import { messages } from '@/localization/messages';
import {
  assignedOutfitGarments,
  collectValidOutfits,
} from '@/features/recommendation/domain/outfit-composition';
import { deriveClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import {
  composeOutfitPool,
  eligibilityCandidates,
  excludeOutfitOptions,
  outfitMatchesArchetype,
  outfitOptionId,
  recommendOutfits,
} from './recommend-outfits.ts';
import { createRecommendationContextWithPool } from './recommendation-context.ts';

test('the same derived pool is reused when fallback follows context creation', () => {
  const weather = snapshot();
  const first = composeOutfitPool(
    deriveClothingRequirements(weather, observedAt), 'womens', 0,
  );
  const fallback = composeOutfitPool(
    deriveClothingRequirements(weather, observedAt), 'womens', 0,
  );
  assert.strictEqual(fallback, first);
  assert.notStrictEqual(composeOutfitPool(
    deriveClothingRequirements(weather, observedAt), 'mens', 0,
  ), first);
});

// A pool read back from storage lists the same requirements with their properties in the
// schema's order, not the order the derivation writes them in, and it is the same pool.
function withReversedKeys(value) {
  if (Array.isArray(value)) return value.map(withReversedKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, nested]) => [key, withReversedKeys(nested)]));
  }
  return value;
}

test('requirements that list the same properties in another order share the composed pool', () => {
  const derived = deriveClothingRequirements(snapshot(), observedAt);
  const stored = withReversedKeys(derived);
  assert.notEqual(JSON.stringify(stored), JSON.stringify(derived));
  assert.strictEqual(composeOutfitPool(stored, 'womens', 0), composeOutfitPool(derived, 'womens', 0));
});

const observedAt = '2026-08-01T18:00:00.000Z';
const futureAt = '2026-08-01T19:00:00.000Z';

function measurements(overrides = {}) {
  return {
    temperatureCelsius: 20,
    apparentTemperatureCelsius: 20,
    condition: 'clear',
    precipitationProbability: 0,
    windSpeedMetersPerSecond: 0,
    humidity: 0.5,
    uvIndex: 0,
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  const current = {
    observedAt,
    ...measurements(overrides.current),
  };
  const hourly = overrides.hourly ?? [
    {
      forecastAt: futureAt,
      ...measurements({
        temperatureCelsius: current.temperatureCelsius,
        apparentTemperatureCelsius: current.apparentTemperatureCelsius,
        condition: current.condition,
        precipitationProbability: current.precipitationProbability,
        windSpeedMetersPerSecond: current.windSpeedMetersPerSecond,
      }),
    },
  ];

  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
    localProfileId: 'profile-one',
    locationKey: 'manual:sample.istanbul',
    timeZone: 'UTC',
    fetchedAt: observedAt,
    origin: { kind: 'sample', sourceId: 'recommend-outfits-test' },
    current,
    minimumTemperatureCelsius:
      overrides.minimumTemperatureCelsius ?? current.temperatureCelsius,
    maximumTemperatureCelsius:
      overrides.maximumTemperatureCelsius ?? current.temperatureCelsius + 1,
    hourly,
    ...overrides.snapshotFields,
  };
}

function coldWetSnapshot() {
  return snapshot({
    current: {
      temperatureCelsius: 0,
      apparentTemperatureCelsius: -2,
      condition: 'heavy_rain',
      precipitationProbability: 1,
      windSpeedMetersPerSecond: 12,
    },
    minimumTemperatureCelsius: -2,
    maximumTemperatureCelsius: 2,
  });
}

function warmWetSnapshot() {
  return snapshot({
    current: {
      temperatureCelsius: 20,
      apparentTemperatureCelsius: 18,
      condition: 'rain',
      precipitationProbability: 1,
      windSpeedMetersPerSecond: 8,
    },
    minimumTemperatureCelsius: 18,
    maximumTemperatureCelsius: 22,
  });
}

function candidateKeys(result) {
  return result.outfits.flatMap((outfit) => outfit.candidateKeys);
}

test('Formal dress style selects the mens suit on a mild dry day', () => {
  const input = { snapshot: snapshot(), now: observedAt,
    clothingPreference: 'mens', dayVariant: 0, dayKind: 'weekday' };
  const smart = recommendOutfits({ ...input, dressStyle: 'smart' });
  const formal = recommendOutfits({ ...input, dressStyle: 'formal' });

  assert.equal(smart.status, 'recommended');
  assert.equal(formal.status, 'recommended');
  assert.equal(formal.outfits[0].formality, 'formal');
  assert.equal(formal.outfits[0].body.primaryTop.garment.garmentTypeId, 'shirt');
  assert.equal(formal.outfits[0].body.bottom.garment.garmentTypeId, 'trousers');
  assert.equal(formal.outfits[0].outerLayer.garment.garmentTypeId, 'blazer');
  assert.equal(formal.outfits[0].footwear.garment.garmentTypeId, 'closed_shoes');
  assert.notDeepEqual(formal.outfits.map(({ optionId }) => optionId),
    smart.outfits.map(({ optionId }) => optionId));
});

test('extreme weather pipeline composes three distinct valid catalog outfits', () => {
  const cases = [
    ['below minus fifteen', { temperatureCelsius: -18, apparentTemperatureCelsius: -22,
      condition: 'clear', precipitationProbability: 0, windSpeedMetersPerSecond: 2 }],
    ['above thirty eight', { temperatureCelsius: 40, apparentTemperatureCelsius: 42,
      condition: 'clear', precipitationProbability: 0, windSpeedMetersPerSecond: 2 }],
    ['wind and precipitation', { temperatureCelsius: 12, apparentTemperatureCelsius: 8,
      condition: 'heavy_rain', precipitationProbability: 1, windSpeedMetersPerSecond: 18 }],
  ];
  for (const [label, reading] of cases) {
    const weather = snapshot({ current: reading,
      minimumTemperatureCelsius: reading.temperatureCelsius - 2,
      maximumTemperatureCelsius: reading.temperatureCelsius + 2 });
    for (const clothingPreference of ['womens', 'mens']) {
      const result = recommendOutfits({ snapshot: weather, now: observedAt,
        clothingPreference, dayVariant: 3, dayKind: 'weekday' });
      assert.equal(result.status, 'recommended', `${label}: ${clothingPreference}`);
      assert.equal(result.outfits.length, 3, `${label}: ${clothingPreference}`);
      assert.equal(new Set(result.outfits.map(({ optionId }) => optionId)).size, 3,
        `${label}: ${clothingPreference}`);
      assert.ok(result.outfits.every((outfit) => outfit.candidateKeys.every((key) =>
        key.startsWith('catalog:'))), `${label}: ${clothingPreference}`);
      assert.ok(result.outfits.every((outfit) => outfit.requirementEvaluations.every(
        ({ requirement, status }) => requirement.priority === 'optional' || status === 'met'
          || status === 'tradeoff')), `${label}: ${clothingPreference}`);
    }
  }
});

test('late mild and severe cold tails retain three valid catalog outfits', () => {
  const at = '2026-08-01T18:00:00.000Z';
  for (const tail of [[11], [11, 11], [4]]) {
    const hours = tail.length === 2
      ? ['2026-08-01T23:00:00.000Z', '2026-08-02T00:00:00.000Z']
      : ['2026-08-02T00:00:00.000Z'];
    const weather = snapshot({
      current: { temperatureCelsius: 20, apparentTemperatureCelsius: 20 },
      hourly: [
        { forecastAt: at, ...measurements() },
        ...hours.map((forecastAt, index) => ({ forecastAt,
          ...measurements({ temperatureCelsius: tail[index],
            apparentTemperatureCelsius: tail[index] }) })),
      ],
    });
    for (const clothingPreference of ['womens', 'mens']) {
      const result = recommendOutfits({ snapshot: weather, now: at, clothingPreference,
        dayVariant: 0, dayKind: 'weekday' });
      assert.equal(result.status, 'recommended');
      assert.equal(result.outfits.length, 3);
    }
  }
});

test('hot start with a severe late cold hour still composes three outfits', () => {
  const at = '2026-08-01T18:00:00.000Z';
  const weather = snapshot({
    current: { temperatureCelsius: 30, apparentTemperatureCelsius: 30 },
    hourly: [
      { forecastAt: at, ...measurements({ temperatureCelsius: 30,
        apparentTemperatureCelsius: 30 }) },
      { forecastAt: '2026-08-02T00:00:00.000Z', ...measurements({
        temperatureCelsius: 4, apparentTemperatureCelsius: 4 }) },
    ],
  });
  for (const clothingPreference of ['womens', 'mens']) {
    const result = recommendOutfits({ snapshot: weather, now: at, clothingPreference,
      dayVariant: 0, dayKind: 'weekday' });
    assert.equal(result.status, 'recommended');
    assert.equal(result.outfits.length, 3);
  }
});

test('cold wet weather recommends immutable deterministic catalog outfits', () => {
  const weather = coldWetSnapshot();
  const result = recommendOutfits({
    now: observedAt,
    snapshot: weather,
    clothingPreference: 'womens',
  });

  assert.equal(result.status, 'recommended');
  assert.equal(result.generationMode, 'deterministic-fallback');
  assert.equal(result.outfits.length >= 1 && result.outfits.length <= 3, true);
  assert.deepEqual(result.requirements, deriveClothingRequirements(weather, observedAt));
  assert.equal(result.outfits.every((outfit) =>
    outfit.requirementEvaluations.every(({ requirement, status }) =>
      requirement.priority === 'optional' ||
      status === 'met' ||
      status === 'tradeoff',
    )), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.requirements), true);
  assert.equal(Object.isFrozen(result.outfits), true);
});

test('a continental spring day still composes three outfits from the bundled catalog', () => {
  // The first four hours are cold; the late hot forecast does not invalidate that outfit.
  const hourAt = (hour) => `2026-04-15T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const hourly = [[8, 4], [12, 15], [16, 29], [20, 18]].map(([hour, temperature]) => ({
    forecastAt: hourAt(hour),
    ...measurements({ temperatureCelsius: temperature, apparentTemperatureCelsius: temperature }),
  }));
  const weather = snapshot({
    current: { temperatureCelsius: 4, apparentTemperatureCelsius: 4 },
    snapshotFields: { fetchedAt: hourAt(7) },
    minimumTemperatureCelsius: 4,
    maximumTemperatureCelsius: 29,
    hourly,
  });
  weather.current = { ...weather.current, observedAt: hourAt(7) };

  for (const clothingPreference of ['womens', 'mens']) {
    const result = recommendOutfits({
      now: hourAt(7),
      snapshot: weather,
      clothingPreference,
      dressStyle: 'smart',
      dayVariant: 0,
    });
    assert.equal(result.status, 'recommended');
    assert.equal(result.outfits.length, 3);
    assert.equal(
      result.requirements.requirements.find(({ kind }) => kind === 'thermal')?.priority,
      'mandatory',
    );
    assert.equal(
      result.requirements.requirements.find(({ kind }) => kind === 'breathability')?.priority,
      undefined,
    );
  }
});

test('the rationale grid keeps band-neutral reasons across boundary temperatures', () => {
  const temperatureLowEn = 'The temperature calls for warmth.';
  const temperatureLowTr = 'Hava soğuk, daha sıcak giyinmek gerekiyor.';

  for (const temperatureCelsius of [12, 13]) {
    const result = recommendOutfits({
      now: observedAt,
      snapshot: snapshot({
        current: {
          temperatureCelsius,
          apparentTemperatureCelsius: temperatureCelsius,
        },
        minimumTemperatureCelsius: temperatureCelsius,
        maximumTemperatureCelsius: temperatureCelsius + 1,
      }),
      clothingPreference: 'womens',
      dressStyle: 'smart',
      dayVariant: 0,
    });

    assert.equal(result.status, 'recommended');
    assert.deepEqual(result.requirements.reasonCodes, [
      'temperature_low',
      'apparent_temperature_low',
    ]);
    assert.equal(
      messages.en.today.requirementReasons.temperature_low,
      temperatureLowEn,
    );
    assert.equal(
      messages.tr.today.requirementReasons.temperature_low,
      temperatureLowTr,
    );
  }

  const veryColdDay = recommendOutfits({
    now: observedAt,
    snapshot: snapshot({
      current: {
        temperatureCelsius: -5,
        apparentTemperatureCelsius: -5,
      },
      minimumTemperatureCelsius: -5,
      maximumTemperatureCelsius: -4,
    }),
    clothingPreference: 'womens',
    dressStyle: 'smart',
    dayVariant: 0,
  });

  assert.equal(veryColdDay.status, 'recommended');
  assert.ok(veryColdDay.requirements.reasonCodes.includes('temperature_low'));
  assert.equal(
    messages.en.today.requirementReasons.temperature_low,
    temperatureLowEn,
  );
  assert.equal(
    messages.tr.today.requirementReasons.temperature_low,
    temperatureLowTr,
  );

  const moderateDay = recommendOutfits({
    now: observedAt,
    snapshot: snapshot({
      current: {
        temperatureCelsius: 8,
        apparentTemperatureCelsius: 8,
      },
      minimumTemperatureCelsius: 8,
      maximumTemperatureCelsius: 9,
    }),
    clothingPreference: 'womens',
    dressStyle: 'smart',
    dayVariant: 0,
    dayKind: 'weekday',
  });

  assert.equal(moderateDay.status, 'recommended');
  assert.equal(
    moderateDay.requirements.requirements.find(
      ({ kind }) => kind === 'thermal',
    )?.minimum,
    'moderate',
  );
  // The moderate rung names a jacket over the knit, so the picks wear one and that jacket is
  // not counted as warmth the day did not ask for.
  for (const outfit of moderateDay.outfits) {
    assert.notEqual(outfit.outerLayer, null, outfit.compositionKey);
    assert.equal(outfit.reasonCodes.includes('thermal_over_protection'), false, outfit.compositionKey);
  }
  assert.equal(
    messages.en.today.compositionReasons.thermal_over_protection,
    'This outfit carries more warmth than the day calls for.',
  );
  assert.equal(
    messages.tr.today.compositionReasons.thermal_over_protection,
    'Bu kombin günün gerektirdiğinden daha sıcak tutuyor.',
  );

  const mildDay = recommendOutfits({
    now: observedAt,
    snapshot: snapshot({
      current: {
        temperatureCelsius: 20.7,
        apparentTemperatureCelsius: 20.7,
      },
      minimumTemperatureCelsius: 20.7,
      maximumTemperatureCelsius: 21.7,
    }),
    clothingPreference: 'womens',
    dressStyle: 'smart',
    dayVariant: 0,
    dayKind: 'weekday',
  });

  assert.equal(mildDay.status, 'recommended');
  assert.deepEqual(mildDay.requirements.reasonCodes, []);
  assert.equal(mildDay.outfits.some(({ archetypeId }) => archetypeId === 'wind_guard'), false);
  assert.ok(mildDay.outfits.some(({ reasonCodes }) =>
    reasonCodes.includes('thermal_over_protection')));
  assert.equal(
    messages.en.today.compositionReasons.thermal_over_protection,
    'This outfit carries more warmth than the day calls for.',
  );
  assert.equal(
    messages.tr.today.compositionReasons.thermal_over_protection,
    'Bu kombin günün gerektirdiğinden daha sıcak tutuyor.',
  );
});

test('every cold and heat pairing across the bands composes three outfits', () => {
  // Both extremes of the remaining day are mandatory at once unless one side is demoted;
  // the light-thermal band (12 to 18 °C) with a hot afternoon used to leave a single
  // composable outfit (17 °C at 08:00, 30 °C at 15:00).
  const hourAt = (hour) => `2026-04-15T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const nowTemperatures = [0, 8, 15, 22, 30];
  const laterTemperatures = [0, 8, 15, 22, 26, 31];

  for (const nowTemperature of nowTemperatures) {
    for (const laterTemperature of laterTemperatures) {
      const weather = snapshot({
        current: {
          temperatureCelsius: nowTemperature,
          apparentTemperatureCelsius: nowTemperature,
        },
        snapshotFields: { fetchedAt: hourAt(8) },
        minimumTemperatureCelsius: Math.min(nowTemperature, laterTemperature),
        maximumTemperatureCelsius: Math.max(nowTemperature, laterTemperature),
        hourly: [
          {
            forecastAt: hourAt(12),
            ...measurements({
              temperatureCelsius: Math.round((nowTemperature + laterTemperature) / 2),
              apparentTemperatureCelsius: Math.round((nowTemperature + laterTemperature) / 2),
            }),
          },
          {
            forecastAt: hourAt(15),
            ...measurements({
              temperatureCelsius: laterTemperature,
              apparentTemperatureCelsius: laterTemperature,
            }),
          },
        ],
      });
      weather.current = { ...weather.current, observedAt: hourAt(8) };

      for (const clothingPreference of ['womens', 'mens']) {
        const result = recommendOutfits({
          now: hourAt(8),
          snapshot: weather,
          clothingPreference,
          dressStyle: 'smart',
          dayVariant: 0,
        });
        const where = `${nowTemperature} °C now, ${laterTemperature} °C later, ${clothingPreference}`;
        assert.equal(result.status, 'recommended', where);
        assert.equal(result.outfits.length, 3, where);
      }
    }
  }
});

test('fallback archetypes use rule order and advance past duplicates', () => {
  const result = recommendOutfits({
    now: observedAt,
    snapshot: coldWetSnapshot(),
    clothingPreference: 'womens',
  });

  assert.equal(result.status, 'recommended');
  // The day is -2 C at its coldest and what falls on it is heavy rain, so the thermal
  // ladder's top rung asks every outfit for a coat and `snow_day` is not this day's label to
  // hand out: the second and third are `cold_shield` and `wind_guard`, the next two rungs of
  // the same fixed order. What the case is about is unchanged: the order is read from the
  // top and a label already handed out is skipped.
  assert.deepEqual(
    result.outfits.map(({ archetypeId }) => archetypeId),
    ['rain_ready', 'cold_shield', 'wind_guard'],
  );
});

test('cold and wind labels follow the day in fallback, and three outfits remain', () => {
  const coldWindy = recommendOutfits({
    now: observedAt,
    snapshot: coldWetSnapshot(),
    clothingPreference: 'womens',
    dayKind: 'weekday',
  });
  assert.equal(coldWindy.status, 'recommended');
  const coldDay = archetypeDayFromRequirements(coldWindy.requirements.requirements);
  assert.equal(coldDay.cold, true);
  assert.equal(coldDay.windy, true);
  for (const archetypeId of ['cold_shield', 'wind_guard']) {
    const outfit = coldWindy.outfits.find((candidate) => candidate.archetypeId === archetypeId);
    assert.ok(outfit, archetypeId);
    assert.equal(outfitMatchesArchetype(outfit, archetypeId, 'weekday', coldDay), true);
  }

  const warmCalm = recommendOutfits({
    now: observedAt,
    snapshot: snapshot({ current: { temperatureCelsius: 21, apparentTemperatureCelsius: 21 } }),
    clothingPreference: 'womens',
    dayKind: 'weekday',
  });
  assert.equal(warmCalm.status, 'recommended');
  assert.equal(warmCalm.outfits.length, 3);
  assert.equal(new Set(warmCalm.outfits.map(({ archetypeId }) => archetypeId)).size, 3);
  const warmDay = archetypeDayFromRequirements(warmCalm.requirements.requirements);
  assert.equal(warmDay.cold, false);
  assert.equal(warmDay.windy, false);
  for (const outfit of warmCalm.outfits) {
    for (const archetypeId of ['cold_shield', 'wind_guard']) {
      assert.equal(outfitMatchesArchetype(outfit, archetypeId, 'weekday', warmDay), false);
    }
    assert.equal(['cold_shield', 'wind_guard'].includes(outfit.archetypeId), false);
  }
});

// The bug: snow makes a waterproof outer layer mandatory, so every outfit on a -1 °C snow
// day matched `rain_ready` first and Today labelled a snow outfit "Rain Ready". A snow or
// sleet day now leads with `snow_day` and never hands out the rain label.
test('a snow or sleet day leads with snow_day and never labels rain_ready', () => {
  for (const condition of ['snow', 'sleet']) {
    for (const clothingPreference of ['womens', 'mens']) {
      for (const dressStyle of ['casual', 'smart', 'formal']) {
        const result = recommendOutfits({
          now: observedAt,
          snapshot: snapshot({
            current: {
              temperatureCelsius: -1,
              apparentTemperatureCelsius: -4,
              condition,
              precipitationProbability: 0.9,
              windSpeedMetersPerSecond: 4,
            },
            minimumTemperatureCelsius: -3,
            maximumTemperatureCelsius: 1,
          }),
          clothingPreference,
          dressStyle,
          dayVariant: 0,
        });
        const where = `${condition}, ${clothingPreference}, ${dressStyle}`;
        assert.equal(result.status, 'recommended', where);
        const archetypeIds = result.outfits.map(({ archetypeId }) => archetypeId);
        assert.equal(archetypeIds.length, 3, where);
        assert.equal(archetypeIds[0], 'snow_day', where);
        assert.equal(archetypeIds.includes('rain_ready'), false, where);
      }
    }
  }
});

// The bug: nothing in the pipeline knew the weekday, so a Tuesday could be labelled
// Weekend Relaxed. A weekday now drops that rung and the casual outfit takes the next rung
// its garments allow (`on_the_move` stays off ballet flats and dress shoes).
test('a weekday drops weekend_relaxed from the fallback order', () => {
  const input = {
    now: observedAt,
    snapshot: snapshot(),
    clothingPreference: 'womens',
    dressStyle: 'casual',
    dayVariant: 0,
  };
  // Which of the three carries the rung follows the offer order, and the offer order is not
  // what this test is about, so the claim is read over the trio rather than at its head.
  const carries = (result, archetypeId) =>
    result.outfits.some((outfit) => outfit.archetypeId === archetypeId);

  const dayBlind = recommendOutfits(input);
  assert.equal(carries(dayBlind, 'weekend_relaxed'), true);
  assert.equal(
    carries(recommendOutfits({ ...input, dayKind: 'weekend' }), 'weekend_relaxed'),
    true,
  );

  const weekday = recommendOutfits({ ...input, dayKind: 'weekday' });
  assert.equal(weekday.outfits.length, 3);
  assert.equal(new Set(weekday.outfits.map(({ archetypeId }) => archetypeId)).size, 3);
  assert.equal(carries(weekday, 'weekend_relaxed'), false);
});

test('mens recommendations exclude womens-only catalog types', () => {
  const weather = warmWetSnapshot();
  const womens = recommendOutfits({
    now: observedAt,
    snapshot: weather,
    clothingPreference: 'womens',
  });
  const mens = recommendOutfits({
    now: observedAt,
    snapshot: weather,
    clothingPreference: 'mens',
  });
  const womensOnlyKeys = ['catalog:blouse', 'catalog:skirt', 'catalog:dress'];

  assert.equal(womens.status, 'recommended');
  assert.equal(mens.status, 'recommended');
  assert.equal(
    candidateKeys(womens).some((key) => womensOnlyKeys.includes(key)),
    true,
  );
  assert.equal(
    candidateKeys(mens).some((key) => womensOnlyKeys.includes(key)),
    false,
  );
});

test('recommendations are deterministic across repeated calls with the same input', () => {
  const input = Object.freeze({
    now: observedAt,
    snapshot: warmWetSnapshot(),
    clothingPreference: 'womens',
  });

  const first = recommendOutfits(input);
  const repeated = recommendOutfits(input);

  assert.deepEqual(first, repeated);
});

// The body garments History reads an outfit by: an outfit that changes only its accessories
// is the same outfit to the person wearing it.
function bodyGarments(outfit) {
  return [...new Set(assignedOutfitGarments(outfit).map(({ garment }) => garment.garmentTypeId))]
    .sort().join('|');
}

function narrowPool() {
  const weather = snapshot({ current: { temperatureCelsius: 32, apparentTemperatureCelsius: 32 } });
  const composition = composeOutfitPool(deriveClothingRequirements(weather, observedAt), 'mens', 0);
  assert.equal(composition.status, 'composed');
  return composition.outfits;
}

test('exclusions apply only when at least three options remain', () => {
  const outfits = narrowPool().slice(0, 5);

  assert.deepEqual(
    excludeOutfitOptions(outfits, outfits.slice(0, 2)).map(outfitOptionId),
    outfits.slice(2).map(outfitOptionId),
  );
  assert.equal(excludeOutfitOptions(outfits, outfits.slice(0, 3)), outfits);
});

test('deterministic selection never returns an excluded option', () => {
  const shared = {
    now: observedAt,
    snapshot: warmWetSnapshot(),
    clothingPreference: 'womens',
    dressStyle: 'smart',
    dayVariant: 0,
  };
  const previous = recommendOutfits(shared);
  assert.equal(previous.status, 'recommended');
  const excludedOptionIds = previous.outfits.map(({ optionId }) => optionId);

  const next = recommendOutfits({ ...shared, excludedOutfits: previous.outfits });

  assert.equal(next.status, 'recommended');
  assert.equal(next.outfits.length, 3);
  assert.equal(
    next.outfits.some(({ optionId }) => excludedOptionIds.includes(optionId)),
    false,
  );
});

test('a narrow pool keeps the three shown options rather than running out', () => {
  const narrow = narrowPool().slice(0, 4);

  assert.deepEqual(excludeOutfitOptions(narrow, narrow.slice(0, 3)), narrow);
});

function dayWeather(temperatureCelsius, condition, precipitationProbability, windSpeedMetersPerSecond = 2) {
  return snapshot({
    current: {
      temperatureCelsius,
      apparentTemperatureCelsius: temperatureCelsius,
      condition,
      precipitationProbability,
      windSpeedMetersPerSecond,
      humidity: 0.6,
    },
    maximumTemperatureCelsius: temperatureCelsius,
  });
}

// The day's accessories are part of an option's id, so yesterday's shirt, trousers and blazer
// came back today under a new id once the colder day's beanie, scarf and gloves were gone.
test('the next day never repeats yesterday\'s body garments when only the accessories change', () => {
  // A reduced grid of the day pairs that repeated: a mild day composes for hundreds of
  // milliseconds, so the suite keeps the cells that caught every kind of repeat.
  const dayPairs = [
    [[10, 'clear', 0], [13, 'clear', 0]],
    [[13, 'clear', 0], [10, 'clear', 0]],
    [[15, 'cloudy', 0.4], [15, 'clear', 0]],
  ];
  const dressStyles = ['casual', 'smart', 'formal'];
  const repeats = [];
  for (const clothingPreference of ['womens', 'mens']) {
    for (const [yesterday, today] of dayPairs) {
      for (const dayVariant of [3]) {
        // Each day's three styles share one composed pool, so they run together.
        const shared = (dressStyle) =>
          ({ now: observedAt, clothingPreference, dressStyle, dayKind: 'weekday' });
        const previous = dressStyles.map((dressStyle) => recommendOutfits({
          ...shared(dressStyle), snapshot: dayWeather(...yesterday), dayVariant,
        }));
        dressStyles.forEach((dressStyle, index) => {
          const next = recommendOutfits({
            ...shared(dressStyle),
            snapshot: dayWeather(...today),
            dayVariant: dayVariant + 1,
            excludedOutfits: previous[index].outfits,
          });
          const worn = new Set(previous[index].outfits.map(bodyGarments));
          for (const outfit of next.outfits) {
            if (worn.has(bodyGarments(outfit))) {
              repeats.push(`${clothingPreference} ${dressStyle} ${yesterday} -> ${today} ` +
                `variant ${dayVariant}: ${bodyGarments(outfit)}`);
            }
          }
        });
      }
    }
  }

  assert.deepEqual(repeats, []);
});

// A day whose only formal outfit is a suit lost it to the diversity rule whenever a smart look
// in the same shirt and trousers came first, so a formal dress style was shown smart outfits.
test('the offered pool keeps an outfit of every formality the day can compose', () => {
  const cells = [
    ['mens', [8, 'clear', 0, 6], 2],
    ['mens', [8, 'cloudy', 0.4, 2], 3],
    ['mens', [13, 'clear', 0, 2], 1],
    ['mens', [25, 'clear', 0, 2], 5],
    ['mens', [30, 'clear', 0, 2], 5],
    ['womens', [8, 'clear', 0, 6], 4],
    ['womens', [19, 'clear', 0, 9], 4],
  ];
  const missing = [];
  for (const [clothingPreference, day, dayVariant] of cells) {
    const requirements = deriveClothingRequirements(dayWeather(...day), observedAt);
    const valid = collectValidOutfits(requirements, eligibilityCandidates(requirements, clothingPreference));
    const offered = composeOutfitPool(requirements, clothingPreference, dayVariant);
    assert.equal(valid.status, 'composed');
    assert.equal(offered.status, 'composed');
    for (const formality of new Set(valid.outfits.map((outfit) => outfit.formality))) {
      if (!offered.outfits.some((outfit) => outfit.formality === formality)) {
        missing.push(`${clothingPreference} ${day} variant ${dayVariant}: ${formality}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

// A day with no thermal requirement once offered no layered arrangement at all, so the three
// shown outfits could not carry one either.
test('a mild day shows at least one layered outfit in every dress style', () => {
  for (const clothingPreference of ['womens', 'mens']) {
    for (const dressStyle of ['casual', 'smart', 'formal']) {
      for (const temperatureCelsius of [20, 26]) {
        const result = recommendOutfits({
          now: observedAt,
          snapshot: snapshot({
            current: { temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius },
          }),
          clothingPreference,
          dressStyle,
          dayVariant: 0,
        });
        const where = `${temperatureCelsius} °C ${clothingPreference} ${dressStyle}`;
        assert.equal(result.status, 'recommended', where);
        assert.equal(
          result.outfits.some((outfit) => outfit.midLayer !== null || outfit.outerLayer !== null),
          true,
          `${where} showed no layered outfit`,
        );
      }
    }
  }
});

test('fallback prefers each dress style while preserving three distinct valid options', () => {
  for (const dressStyle of ['casual', 'smart', 'formal']) {
    const result = recommendOutfits({
      now: observedAt,
      snapshot: snapshot(),
      clothingPreference: 'womens',
      dayVariant: 0,
      dressStyle,
    });
    assert.equal(result.status, 'recommended');
    assert.equal(result.outfits.length, 3);
    assert.equal(result.outfits[0].formality, dressStyle);
    assert.equal(new Set(result.outfits.map(({ optionId }) => optionId)).size, 3);
  }
});

test('casual and formal styles select different triples from the same conditions', () => {
  const shared = { snapshot: snapshot(), now: observedAt, clothingPreference: 'womens', dayVariant: 0 };
  const casual = recommendOutfits({ ...shared, dressStyle: 'casual' });
  const formal = recommendOutfits({ ...shared, dressStyle: 'formal' });
  assert.equal(casual.status, 'recommended');
  assert.equal(formal.status, 'recommended');
  assert.notDeepEqual(
    casual.outfits.map(({ optionId }) => optionId),
    formal.outfits.map(({ optionId }) => optionId),
  );
});

test('each dress style keeps three distinct fallback outfits across catalog preferences, weather and day variants', () => {
  for (const clothingPreference of ['womens', 'mens']) {
    for (const dressStyle of ['casual', 'smart', 'formal']) {
      for (const weather of [snapshot(), coldWetSnapshot(), warmWetSnapshot()]) {
        for (let dayVariant = 0; dayVariant < 7; dayVariant += 1) {
          // A weekday takes `weekend_relaxed` out of the order, so the three-outfit
          // invariant is proved with the field absent and with either value.
          for (const dayKind of [undefined, 'weekday', 'weekend']) {
            const result = recommendOutfits({
              now: observedAt,
              snapshot: weather,
              clothingPreference,
              dressStyle,
              dayVariant,
              dayKind,
            });
            assert.equal(result.status, 'recommended');
            assert.equal(result.outfits.length, 3);
            assert.equal(new Set(result.outfits.map(({ optionId }) => optionId)).size, 3);
            assert.equal(new Set(result.outfits.map(({ archetypeId }) => archetypeId)).size, 3);
            if (dayKind === 'weekday') {
              assert.equal(
                result.outfits.some(({ archetypeId }) => archetypeId === 'weekend_relaxed'),
                false,
              );
            }
          }
        }
      }
    }
  }
});

// FX1. A hot dry weekday offered four options, all casual and all in sandals, so only
// `light_and_airy` and `everyday_easy` were assignable and `assignFallbackArchetypes`
// threw where the deterministic tier must always answer.
//
// The grid spans the bands that decide the pool: the three heat bands above 27 °C, the two
// wind bands the window covers (none below 5 m/s, optional below 8; at 8 the requirement
// turns mandatory, a wind-resistant garment joins the pool and `wind_guard` is assignable
// again), both catalog preferences, every day variant and every dress style. A dry
// condition adds no requirement of its own, so one stands for clear, cloudy and fog.
function hotDryWeekdayCases() {
  const cases = [];
  for (const temperatureCelsius of [28, 30, 33]) {
    for (const windSpeedMetersPerSecond of [0, 7.9]) {
      for (const clothingPreference of ['womens', 'mens']) {
        for (let dayVariant = 0; dayVariant < 7; dayVariant += 1) {
          for (const dressStyle of ['casual', 'smart', 'formal']) {
            cases.push({
              where: `${temperatureCelsius} °C, wind ${windSpeedMetersPerSecond}, ${clothingPreference} ${dressStyle}, variant ${dayVariant}`,
              input: {
                now: observedAt,
                snapshot: snapshot({
                  current: {
                    temperatureCelsius,
                    apparentTemperatureCelsius: temperatureCelsius,
                    windSpeedMetersPerSecond,
                  },
                }),
                clothingPreference,
                dressStyle,
                dayVariant,
                dayKind: 'weekday',
              },
            });
          }
        }
      }
    }
  }
  return cases;
}

// One walk of the grid; every hot dry weekday assertion below reads these results.
let hotDryWeekdays;
function hotDryWeekdayResults() {
  hotDryWeekdays ??= hotDryWeekdayCases().map((entry) => ({
    ...entry,
    result: recommendOutfits(entry.input),
  }));
  return hotDryWeekdays;
}

test('T1 a hot dry weekday still recommends three distinctly labelled outfits', () => {
  for (const { where, result } of hotDryWeekdayResults()) {
    assert.equal(result.status, 'recommended', where);
    assert.equal(result.outfits.length, 3, where);
    assert.equal(new Set(result.outfits.map(({ archetypeId }) => archetypeId)).size, 3, where);
  }
});

test('T2 no weekday fallback outfit is labelled weekend_relaxed', () => {
  const weekdayResults = [
    ...hotDryWeekdayResults(),
    ...[coldWetSnapshot(), warmWetSnapshot()].map((weather, index) => ({
      where: `wet ${index}`,
      result: recommendOutfits({
        now: observedAt,
        snapshot: weather,
        clothingPreference: 'womens',
        dressStyle: 'casual',
        dayVariant: 0,
        dayKind: 'weekday',
      }),
    })),
  ];
  for (const { where, result } of weekdayResults) {
    assert.equal(
      result.outfits.some(({ archetypeId }) => archetypeId === 'weekend_relaxed'),
      false,
      where,
    );
  }
});

test('T3 every assigned archetype reads back under the same dayKind, so a stored row survives', () => {
  for (const { where, input, result } of hotDryWeekdayResults()) {
    for (const outfit of result.outfits) {
      assert.equal(
        outfitMatchesArchetype(outfit, outfit.archetypeId, input.dayKind),
        true,
        `${where}: ${outfit.archetypeId} would not read back`,
      );
    }
  }
});

test('T4 every assigned archetype is a member of the closed twelve', () => {
  for (const { where, result } of hotDryWeekdayResults()) {
    for (const { archetypeId } of result.outfits) {
      assert.equal(outfitArchetypeIds.includes(archetypeId), true, `${where}: ${archetypeId}`);
    }
  }
});

test('dry mild aesthetic ordering agrees with the day-aware label gate', () => {
  for (const clothingPreference of ['womens', 'mens']) {
    const result = recommendOutfits({
      snapshot: snapshot(),
      now: observedAt,
      clothingPreference,
      dressStyle: 'casual',
      styleAesthetics: ['relaxed', 'sporty'],
      dayVariant: 0,
      dayKind: 'weekday',
    });
    assert.equal(result.status, 'recommended', clothingPreference);
    const day = archetypeDayFromRequirements(result.requirements.requirements);
    assert.equal(day.wet, false, clothingPreference);
    assert.notEqual(result.outfits[0].outerLayer?.garment.properties.waterProtection,
      'waterproof', clothingPreference);
    for (const outfit of result.outfits) {
      assert.equal(outfitMatchesArchetype(outfit, outfit.archetypeId, 'weekday', day),
        true, `${clothingPreference}: ${outfit.archetypeId}`);
      assert.equal(outfitMatchesArchetype(outfit, 'rain_ready', 'weekday', day),
        false, `${clothingPreference}: dry day labelled rain_ready`);
    }
  }
});

// The rotation through the day's best runs on past a week: the same weather a week later, on a
// day with the same seven-day variant, is offered other outfits, while the day variant the AI
// request carries stays the same.
test('the same weather a week later offers other outfits under the same day variant', () => {
  const weather = snapshot({ current: { temperatureCelsius: 14, apparentTemperatureCelsius: 14 } });
  const offered = (localDayKey) => recommendOutfits({
    snapshot: weather, now: observedAt, clothingPreference: 'womens', dayVariant: 3, localDayKey,
  }).outfits.map(outfitOptionId);
  const weeks = ['2026-03-05', '2026-03-12', '2026-03-19', '2026-03-26'].map(offered);
  assert.equal(new Set(weeks.map((ids) => ids.join())).size, 4);
  assert.deepEqual(offered('2026-03-05'), weeks[0]);
});

// The three shown outfits used to be the first three that took distinct labels, so they
// often wore one pair of shoes, one bottom or one outer layer between them. The two after the
// first now come from the first's own band and formality, each sharing as few garments with
// those already taken as it can. Over 216 trios (both cuts, three styles, dry and rainy, -4 to
// 26 C, three days) the trios in one shoe were 109, in one bottom 94 and in one outer layer
// 139; these are ceilings a later change has to walk past on purpose. Catalog version 7 leaves
// them standing (shoe 78 to 76, bottom 64 to 22, outer 115 to 115).
test('the three shown outfits spread their shoes, bottoms and outer layers across the day\'s best', () => {
  const counts = { shoe: 0, bottom: 0, outer: 0 };
  const type = (assigned) => assigned?.garment.garmentTypeId ?? null;
  for (const clothingPreference of ['womens', 'mens']) {
    for (const dressStyle of ['casual', 'smart', 'formal']) {
      for (const [condition, precipitationProbability] of [['clear', 0], ['rain', 0.8]]) {
        for (const temperatureCelsius of [-4, 2, 8, 14, 20, 26]) {
          for (const localDayKey of ['2026-08-01', '2026-08-02', '2026-08-03']) {
            const { outfits } = recommendOutfits({
              snapshot: snapshot({ current: { temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius,
                condition, precipitationProbability } }),
              now: observedAt, clothingPreference, dressStyle, dayVariant: 0, localDayKey,
            });
            const one = (slot) => new Set(outfits.map(slot)).size === 1;
            if (one(({ footwear }) => type(footwear))) counts.shoe += 1;
            if (one(({ body }) => type(body.kind === 'separates' ? body.bottom : body.onePiece))) counts.bottom += 1;
            if (outfits.every(({ outerLayer }) => outerLayer) && one(({ outerLayer }) => type(outerLayer))) counts.outer += 1;
          }
        }
      }
    }
  }
  assert.ok(counts.shoe <= 80, `${counts.shoe} trios in one shoe`);
  assert.ok(counts.bottom <= 66, `${counts.bottom} trios in one bottom`);
  assert.ok(counts.outer <= 116, `${counts.outer} trios in one outer layer`);
});

// The next day's first outfit used to wear yesterday's shoes, bottom and jacket whenever the
// weather held, because nothing compared it with the three shown before. Over 216 day pairs of
// unchanged weather (both cuts, three styles, dry and rainy, -4 to 26 C) the second day's first
// outfit wore the first day's first shoes 153 times, its bottom 150 times and its outer layer
// 147 times; these are ceilings a later change has to walk past on purpose. Catalog version 7
// walks past the shoe one: a formal dry day leads with the ordinary dress shoes on both days,
// a smart or formal rain day with its only dress shoe for the rain, and a cool dry day with a
// skirt in the knee boots that suit it (shoe 86 to 118, bottom 87 to 52, outer 116 to 128).
test('the next day leads with pieces yesterday\'s three did not wear, where the day\'s best allows', () => {
  const counts = { shoe: 0, bottom: 0, outer: 0 };
  const type = (assigned) => assigned?.garment.garmentTypeId ?? null;
  const bottomOf = ({ body }) => type(body.kind === 'separates' ? body.bottom : body.onePiece);
  for (const clothingPreference of ['womens', 'mens']) {
    for (const dressStyle of ['casual', 'smart', 'formal']) {
      for (const [condition, precipitationProbability] of [['clear', 0], ['rain', 0.8]]) {
        for (const temperatureCelsius of [-4, 2, 8, 14, 20, 26]) {
          const weather = snapshot({ current: { temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius,
            condition, precipitationProbability } });
          const shown = (localDayKey, excludedOutfits) => recommendOutfits({
            snapshot: weather, now: observedAt, clothingPreference, dressStyle, dayVariant: 0, localDayKey, excludedOutfits,
          }).outfits;
          for (const [yesterday, today] of [['2026-08-01', '2026-08-02'], ['2026-08-02', '2026-08-03'],
            ['2026-08-03', '2026-08-04']]) {
            const before = shown(yesterday);
            const [first] = shown(today, before);
            if (type(first.footwear) === type(before[0].footwear)) counts.shoe += 1;
            if (bottomOf(first) === bottomOf(before[0])) counts.bottom += 1;
            if (first.outerLayer && type(first.outerLayer) === type(before[0].outerLayer)) counts.outer += 1;
          }
        }
      }
    }
  }
  assert.ok(counts.shoe <= 118, `${counts.shoe} first outfits in yesterday's shoes`);
  assert.ok(counts.bottom <= 90, `${counts.bottom} first outfits in yesterday's bottom`);
  assert.ok(counts.outer <= 128, `${counts.outer} first outfits in yesterday's outer layer`);
});

// The deterministic three are saved only when each is one of the options the day's context
// offers, so they are drawn from the same outfits: yesterday's three left out, and so are the
// options repeating two of their shoes, bottom and outer layer while twelve others remain. The
// three used to come from the pool without that second step and missed the context's options
// on 227 of 594 next-day cells, so an AI failure left the day without a recommendation.
test('the deterministic three are always among the options the same day offers the AI', () => {
  for (const clothingPreference of ['womens', 'mens']) {
    for (const dressStyle of ['casual', 'smart', 'formal']) {
      for (const temperatureCelsius of [-2, 6, 14, 22, 30]) {
        const weather = snapshot({ current: { temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius } });
        const base = { snapshot: weather, now: observedAt, clothingPreference, dressStyle, dayVariant: 0 };
        const yesterday = recommendOutfits({ ...base, localDayKey: '2026-08-01' }).outfits;
        const input = { ...base, localDayKey: '2026-08-02', excludedOutfits: yesterday };
        const offered = new Set(createRecommendationContextWithPool(input, '2026-08-02')
          .context.options.map(({ optionId }) => optionId));
        const cell = `${clothingPreference}/${dressStyle}/${temperatureCelsius} C`;
        for (const outfit of recommendOutfits(input).outfits) {
          assert.ok(offered.has(outfitOptionId(outfit)), `${cell} showed ${outfit.compositionKey}, which the context leaves out`);
        }
      }
    }
  }
});

// Leaving out yesterday's repeated pieces never leaves a dress style without its own outfits:
// each formality keeps its best three, so the day still leads with the dress style's own
// formality wherever the pool holds it.
test('the repeat filter keeps every formality, so the three lead with the dress style wherever the pool holds it', () => {
  const missed = [];
  for (const clothingPreference of ['womens', 'mens']) {
    for (const dressStyle of ['casual', 'smart', 'formal']) {
      for (const [condition, precipitationProbability] of [['clear', 0], ['rain', 0.8]]) {
        for (const temperatureCelsius of [-2, 6, 10, 14, 18, 22, 30]) {
          const weather = snapshot({ current: { temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius,
            condition, precipitationProbability } });
          const base = { snapshot: weather, now: observedAt, clothingPreference, dressStyle, dayVariant: 0 };
          for (const [yesterday, today] of [['2026-08-01', '2026-08-02'], ['2026-08-02', '2026-08-03']]) {
            const before = recommendOutfits({ ...base, localDayKey: yesterday }).outfits;
            const input = { ...base, localDayKey: today, excludedOutfits: before };
            const { pool } = createRecommendationContextWithPool(input, today);
            const held = excludeOutfitOptions(pool, before).some(({ formality }) => formality === dressStyle);
            const [first] = recommendOutfits(input).outfits;
            if (held && first.formality !== dressStyle) {
              missed.push(`${clothingPreference}/${dressStyle}/${condition}/${temperatureCelsius} C/${today}`);
            }
          }
        }
      }
    }
  }
  assert.deepEqual(missed, []);
});
