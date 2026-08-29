import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenWeatherWeatherProvider } from './openweather-weather-provider.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

const location = {
  latitudeE2: 4101,
  longitudeE2: 2898,
  timeZone: 'Europe/Istanbul',
};

function unixSeconds(timestamp) {
  return Date.parse(timestamp) / 1000;
}

function rawFixture() {
  return {
    timezone: 'America/New_York',
    current: {
      dt: unixSeconds('2026-08-29T09:10:00.000Z'),
      temp: 24.5,
      feels_like: 25.2,
      humidity: 82,
      uvi: 5.4,
      wind_speed: 3.6,
      weather: [{ id: 802 }],
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
    daily: [{ temp: { min: 18, max: 29 } }],
  };
}

test('requests One Call 3.0 exactly and returns a live OpenWeather snapshot', async () => {
  const signal = new AbortController().signal;
  let captured;
  const provider = new OpenWeatherWeatherProvider({
    apiKey: 'configured-key',
    fetch: async (url, init) => {
      captured = { url, init };
      return Response.json(rawFixture());
    },
  });

  const snapshot = await provider.fetchWeather(location, signal);
  const url = new URL(captured.url);

  assert.equal(url.origin + url.pathname, 'https://api.openweathermap.org/data/3.0/onecall');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    lat: '41.01',
    lon: '28.98',
    units: 'metric',
    exclude: 'minutely,alerts',
    appid: 'configured-key',
  });
  assert.equal(captured.init.signal, signal);
  assert.equal(snapshot.timeZone, 'Europe/Istanbul');
  assert.equal(snapshot.provenance, 'live');
  assert.equal(snapshot.sourceId, 'openweather');
  assert.equal(snapshot.current.observedAt, '2026-08-29T09:10:00.000Z');
  assert.equal(snapshot.current.temperatureCelsius, 24.5);
  assert.equal(snapshot.current.apparentTemperatureCelsius, 25.2);
  assert.equal(snapshot.current.humidity, 0.82);
  assert.equal(snapshot.current.precipitationProbability, 0.4);
  assert.notEqual(snapshot.current.precipitationProbability, 0.004);
  assert.equal(snapshot.current.windSpeedMetersPerSecond, 3.6);
  assert.equal(snapshot.current.uvIndex, 5.4);
  assert.equal(snapshot.current.condition, 'partly_cloudy');
  assert.equal(snapshot.minimumTemperatureCelsius, 18);
  assert.equal(snapshot.maximumTemperatureCelsius, 29);
  assert.ok(snapshot.fetchedAt.endsWith('Z'));
});

test('ignores the provider time zone and clamps both daily temperature bounds', async () => {
  const fixture = rawFixture();
  fixture.timezone = 'America/New_York';
  fixture.daily[0].temp.min = 27;
  fixture.daily[0].temp.max = 20;
  const provider = new OpenWeatherWeatherProvider({
    apiKey: 'secret-key',
    fetch: async () => Response.json(fixture),
  });

  const snapshot = await provider.fetchWeather(location);

  assert.equal(snapshot.timeZone, 'Europe/Istanbul');
  assert.equal(snapshot.minimumTemperatureCelsius, 24.5);
  assert.equal(snapshot.maximumTemperatureCelsius, 24.5);
});

for (const [status, kind] of [
  [429, 'quota'],
  [401, 'auth'],
  [400, 'invalid_request'],
  [404, 'invalid_request'],
  [500, 'upstream'],
]) {
  test(`classifies HTTP ${status} as ${kind} without leaking the key or response`, async () => {
    const apiKey = 'sentinel-secret-key-do-not-leak';
    const responseText = `private upstream response ${status}`;
    const provider = new OpenWeatherWeatherProvider({
      apiKey,
      fetch: async () => new Response(responseText, { status }),
    });

    await assert.rejects(provider.fetchWeather(location), (error) => {
      assert.ok(error instanceof WeatherProviderError);
      assert.equal(error.kind, kind);
      assert.equal(error.message.includes(apiKey), false);
      assert.equal(error.message.includes('appid'), false);
      assert.equal(error.message.includes(responseText), false);
      return true;
    });
  });
}

test('classifies a rejected fetch as availability', async () => {
  const provider = new OpenWeatherWeatherProvider({
    apiKey: 'secret-key',
    fetch: async () => { throw new Error('network details'); },
  });

  await assert.rejects(
    provider.fetchWeather(location),
    (error) => error instanceof WeatherProviderError && error.kind === 'availability',
  );
});

test('classifies an aborted fetch as timeout', async () => {
  const controller = new AbortController();
  const provider = new OpenWeatherWeatherProvider({
    apiKey: 'secret-key',
    fetch: async () => {
      controller.abort();
      throw new DOMException('provider details', 'AbortError');
    },
  });

  await assert.rejects(
    provider.fetchWeather(location, controller.signal),
    (error) => error instanceof WeatherProviderError && error.kind === 'timeout',
  );
});

test('classifies malformed JSON as invalid_response without leaking secrets or body text', async () => {
  const apiKey = 'sentinel-secret-key-do-not-leak';
  const responseText = 'not-json private upstream body';
  const provider = new OpenWeatherWeatherProvider({
    apiKey,
    fetch: async () => new Response(responseText),
  });

  await assert.rejects(provider.fetchWeather(location), (error) => {
    assert.ok(error instanceof WeatherProviderError);
    assert.equal(error.kind, 'invalid_response');
    assert.equal(error.message.includes(apiKey), false);
    assert.equal(error.message.includes('appid'), false);
    assert.equal(error.message.includes(responseText), false);
    return true;
  });
});

test('classifies schema-invalid and unmapped-condition responses as invalid_response', async () => {
  const invalidSchemaProvider = new OpenWeatherWeatherProvider({
    apiKey: 'secret-key',
    fetch: async () => Response.json({ current: null }),
  });
  const unmapped = rawFixture();
  unmapped.current.weather[0].id = 999;
  const unmappedProvider = new OpenWeatherWeatherProvider({
    apiKey: 'secret-key',
    fetch: async () => Response.json(unmapped),
  });

  for (const provider of [invalidSchemaProvider, unmappedProvider]) {
    await assert.rejects(
      provider.fetchWeather(location),
      (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
    );
  }
});
