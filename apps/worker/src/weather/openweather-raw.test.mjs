import assert from 'node:assert/strict';
import test from 'node:test';

import { weatherLocalDateKey, weatherV1SuccessSchema } from '@kuyara/contracts';

import {
  mapOpenWeatherCondition,
  mapOpenWeatherResponse,
  openWeatherResponseSchema,
} from './openweather-raw.ts';
import { mapProviderWeatherToApi } from './provider-weather-mapper.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

const location = {
  latitudeE2: 4101,
  longitudeE2: 2898,
  timeZone: 'Europe/Istanbul',
};
const fetchedAt = '2026-08-29T09:05:00.000Z';

function unixSeconds(timestamp) {
  return Date.parse(timestamp) / 1000;
}

function rawFixture() {
  return {
    lat: 41.01,
    lon: 28.98,
    timezone: 'America/New_York',
    current: {
      dt: unixSeconds('2026-08-29T09:10:00.000Z'),
      temp: 24.5,
      feels_like: 25.2,
      humidity: 82,
      uvi: 5.4,
      wind_speed: 3.6,
      weather: [{ id: 802, description: 'scattered clouds' }],
    },
    hourly: [
      {
        dt: unixSeconds('2026-08-29T09:00:00.000Z'),
        temp: 24,
        feels_like: 25,
        humidity: 82,
        uvi: 5.1,
        wind_speed: 3.2,
        pop: 0.4,
        weather: [{ id: 802 }],
      },
      {
        dt: unixSeconds('2026-08-29T10:00:00.000Z'),
        temp: 25,
        feels_like: 26,
        humidity: 78,
        uvi: 5.8,
        wind_speed: 3.6,
        pop: 0.2,
        weather: [{ id: 801 }],
      },
    ],
    daily: [{
      dt: unixSeconds('2026-08-29T00:00:00.000Z'),
      temp: { min: 18, max: 29, day: 25 },
    }],
  };
}

test('maps OpenWeather units and Unix seconds without using the provider time zone', () => {
  const snapshot = mapOpenWeatherResponse(
    openWeatherResponseSchema.parse(rawFixture()),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.timeZone, 'Europe/Istanbul');
  assert.equal(snapshot.current.observedAt, '2026-08-29T09:10:00.000Z');
  assert.equal(snapshot.current.humidity, 0.82);
  assert.equal(snapshot.current.precipitationProbability, 0.4);
  assert.notEqual(snapshot.current.precipitationProbability, 0.004);
  assert.equal(snapshot.current.windSpeedMetersPerSecond, 3.6);
  assert.equal(snapshot.current.uvIndex, 5.4);
  assert.equal(snapshot.current.condition, 'partly_cloudy');
});

test('clamps daily temperatures around the current reading', () => {
  const fixture = rawFixture();
  fixture.daily[0].temp.min = 27;
  fixture.daily[0].temp.max = 20;

  const snapshot = mapOpenWeatherResponse(
    openWeatherResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.minimumTemperatureCelsius, 24.5);
  assert.equal(snapshot.maximumTemperatureCelsius, 24.5);
});

test('keeps at most 25 ordered hourly entries from the observed local day', () => {
  const fixture = rawFixture();
  const sameDay = Array.from({ length: 30 }, (_, index) => ({
    dt: unixSeconds(new Date(
      Date.parse('2026-08-28T21:00:00.000Z') + index * 30 * 60 * 1000,
    ).toISOString()),
    temp: 20,
    feels_like: 20,
    humidity: 50,
    uvi: 0,
    wind_speed: 2,
    pop: 0.1,
    weather: [{ id: 800 }],
  }));
  fixture.hourly = [
    { ...sameDay[0], dt: unixSeconds('2026-08-28T20:30:00.000Z') },
    ...sameDay,
    { ...sameDay[0], dt: unixSeconds('2026-08-29T21:00:00.000Z') },
  ].reverse();

  const snapshot = mapOpenWeatherResponse(
    openWeatherResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );
  const currentDay = weatherLocalDateKey(snapshot.current.observedAt, location.timeZone);

  assert.equal(snapshot.hourly.length, 25);
  assert.equal(snapshot.hourly[0].forecastAt, '2026-08-28T21:00:00.000Z');
  assert.equal(snapshot.hourly[24].forecastAt, '2026-08-29T09:00:00.000Z');
  assert.ok(snapshot.hourly.every(({ forecastAt }) => (
    weatherLocalDateKey(forecastAt, location.timeZone) === currentDay
  )));
  assert.ok(snapshot.hourly.every(({ forecastAt }, index, hourly) => (
    index === 0 || hourly[index - 1].forecastAt < forecastAt
  )));
});

