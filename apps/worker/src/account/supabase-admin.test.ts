import assert from 'node:assert/strict';
import test from 'node:test';

import { AccountError } from './account-error.ts';
import { createSupabaseAdmin } from './supabase-admin.ts';

const supabaseUrl = 'https://project.supabase.co';
const secretKey = 'sb_secret_sentinel_value';
const publishableKey = 'sb_publishable_sentinel_value';
const userId = '3f2b8c1e-5d4a-4c1b-9a7e-0d6f1b2c3d4e';

// The adapter always sends a plain header record and a string body; RequestInit types them wider.
type AdminCall = { url: string; init: RequestInit & { headers: Record<string, string>; body: string } };
type AdminHandler = (call: AdminCall) => Response | Promise<Response>;

function setup(handler: AdminHandler) {
  const calls: AdminCall[] = [];
  const admin = createSupabaseAdmin({
    supabaseUrl, publishableKey, secretKey, timeoutMs: 20,
    fetch: async (url, init) => {
      const call: AdminCall = { url: String(url), init: init as AdminCall['init'] };
      calls.push(call);
      return handler(call);
    },
  });
  return { calls, admin };
}

const userBody = (identities: unknown[]) => ({ id: userId, aud: 'authenticated', email: 'private@example.com', identities });

async function assertUnavailable(promise: Promise<unknown>) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof AccountError);
    assert.equal(error.code, 'unavailable');
    assert.equal(error.message.includes(secretKey), false);
    assert.equal(error.message.includes('private'), false);
    return true;
  });
}

test('reads the Apple subject through the admin API with the secret key in the apikey header', async () => {
  const { calls, admin } = setup(() => Response.json(userBody([
    { provider: 'google', provider_id: 'g-1', identity_data: { sub: 'g-1' } },
    { provider: 'apple', provider_id: '001234.abc.1234', identity_data: { sub: '001234.abc.1234', email: 'private@example.com' } },
  ])));
  assert.deepEqual(await admin.getAccount(userId), { appleSubject: '001234.abc.1234' });
  assert.equal(calls[0].url, `${supabaseUrl}/auth/v1/admin/users/${userId}`);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.apikey, secretKey);
  assert.equal(calls[0].init.redirect, 'manual');
  assert.ok(calls[0].init.signal);
});

test('falls back to identity_data.sub, and a Google-only account has no Apple subject', async () => {
  const apple = setup(() => Response.json(userBody([{ provider: 'apple', identity_data: { sub: 'from-data' } }])));
  assert.deepEqual(await apple.admin.getAccount(userId), { appleSubject: 'from-data' });
  const google = setup(() => Response.json(userBody([{ provider: 'google', provider_id: 'g-1' }])));
  assert.deepEqual(await google.admin.getAccount(userId), { appleSubject: null });
  const none = setup(() => Response.json(userBody([])));
  assert.deepEqual(await none.admin.getAccount(userId), { appleSubject: null });
});

test('a missing user is null, not an error', async () => {
  const { admin } = setup(() => Response.json({ code: 404, error_code: 'user_not_found', msg: 'private' }, { status: 404 }));
  assert.equal(await admin.getAccount(userId), null);
});

test('unreadable, mismatched or ambiguous answers are unavailable', async () => {
  const bodies = [
    Response.json(userBody([{ provider: 'apple' }])),
    Response.json({ ...userBody([]), id: '00000000-0000-4000-8000-000000000000' }),
    Response.json({ id: userId }),
    Response.json(userBody([
      { provider: 'apple', provider_id: 'a' }, { provider: 'apple', provider_id: 'b' },
    ])),
    Response.json({ nothing: true }),
    new Response('not json'),
    new Response('private', { status: 500 }),
    new Response('private', { status: 401 }),
  ];
  for (const body of bodies) {
    await assertUnavailable(setup(() => body.clone()).admin.getAccount(userId));
  }
  await assertUnavailable(setup(() => { throw new Error('private network detail'); }).admin.getAccount(userId));
});

test('a hung call is aborted at the timeout', async () => {
  let aborted = false;
  const { admin } = setup(({ init }) => new Promise<Response>((_, reject) => {
    init.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('private')); });
  }));
  await assertUnavailable(admin.getAccount(userId));
  assert.equal(aborted, true);
});

