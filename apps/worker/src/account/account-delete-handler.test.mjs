import assert from 'node:assert/strict';
import test from 'node:test';

import { accountDeleteV1ErrorSchema, accountDeleteV1SuccessSchema } from '@kuyara/contracts';
import { AccountError } from './account-error.ts';
import { createAccountDeleteHandler } from './account-delete-handler.ts';

const userId = '3f2b8c1e-5d4a-4c1b-9a7e-0d6f1b2c3d4e';
const token = 'access.token.sentinel';
const code = 'apple-code-sentinel';
const subject = '001234.abc.1234';

function setup(overrides = {}) {
  const events = [];
  const deps = {
    rateLimiter: { limit: async ({ key }) => { events.push(['limit', key]); return { success: true }; } },
    verifier: async (accessToken) => { events.push(['verify', accessToken]); return { userId }; },
    admin: {
      getAccount: async (id) => { events.push(['getAccount', id]); return { appleSubject: null }; },
      deleteUser: async (id) => { events.push(['deleteUser', id]); },
    },
    revoker: async (input) => { events.push(['revoke', input]); },
    ...overrides,
  };
  return { events, handle: createAccountDeleteHandler(deps) };
}

const request = ({ body = {}, headers = {}, method = 'POST', path = '/v1/account/delete', raw } = {}) => new Request(`https://worker.test${path}`, {
  method,
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'cf-connecting-ip': '192.0.2.1', ...headers },
  ...(method === 'POST' ? { body: raw ?? JSON.stringify(body) } : {}),
});

async function expectError(response, status, errorCode) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(accountDeleteV1ErrorSchema.parse(body), { error: { code: errorCode } });
  assert.deepEqual(body, { error: { code: errorCode } });
}
const names = (events) => events.map(([name]) => name);

