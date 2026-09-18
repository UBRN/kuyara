import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDaypart } from '@/features/today/domain/atmosphere-state';
import { weatherConditionCodes } from '@/features/weather/domain/weather';
import { resolveConditionStyle } from './condition-style.ts';

const expected = {
  clear: {
    day: ['clearDay', 'conditionClear'],
    night: ['clearNight', 'conditionClearNight'],
  },
  mostly_clear: {
    day: ['mostlyClearDay', 'conditionMostlyClear'],
    night: ['mostlyClearNight', 'conditionMostlyClearNight'],
  },
  partly_cloudy: {
    day: ['partlyCloudyDay', 'conditionPartlyCloudy'],
    night: ['partlyCloudyNight', 'conditionPartlyCloudyNight'],
  },
  cloudy: {
    day: ['cloudy', 'conditionCloudy'],
    night: ['cloudy', 'conditionCloudy'],
  },
  fog: {
    day: ['fog', 'conditionFog'],
    night: ['fog', 'conditionFog'],
  },
  drizzle: {
    day: ['drizzle', 'conditionDrizzle'],
    night: ['drizzle', 'conditionDrizzle'],
  },
  rain: {
    day: ['rain', 'conditionRain'],
    night: ['rain', 'conditionRain'],
  },
  heavy_rain: {
    day: ['heavyRain', 'conditionHeavyRain'],
    night: ['heavyRain', 'conditionHeavyRain'],
  },
  sleet: {
    day: ['sleet', 'conditionSleet'],
    night: ['sleet', 'conditionSleet'],
  },
  snow: {
    day: ['snow', 'conditionSnow'],
    night: ['snow', 'conditionSnow'],
  },
  thunderstorm: {
    day: ['thunderstorm', 'conditionThunderstorm'],
    night: ['thunderstorm', 'conditionThunderstorm'],
  },
};

const istanbul = { latitudeE2: 4101, longitudeE2: 2898 };

test('every weather condition resolves in both dayparts', () => {
  assert.deepEqual(Object.keys(expected), [...weatherConditionCodes]);

  for (const condition of weatherConditionCodes) {
    for (const daypart of ['day', 'night']) {
      const [ink, shape] = expected[condition][daypart];
      assert.deepEqual(
        resolveConditionStyle(condition, daypart),
        { ink, shape },
        `${condition} at ${daypart}`,
      );
    }
  }
});

test('only the three conditions that show the sky change after sunset', () => {
  const changes = weatherConditionCodes.filter((condition) => (
    resolveConditionStyle(condition, 'day').shape
      !== resolveConditionStyle(condition, 'night').shape
  ));

  assert.deepEqual(changes, ['clear', 'mostly_clear', 'partly_cloudy']);
});

test('every condition and daypart pair carries its own ink', () => {
  const inks = new Set();
  for (const condition of weatherConditionCodes) {
    for (const daypart of ['day', 'night']) {
      inks.add(resolveConditionStyle(condition, daypart).ink);
    }
  }

  assert.equal(inks.size, 14);
  assert.ok(!inks.has('neutral'));
});

test('unknown conditions and an unreadable daypart resolve safely to neutral', () => {
  for (const [condition, daypart] of [
    ['future_condition', 'day'],
    ['toString', 'day'],
    ['rain', null],
    ['clear', null],
  ]) {
    assert.deepEqual(resolveConditionStyle(condition, daypart), {
      ink: 'neutral',
      shape: 'conditionCloudy',
    });
  }
});

test('the daypart follows the place, not a fixed window', () => {
  // Istanbul on 18 September 2026 rises at 06:48 and sets at 19:08 local, so the two
  // hours the fixed 06 to 20 window called day are the two this test cares about.
  const daypartAt = (local) => resolveDaypart(
    `2026-09-18T${local}:00+03:00`,
    'Europe/Istanbul',
    istanbul,
  );

  assert.equal(daypartAt('06:00'), 'night');
  assert.equal(daypartAt('06:47'), 'night');
  assert.equal(daypartAt('06:49'), 'day');
  assert.equal(daypartAt('13:00'), 'day');
  assert.equal(daypartAt('19:07'), 'day');
  assert.equal(daypartAt('19:10'), 'night');
  assert.equal(daypartAt('22:30'), 'night');
});

test('the fixed window still answers when the sun cannot', () => {
  const longyearbyen = { latitudeE2: 7822, longitudeE2: 1565 };
  const atMidwinter = (local) => resolveDaypart(
    `2026-12-21T${local}:00+01:00`,
    'Arctic/Longyearbyen',
    longyearbyen,
  );

  // A polar night has no sunrise to read, so the window decides and the screen keeps a
  // daypart rather than falling to the neutral ink.
  assert.equal(atMidwinter('12:00'), 'day');
  assert.equal(atMidwinter('23:00'), 'night');

  // The same fallback covers a snapshot stored before coordinates were kept beside it.
  assert.equal(resolveDaypart('2026-09-18T12:00:00+03:00', 'Europe/Istanbul', null), 'day');
  assert.equal(resolveDaypart('2026-09-18T23:00:00+03:00', 'Europe/Istanbul', undefined), 'night');
});

test('an unreadable instant or time zone resolves to no daypart at all', () => {
  assert.equal(resolveDaypart('not-an-instant', 'Europe/Istanbul', istanbul), null);
  assert.equal(resolveDaypart('2026-09-18T12:00:00Z', 'Mars/Olympus', istanbul), null);
});
