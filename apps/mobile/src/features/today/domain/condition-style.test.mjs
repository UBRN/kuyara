import assert from 'node:assert/strict';
import test from 'node:test';

import { weatherConditionCodes } from '@/features/weather/domain/weather';
import { resolveConditionStyle } from './condition-style.ts';

const expected = {
  clear: ['clearDay', 'conditionClear'],
  mostly_clear: ['overcast', 'conditionMostlyClear'],
  partly_cloudy: ['overcast', 'conditionPartlyCloudy'],
  cloudy: ['overcast', 'conditionCloudy'],
  fog: ['fog', 'conditionFog'],
  drizzle: ['rain', 'conditionDrizzle'],
  rain: ['rain', 'conditionRain'],
  heavy_rain: ['rain', 'conditionHeavyRain'],
  sleet: ['snow', 'conditionSleet'],
  snow: ['snow', 'conditionSnow'],
  thunderstorm: ['storm', 'conditionThunderstorm'],
};

test('every weather condition resolves to a semantic ink and shape', () => {
  assert.deepEqual(Object.keys(expected), [...weatherConditionCodes]);

  for (const condition of weatherConditionCodes) {
    const [ink, shape] = expected[condition];
    assert.deepEqual(resolveConditionStyle(condition, 12), { ink, shape });
  }

  assert.deepEqual(resolveConditionStyle('clear', 20), {
    ink: 'clearNight',
    shape: 'conditionClearNight',
  });
});

test('unknown conditions and invalid local hours resolve safely to neutral', () => {
  for (const [condition, localHour] of [
    ['future_condition', 12],
    ['toString', 12],
    ['rain', null],
    ['rain', -1],
    ['rain', 24],
  ]) {
    assert.deepEqual(resolveConditionStyle(condition, localHour), {
      ink: 'neutral',
      shape: 'conditionCloudy',
    });
  }
});
