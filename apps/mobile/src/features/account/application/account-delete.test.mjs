import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccountDeletionClient } from './account-delete.ts';

test('sends token only in header, validates success and clears the account link after success', async () => {
  const sent = [];
  const cleared = [];
  const client = createAccountDeletionClient({
    request: async (path, body, headers) => { sent.push([path, body, headers]); return { status: 200, body: { data: { status: 'deleted' } } }; },
    cleanup: async (change) => { cleared.push(change); },
  });
  assert.deepEqual(await client.deleteAccount({ accessToken: 'secret', appleAuthorizationCode: 'code' }), { kind: 'deleted' });
  assert.deepEqual(sent, [['/v1/account/delete', { appleAuthorizationCode: 'code' }, { Authorization: 'Bearer secret' }]]);
  assert.deepEqual(cleared, [{ link: { userId: null, lastUserId: null, cursor: null }, resetPendingFlags: true, clearSession: true }]);
});

test('maps a known error and an unknown response to stable failures without cleanup', async () => {
  let cleanup = 0;
  const remote = { request: async () => ({ status: 400, body: { error: { code: 'apple_code_invalid' } } }), cleanup: async () => { cleanup += 1; } };
  const client = createAccountDeletionClient(remote);
  assert.deepEqual(await client.deleteAccount({ accessToken: 'token' }), { kind: 'failed', code: 'apple_code_invalid' });
  remote.request = async () => ({ status: 200, body: { data: { status: 'wrong' } } });
  assert.deepEqual(await client.deleteAccount({ accessToken: 'token' }), { kind: 'failed', code: 'unknown' });
  remote.request = async () => ({ status: 503, body: { error: { code: 'future_code' } } });
  assert.deepEqual(await client.deleteAccount({ accessToken: 'token' }), { kind: 'failed', code: 'unknown' });
  assert.equal(cleanup, 0);
});

test('transport failure does not clear device data', async () => {
  const client = createAccountDeletionClient({ request: async () => { throw new Error('secret'); }, cleanup: async () => assert.fail('cleanup') });
  assert.deepEqual(await client.deleteAccount({ accessToken: 'token' }), { kind: 'failed', code: 'unavailable' });
});

test('invalid local request is rejected before the network call', async () => {
  const client = createAccountDeletionClient({ request: async () => assert.fail('request'), cleanup: async () => assert.fail('cleanup') });
  assert.deepEqual(await client.deleteAccount({ accessToken: '', appleAuthorizationCode: '' }), { kind: 'failed', code: 'invalid_request' });
});
