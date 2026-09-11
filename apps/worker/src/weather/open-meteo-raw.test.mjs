import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isValidWeatherHourlyForecastWindow,
  weatherLocalDateKey,
  weatherV1SuccessSchema,
} from '@kuyara/contracts';

import {
  mapOpenMeteoResponse,
  mapOpenMeteoWeatherCode,
  openMeteoResponseSchema,
} from './open-meteo-raw.ts';
import { mapProviderWeatherToApi } from './provider-weather-mapper.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

const location = {
  latitudeE2: 4101,
  longitudeE2: 2898,
  timeZone: 'Europe/Istanbul',
};
const fetchedAt = '2026-08-29T09:05:00.000Z';

// Open-Meteo answers a `timezone=<IANA>` request in that zone's wall clock with no offset
// in the string, so every fixture time below is Istanbul local and `utc_offset_seconds` is
// what turns it back into the instant asserted on.
function rawFixture() {
  return {
    utc_offset_seconds: 10800,
    current: {
      time: '2026-08-29T12:10',
      temperature_2m: 24.5,
      apparent_temperature: 25.2,
      relative_humidity_2m: 82,
      weather_code: 2,
      wind_speed_10m: 3.4,
    },
    hourly: {
      time: ['2026-08-29T12:00', '2026-08-29T13:00'],
      temperature_2m: [24, 25],
      apparent_temperature: [25, 26],
      relative_humidity_2m: [82, 78],
      weather_code: [2, 1],
      wind_speed_10m: [3.2, 3.6],
      precipitation_probability: [40, 20],
      uv_index: [5.1, 5.8],
    },
    daily: {
      time: ['2026-08-29', '2026-08-30'],
      temperature_2m_min: [18, 19],
      temperature_2m_max: [29, 30],
    },
  };
}

test('converts Open-Meteo percentages to contract fractions', () => {
  const raw = openMeteoResponseSchema.parse(rawFixture());

  const snapshot = mapOpenMeteoResponse(raw, location, fetchedAt);

  assert.equal(snapshot.current.humidity, 0.82);
  assert.equal(snapshot.current.precipitationProbability, 0.4);
});

test('clamps a daily maximum below the current temperature', () => {
  const fixture = rawFixture();
  fixture.daily.temperature_2m_max[0] = 20;

  const snapshot = mapOpenMeteoResponse(
    openMeteoResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.maximumTemperatureCelsius, 24.5);
});

test('clamps a daily minimum above the current temperature', () => {
  const fixture = rawFixture();
  fixture.daily.temperature_2m_min[0] = 27;

  const snapshot = mapOpenMeteoResponse(
    openMeteoResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.minimumTemperatureCelsius, 24.5);
});

test('keeps the ordered 36-hour window across local midnight', () => {
  const fixture = rawFixture();
  const times = Array.from({ length: 42 }, (_, index) => new Date(
    Date.parse('2026-08-29T07:00:00.000Z') + (index + 3) * 60 * 60 * 1000,
  ).toISOString().slice(0, 16)).reverse();
  fixture.hourly = {
    time: times,
    temperature_2m: times.map(() => 20),
    apparent_temperature: times.map(() => 20),
    relative_humidity_2m: times.map(() => 50),
    weather_code: times.map(() => 0),
    wind_speed_10m: times.map(() => 2),
    precipitation_probability: times.map(() => 10),
    uv_index: times.map(() => 0),
  };

  const snapshot = mapOpenMeteoResponse(
    openMeteoResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );
  const localDays = new Set(snapshot.hourly.map(({ forecastAt }) => (
    weatherLocalDateKey(forecastAt, location.timeZone)
  )));

  assert.equal(snapshot.hourly.length, 37);
  assert.equal(snapshot.hourly[0].forecastAt, '2026-08-29T09:00:00.000Z');
  assert.equal(snapshot.hourly[36].forecastAt, '2026-08-30T21:00:00.000Z');
  assert.equal(localDays.size, 3);
  assert.equal(isValidWeatherHourlyForecastWindow(
    snapshot.hourly,
    snapshot.current.observedAt,
  ), true);
});

test('takes the low and high from the local day, not the UTC day', () => {
  // 01:10 in Istanbul is still the previous UTC day, which is where `daily[0]` sits.
  const fixture = rawFixture();
  fixture.current.time = '2026-08-29T01:10';
  fixture.hourly.time = ['2026-08-29T01:00', '2026-08-29T02:00'];
  fixture.daily = {
    time: ['2026-08-28', '2026-08-29', '2026-08-30'],
    temperature_2m_min: [11, 18, 19],
    temperature_2m_max: [21, 29, 30],
  };

  const snapshot = mapOpenMeteoResponse(
    openMeteoResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.current.observedAt, '2026-08-28T22:10:00.000Z');
  assert.equal(weatherLocalDateKey(snapshot.current.observedAt, location.timeZone), '2026-08-29');
  assert.equal(snapshot.minimumTemperatureCelsius, 18);
  assert.equal(snapshot.maximumTemperatureCelsius, 29);
});

test('rejects a daily block without the local day', () => {
  const fixture = rawFixture();
  fixture.daily.time = ['2026-08-30', '2026-08-31'];

  assert.throws(
    () => mapOpenMeteoResponse(openMeteoResponseSchema.parse(fixture), location, fetchedAt),
    (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
  );
});

test('maps every supported WMO weather code', () => {
  const cases = [
    [0, 'clear'],
    [1, 'mostly_clear'],
    [2, 'partly_cloudy'],
    [3, 'cloudy'],
    [45, 'fog'], [48, 'fog'],
    [51, 'drizzle'], [53, 'drizzle'], [55, 'drizzle'],
    [56, 'sleet'], [57, 'sleet'],
    [61, 'rain'], [63, 'rain'],
    [65, 'heavy_rain'],
    [66, 'sleet'], [67, 'sleet'],
    [71, 'snow'], [73, 'snow'], [75, 'snow'], [77, 'snow'],
    [80, 'rain'], [81, 'rain'],
    [82, 'heavy_rain'],
    [85, 'snow'], [86, 'snow'],
    [95, 'thunderstorm'], [96, 'thunderstorm'], [99, 'thunderstorm'],
  ];

  for (const [code, condition] of cases) {
    assert.equal(mapOpenMeteoWeatherCode(code), condition);
  }
});

test('rejects an unmapped WMO weather code', () => {
  assert.throws(
    () => mapOpenMeteoWeatherCode(4),
    (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
  );
});

test('rejects mismatched hourly and daily parallel arrays', () => {
  const hourlyMismatch = rawFixture();
  hourlyMismatch.hourly.uv_index.pop();
  const dailyMismatch = rawFixture();
  dailyMismatch.daily.temperature_2m_max.pop();

  assert.equal(openMeteoResponseSchema.safeParse(hourlyMismatch).success, false);
  assert.equal(openMeteoResponseSchema.safeParse(dailyMismatch).success, false);
});

test('rejects an empty hourly response', () => {
  const fixture = rawFixture();
  for (const values of Object.values(fixture.hourly)) values.length = 0;

  assert.equal(openMeteoResponseSchema.safeParse(fixture).success, false);
});

test('maps a realistic response through the shared weather contract', () => {
  const snapshot = mapOpenMeteoResponse(
    openMeteoResponseSchema.parse(rawFixture()),
    location,
    fetchedAt,
  );
  const data = mapProviderWeatherToApi(snapshot).data;

  assert.equal(weatherV1SuccessSchema.safeParse({ data }).success, true);
});
