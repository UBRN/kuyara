import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isValidWeatherHourlyForecastWindow,
  weatherDailyForecastMaximumEntries,
  weatherLocalDateKey,
  weatherV1SuccessSchema,
  weatherV2SuccessSchema,
} from '@kuyara/contracts';

import {
  mapOpenWeatherCondition,
  mapOpenWeatherResponse,
  openWeatherResponseSchema,
} from './openweather-raw.ts';
import {
  mapProviderWeatherToApi,
  mapProviderWeatherToApiV2,
} from './provider-weather-mapper.ts';
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
    daily: [
      {
        // One Call stamps a daily entry at local midday.
        dt: unixSeconds('2026-08-29T09:00:00.000Z'),
        temp: { min: 18, max: 29, day: 25 },
        pop: 0.6,
        rain: 4.2,
        weather: [{ id: 500 }],
      },
      {
        dt: unixSeconds('2026-08-30T09:00:00.000Z'),
        temp: { min: 19, max: 30, day: 26 },
        pop: 0,
        weather: [{ id: 800 }],
      },
    ],
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
  assert.equal(snapshot.daily[0].minimumTemperatureCelsius, snapshot.minimumTemperatureCelsius);
  assert.equal(snapshot.daily[0].maximumTemperatureCelsius, snapshot.maximumTemperatureCelsius);
});

test('keeps the ordered 36-hour window across local midnight', () => {
  const fixture = rawFixture();
  fixture.hourly = Array.from({ length: 42 }, (_, index) => ({
    dt: unixSeconds(new Date(
      Date.parse('2026-08-29T07:00:00.000Z') + index * 60 * 60 * 1000,
    ).toISOString()),
    temp: 20,
    feels_like: 20,
    humidity: 50,
    uvi: 0,
    wind_speed: 2,
    pop: 0.1,
    weather: [{ id: 800 }],
  }));
  fixture.hourly.reverse();

  const snapshot = mapOpenWeatherResponse(
    openWeatherResponseSchema.parse(fixture),
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

test('maps the daily block from the observed local day', () => {
  const snapshot = mapOpenWeatherResponse(
    openWeatherResponseSchema.parse(rawFixture()),
    location,
    fetchedAt,
  );

  assert.deepEqual(snapshot.daily, [
    {
      dateKey: '2026-08-29',
      condition: 'rain',
      minimumTemperatureCelsius: 18,
      maximumTemperatureCelsius: 29,
      precipitationProbability: 0.6,
      precipitationMillimetres: 4.2,
    },
    {
      dateKey: '2026-08-30',
      condition: 'clear',
      minimumTemperatureCelsius: 19,
      maximumTemperatureCelsius: 30,
      precipitationProbability: 0,
      // One Call omits `rain` on a dry day, and the adapter never substitutes a zero.
      precipitationMillimetres: null,
    },
  ]);
});

test('reads both rain and snow millimetres, and null only when neither fell', () => {
  const fixture = rawFixture();
  fixture.daily[1].snow = 12;
  const both = rawFixture();
  both.daily[1].rain = 1.5;
  both.daily[1].snow = 3;

  assert.equal(
    mapOpenWeatherResponse(openWeatherResponseSchema.parse(fixture), location, fetchedAt)
      .daily[1].precipitationMillimetres,
    12,
  );
  // A mixed day reports both keys; the row states the day's total water, not one phase of it.
  assert.equal(
    mapOpenWeatherResponse(openWeatherResponseSchema.parse(both), location, fetchedAt)
      .daily[1].precipitationMillimetres,
    4.5,
  );
});

test('a day beyond the seven the block uses cannot fail the response', () => {
  const fixture = rawFixture();
  fixture.daily = Array.from({ length: 8 }, (_, index) => ({
    dt: unixSeconds(new Date(
      Date.parse('2026-08-29T09:00:00.000Z') + index * 24 * 60 * 60 * 1000,
    ).toISOString()),
    temp: { min: 18, max: 29 },
    pop: 0.6,
    weather: [{ id: 500 }],
  }));
  delete fixture.daily[7].pop;
  delete fixture.daily[7].weather;

  const snapshot = mapOpenWeatherResponse(
    openWeatherResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.daily.length, weatherDailyForecastMaximumEntries);
});

test('rejects a used day whose chance or condition One Call withheld', () => {
  const missingPop = rawFixture();
  delete missingPop.daily[1].pop;
  const missingWeather = rawFixture();
  delete missingWeather.daily[1].weather;

  for (const fixture of [missingPop, missingWeather]) {
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

test('orders the days, drops the earlier ones and stops at the contract ceiling', () => {
  const fixture = rawFixture();
  fixture.daily = Array.from({ length: 9 }, (_, index) => ({
    dt: unixSeconds(new Date(
      Date.parse('2026-08-28T09:00:00.000Z') + index * 24 * 60 * 60 * 1000,
    ).toISOString()),
    temp: { min: 18, max: 29 },
    pop: 0.6,
    weather: [{ id: 500 }],
  })).reverse();

  const snapshot = mapOpenWeatherResponse(
    openWeatherResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.daily.length, weatherDailyForecastMaximumEntries);
  assert.equal(snapshot.daily[0].dateKey, '2026-08-29');
  assert.equal(snapshot.daily.at(-1).dateKey, '2026-09-04');
});

test('rejects a daily block without the observed local day', () => {
  const fixture = rawFixture();
  fixture.daily = [fixture.daily[1]];

  assert.throws(
    () => mapOpenWeatherResponse(
      openWeatherResponseSchema.parse(fixture),
      location,
      fetchedAt,
    ),
    (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
  );
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

test('rejects duplicate or missing in-window hourly forecasts', () => {
  const duplicate = rawFixture();
  duplicate.hourly[1].dt = duplicate.hourly[0].dt;
  const wrongDay = rawFixture();
  wrongDay.hourly.forEach((entry) => {
    entry.dt = unixSeconds('2026-08-31T09:00:00.000Z');
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
  const dataV2 = mapProviderWeatherToApiV2(snapshot).data;

  assert.equal(weatherV1SuccessSchema.safeParse({ data }).success, true);
  assert.equal('daily' in data, false);
  assert.equal(weatherV2SuccessSchema.safeParse({ data: dataV2 }).success, true);
  assert.equal(dataV2.daily.length, 2);
});
