import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchSiriCardSwitch } from './worker-app-config-client.ts';

const baseUrl = 'https://worker.test';
const answering = (status, body) => async (url, init) => {
  assert.equal(url, 'https://worker.test/v1/app-config');
  assert.equal(init.method, 'GET');
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
};

test('the Worker switch reads on or off', async () => {
  assert.equal(await fetchSiriCardSwitch(baseUrl, answering(200, { data: { siriCard: 'off' } })), 'off');
  assert.equal(await fetchSiriCardSwitch(baseUrl, answering(200, { data: { siriCard: 'on', later: 1 } })), 'on');
});

test('a switch value this binary does not know reads on', async () => {
  assert.equal(await fetchSiriCardSwitch(baseUrl, answering(200, { data: { siriCard: 'paused' } })), 'on');
});

test('an error, a broken body or no network gives no answer', async () => {
  for (const send of [
    answering(503, { error: { code: 'unavailable' } }),
    answering(200, { data: {} }),
    answering(200, { data: { siriCard: 7 } }),
    answering(200, 'not json'),
    async () => { throw new TypeError('Network request failed'); },
  ]) {
    assert.equal(await fetchSiriCardSwitch(baseUrl, send), null);
  }
});
