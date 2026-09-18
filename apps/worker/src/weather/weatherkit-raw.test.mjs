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
  mapProviderWeatherToApi,
  mapProviderWeatherToApiV2,
} from './provider-weather-mapper.ts';
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

function dailyEntry(forecastStart, overrides = {}) {
  return {
    forecastStart,
    conditionCode: 'rain',
    precipitationChance: 0.6,
    temperatureMax: 29,
    temperatureMin: 18,
    precipitationAmount: 4.2,
    extraAppleField: 'ignored',
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
      days: [
        dailyEntry('2026-09-03T00:00:00+03:00'),
        dailyEntry('2026-09-04T00:00:00+03:00', {
          conditionCode: 'clear',
          precipitationChance: 0,
          temperatureMax: 31,
          temperatureMin: 19,
        }),
      ],
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

test('keeps the ordered 36-hour window across local midnight', () => {
  const fixture = rawFixture();
  fixture.forecastHourly.hours = Array.from({ length: 42 }, (_, index) => hourlyEntry(new Date(
    Date.parse('2026-09-03T07:00:00.000Z') + index * 60 * 60 * 1000,
  ).toISOString()));
  fixture.forecastHourly.hours.reverse();

  const snapshot = mapWeatherKitResponse(
    weatherKitResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );
  const localDays = new Set(snapshot.hourly.map(({ forecastAt }) => (
    weatherLocalDateKey(forecastAt, location.timeZone)
  )));

  assert.equal(snapshot.hourly.length, 37);
  assert.equal(snapshot.hourly[0].forecastAt, '2026-09-03T09:00:00.000Z');
  assert.equal(snapshot.hourly[36].forecastAt, '2026-09-04T21:00:00.000Z');
  assert.equal(localDays.size, 3);
  assert.equal(isValidWeatherHourlyForecastWindow(
    snapshot.hourly,
    snapshot.current.observedAt,
  ), true);
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
  assert.equal(snapshot.daily[0].minimumTemperatureCelsius, snapshot.minimumTemperatureCelsius);
  assert.equal(snapshot.daily[0].maximumTemperatureCelsius, snapshot.maximumTemperatureCelsius);
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
    // The live REST API sends PascalCase, not the Swift case names.
    const pascalCase = conditionCode.charAt(0).toUpperCase() + conditionCode.slice(1);
    assert.equal(mapWeatherKitCondition(pascalCase), condition);
  }
});

test('rejects an unmapped WeatherKit condition code', () => {
  assert.throws(
    () => mapWeatherKitCondition('unknownFutureCode'),
    (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
  );
});

test('maps the daily block from the observed local day', () => {
  const snapshot = mapWeatherKitResponse(
    weatherKitResponseSchema.parse(rawFixture()),
    location,
    fetchedAt,
  );

  assert.deepEqual(snapshot.daily, [
    {
      dateKey: '2026-09-03',
      condition: 'rain',
      minimumTemperatureCelsius: 18,
      maximumTemperatureCelsius: 29,
      precipitationProbability: 0.6,
      precipitationMillimetres: 4.2,
    },
    {
      dateKey: '2026-09-04',
      condition: 'clear',
      minimumTemperatureCelsius: 19,
      maximumTemperatureCelsius: 31,
      precipitationProbability: 0,
      precipitationMillimetres: 4.2,
    },
  ]);
});

test('carries null millimetres when WeatherKit omits the amount, and never invents one', () => {
  const fixture = rawFixture();
  delete fixture.forecastDaily.days[0].precipitationAmount;

  const snapshot = mapWeatherKitResponse(
    weatherKitResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.daily[0].precipitationMillimetres, null);
});

test('orders the days and stops at the contract ceiling', () => {
  const fixture = rawFixture();
  fixture.forecastDaily.days = Array.from({ length: 10 }, (_, index) => dailyEntry(
    `2026-09-${String(3 + index).padStart(2, '0')}T00:00:00+03:00`,
  )).reverse();

  const snapshot = mapWeatherKitResponse(
    weatherKitResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.daily.length, weatherDailyForecastMaximumEntries);
  assert.deepEqual(snapshot.daily.map(({ dateKey }) => dateKey), [
    '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06',
    '2026-09-07', '2026-09-08', '2026-09-09',
  ]);
});

test('drops the days before the observed local day', () => {
  const fixture = rawFixture();
  fixture.forecastDaily.days.unshift(dailyEntry('2026-09-02T00:00:00+03:00'));

  const snapshot = mapWeatherKitResponse(
    weatherKitResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.daily[0].dateKey, '2026-09-03');
});

test('a day beyond the seven the block uses cannot fail the response', () => {
  // Apple answers with ten or eleven days. WeatherKit is the head of the chain and its loss is
  // silent, so a malformed eleventh day must not take the whole response, /v1 included, with it.
  const fixture = rawFixture();
  fixture.forecastDaily.days = Array.from({ length: 11 }, (_, index) => dailyEntry(
    new Date(Date.parse('2026-09-03T00:00:00+03:00') + index * 24 * 60 * 60 * 1000).toISOString(),
  ));
  delete fixture.forecastDaily.days[10].precipitationChance;
  delete fixture.forecastDaily.days[10].conditionCode;

  const snapshot = mapWeatherKitResponse(
    weatherKitResponseSchema.parse(fixture),
    location,
    fetchedAt,
  );

  assert.equal(snapshot.daily.length, weatherDailyForecastMaximumEntries);
  assert.equal(snapshot.daily[0].dateKey, '2026-09-03');
});

test('rejects a used day whose condition or chance WeatherKit withheld', () => {
  const missingChance = rawFixture();
  delete missingChance.forecastDaily.days[1].precipitationChance;
  const missingCondition = rawFixture();
  delete missingCondition.forecastDaily.days[1].conditionCode;

  for (const fixture of [missingChance, missingCondition]) {
    assert.throws(
      () => mapWeatherKitResponse(
        weatherKitResponseSchema.parse(fixture),
        location,
        fetchedAt,
      ),
      (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
    );
  }
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

test('rejects duplicate hourly forecasts inside the window', () => {
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
  const dataV2 = mapProviderWeatherToApiV2(snapshot).data;

  assert.equal(weatherV1SuccessSchema.safeParse({ data }).success, true);
  assert.equal('daily' in data, false);
  assert.equal(weatherV2SuccessSchema.safeParse({ data: dataV2 }).success, true);
  assert.equal(dataV2.daily.length, 2);
});
