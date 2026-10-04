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
  assert.deepEqual(await client.deleteAccount({ accessToken: 'secret', appleAuthorizationCode: 'code' }), { kind: 'deleted', appleUnrevoked: false });
  assert.deepEqual(sent, [['/v1/account/delete', { appleAuthorizationCode: 'code' }, { Authorization: 'Bearer secret' }]]);
  assert.deepEqual(cleared, [{ link: { userId: null, lastUserId: null, recordsUserId: null, recordsConsentRecordedAt: null, cursor: null }, resetPendingFlags: true, clearSession: true }]);
});

test('an unrevoked Apple deletion still clears the device link and says so', async () => {
  let cleanup = 0;
  const client = createAccountDeletionClient({
    request: async () => ({ status: 200, body: { data: { status: 'deleted_apple_unrevoked' } } }),
    cleanup: async () => { cleanup += 1; },
  });
  assert.deepEqual(await client.deleteAccount({ accessToken: 'token' }), { kind: 'deleted', appleUnrevoked: true });
  assert.equal(cleanup, 1);
});

test('maps a known error and an unknown response to stable failures without cleanup', async () => {
  let cleanup = 0;
  const remote = { request: async () => ({ status: 401, body: { error: { code: 'unauthorized' } } }), cleanup: async () => { cleanup += 1; } };
  const client = createAccountDeletionClient(remote);
  assert.deepEqual(await client.deleteAccount({ accessToken: 'token' }), { kind: 'failed', code: 'unauthorized' });
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

test('a cleanup that fails after the account was deleted is tried once more and the answer stays deleted', async () => {
  for (const failures of [1, 2]) {
    let attempts = 0;
    const client = createAccountDeletionClient({
      request: async () => ({ status: 200, body: { data: { status: 'deleted' } } }),
      cleanup: async () => { attempts += 1; if (attempts <= failures) throw new Error('database is locked'); },
    });
    assert.deepEqual(await client.deleteAccount({ accessToken: 'token' }), { kind: 'deleted', appleUnrevoked: false }, `${failures}`);
    assert.equal(attempts, 2);
  }
});
