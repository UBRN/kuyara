import assert from 'node:assert/strict';
import test from 'node:test';

import { outfitArchetypeIds } from '@kuyara/contracts';

import { deriveClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import {
  excludeOutfitOptions,
  outfitMatchesArchetype,
  recommendOutfits,
} from './recommend-outfits.ts';

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
  // 4 °C at 07:00 and 29 °C at 16:00 once demanded mandatory high thermal and mandatory
  // high breathability at once, which no catalog garment satisfies; the current side of
  // the day now decides which of the two stays mandatory.
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
      'optional',
    );
  }
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
  assert.deepEqual(
    result.outfits.map(({ archetypeId }) => archetypeId),
    ['rain_ready', 'snow_day', 'wind_guard'],
  );
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
// Weekend Relaxed. A weekday now drops that rung and the casual outfit takes `on_the_move`,
// the rung below it.
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
  assert.equal(carries(weekday, 'on_the_move'), true);
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

test('exclusions apply only when at least three options remain', () => {
  const outfits = ['one', 'two', 'three', 'four', 'five'].map((compositionKey) => ({
    compositionKey,
  }));

  assert.deepEqual(
    excludeOutfitOptions(outfits, ['one', 'two']).map(({ compositionKey }) => compositionKey),
    ['three', 'four', 'five'],
  );
  assert.equal(excludeOutfitOptions(outfits, ['one', 'two', 'three']), outfits);
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

  const next = recommendOutfits({ ...shared, excludedOptionIds });

  assert.equal(next.status, 'recommended');
  assert.equal(next.outfits.length, 3);
  assert.equal(
    next.outfits.some(({ optionId }) => excludedOptionIds.includes(optionId)),
    false,
  );
});

test('a narrow pool keeps the three shown options rather than running out', () => {
  const shared = {
    now: observedAt,
    snapshot: snapshot({ current: { temperatureCelsius: 32, apparentTemperatureCelsius: 32 } }),
    clothingPreference: 'womens',
    dressStyle: 'smart',
    dayVariant: 0,
  };
  const shown = recommendOutfits(shared);
  assert.equal(shown.status, 'recommended');
  const excludedOptionIds = shown.outfits.map(({ optionId }) => optionId);

  // A hot day composes four options, so removing three would leave one. The exclusion is
  // dropped whole and the day repeats rather than falling back to fewer than three outfits.
  const next = recommendOutfits({ ...shared, excludedOptionIds });

  assert.equal(next.status, 'recommended');
  assert.deepEqual(next.outfits.map(({ optionId }) => optionId), excludedOptionIds);
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
