import assert from 'node:assert/strict';
import test from 'node:test';

import { z } from 'zod';

import { fetchProviderWeather, weatherHttpErrorKind } from './provider-fetch.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

for (const [status, kind] of [
  [400, 'invalid_request'],
  [401, 'auth'],
  [403, 'auth'],
  [404, 'availability'],
  [429, 'quota'],
  [500, 'upstream'],
  [502, 'upstream'],
  [418, 'upstream'],
]) {
  test(`HTTP ${status} is ${kind} for every weather provider`, () => {
    assert.equal(weatherHttpErrorKind(status), kind);
  });
}

const url = new URL('https://weather.example/forecast');
const schema = z.object({ value: z.number() });

function fetchWith(fetchImpl, overrides = {}) {
  return fetchProviderWeather({
    fetch: fetchImpl,
    url,
    schema,
    map: () => { throw new Error('unreachable'); },
    ...overrides,
  });
}

function failsWith(promise, kind) {
  return assert.rejects(promise, (error) => (
    error instanceof WeatherProviderError && error.kind === kind
  ));
}

test('a network failure is availability, or timeout once the signal aborted', async () => {
  await failsWith(fetchWith(async () => { throw new TypeError('network down'); }), 'availability');
  const controller = new AbortController();
  controller.abort();
  await failsWith(
    fetchWith(async () => { throw new TypeError('aborted'); }, { signal: controller.signal }),
    'timeout',
  );
});

test('an unreadable body is invalid_response, or timeout once the signal aborted', async () => {
  await failsWith(fetchWith(async () => new Response('not json')), 'invalid_response');
  const controller = new AbortController();
  controller.abort();
  await failsWith(
    fetchWith(async () => new Response('not json'), { signal: controller.signal }),
    'timeout',
  );
});

test('a body the schema rejects is invalid_response', async () => {
  await failsWith(fetchWith(async () => Response.json({ value: 'x' })), 'invalid_response');
});

test('a mapper failure or a failed v2 self-check is invalid_response', async () => {
  await failsWith(fetchWith(async () => Response.json({ value: 1 })), 'invalid_response');
  await failsWith(
    fetchWith(async () => Response.json({ value: 1 }), { map: () => ({ daily: [] }) }),
    'invalid_response',
  );
});

test('the request carries the init and the signal and nothing else', async () => {
  const controller = new AbortController();
  let seen;
  await fetchWith(async (requestUrl, init) => {
    seen = { requestUrl, init };
    return new Response('x', { status: 500 });
  }, { init: { headers: { Authorization: 'Bearer t' } }, signal: controller.signal }).catch(() => {});
  assert.equal(seen.requestUrl, url);
  assert.deepEqual(seen.init, {
    headers: { Authorization: 'Bearer t' },
    signal: controller.signal,
  });
});
