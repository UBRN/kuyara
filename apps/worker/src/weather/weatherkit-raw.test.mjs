import assert from 'node:assert/strict';
import test from 'node:test';

import { weatherLocalDateKey, weatherV1SuccessSchema } from '@kuyara/contracts';

import { mapProviderWeatherToApi } from './provider-weather-mapper.ts';
import { WeatherProviderError } from './weather-provider-error.ts';
import {
  mapWeatherKitCondition,
  mapWeatherKitResponse,
  weatherKitResponseSchema,
} from './weatherkit-raw.ts';

const location = {
  latitudeE2: 4101,
  longitudeE2: 2898,
  timeZone: 'Europe/Istanbul',
};
const fetchedAt = '2026-09-03T09:05:00.000Z';

function hourlyEntry(forecastStart, overrides = {}) {
  return {
    forecastStart,
    conditionCode: 'partlyCloudy',
    humidity: 0.82,
    precipitationChance: 0.4,
    temperature: 24,
    temperatureApparent: 25,
    uvIndex: 5,
    windSpeed: 10.8,
    ...overrides,
  };
}

function rawFixture() {
  return {
    currentWeather: {
      asOf: '2026-09-03T09:50:00.000Z',
      conditionCode: 'partlyCloudy',
      humidity: 0.82,
      temperature: 24.5,
      temperatureApparent: 25.2,
      uvIndex: 5,
      windSpeed: 12.24,
      extraAppleField: 'ignored',
    },
    forecastHourly: {
      hours: [
        hourlyEntry('2026-09-03T09:00:00.000Z'),
        hourlyEntry('2026-09-03T10:00:00.000Z', {
          conditionCode: 'mostlyClear',
          humidity: 0.78,
          precipitationChance: 0.2,
          temperature: 25,
          temperatureApparent: 26,
          uvIndex: 6,
          windSpeed: 12.96,
        }),
      ],
      extraAppleField: 'ignored',
    },
    forecastDaily: {
      days: [{
        forecastStart: '2026-09-03T00:00:00+03:00',
        temperatureMax: 29,
        temperatureMin: 18,
        extraAppleField: 'ignored',
      }],
      extraAppleField: 'ignored',
    },
    extraAppleField: 'ignored',
  };
}

test('converts km/h wind and passes WeatherKit metric values through unchanged', () => {
  const snapshot = mapWeatherKitResponse(
    weatherKitResponseSchema.parse(rawFixture()),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.current.temperatureCelsius, 24.5);
  assert.equal(snapshot.current.apparentTemperatureCelsius, 25.2);
  assert.equal(snapshot.current.humidity, 0.82);
  assert.equal(snapshot.current.precipitationProbability, 0.2);
  assert.equal(snapshot.current.windSpeedMetersPerSecond, 3.4);
  assert.equal(snapshot.hourly[0].windSpeedMetersPerSecond, 3);
});

test('takes current precipitation from the nearest hour and UV from current weather', () => {
  const snapshot = mapWeatherKitResponse(
    weatherKitResponseSchema.parse(rawFixture()),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.current.precipitationProbability, 0.2);
  assert.equal(snapshot.current.uvIndex, 5);
});

test('keeps at most 25 ordered hourly entries from the observed local day', () => {
  const fixture = rawFixture();
  const sameDay = Array.from({ length: 30 }, (_, index) => hourlyEntry(new Date(
    Date.parse('2026-09-02T21:00:00.000Z') + index * 30 * 60 * 1000,
  ).toISOString()));
  fixture.forecastHourly.hours = [
    hourlyEntry('2026-09-02T20:30:00.000Z'),
    ...sameDay,
    hourlyEntry('2026-09-03T21:00:00.000Z'),
  ].reverse();

  const snapshot = mapWeatherKitResponse(
    weatherKitResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );
  const currentDay = weatherLocalDateKey(snapshot.current.observedAt, location.timeZone);

  assert.equal(snapshot.hourly.length, 25);
  assert.equal(snapshot.hourly[0].forecastAt, '2026-09-02T21:00:00.000Z');
  assert.equal(snapshot.hourly[24].forecastAt, '2026-09-03T09:00:00.000Z');
  assert.ok(snapshot.hourly.every(({ forecastAt }) => (
    weatherLocalDateKey(forecastAt, location.timeZone) === currentDay
  )));
  assert.ok(snapshot.hourly.every(({ forecastAt }, index, hourly) => (
    index === 0 || hourly[index - 1].forecastAt < forecastAt
  )));
});

