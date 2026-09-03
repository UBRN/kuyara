import assert from 'node:assert/strict';
import test from 'node:test';

import { WeatherProviderError } from './weather-provider-error.ts';
import { WeatherKitWeatherProvider } from './weatherkit-weather-provider.ts';

const location = {
  latitudeE2: 4101,
  longitudeE2: 2898,
  timeZone: 'Europe/Istanbul',
};

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
    },
    forecastHourly: {
      hours: [{
        forecastStart: '2026-09-03T10:00:00.000Z',
        conditionCode: 'mostlyClear',
        humidity: 0.78,
        precipitationChance: 0.2,
        temperature: 25,
        temperatureApparent: 26,
        uvIndex: 6,
        windSpeed: 12.96,
      }],
    },
    forecastDaily: {
      days: [{
        forecastStart: '2026-09-03T00:00:00+03:00',
        temperatureMax: 29,
        temperatureMin: 18,
      }],
    },
  };
}

test('requests WeatherKit exactly with bearer authorization and returns a live snapshot', async () => {
  const signal = new AbortController().signal;
  let captured;
  const provider = new WeatherKitWeatherProvider({
    token: async () => 'sentinel-bearer-token',
    fetch: async (url, init) => {
      captured = { url, init };
      return Response.json(rawFixture());
    },
  });

  const snapshot = await provider.fetchWeather(location, signal);

  assert.equal(
    captured.url.toString(),
    'https://weatherkit.apple.com/api/v1/weather/en/41.01/28.98?timezone=Europe%2FIstanbul&dataSets=currentWeather%2CforecastHourly%2CforecastDaily',
  );
  assert.deepEqual(Object.fromEntries(captured.url.searchParams), {
    timezone: 'Europe/Istanbul',
    dataSets: 'currentWeather,forecastHourly,forecastDaily',
  });
  assert.deepEqual(captured.init.headers, {
    Authorization: 'Bearer sentinel-bearer-token',
  });
  assert.equal(captured.init.signal, signal);
  assert.equal(snapshot.provenance, 'live');
  assert.equal(snapshot.sourceId, 'weatherkit');
});

for (const [status, kind] of [
  [429, 'quota'],
  [401, 'auth'],
  [403, 'auth'],
  [400, 'invalid_request'],
  [404, 'invalid_request'],
  [500, 'upstream'],
]) {
  test(`classifies HTTP ${status} as ${kind} without leaking bearer or response`, async () => {
    const token = 'sentinel-bearer-token-do-not-leak';
    const responseText = `private WeatherKit response ${status}`;
    const provider = new WeatherKitWeatherProvider({
      token: async () => token,
      fetch: async () => new Response(responseText, { status }),
    });

    await assert.rejects(provider.fetchWeather(location), (error) => {
      assert.ok(error instanceof WeatherProviderError);
      assert.equal(error.kind, kind);
      assert.equal(error.message.includes(token), false);
      assert.equal(error.message.includes(responseText), false);
      return true;
    });
  });
}

test('classifies a rejected fetch as availability', async () => {
  const provider = new WeatherKitWeatherProvider({
    token: async () => 'token',
    fetch: async () => { throw new Error('network details'); },
  });

  await assert.rejects(
    provider.fetchWeather(location),
    (error) => error instanceof WeatherProviderError && error.kind === 'availability',
  );
});

test('classifies an aborted fetch as timeout', async () => {
  const controller = new AbortController();
  const provider = new WeatherKitWeatherProvider({
    token: async () => 'token',
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

test('classifies malformed JSON as invalid_response without leaking body or coordinates', async () => {
  const token = 'sentinel-bearer-token-do-not-leak';
  const responseText = 'not-json private WeatherKit body';
  const provider = new WeatherKitWeatherProvider({
    token: async () => token,
    fetch: async () => new Response(responseText),
  });

  await assert.rejects(provider.fetchWeather(location), (error) => {
    assert.ok(error instanceof WeatherProviderError);
    assert.equal(error.kind, 'invalid_response');
    assert.equal(error.message.includes(token), false);
    assert.equal(error.message.includes(responseText), false);
    assert.equal(error.message.includes(String(location.latitudeE2 / 100)), false);
    assert.equal(error.message.includes(String(location.longitudeE2 / 100)), false);
    return true;
  });
});

test('classifies a schema-invalid body as invalid_response', async () => {
  const provider = new WeatherKitWeatherProvider({
    token: async () => 'token',
    fetch: async () => Response.json({ currentWeather: null }),
  });

  await assert.rejects(
    provider.fetchWeather(location),
    (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
  );
});

test('propagates token auth failures without calling fetch', async () => {
  let fetchCalled = false;
  const authError = new WeatherProviderError('auth');
  const provider = new WeatherKitWeatherProvider({
    token: async () => { throw authError; },
    fetch: async () => {
      fetchCalled = true;
      return Response.json(rawFixture());
    },
  });

  await assert.rejects(provider.fetchWeather(location), (error) => error === authError);
  assert.equal(fetchCalled, false);
});
