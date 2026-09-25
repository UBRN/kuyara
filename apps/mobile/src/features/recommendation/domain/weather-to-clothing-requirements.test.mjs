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

test('later departure uses its forecast, not the current reading', () => {
  const result = deriveClothingRequirements(snapshot({
    current: { temperatureCelsius: 30, apparentTemperatureCelsius: 30 },
    hourly: [{ forecastAt: '2026-08-01T13:00:00.000Z',
      ...measurements({ temperatureCelsius: 10, apparentTemperatureCelsius: 10 }) }],
  }), '2026-08-01T11:00:00.000Z', '2026-08-01T13:00:00.000Z');
  assert.equal(findRequirement(result, 'thermal')?.priority, 'mandatory');
  assert.equal(findRequirement(result, 'breathability'), undefined);
});

test('short cold tail is optional; two consecutive hours below 12 or one below 5 are mandatory', () => {
  const at = '2026-08-01T18:00:00.000Z';
  const nextDay = (temps) => snapshot({ current: { temperatureCelsius: 21,
    apparentTemperatureCelsius: 21 }, hourly: [
    { forecastAt: at, ...measurements({ temperatureCelsius: 21 }) },
    ...temps.map(([dateHour, temperature]) => ({ forecastAt: `2026-08-${dateHour}:00:00.000Z`,
      ...measurements({ temperatureCelsius: temperature, apparentTemperatureCelsius: temperature }) })),
  ] });
  assert.equal(findRequirement(deriveClothingRequirements(nextDay([['02T00', 11]]), at), 'thermal')?.priority,
    'optional');
  assert.equal(findRequirement(deriveClothingRequirements(nextDay([['01T23', 11], ['02T00', 11]]), at), 'thermal')?.priority,
    'mandatory');
  assert.equal(findRequirement(deriveClothingRequirements(nextDay([['02T00', 4]]), at), 'thermal')?.priority,
    'mandatory');
});

test('03:00 cold is outside a 20:00 selection ending at 01:00', () => {
  const result = deriveClothingRequirements(snapshot({
    hourly: [{ forecastAt: '2026-08-02T03:00:00.000Z',
      ...measurements({ temperatureCelsius: 3, apparentTemperatureCelsius: 3 }) }],
  }), '2026-08-01T20:00:00.000Z');
  assert.equal(findRequirement(result, 'thermal'), undefined);
});

test('severe late cold remains mandatory after a hot first four hours', () => {
  const at = '2026-08-01T18:00:00.000Z';
  const result = deriveClothingRequirements(snapshot({
    current: { temperatureCelsius: 30, apparentTemperatureCelsius: 30 },
    hourly: [
      { forecastAt: at, ...measurements({ temperatureCelsius: 30,
        apparentTemperatureCelsius: 30 }) },
      { forecastAt: '2026-08-02T00:00:00.000Z', ...measurements({
        temperatureCelsius: 4, apparentTemperatureCelsius: 4 }) },
    ],
  }), at);
  assert.equal(findRequirement(result, 'thermal')?.priority, 'mandatory');
  assert.equal(findRequirement(result, 'breathability')?.priority, 'optional');
});

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

