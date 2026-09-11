import assert from 'node:assert/strict';
import test from 'node:test';

import { weatherConditionCodes } from '@/features/weather/domain/weather';
import {
  clothingRequirementReasonCodes,
  deriveClothingRequirements,
} from './weather-to-clothing-requirements.ts';

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
    origin: { kind: 'sample', sourceId: 'requirements-test' },
    current,
    minimumTemperatureCelsius:
      overrides.minimumTemperatureCelsius ?? current.temperatureCelsius,
    maximumTemperatureCelsius:
      overrides.maximumTemperatureCelsius ?? current.temperatureCelsius + 1,
    hourly,
    ...overrides.snapshotFields,
  };
}

function findRequirement(result, kind, target) {
  return result.requirements.find(
    (requirement) =>
      requirement.kind === kind &&
      (target === undefined || requirement.target === target),
  );
}

test('thermal and coverage thresholds use exact lower-bound semantics', () => {
  const cases = [
    [18.001, null, null],
    [18, null, null],
    [17.999, 'light', 'optional'],
    [12.001, 'light', 'optional'],
    [12, 'light', 'optional'],
    [11.999, 'moderate', 'mandatory'],
    [5.001, 'moderate', 'mandatory'],
    [5, 'moderate', 'mandatory'],
    [4.999, 'high', 'mandatory'],
  ];

  for (const [temperature, thermalMinimum, coveragePriority] of cases) {
    const result = deriveClothingRequirements(snapshot({
      current: {
        temperatureCelsius: temperature,
        apparentTemperatureCelsius: temperature,
      },
      minimumTemperatureCelsius: temperature,
      maximumTemperatureCelsius: temperature + 1,
    }), observedAt);
    const thermal = findRequirement(result, 'thermal');
    const arms = findRequirement(result, 'arm_coverage');
    const legs = findRequirement(result, 'leg_coverage');

    assert.equal(thermal?.minimum ?? null, thermalMinimum, `${temperature} thermal`);
    assert.equal(thermal?.priority ?? null, thermalMinimum ? 'mandatory' : null);
    assert.equal(arms?.minimum ?? null, coveragePriority ? 'full' : null);
    assert.equal(arms?.priority ?? null, coveragePriority);
    assert.equal(legs?.minimum ?? null, coveragePriority ? 'full' : null);
    assert.equal(legs?.priority ?? null, coveragePriority);
  }
});

test('breathability thresholds distinguish optional warmth from mandatory heat', () => {
  const cases = [
    [23.999, null, null],
    [24, 'moderate', 'optional'],
    [24.001, 'moderate', 'optional'],
    [27.999, 'moderate', 'optional'],
    [28, 'high', 'mandatory'],
    [28.001, 'high', 'mandatory'],
  ];

  for (const [temperature, minimum, priority] of cases) {
    const result = deriveClothingRequirements(snapshot({
      current: {
        temperatureCelsius: temperature,
        apparentTemperatureCelsius: temperature,
      },
      minimumTemperatureCelsius: temperature - 1,
      maximumTemperatureCelsius: temperature,
    }), observedAt);
    const breathability = findRequirement(result, 'breathability');

    assert.equal(breathability?.minimum ?? null, minimum, `${temperature} minimum`);
    assert.equal(breathability?.priority ?? null, priority, `${temperature} priority`);
  }
});

test('past daily cold does not over-insulate a warm evening with warm remaining hours', () => {
  const result = deriveClothingRequirements(snapshot({
    current: {
      temperatureCelsius: 22,
      apparentTemperatureCelsius: 22,
    },
    minimumTemperatureCelsius: 3,
    maximumTemperatureCelsius: 23,
    hourly: [
      {
        forecastAt: '2026-08-01T07:00:00.000Z',
        ...measurements({
          temperatureCelsius: 3,
          apparentTemperatureCelsius: 1,
        }),
      },
      {
        forecastAt: futureAt,
        ...measurements({
          temperatureCelsius: 21,
          apparentTemperatureCelsius: 21,
        }),
      },
    ],
  }), observedAt);

  assert.equal(findRequirement(result, 'thermal'), undefined);
  assert.equal(findRequirement(result, 'arm_coverage'), undefined);
  assert.equal(findRequirement(result, 'leg_coverage'), undefined);
  assert.deepEqual(result.reasonCodes, ['daily_range_wide']);
});

