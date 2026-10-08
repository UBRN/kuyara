import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkerAccountDeletion } from './worker-account-deletion.ts';
import { createAccountDeletionClient } from '../application/account-delete.ts';

function deletion(reply, { resetFails = false } = {}) {
  const calls = [];
  const port = createWorkerAccountDeletion({
    baseUrl: 'https://worker.example',
    fetcher: async (url, init) => {
      calls.push(['fetch', url, init]);
      return reply();
    },
    resetLinkAndFlags: async () => { calls.push(['reset']); if (resetFails) throw new Error('database is locked'); },
    clearSession: async () => { calls.push(['session']); },
  });
  return { calls, client: createAccountDeletionClient(port) };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('deletion posts to the Worker route with the token in the header only, then resets the link and the session', async () => {
  const { calls, client } = deletion(() => json(200, { data: { status: 'deleted_apple_unrevoked' } }));
  assert.deepEqual(await client.deleteAccount({ accessToken: 'eyJ.token', appleAuthorizationCode: 'code' }),
    { kind: 'deleted', appleUnrevoked: true });
  const [, url, init] = calls[0];
  assert.equal(url, 'https://worker.example/v1/account/delete');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.authorization, 'Bearer eyJ.token');
  assert.deepEqual(JSON.parse(init.body), { appleAuthorizationCode: 'code' });
  assert.equal(init.body.includes('eyJ'), false);
  assert.deepEqual(calls.slice(1), [['reset'], ['session']]);
});

test('a failure keeps the link, the flags and the session; only a lost or unreadable answer is asked again', async () => {
  for (const [reply, fetches] of [
    [() => json(503, { error: { code: 'unavailable' } }), 1],
    [() => new Response('<html>', { status: 502 }), 2],
    [() => { throw new TypeError('Network request failed'); }, 2],
  ]) {
    const { calls, client } = deletion(reply);
    assert.equal((await client.deleteAccount({ accessToken: 'eyJ.token' })).kind, 'failed');
    assert.deepEqual(calls.map(([name]) => name), Array(fetches).fill('fetch'));
  }
});

test('a reset that keeps failing after the deletion still ends the session, and the account reads as deleted', async () => {
  const { calls, client } = deletion(() => json(200, { data: { status: 'deleted' } }), { resetFails: true });
  assert.deepEqual(await client.deleteAccount({ accessToken: 'eyJ.token' }), { kind: 'deleted', appleUnrevoked: false });
  assert.deepEqual(calls.slice(1).map(([name]) => name), ['reset', 'session', 'reset', 'session']);
});
