import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchJsonWithTimeout } from './fetch-json-with-timeout.ts';

const failures = {
  network: (cause) => ({ kind: 'network', cause }),
  invalidJson: () => ({ kind: 'invalid-json' }),
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('it returns the response and its parsed body, and passes the request through', async () => {
  let seen;
  const fetch = async (url, init) => {
    seen = { url, init };
    return jsonResponse({ ok: true }, 201);
  };

  const result = await fetchJsonWithTimeout(fetch, 'https://example.test/x', { method: 'POST', body: '{}' }, 1000, failures);

  assert.equal(result.response.status, 201);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(seen.url, 'https://example.test/x');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.body, '{}');
  assert.ok(seen.init.signal instanceof AbortSignal);
});

test('a non-2xx response is returned, not thrown: the caller reads the status and body', async () => {
  const result = await fetchJsonWithTimeout(async () => jsonResponse({ error: 1 }, 503), 'u', {}, 1000, failures);

  assert.equal(result.response.ok, false);
  assert.deepEqual(result.body, { error: 1 });
});

test('a request that fails is thrown as the caller\'s network failure, with its cause', async () => {
  const cause = new Error('offline');

  await assert.rejects(
    fetchJsonWithTimeout(async () => { throw cause; }, 'u', {}, 1000, failures),
    (thrown) => thrown.kind === 'network' && thrown.cause === cause,
  );
});

test('a body that is not JSON is thrown as the caller\'s invalid-JSON failure', async () => {
  await assert.rejects(
    fetchJsonWithTimeout(async () => new Response('<html>'), 'u', {}, 1000, failures),
    (thrown) => thrown.kind === 'invalid-json',
  );
});

test('the deadline aborts a request that never answers, as a network failure', async () => {
  const fetch = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });

  await assert.rejects(
    fetchJsonWithTimeout(fetch, 'u', {}, 5, failures),
    (thrown) => thrown.kind === 'network' && thrown.cause.message === 'aborted',
  );
});

test('the deadline also covers reading the body', async () => {
  const fetch = (_url, init) => Promise.resolve({
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  });

  await assert.rejects(
    fetchJsonWithTimeout(fetch, 'u', {}, 5, failures),
    (thrown) => thrown.kind === 'invalid-json',
  );
});