test('next-day hourly conditions do not change today\'s clothing requirements', () => {
  const result = deriveClothingRequirements(snapshot({
    current: {
      temperatureCelsius: 22,
      apparentTemperatureCelsius: 22,
    },
    minimumTemperatureCelsius: 21,
    maximumTemperatureCelsius: 23,
    hourly: [
      {
        forecastAt: futureAt,
        ...measurements({ temperatureCelsius: 21, apparentTemperatureCelsius: 21 }),
      },
      {
        forecastAt: '2026-08-02T01:00:00.000Z',
        ...measurements({
          temperatureCelsius: 0,
          apparentTemperatureCelsius: -4,
          condition: 'heavy_rain',
          precipitationProbability: 1,
          windSpeedMetersPerSecond: 12,
        }),
      },
    ],
  }), observedAt);

  assert.deepEqual(result.requirements, []);
  assert.deepEqual(result.reasonCodes, []);
});

test('daily extrema are a documented fallback when no future hourly entry exists', () => {
  const result = deriveClothingRequirements(snapshot({
    current: {
      temperatureCelsius: 22,
      apparentTemperatureCelsius: 22,
    },
    minimumTemperatureCelsius: 4,
    maximumTemperatureCelsius: 23,
    hourly: [
      {
        forecastAt: '2026-08-01T17:00:00.000Z',
        ...measurements({
          temperatureCelsius: 20,
          apparentTemperatureCelsius: 20,
        }),
      },
      {
        forecastAt: observedAt,
        ...measurements({
          temperatureCelsius: 22,
          apparentTemperatureCelsius: 22,
        }),
      },
    ],
  }), observedAt);

  const thermal = findRequirement(result, 'thermal');
  assert.equal(thermal.minimum, 'high');
  assert.equal(thermal.priority, 'mandatory');
  assert.deepEqual(thermal.reasonCodes, [
    'temperature_low',
    'daily_range_wide',
    'daily_extrema_fallback',
  ]);
  assert.equal(findRequirement(result, 'arm_coverage').priority, 'mandatory');
  assert.equal(findRequirement(result, 'leg_coverage').priority, 'mandatory');
});

test('daily range reason starts at exactly eight degrees', () => {
  const narrow = deriveClothingRequirements(snapshot({
    minimumTemperatureCelsius: 16,
    maximumTemperatureCelsius: 23.999,
  }), observedAt);
  const wide = deriveClothingRequirements(snapshot({
    minimumTemperatureCelsius: 16,
    maximumTemperatureCelsius: 24,
  }), observedAt);
  const wider = deriveClothingRequirements(snapshot({
    minimumTemperatureCelsius: 16,
    maximumTemperatureCelsius: 24.001,
  }), observedAt);

  assert.equal(narrow.reasonCodes.includes('daily_range_wide'), false);
  assert.equal(wide.reasonCodes.includes('daily_range_wide'), true);
  assert.equal(wider.reasonCodes.includes('daily_range_wide'), true);
});

