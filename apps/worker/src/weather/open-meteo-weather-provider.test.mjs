import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenMeteoWeatherProvider } from './open-meteo-weather-provider.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

const location = {
  latitudeE2: 4101,
  longitudeE2: 2898,
  timeZone: 'Europe/Istanbul',
};

function rawFixture() {
  return {
    current: {
      time: '2026-08-29T09:50',
      temperature_2m: 24.5,
      apparent_temperature: 25.2,
      relative_humidity_2m: 82,
      weather_code: 2,
      wind_speed_10m: 3.4,
    },
    hourly: {
      time: ['2026-08-29T09:00', '2026-08-29T10:00'],
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

test('requests the exact Open-Meteo fields and returns a live provider snapshot', async () => {
  const signal = new AbortController().signal;
  let captured;
  const provider = new OpenMeteoWeatherProvider({
    fetch: async (url, init) => {
      captured = { url, init };
      return Response.json(rawFixture());
    },
  });

  const snapshot = await provider.fetchWeather(location, signal);
  const url = new URL(captured.url);

  assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    latitude: '41.01',
    longitude: '28.98',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation_probability,uv_index',
    daily: 'temperature_2m_min,temperature_2m_max',
    wind_speed_unit: 'ms',
    timezone: 'UTC',
    forecast_days: '2',
  });
  assert.equal(captured.init.signal, signal);
  assert.equal(snapshot.timeZone, location.timeZone);
  assert.equal(snapshot.provenance, 'live');
  assert.equal(snapshot.sourceId, 'open-meteo');
  assert.equal(snapshot.current.observedAt, '2026-08-29T09:50:00.000Z');
  assert.equal(snapshot.current.temperatureCelsius, 24.5);
  assert.equal(snapshot.current.apparentTemperatureCelsius, 25.2);
  assert.equal(snapshot.current.humidity, 0.82);
  assert.equal(snapshot.current.precipitationProbability, 0.2);
  assert.equal(snapshot.current.windSpeedMetersPerSecond, 3.4);
  assert.equal(snapshot.current.uvIndex, 5.8);
  assert.equal(snapshot.current.condition, 'partly_cloudy');
  assert.equal(snapshot.minimumTemperatureCelsius, 18);
  assert.equal(snapshot.maximumTemperatureCelsius, 29);
  assert.ok(snapshot.fetchedAt.endsWith('Z'));
  assert.deepEqual(snapshot.hourly.map(({ forecastAt }) => forecastAt), [
    '2026-08-29T09:00:00.000Z',
    '2026-08-29T10:00:00.000Z',
  ]);
});

for (const [status, kind] of [
  [429, 'quota'],
  [401, 'auth'],
  [403, 'auth'],
  [400, 'invalid_request'],
  [500, 'upstream'],
]) {
  test(`classifies HTTP ${status} as ${kind} without leaking upstream data`, async () => {
    const responseText = 'private upstream response';
    const provider = new OpenMeteoWeatherProvider({
      fetch: async () => new Response(responseText, { status }),
    });

    await assert.rejects(provider.fetchWeather(location), (error) => {
      assert.ok(error instanceof WeatherProviderError);
      assert.equal(error.kind, kind);
      assert.equal(error.message.includes(responseText), false);
      assert.equal(error.message.includes(String(location.latitudeE2 / 100)), false);
      assert.equal(error.message.includes(String(location.longitudeE2 / 100)), false);
      return true;
    });
  });
}

test('classifies a rejected fetch as availability', async () => {
  const provider = new OpenMeteoWeatherProvider({
    fetch: async () => { throw new Error('network details'); },
  });

  await assert.rejects(
    provider.fetchWeather(location),
    (error) => error instanceof WeatherProviderError && error.kind === 'availability',
  );
});

test('classifies an aborted fetch as timeout', async () => {
  const controller = new AbortController();
  const provider = new OpenMeteoWeatherProvider({
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

test('classifies an abort while reading the body as timeout', async () => {
  const controller = new AbortController();
  const provider = new OpenMeteoWeatherProvider({
    fetch: async () => ({
      ok: true,
      json: async () => {
        controller.abort();
        throw new DOMException('provider details', 'AbortError');
      },
    }),
  });

  await assert.rejects(
    provider.fetchWeather(location, controller.signal),
    (error) => error instanceof WeatherProviderError && error.kind === 'timeout',
  );
});

test('classifies malformed JSON as invalid_response without leaking body or coordinates', async () => {
  const responseText = 'not-json private upstream body';
  const provider = new OpenMeteoWeatherProvider({
    fetch: async () => new Response(responseText),
  });

  await assert.rejects(provider.fetchWeather(location), (error) => {
    assert.ok(error instanceof WeatherProviderError);
    assert.equal(error.kind, 'invalid_response');
    assert.equal(error.message.includes(responseText), false);
    assert.equal(error.message.includes(String(location.latitudeE2 / 100)), false);
    assert.equal(error.message.includes(String(location.longitudeE2 / 100)), false);
    return true;
  });
});

test('classifies a schema-invalid body as invalid_response', async () => {
  const provider = new OpenMeteoWeatherProvider({
    fetch: async () => Response.json({ current: null }),
  });

  await assert.rejects(
    provider.fetchWeather(location),
    (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
  );
});