test('clamps daily temperature bounds around the current reading', () => {
  const fixture = rawFixture();
  fixture.forecastDaily.days[0].temperatureMax = 20;
  fixture.forecastDaily.days[0].temperatureMin = 27;

  const snapshot = mapWeatherKitResponse(
    weatherKitResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.minimumTemperatureCelsius, 24.5);
  assert.equal(snapshot.maximumTemperatureCelsius, 24.5);
});

test('maps every documented WeatherKit condition code', () => {
  const cases = [
    ['clear', 'clear'],
    ['mostlyClear', 'mostly_clear'],
    ['partlyCloudy', 'partly_cloudy'],
    ['cloudy', 'cloudy'],
    ['mostlyCloudy', 'cloudy'],
    ['foggy', 'fog'],
    ['haze', 'fog'],
    ['smoky', 'fog'],
    ['blowingDust', 'fog'],
    ['drizzle', 'drizzle'],
    ['freezingDrizzle', 'drizzle'],
    ['sunShowers', 'drizzle'],
    ['rain', 'rain'],
    ['freezingRain', 'rain'],
    ['heavyRain', 'heavy_rain'],
    ['hurricane', 'heavy_rain'],
    ['tropicalStorm', 'heavy_rain'],
    ['sleet', 'sleet'],
    ['hail', 'sleet'],
    ['wintryMix', 'sleet'],
    ['snow', 'snow'],
    ['heavySnow', 'snow'],
    ['blizzard', 'snow'],
    ['flurries', 'snow'],
    ['blowingSnow', 'snow'],
    ['sunFlurries', 'snow'],
    ['thunderstorms', 'thunderstorm'],
    ['isolatedThunderstorms', 'thunderstorm'],
    ['scatteredThunderstorms', 'thunderstorm'],
    ['strongStorms', 'thunderstorm'],
    ['breezy', 'clear'],
    ['windy', 'clear'],
    ['hot', 'clear'],
    ['frigid', 'clear'],
  ];

  assert.equal(cases.length, 34);
  for (const [conditionCode, condition] of cases) {
    assert.equal(mapWeatherKitCondition(conditionCode), condition);
  }
});

test('rejects an unmapped WeatherKit condition code', () => {
  assert.throws(
    () => mapWeatherKitCondition('unknownFutureCode'),
    (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
  );
});

test('rejects empty hourly and daily forecasts', () => {
  const emptyHourly = rawFixture();
  emptyHourly.forecastHourly.hours = [];
  const emptyDaily = rawFixture();
  emptyDaily.forecastDaily.days = [];

  assert.equal(weatherKitResponseSchema.safeParse(emptyHourly).success, false);
  assert.equal(weatherKitResponseSchema.safeParse(emptyDaily).success, false);
});

test('rejects a daily forecast without the observed local day', () => {
  const fixture = rawFixture();
  fixture.forecastDaily.days[0].forecastStart = '2026-09-04T00:00:00+03:00';

  assert.throws(
    () => mapWeatherKitResponse(
      weatherKitResponseSchema.parse(fixture),
      location,
      fetchedAt,
    ),
    (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
  );
});

test('rejects duplicate local-day hourly forecasts', () => {
  const fixture = rawFixture();
  fixture.forecastHourly.hours[1].forecastStart = fixture.forecastHourly.hours[0].forecastStart;

  assert.throws(
    () => mapWeatherKitResponse(
      weatherKitResponseSchema.parse(fixture),
      location,
      fetchedAt,
    ),
    (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
  );
});

test('maps a realistic response through the shared weather contract', () => {
  const snapshot = mapWeatherKitResponse(
    weatherKitResponseSchema.parse(rawFixture()),
    location,
    fetchedAt,
  );
  const data = mapProviderWeatherToApi(snapshot).data;

  assert.equal(weatherV1SuccessSchema.safeParse({ data }).success, true);
});