test('maps every OpenWeather condition row', () => {
  const cases = [
    [200, 'thunderstorm'], [232, 'thunderstorm'],
    [300, 'drizzle'], [321, 'drizzle'],
    [500, 'rain'], [501, 'rain'],
    [502, 'heavy_rain'], [504, 'heavy_rain'],
    [511, 'sleet'],
    [520, 'rain'], [521, 'rain'],
    [522, 'heavy_rain'], [531, 'heavy_rain'],
    [600, 'snow'], [602, 'snow'],
    [611, 'sleet'], [613, 'sleet'],
    [615, 'sleet'], [616, 'sleet'],
    [620, 'snow'], [622, 'snow'],
    [701, 'fog'], [762, 'fog'],
    [771, 'thunderstorm'], [781, 'thunderstorm'],
    [800, 'clear'],
    [801, 'mostly_clear'],
    [802, 'partly_cloudy'],
    [803, 'cloudy'], [804, 'cloudy'],
  ];

  for (const [id, condition] of cases) {
    assert.equal(mapOpenWeatherCondition(id), condition);
  }
});

test('rejects unmapped OpenWeather conditions', () => {
  for (const id of [614, 999]) {
    assert.throws(
      () => mapOpenWeatherCondition(id),
      (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
    );
  }
});

test('rejects empty condition arrays, daily data, and hourly data', () => {
  const emptyCurrentWeather = rawFixture();
  emptyCurrentWeather.current.weather = [];
  const emptyHourlyWeather = rawFixture();
  emptyHourlyWeather.hourly[0].weather = [];
  const emptyDaily = rawFixture();
  emptyDaily.daily = [];
  const emptyHourly = rawFixture();
  emptyHourly.hourly = [];

  assert.equal(openWeatherResponseSchema.safeParse(emptyCurrentWeather).success, false);
  assert.equal(openWeatherResponseSchema.safeParse(emptyHourlyWeather).success, false);
  assert.equal(openWeatherResponseSchema.safeParse(emptyDaily).success, false);
  assert.throws(
    () => mapOpenWeatherResponse(
      openWeatherResponseSchema.parse(emptyHourly),
      location,
      fetchedAt,
    ),
    (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
  );
});

test('rejects duplicate or missing local-day hourly forecasts', () => {
  const duplicate = rawFixture();
  duplicate.hourly[1].dt = duplicate.hourly[0].dt;
  const wrongDay = rawFixture();
  wrongDay.hourly.forEach((entry) => {
    entry.dt = unixSeconds('2026-08-30T09:00:00.000Z');
  });

  for (const fixture of [duplicate, wrongDay]) {
    assert.throws(
      () => mapOpenWeatherResponse(
        openWeatherResponseSchema.parse(fixture),
        location,
        fetchedAt,
      ),
      (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
    );
  }
});

test('maps a realistic response through the shared weather contract', () => {
  const snapshot = mapOpenWeatherResponse(
    openWeatherResponseSchema.parse(rawFixture()),
    location,
    fetchedAt,
  );
  const data = mapProviderWeatherToApi(snapshot).data;

  assert.equal(weatherV1SuccessSchema.safeParse({ data }).success, true);
});