test('wind boundaries do not double-promote thermal protection', () => {
  const cases = [
    [4.999, null, null],
    [5, 'wind_resistant', 'optional'],
    [5.001, 'wind_resistant', 'optional'],
    [7.999, 'wind_resistant', 'optional'],
    [8, 'wind_resistant', 'mandatory'],
    [8.001, 'wind_resistant', 'mandatory'],
  ];

  for (const [wind, minimum, priority] of cases) {
    const result = deriveClothingRequirements(snapshot({
      current: { windSpeedMetersPerSecond: wind },
    }), observedAt);
    const requirement = findRequirement(result, 'wind_protection');
    assert.equal(requirement?.minimum ?? null, minimum);
    assert.equal(requirement?.priority ?? null, priority);
  }

  const coldAndWindy = deriveClothingRequirements(snapshot({
    current: {
      temperatureCelsius: 14,
      apparentTemperatureCelsius: 8,
      windSpeedMetersPerSecond: 8,
    },
    minimumTemperatureCelsius: 8,
    maximumTemperatureCelsius: 14,
  }), observedAt);
  assert.equal(findRequirement(coldAndWindy, 'thermal').minimum, 'moderate');
  assert.equal(findRequirement(coldAndWindy, 'wind_protection').priority, 'mandatory');
});

test('precipitation probability boundaries map to optional and mandatory body protection', () => {
  const cases = [
    [0.299, null, null],
    [0.3, 'water_resistant', 'optional'],
    [0.301, 'water_resistant', 'optional'],
    [0.599, 'water_resistant', 'optional'],
    [0.6, 'waterproof', 'mandatory'],
    [0.601, 'waterproof', 'mandatory'],
  ];

  for (const [probability, minimum, priority] of cases) {
    const result = deriveClothingRequirements(snapshot({
      current: { precipitationProbability: probability },
    }), observedAt);
    const requirement = findRequirement(result, 'water_protection', 'body');
    assert.equal(requirement?.minimum ?? null, minimum);
    assert.equal(requirement?.priority ?? null, priority);
  }
});

test('every condition code has an explicit weather-protection outcome', () => {
  const dryConditions = new Set([
    'clear',
    'mostly_clear',
    'partly_cloudy',
    'cloudy',
    'fog',
  ]);

  for (const condition of weatherConditionCodes) {
    const result = deriveClothingRequirements(snapshot({ current: { condition } }), observedAt);
    const body = findRequirement(result, 'water_protection', 'body');
    const feet = findRequirement(result, 'water_protection', 'feet');
    const traction = findRequirement(result, 'traction');

    if (dryConditions.has(condition)) {
      assert.equal(body, undefined, condition);
      assert.equal(feet, undefined, condition);
      assert.equal(traction, undefined, condition);
      continue;
    }

    if (condition === 'drizzle') {
      assert.deepEqual(
        [body.minimum, body.priority, feet, traction],
        ['water_resistant', 'mandatory', undefined, undefined],
      );
    } else if (condition === 'rain') {
      assert.deepEqual(
        [body.minimum, body.priority, feet.minimum, feet.priority, traction],
        ['waterproof', 'mandatory', 'water_resistant', 'optional', undefined],
      );
    } else if (condition === 'heavy_rain' || condition === 'thunderstorm') {
      assert.deepEqual(
        [body.minimum, body.priority, feet.minimum, feet.priority, traction.priority],
        ['waterproof', 'mandatory', 'water_resistant', 'mandatory', 'optional'],
      );
    } else {
      assert.deepEqual(
        [body.minimum, body.priority, feet.minimum, feet.priority, traction.priority],
        ['waterproof', 'mandatory', 'waterproof', 'mandatory', 'mandatory'],
      );
    }
  }
});