test('an account without Apple is verified, looked up and deleted, and no code is exchanged', async () => {
  const { events, handle } = setup();
  const response = await handle(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(accountDeleteV1SuccessSchema.parse(await response.json()), { data: { status: 'deleted' } });
  assert.deepEqual(events, [
    ['limit', 'account-delete:192.0.2.1'], ['verify', token], ['getAccount', userId], ['deleteUser', userId],
  ]);
});

const appleAdmin = (events) => ({
  getAccount: async (id) => { events.push(['getAccount', id]); return { appleSubject: subject }; },
  deleteUser: async (id) => { events.push(['deleteUser', id]); },
});

test('an Apple account revokes with its own subject before it deletes', async (t) => {
  const infos = [];
  t.mock.method(console, 'info', (entry) => infos.push(entry));
  const events = [];
  const { handle } = setup({ admin: appleAdmin(events), revoker: async (input) => { events.push(['revoke', input]); return 'revoked'; } });
  const response = await handle(request({ body: { appleAuthorizationCode: code } }));
  assert.equal(response.status, 200);
  assert.deepEqual(accountDeleteV1SuccessSchema.parse(await response.json()), { data: { status: 'deleted' } });
  assert.deepEqual(events, [
    ['getAccount', userId],
    ['revoke', { authorizationCode: code, expectedSubject: subject }], ['deleteUser', userId],
  ]);
  assert.deepEqual(infos, []);
});

test('an Apple account without a code is deleted unrevoked and Apple is never asked', async (t) => {
  const infos = [];
  t.mock.method(console, 'info', (entry) => infos.push(entry));
  const events = [];
  const { handle } = setup({ admin: appleAdmin(events), revoker: async () => { events.push(['revoke']); return 'revoked'; } });
  const response = await handle(request());
  assert.equal(response.status, 200);
  assert.deepEqual(accountDeleteV1SuccessSchema.parse(await response.json()), { data: { status: 'deleted_apple_unrevoked' } });
  assert.deepEqual(events, [['getAccount', userId], ['deleteUser', userId]]);
  assert.deepEqual(infos, [{ event: 'account_delete_apple_unrevoked', reason: 'no_code' }]);
});

test('a code Apple refuses deletes the account unrevoked', async (t) => {
  const infos = [];
  t.mock.method(console, 'info', (entry) => infos.push(entry));
  const events = [];
  const { handle } = setup({ admin: appleAdmin(events), revoker: async () => { events.push(['revoke']); return 'refused'; } });
  const response = await handle(request({ body: { appleAuthorizationCode: code } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { status: 'deleted_apple_unrevoked' } });
  // The attempt comes first, then the delete.
  assert.deepEqual(events, [['getAccount', userId], ['revoke'], ['deleteUser', userId]]);
  assert.deepEqual(infos, [{ event: 'account_delete_apple_unrevoked', reason: 'refused' }]);
});

test('a code sent for an account without Apple is never exchanged', async () => {
  const events = [];
  const { handle } = setup({ revoker: async () => { events.push(['revoke']); return 'revoked'; } });
  const response = await handle(request({ body: { appleAuthorizationCode: code } }));
  assert.deepEqual(await response.json(), { data: { status: 'deleted' } });
  assert.equal(events.length, 0);
});

test('Apple being unreachable or the revoke call failing is unavailable and nothing is deleted', async () => {
  const events = [];
  const { handle } = setup({
    admin: appleAdmin(events),
    revoker: async () => { throw new AccountError('unavailable'); },
  });
  await expectError(await handle(request({ body: { appleAuthorizationCode: code } })), 503, 'unavailable');
  assert.equal(events.some(([name]) => name === 'deleteUser'), false);
});

test('a failed delete after a revoked token answers unavailable and reports no success', async (t) => {
  const infos = [];
  t.mock.method(console, 'info', (entry) => infos.push(entry));
  const events = [];
  const { handle } = setup({
    admin: {
      getAccount: async () => ({ appleSubject: subject }),
      deleteUser: async () => { events.push(['deleteUser']); throw new AccountError('unavailable'); },
    },
    revoker: async () => { events.push(['revoke']); return 'revoked'; },
  });
  await expectError(await handle(request({ body: { appleAuthorizationCode: code } })), 503, 'unavailable');
  assert.deepEqual(events, [['revoke'], ['deleteUser']]);
  // A failed delete after a refused code is not counted as an unrevoked deletion either.
  const refused = setup({
    admin: { getAccount: async () => ({ appleSubject: subject }), deleteUser: async () => { throw new AccountError('unavailable'); } },
    revoker: async () => 'refused',
  });
  await expectError(await refused.handle(request({ body: { appleAuthorizationCode: code } })), 503, 'unavailable');
  assert.deepEqual(infos, []);
});

test('a failed delete answers unavailable', async () => {
  const { handle } = setup({
    admin: { getAccount: async () => ({ appleSubject: null }), deleteUser: async () => { throw new AccountError('unavailable'); } },
  });
  await expectError(await handle(request()), 503, 'unavailable');
});

test('an account that is already gone is deleted without revoking or deleting again', async () => {
  const { events, handle } = setup({
    admin: { getAccount: async () => null, deleteUser: async () => { events.push(['deleteUser']); } },
  });
  const response = await handle(request({ body: { appleAuthorizationCode: code } }));
  assert.equal(response.status, 200);
  assert.deepEqual(names(events), ['limit', 'verify']);
});

test('token failures map to closed codes', async () => {
  for (const [thrown, status, errorCode] of [
    [new AccountError('unauthorized'), 401, 'unauthorized'],
    [new AccountError('unavailable'), 503, 'unavailable'],
    [new Error('private detail'), 500, 'internal_error'],
  ]) {
    const { events, handle } = setup({ verifier: async () => { throw thrown; } });
    await expectError(await handle(request()), status, errorCode);
    assert.equal(names(events).includes('getAccount'), false);
  }
});

test('a missing or malformed bearer header is unauthorized before any body is read or token checked', async () => {
  for (const authorization of [undefined, '', 'Bearer', 'Bearer ', 'Basic abc', 'Bearer a b', 'bearer']) {
    const { events, handle } = setup();
    const headers = authorization === undefined ? { authorization: '' } : { authorization };
    await expectError(await handle(request({ headers })), 401, 'unauthorized');
    assert.deepEqual(names(events), ['limit']);
  }
  const { handle } = setup();
  assert.equal((await handle(request({ headers: { authorization: `bearer ${token}` } }))).status, 200);
});

test('the request body is strict and validated before the token is checked', async () => {
  for (const options of [
    { body: { userId } }, { body: { accessToken: token } }, { body: { appleAuthorizationCode: '' } },
    { body: { appleAuthorizationCode: 5 } }, { raw: 'not json' }, { raw: '' }, { raw: '[]' }, { raw: 'null' },
    { headers: { 'content-type': 'text/plain' } },
  ]) {
    const { events, handle } = setup();
    await expectError(await handle(request(options)), 400, 'invalid_request');
    assert.deepEqual(names(events), ['limit']);
  }
  const { handle } = setup();
  assert.equal((await handle(request({ headers: { 'content-type': 'Application/JSON; charset=utf-8' } }))).status, 200);
});

test('routing: unknown path is 404 and a wrong method is 405, with no side effects', async () => {
  const { events, handle } = setup();
  await expectError(await handle(request({ path: '/v1/account/other' })), 404, 'not_found');
  const wrong = await handle(request({ method: 'GET' }));
  await expectError(wrong, 405, 'method_not_allowed');
  assert.equal(wrong.headers.get('allow'), 'POST');
  assert.deepEqual(events, []);
});

test('rate limiting stops everything and logs only the closed denial and outage', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  const denied = setup({ rateLimiter: { limit: async () => ({ success: false }) } });
  const response = await denied.handle(request());
  await expectError(response, 429, 'rate_limited');
  assert.equal(response.headers.get('retry-after'), '60');
  assert.deepEqual(denied.events, []);
  const broken = setup({ rateLimiter: { limit: async () => { throw new Error('private'); } } });
  await expectError(await broken.handle(request()), 503, 'unavailable');
  assert.deepEqual(broken.events, []);
  assert.deepEqual(warnings, [
    { event: 'rate_limited', route: '/v1/account/delete', limiter: 'account_delete_burst' },
    { event: 'rate_limiter_error', route: '/v1/account/delete', limiter: 'account_delete_burst' },
  ]);
});

test('failures log a closed stage and code, never a token, code, id or message', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  const cases = [
    { verifier: async () => { throw new AccountError('unauthorized'); } },
    { verifier: async () => { throw new Error(`private ${token} ${code} ${userId}`); } },
    { admin: { getAccount: async () => { throw new AccountError('unavailable'); }, deleteUser: async () => {} } },
    {
      admin: { getAccount: async () => ({ appleSubject: subject }), deleteUser: async () => {} },
      revoker: async () => { throw new AccountError('unavailable'); },
    },
    { admin: { getAccount: async () => ({ appleSubject: null }), deleteUser: async () => { throw new AccountError('unavailable'); } } },
  ];
  for (const overrides of cases) {
    await setup(overrides).handle(request({ body: { appleAuthorizationCode: code } }));
  }
  assert.deepEqual(warnings, [
    { event: 'account_delete_failed', stage: 'verify', code: 'unauthorized' },
    { event: 'account_delete_failed', stage: 'verify', code: 'internal_error' },
    { event: 'account_delete_failed', stage: 'lookup', code: 'unavailable' },
    { event: 'account_delete_failed', stage: 'apple', code: 'unavailable' },
    { event: 'account_delete_failed', stage: 'delete', code: 'unavailable' },
  ]);
});