test('deleteUser sends a hard delete and treats 404 as already deleted', async () => {
  const { calls, admin } = setup(() => new Response('{}', { status: 200 }));
  await admin.deleteUser(userId);
  assert.equal(calls[0].url, `${supabaseUrl}/auth/v1/admin/users/${userId}`);
  assert.equal(calls[0].init.method, 'DELETE');
  assert.equal(calls[0].init.headers.apikey, secretKey);
  assert.deepEqual(JSON.parse(calls[0].init.body), { should_soft_delete: false });
  await setup(() => new Response('', { status: 404 })).admin.deleteUser(userId);
});

test('deleteUser failures are unavailable', async () => {
  for (const status of [400, 401, 403, 422, 429, 500]) {
    await assertUnavailable(setup(() => new Response('private', { status })).admin.deleteUser(userId));
  }
  await assertUnavailable(setup(() => { throw new Error('private network detail'); }).admin.deleteUser(userId));
});

test('an id that is not a UUID never reaches the URL', async () => {
  const { calls, admin } = setup(() => Response.json(userBody([])));
  await assertUnavailable(admin.getAccount('../../users'));
  await assertUnavailable(admin.deleteUser(`${userId}/x`));
  assert.equal(calls.length, 0);
});

const accessToken = 'user.access.sentinel';

async function assertUnauthorized(promise: Promise<unknown>) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof AccountError);
    assert.equal(error.code, 'unauthorized');
    assert.equal(error.message.includes(accessToken), false);
    assert.equal(error.message.includes('private'), false);
    return true;
  });
}

test('confirmSession asks Supabase Auth for the token\'s user as a client: the token as bearer, the publishable key as apikey', async () => {
  const { calls, admin } = setup(() => Response.json(userBody([])));
  assert.equal(await admin.confirmSession(accessToken, userId), 'alive');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${supabaseUrl}/auth/v1/user`);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.apikey, publishableKey);
  assert.equal(JSON.stringify(calls[0].init.headers).includes(secretKey), false, 'the secret key stays with the admin calls');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${accessToken}`);
  assert.equal(calls[0].init.redirect, 'manual');
  assert.ok(calls[0].init.signal);
});

test('a session Supabase Auth says has ended is unauthorized', async () => {
  for (const errorCode of ['session_not_found', 'user_banned', 'bad_jwt']) {
    const { admin } = setup(() => Response.json({ code: 403, error_code: errorCode, msg: 'private' }, { status: 403 }));
    await assertUnauthorized(admin.confirmSession(accessToken, userId));
  }
});

test('a user Supabase Auth no longer finds is gone, not refused', async () => {
  const { admin } = setup(() => Response.json({ code: 403, error_code: 'user_not_found', msg: 'private' }, { status: 403 }));
  assert.equal(await admin.confirmSession(accessToken, userId), 'user_gone');
});

test('any other confirmSession answer, an outage or a hung call is unavailable', async () => {
  const bodies = [
    Response.json({ ...userBody([]), id: '00000000-0000-4000-8000-000000000000' }),
    Response.json({ nothing: true }),
    new Response('not json'),
    Response.json({ code: 403, error_code: 'not_admin', msg: 'private' }, { status: 403 }),
    Response.json({ code: 403, error_code: 'session_expired', msg: 'private' }, { status: 403 }),
    Response.json({ code: 404, error_code: 'user_not_found', msg: 'private' }, { status: 404 }),
    Response.json({ code: 401, error_code: 'session_not_found', msg: 'private' }, { status: 401 }),
    Response.json({ message: 'Invalid API key', hint: 'private' }, { status: 401 }),
    Response.json({ code: 500, error_code: 'unexpected_failure', msg: 'private' }, { status: 500 }),
    Response.json({ code: 429, error_code: 'over_request_rate_limit', msg: 'private' }, { status: 429 }),
    new Response('private', { status: 503 }),
  ];
  for (const body of bodies) {
    await assertUnavailable(setup(() => body.clone()).admin.confirmSession(accessToken, userId));
  }
  await assertUnavailable(setup(() => { throw new Error('private network detail'); }).admin.confirmSession(accessToken, userId));
  let aborted = false;
  const hung = setup(({ init }) => new Promise<Response>((_, reject) => {
    init.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('private')); });
  }));
  await assertUnavailable(hung.admin.confirmSession(accessToken, userId));
  assert.equal(aborted, true);
});