test('condition signals override probability without cancelling independent needs', () => {
  const rain = deriveClothingRequirements(snapshot({
    current: {
      temperatureCelsius: 29,
      apparentTemperatureCelsius: 30,
      condition: 'rain',
      precipitationProbability: 0.3,
    },
    minimumTemperatureCelsius: 28,
    maximumTemperatureCelsius: 30,
  }), observedAt);
  assert.equal(findRequirement(rain, 'breathability').minimum, 'high');
  const rainBody = findRequirement(rain, 'water_protection', 'body');
  assert.equal(rainBody.minimum, 'waterproof');
  assert.equal(rainBody.priority, 'mandatory');
  assert.deepEqual(rainBody.reasonCodes, [
    'precipitation_possible',
    'condition_rain',
  ]);

  const snow = deriveClothingRequirements(snapshot({
    current: {
      temperatureCelsius: 20,
      apparentTemperatureCelsius: 20,
      condition: 'snow',
    },
    minimumTemperatureCelsius: 20,
    maximumTemperatureCelsius: 21,
  }), observedAt);
  assert.equal(findRequirement(snow, 'thermal'), undefined);
  assert.equal(findRequirement(snow, 'water_protection', 'feet').minimum, 'waterproof');
  assert.equal(findRequirement(snow, 'traction').priority, 'mandatory');

  const likelyClear = deriveClothingRequirements(snapshot({
    current: { condition: 'clear', precipitationProbability: 0.6 },
  }), observedAt);
  assert.equal(
    findRequirement(likelyClear, 'water_protection', 'body').minimum,
    'waterproof',
  );
});

test('thunderstorm output describes protection without claiming outdoor safety', () => {
  const result = deriveClothingRequirements(snapshot({
    current: { condition: 'thunderstorm' },
  }), observedAt);
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes('condition_thunderstorm'), true);
  assert.equal(/safe|safety|outdoor|activity/i.test(serialized), false);
});

test('output is immutable, deduplicated, stably ordered, and metadata-independent', () => {
  const input = snapshot({
    current: {
      temperatureCelsius: 8,
      apparentTemperatureCelsius: 7,
      condition: 'rain',
      precipitationProbability: 0.6,
      windSpeedMetersPerSecond: 8,
    },
    minimumTemperatureCelsius: 7,
    maximumTemperatureCelsius: 12,
  });
  const first = deriveClothingRequirements(input, observedAt);
  const second = deriveClothingRequirements({
    ...input,
    id: '118f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
    localProfileId: 'profile-two',
  }, observedAt);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.requirements.map((requirement) =>
      requirement.kind === 'water_protection'
        ? `${requirement.kind}:${requirement.target}`
        : requirement.kind,
    ),
    [
      'thermal',
      'arm_coverage',
      'leg_coverage',
      'wind_protection',
      'water_protection:body',
      'water_protection:feet',
    ],
  );
  assert.equal(new Set(first.requirements.map((item) =>
    item.kind === 'water_protection' ? `${item.kind}:${item.target}` : item.kind,
  )).size, first.requirements.length);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.requirements), true);
  assert.equal(Object.isFrozen(first.reasonCodes), true);
  assert.equal(first.requirements.every((item) =>
    Object.isFrozen(item) && Object.isFrozen(item.reasonCodes),
  ), true);
  assert.deepEqual(
    [...first.reasonCodes].sort(
      (left, right) =>
        clothingRequirementReasonCodes.indexOf(left) -
        clothingRequirementReasonCodes.indexOf(right),
    ),
    first.reasonCodes,
  );
});

test('just after local midnight the remaining hours come from now, not from observedAt', () => {
  // 00:20 on the new local day in Istanbul; the snapshot was still observed the day before,
  // so reading the day from `observedAt` would drop the 01:00 hour and fall back to the
  // daily extrema of the day that just ended.
  const afterMidnight = '2026-08-01T21:20:00.000Z';
  const result = deriveClothingRequirements(snapshot({
    current: { temperatureCelsius: 20, apparentTemperatureCelsius: 20 },
    minimumTemperatureCelsius: 13,
    maximumTemperatureCelsius: 20,
    hourly: [{
      forecastAt: '2026-08-01T22:00:00.000Z',
      ...measurements({ temperatureCelsius: 4, apparentTemperatureCelsius: 4 }),
    }],
    snapshotFields: { timeZone: 'Europe/Istanbul' },
  }), afterMidnight);

  assert.equal(result.reasonCodes.includes('daily_extrema_fallback'), false);
  assert.equal(findRequirement(result, 'thermal').minimum, 'high');
});
