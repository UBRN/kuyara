import assert from 'node:assert/strict';
import test from 'node:test';

import { weatherV1SuccessSchema } from './weather-v1.ts';
import {
  weatherDailyForecastMaximumEntries,
  weatherV2Path,
  weatherV2SuccessSchema,
} from './weather-v2.ts';

function validSuccess() {
  const measurements = {
    temperatureCelsius: 16,
    apparentTemperatureCelsius: 15,
    condition: 'rain',
    precipitationProbability: 0.55,
    windSpeedMetersPerSecond: 4.2,
    humidity: 0.72,
    uvIndex: 3,
  };
  return {
    data: {
      timeZone: 'Europe/Istanbul',
      fetchedAt: '2026-08-01T09:30:00.000Z',
      origin: { kind: 'sample', sourceId: 'sample' },
      current: { ...measurements, observedAt: '2026-08-01T09:30:00.000Z' },
      minimumTemperatureCelsius: 12,
      maximumTemperatureCelsius: 19,
      hourly: [
        { ...measurements, forecastAt: '2026-08-01T10:00:00.000Z' },
        { ...measurements, forecastAt: '2026-08-01T11:00:00.000Z' },
      ],
      daily: [
        {
          dateKey: '2026-08-01',
          condition: 'rain',
          minimumTemperatureCelsius: 12,
          maximumTemperatureCelsius: 19,
          precipitationProbability: 0.55,
          precipitationMillimetres: 4.2,
        },
        {
          dateKey: '2026-08-02',
          condition: 'clear',
          minimumTemperatureCelsius: 14,
          maximumTemperatureCelsius: 24,
          precipitationProbability: 0,
          precipitationMillimetres: null,
        },
      ],
    },
  };
}

test('exports the confirmed weather v2 path and daily ceiling', () => {
  assert.equal(weatherV2Path, '/v2/weather');
  assert.equal(weatherDailyForecastMaximumEntries, 7);
});

test('accepts the v1 payload widened with an ordered daily block', () => {
  const payload = validSuccess();
  const result = weatherV2SuccessSchema.safeParse(payload);

  assert.equal(result.success, true);
  assert.equal(result.data.data.daily.length, 2);
  assert.equal(result.data.data.daily[1].precipitationMillimetres, null);
});

// The whole reason /v2 exists: builds 8 and 9 reject an unknown key, so the daily block must
// never reach a /v1 body. The v1 schema strips it, which is what the Worker relies on.
test('the v1 schema still accepts and strips the widened payload', () => {
  const result = weatherV1SuccessSchema.safeParse(validSuccess());

  assert.equal(result.success, true);
  assert.equal('daily' in result.data.data, false);
});

test('keeps every v1 invariant', () => {
  const brokenHourlyOrder = validSuccess();
  brokenHourlyOrder.data.hourly.reverse();
  const brokenOrigin = validSuccess();
  brokenOrigin.data.origin = { kind: 'live', sourceId: 'sample' };

  for (const payload of [brokenHourlyOrder, brokenOrigin]) {
    assert.equal(weatherV2SuccessSchema.safeParse(payload).success, false);
  }
});

test('rejects a daily block that is empty, too long, unordered, or off the local day', () => {
  const empty = validSuccess();
  empty.data.daily = [];
  const tooLong = validSuccess();
  tooLong.data.daily = Array.from({ length: weatherDailyForecastMaximumEntries + 1 }, (_, index) => ({
    ...validSuccess().data.daily[0],
    dateKey: `2026-08-0${index + 1}`,
  }));
  const unordered = validSuccess();
  unordered.data.daily.reverse();
  const duplicated = validSuccess();
  duplicated.data.daily[1].dateKey = duplicated.data.daily[0].dateKey;
  const wrongFirstDay = validSuccess();
  wrongFirstDay.data.daily.shift();
  // 09:30 UTC is still 23:30 on the previous day in Honolulu, so the first entry no longer
  // names the observation's local day.
  const otherZone = validSuccess();
  otherZone.data.timeZone = 'Pacific/Honolulu';

  for (const payload of [empty, tooLong, unordered, duplicated, wrongFirstDay, otherZone]) {
    assert.equal(weatherV2SuccessSchema.safeParse(payload).success, false);
  }
});

test('rejects an entry with an unusable date key, condition, chance, or amount', () => {
  const badDateKey = validSuccess();
  badDateKey.data.daily[1].dateKey = '2026-8-2';
  const badCondition = validSuccess();
  badCondition.data.daily[1].condition = 'sandstorm';
  const badChance = validSuccess();
  badChance.data.daily[1].precipitationProbability = 55;
  const negativeAmount = validSuccess();
  negativeAmount.data.daily[1].precipitationMillimetres = -1;
  const missingAmount = validSuccess();
  delete missingAmount.data.daily[1].precipitationMillimetres;
  const invertedRange = validSuccess();
  invertedRange.data.daily[1].minimumTemperatureCelsius = 30;

  for (const payload of [
    badDateKey, badCondition, badChance, negativeAmount, missingAmount, invertedRange,
  ]) {
    assert.equal(weatherV2SuccessSchema.safeParse(payload).success, false);
  }
});

test('rejects a first daily entry that contradicts the snapshot low and high', () => {
  const payload = validSuccess();
  payload.data.daily[0].maximumTemperatureCelsius = 21;

  assert.equal(weatherV2SuccessSchema.safeParse(payload).success, false);
});

test('strips an unknown key instead of failing, so a later Worker field is readable', () => {
  const payload = validSuccess();
  payload.data.daily[0].precipitationHours = 3;
  const result = weatherV2SuccessSchema.safeParse(payload);

  assert.equal(result.success, true);
  assert.equal('precipitationHours' in result.data.data.daily[0], false);
});