// Three rungs, from A3 section 3 of 2026-09-17: Fit The Forecast puts shorts at 23 and
// raksul a single short sleeve at 25, and 28 is where kuyara already made breathability
// mandatory. The two lower rungs reorder the offer and compose nothing away.
test('breathability thresholds distinguish optional warmth from mandatory heat', () => {
  const cases = [
    [22.999, null, null],
    [23, 'moderate', 'optional'],
    [24.999, 'moderate', 'optional'],
    [25, 'high', 'optional'],
    [27.999, 'high', 'optional'],
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

test('the first four hours keep the primary exposure mandatory', () => {
  const hourAt = (hour) => `2026-08-01T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const hours = (entries) => entries.map(([hour, temperature]) => ({
    forecastAt: hourAt(hour),
    ...measurements({
      temperatureCelsius: temperature,
      apparentTemperatureCelsius: temperature,
    }),
  }));
  const day = (nowHour, temperature, hourly) => deriveClothingRequirements(snapshot({
    current: { temperatureCelsius: temperature, apparentTemperatureCelsius: temperature },
    snapshotFields: { fetchedAt: hourAt(nowHour) },
    minimumTemperatureCelsius: 4,
    maximumTemperatureCelsius: 29,
    hourly,
  }), hourAt(nowHour));
  const priorities = (result) => Object.fromEntries(
    ['thermal', 'arm_coverage', 'leg_coverage', 'breathability'].map((kind) => [
      kind,
      `${findRequirement(result, kind)?.minimum}:${findRequirement(result, kind)?.priority}`,
    ]),
  );

  // The later hot hour does not make the cold morning outfit breathable.
  const coldNow = day(7, 4, hours([[8, 4], [16, 29]]));
  assert.deepEqual(priorities(coldNow), {
    thermal: 'high:mandatory',
    arm_coverage: 'full:mandatory',
    leg_coverage: 'full:mandatory',
    breathability: 'undefined:undefined',
  });

  // Cold at the end boundary is outside coverage, so heat now wins alone.
  assert.deepEqual(priorities(day(16, 29, hours([[17, 29], [22, 4]]))), {
    thermal: 'undefined:undefined',
    arm_coverage: 'undefined:undefined',
    leg_coverage: 'undefined:undefined',
    breathability: 'high:mandatory',
  });
  // Later heat does not drive the main outfit outside its first four hours.
  assert.deepEqual(priorities(day(12, 15, hours([[16, 29], [22, 12]]))), {
    thermal: 'light:mandatory',
    arm_coverage: 'full:optional',
    leg_coverage: 'full:optional',
    breathability: 'undefined:undefined',
  });
  assert.deepEqual(priorities(day(8, 17, hours([[9, 17], [15, 30]]))), {
    thermal: 'light:mandatory',
    arm_coverage: 'full:optional',
    leg_coverage: 'full:optional',
    breathability: 'undefined:undefined',
  });
  // Cold at 22:00 is outside the afternoon coverage end.
  assert.deepEqual(priorities(day(15, 30, hours([[16, 30], [22, 17]]))), {
    thermal: 'undefined:undefined',
    arm_coverage: 'undefined:undefined',
    leg_coverage: 'undefined:undefined',
    breathability: 'high:mandatory',
  });
  // Later heat outside the first four hours does not force breathability.
  const warmAllDay = day(12, 20, hours([[16, 29], [22, 18]]));
  assert.equal(findRequirement(warmAllDay, 'thermal'), undefined);
  assert.equal(findRequirement(warmAllDay, 'breathability'), undefined);
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

test('an open before 18:00 local ignores every hour after the local midnight', () => {
  const result = deriveClothingRequirements(snapshot({
    current: {
      temperatureCelsius: 22,
      apparentTemperatureCelsius: 22,
    },
    minimumTemperatureCelsius: 21,
    maximumTemperatureCelsius: 23,
    snapshotFields: { fetchedAt: '2026-08-01T09:00:00.000Z' },
    hourly: [
      {
        forecastAt: '2026-08-01T10:00:00.000Z',
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
  }), '2026-08-01T09:00:00.000Z');

  assert.deepEqual(result.requirements, []);
  assert.deepEqual(result.reasonCodes, []);
});

test('an evening open includes overnight weather until its 01:00 coverage end', () => {
  const overnight = {
    forecastAt: '2026-08-02T00:00:00.000Z',
    ...measurements({
      temperatureCelsius: 0,
      apparentTemperatureCelsius: -4,
      condition: 'heavy_rain',
      precipitationProbability: 1,
      windSpeedMetersPerSecond: 12,
    }),
  };
  const evening = snapshot({
    current: { temperatureCelsius: 22, apparentTemperatureCelsius: 22 },
    minimumTemperatureCelsius: 21,
    maximumTemperatureCelsius: 23,
    snapshotFields: { fetchedAt: '2026-08-01T19:00:00.000Z' },
    hourly: [
      {
        forecastAt: '2026-08-01T20:00:00.000Z',
        ...measurements({ temperatureCelsius: 18, apparentTemperatureCelsius: 18 }),
      },
      overnight,
      // 05:00 is beyond the 01:00 outfit end.
      {
        forecastAt: '2026-08-02T05:00:00.000Z',
        ...measurements({ temperatureCelsius: 35, apparentTemperatureCelsius: 35 }),
      },
    ],
  });
  const result = deriveClothingRequirements(evening, '2026-08-01T19:00:00.000Z');

  assert.equal(findRequirement(result, 'thermal').minimum, 'high');
  assert.equal(findRequirement(result, 'water_protection').minimum, 'waterproof');
  assert.equal(findRequirement(result, 'wind_protection').priority, 'mandatory');
  // The 05:00 hour sits past the outfit end.
  assert.equal(findRequirement(result, 'breathability'), undefined);
});

test('an open after midnight stays inside the evening that has not ended', () => {
  // 01:30 local. The dressing day is still the one that began the evening before, so the
  // 03:00 hour counts and the 09:00 hour of the new morning does not.
  const result = deriveClothingRequirements(snapshot({
    current: { temperatureCelsius: 16, apparentTemperatureCelsius: 16 },
    minimumTemperatureCelsius: 15,
    maximumTemperatureCelsius: 17,
    snapshotFields: { fetchedAt: '2026-08-02T01:30:00.000Z' },
    hourly: [
      {
        forecastAt: '2026-08-02T03:00:00.000Z',
        ...measurements({ temperatureCelsius: 3, apparentTemperatureCelsius: 3 }),
      },
      {
        forecastAt: '2026-08-02T09:00:00.000Z',
        ...measurements({ temperatureCelsius: 30, apparentTemperatureCelsius: 30 }),
      },
    ],
  }), '2026-08-02T01:30:00.000Z');

  assert.equal(findRequirement(result, 'thermal').minimum, 'high');
  assert.equal(findRequirement(result, 'breathability'), undefined);
});

test('every open between 04:00 and 17:59 composes exactly what the calendar day composed', () => {
  // The byte-identity guarantee for morning and afternoon opens: the window selects the
  // same hours the local-day filter selected, and the provider's daily extrema never reach
  // the pool. A hot overnight hour and an absurd daily range are both invisible here.
  const hourAt = (day, hour) =>
    `2026-08-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const reading = (day, hour, temperature) => ({
    forecastAt: hourAt(day, hour),
    ...measurements({
      temperatureCelsius: temperature,
      apparentTemperatureCelsius: temperature,
      windSpeedMetersPerSecond: temperature < 10 ? 9 : 2,
      precipitationProbability: temperature < 10 ? 0.7 : 0.1,
      condition: temperature < 10 ? 'rain' : 'clear',
    }),
  });
  const localDayHours = [
    reading(1, 2, 14), reading(1, 6, 11), reading(1, 10, 19),
    reading(1, 15, 26), reading(1, 20, 16), reading(1, 23, 9),
  ];
  const overnight = [reading(2, 1, 31), reading(2, 3, 33), reading(2, 8, 2)];

  for (const nowHour of [4, 5, 9, 12, 17]) {
    const now = hourAt(1, nowHour);
    const fields = {
      current: { temperatureCelsius: 20, apparentTemperatureCelsius: 20 },
      snapshotFields: { fetchedAt: now },
    };
    const calendarDay = deriveClothingRequirements(snapshot({
      ...fields,
      minimumTemperatureCelsius: 11,
      maximumTemperatureCelsius: 26,
      hourly: localDayHours,
    }), now);
    const dressingDay = deriveClothingRequirements(snapshot({
      ...fields,
      // A far wider provider range and three overnight hours: neither may move the result.
      // Both ranges are wide, so `daily_range_wide` fires either way and the only thing the
      // numbers could still change is the temperature pool, which they must not reach.
      minimumTemperatureCelsius: -20,
      maximumTemperatureCelsius: 45,
      hourly: [...localDayHours, ...overnight],
    }), now);

    assert.deepEqual(dressingDay, calendarDay, `${nowHour}:00 local`);
  }
});

test('a window with no hour of its own follows the current measurement alone', () => {
  // 23:00 local with every hour already past. The provider's daily minimum and maximum
  // describe the calendar day the snapshot was observed in, so reading them here dressed
  // the wearer for this morning's low; the window contributes nothing instead.
  const result = deriveClothingRequirements(snapshot({
    current: {
      temperatureCelsius: 22,
      apparentTemperatureCelsius: 22,
    },
    minimumTemperatureCelsius: 4,
    maximumTemperatureCelsius: 23,
    snapshotFields: { fetchedAt: '2026-08-01T23:00:00.000Z' },
    hourly: [
      {
        forecastAt: '2026-08-01T17:00:00.000Z',
        ...measurements({
          temperatureCelsius: 20,
          apparentTemperatureCelsius: 20,
        }),
      },
      {
        forecastAt: '2026-08-01T22:00:00.000Z',
        ...measurements({
          temperatureCelsius: 22,
          apparentTemperatureCelsius: 22,
        }),
      },
    ],
  }), '2026-08-01T23:00:00.000Z');

  assert.equal(findRequirement(result, 'thermal'), undefined);
  assert.equal(findRequirement(result, 'arm_coverage'), undefined);
  assert.equal(findRequirement(result, 'leg_coverage'), undefined);
  // The calendar day's spread is still wide, and still says so: `daily_range_wide` is a
  // statement about the date, not about the window.
  assert.deepEqual(result.reasonCodes, ['daily_range_wide']);
});

test('a time zone Intl refuses keeps every hour still ahead in the pool', () => {
  // `wardrobeDayWindow` answers null for a zone it cannot read, and a pool of one stale
  // measurement would be a silent narrowing. Without a window every hour the snapshot
  // still has ahead counts, including the 2 C hour a valid zone would leave outside.
  const hourly = [
    {
      forecastAt: '2026-08-01T17:00:00.000Z',
      ...measurements({ temperatureCelsius: 30, apparentTemperatureCelsius: 30 }),
    },
    {
      forecastAt: '2026-08-03T00:00:00.000Z',
      ...measurements({ temperatureCelsius: 2, apparentTemperatureCelsius: 2 }),
    },
  ];
  const broken = deriveClothingRequirements(snapshot({
    snapshotFields: { timeZone: 'Not/AZone' },
    hourly,
  }), observedAt);

  assert.equal(findRequirement(broken, 'thermal')?.minimum, 'high');
  assert.equal(findRequirement(broken, 'arm_coverage')?.priority, 'mandatory');
  // The hour before `now` stays out of the pool whatever the zone does, so nothing here
  // asks for breathability at 30 C.
  assert.equal(findRequirement(broken, 'breathability'), undefined);

  // The same snapshot in a zone Intl accepts stops at the window's 04:00 end, which is
  // what makes the fallback above visible rather than incidental.
  const readable = deriveClothingRequirements(snapshot({ hourly }), observedAt);
  assert.equal(findRequirement(readable, 'thermal'), undefined);
});

test('a snapshot forty hours old composes from the current measurement alone', () => {
  // The hourly series reaches 36 hours past the observation, so the dressing-day window
  // empties only on a device that has been offline into a second day. There is no daily
  // extrema fallback behind it any more: the date's own 4 C low stays out of the pool.
  const hourly = Array.from({ length: 37 }, (_, hour) => ({
    forecastAt: new Date(Date.parse(observedAt) + hour * 3_600_000).toISOString(),
    ...measurements({ temperatureCelsius: 4, apparentTemperatureCelsius: 4 }),
  }));
  const fields = {
    current: { temperatureCelsius: 22, apparentTemperatureCelsius: 22 },
    minimumTemperatureCelsius: 4,
    maximumTemperatureCelsius: 23,
    hourly,
  };
  const now = new Date(Date.parse(observedAt) + 40 * 3_600_000).toISOString();

  const stale = deriveClothingRequirements(snapshot(fields), now);
  const currentOnly = deriveClothingRequirements(snapshot({ ...fields, hourly: [] }), now);

  assert.deepEqual(stale, currentOnly);
  assert.equal(findRequirement(stale, 'thermal'), undefined);
  // The date's spread is still the date's, so the reason code survives without a thermal
  // floor under it.
  assert.deepEqual(stale.reasonCodes, ['daily_range_wide']);
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
      requirement.kind === 'water_protection' ||
        requirement.kind === 'extremity_cover'
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
      'extremity_cover:head',
      'extremity_cover:neck',
      'extremity_cover:hands',
    ],
  );
  assert.equal(new Set(first.requirements.map((item) =>
    item.kind === 'water_protection' || item.kind === 'extremity_cover'
      ? `${item.kind}:${item.target}`
      : item.kind,
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
      forecastAt: '2026-08-01T21:30:00.000Z',
      ...measurements({ temperatureCelsius: 4, apparentTemperatureCelsius: 4 }),
    }],
    snapshotFields: { timeZone: 'Europe/Istanbul' },
  }), afterMidnight);

  assert.equal(result.reasonCodes.includes('daily_extrema_fallback'), false);
  assert.equal(findRequirement(result, 'thermal').minimum, 'high');
});