test('an oversized body is refused as invalid_request, read only up to the limit, and never reaches the token check', async () => {
  // A stream that would deliver 1 MiB in 1 KiB chunks: the handler must stop far short of it.
  let pulled = 0;
  const chunk = new TextEncoder().encode(`${' '.repeat(1023)}\n`);
  const body = new ReadableStream({
    pull(controller) {
      pulled += 1;
      if (pulled > 1024) controller.close(); else controller.enqueue(chunk);
    },
  });
  const { events, handle } = setup();
  const oversized = new Request('https://worker.test/v1/account/delete', {
    method: 'POST', body, duplex: 'half',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'cf-connecting-ip': '192.0.2.1' },
  });
  await expectError(await handle(oversized), 400, 'invalid_request');
  assert.ok(pulled <= 8, `read ${pulled} chunks of a 1024-chunk body`);
  assert.deepEqual(names(events), ['limit']);
});

test('a declared Content-Length over the limit is refused before the body is read', async () => {
  const { events, handle } = setup();
  const declared = request({ headers: { 'content-length': '5000' } });
  await expectError(await handle(declared), 400, 'invalid_request');
  assert.deepEqual(names(events), ['limit']);
});

test('a body at the limit is still parsed', async () => {
  const { handle } = setup();
  const padded = JSON.stringify({ appleAuthorizationCode: 'a'.repeat(1024) });
  assert.ok(padded.length < 4096);
  assert.equal((await handle(request({ raw: padded }))).status, 200);
});
