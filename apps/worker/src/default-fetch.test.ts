import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultFetch } from './default-fetch.ts';

test('the default fetch calls the global with the global as this', async (t) => {
  let receiver: unknown;
  t.mock.method(globalThis, 'fetch', function fake(this: unknown) {
    receiver = this;
    return Promise.resolve(new Response('ok'));
  });
  const response = await defaultFetch()('https://example.test/');
  assert.equal(await response.text(), 'ok');
  assert.equal(receiver, globalThis);
});

test('it is resolved from the global on every call', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('replaced'));
  assert.equal(await defaultFetch()('https://example.test/').then((r) => r.text()), 'replaced');
});
