import assert from 'node:assert/strict';
import test from 'node:test';

import { z } from 'zod';

import type { FetchLike } from '../default-fetch.ts';
import {
  fetchProviderWeather,
  type ProviderFetchOptions,
  weatherHttpErrorKind,
} from './provider-fetch.ts';
import type { ProviderWeatherSnapshot } from './weather-provider.ts';
import { WeatherProviderError, type WeatherProviderErrorKind } from './weather-provider-error.ts';

const statusKinds: [number, WeatherProviderErrorKind][] = [
  [400, 'invalid_request'],
  [401, 'auth'],
  [403, 'auth'],
  [404, 'availability'],
  [429, 'quota'],
  [500, 'upstream'],
  [502, 'upstream'],
  [418, 'upstream'],
];
for (const [status, kind] of statusKinds) {
  test(`HTTP ${status} is ${kind} for every weather provider`, () => {
    assert.equal(weatherHttpErrorKind(status), kind);
  });
}

const url = new URL('https://weather.example/forecast');
const schema = z.object({ value: z.number() });

function fetchWith(
  fetchImpl: FetchLike,
  overrides: Partial<ProviderFetchOptions<{ value: number }>> = {},
) {
  return fetchProviderWeather({
    fetch: fetchImpl,
    url,
    schema,
    map: () => { throw new Error('unreachable'); },
    ...overrides,
  });
}

function failsWith(promise: Promise<unknown>, kind: WeatherProviderErrorKind) {
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
    fetchWith(async () => Response.json({ value: 1 }), {
      // A snapshot the v2 self-check must refuse: it carries no fields, only an empty daily list.
      map: () => ({ daily: [] }) as unknown as ProviderWeatherSnapshot,
    }),
    'invalid_response',
  );
});

test('the request carries the init and the signal and nothing else', async () => {
  const controller = new AbortController();
  const seen: { requestUrl: string | URL | Request; init: RequestInit | undefined }[] = [];
  await fetchWith(async (requestUrl, init) => {
    seen.push({ requestUrl, init });
    return new Response('x', { status: 500 });
  }, { init: { headers: { Authorization: 'Bearer t' } }, signal: controller.signal }).catch(() => {});
  assert.equal(seen[0].requestUrl, url);
  assert.deepEqual(seen[0].init, {
    headers: { Authorization: 'Bearer t' },
    signal: controller.signal,
  });
});
