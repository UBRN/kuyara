import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { AuthRetryableFetchError, createClient } from '@supabase/supabase-js';

import { appleUserIdOf, authSessionOf, createSupabaseAccountAuth } from './supabase-account-auth.ts';
import { keepSessionOnServiceFailure } from './refresh-failure-fetch.ts';
import { createExpoAppleSignIn, createNonceSource } from './expo-native-sign-in.ts';
import { AccountProviderError } from '../application/account-session.ts';

const userId = '00000000-0000-4000-8000-000000000900';
const appleSub = '001234.abcdef.0912';
const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (n) => `${base64url({ alg: 'ES256', typ: 'JWT' })}.${base64url({
  sub: userId, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, n,
})}.c2ln`;

const identity = (provider, sub) => ({
  id: sub, identity_id: `${provider}-identity`, user_id: userId, provider,
  identity_data: { sub, email: 'q7@privaterelay.appleid.com', full_name: 'Never Read' },
});

function tokenResponse({ providers = ['apple'], primary = 'apple', n = 1 } = {}) {
  return {
    access_token: jwt(n), refresh_token: `refresh-${n}`, token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: userId, aud: 'authenticated', role: 'authenticated', email: 'q7@privaterelay.appleid.com',
      app_metadata: { provider: primary, providers },
      user_metadata: { full_name: 'Never Read', avatar_url: 'https://example.com/me.png' },
      identities: providers.map((provider) => identity(provider, provider === 'apple' ? appleSub : 'google-sub')),
      created_at: '2026-10-01T00:00:00Z',
    },
  };
}

const storageKey = 'kuyara.account.session';

/** A Supabase client over an in-memory store whose auth requests reach `answer`. */
function fakeAuth(answer, wrap = (send) => send) {
  const requests = [];
  const store = new Map();
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const request = { path: url.pathname, grant: url.searchParams.get('grant_type'),
      body: init.body === undefined ? undefined : JSON.parse(init.body),
      authorization: new Headers(init.headers).get('Authorization') };
    requests.push(request);
    const reply = await answer(request);
    if (reply.html !== undefined) {
      return new Response(reply.html, { status: reply.status, headers: { 'Content-Type': 'text/html' } });
    }
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  const client = createClient('https://project.supabase.co', 'sb_publishable_test', {
    global: { fetch: wrap(fetch) },
    auth: {
      autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, storageKey,
      storage: {
        getItem: async (key) => store.get(key) ?? null,
        setItem: async (key, value) => { store.set(key, value); },
        removeItem: async (key) => { store.delete(key); },
      },
    },
  });
  return {
    client, requests, store,
    storedSession: async () => store.get(storageKey) ?? null,
    removeStoredSession: async () => { store.delete(storageKey); },
  };
}

const nonce = async () => ({ raw: 'raw-nonce', hashed: 'hashed-nonce' });

function apple(over = {}) {
  const calls = [];
  return {
    calls,
    signIn: async (hashed) => { calls.push(['signIn', hashed]); return { identityToken: 'apple-id-token' }; },
    reauthorize: async () => { calls.push(['reauthorize']); return { authorizationCode: 'apple-code' }; },
    credentialState: async (sub) => { calls.push(['state', sub]); return 'authorized'; },
    ...over,
  };
}

async function signedIn(answer = () => ({ body: tokenResponse() }), appleOver = {}) {
  const fake = fakeAuth(answer);
  const appleFake = apple(appleOver);
  const auth = createSupabaseAccountAuth({ client: fake.client, apple: appleFake, nonce, storedSession: fake.storedSession, removeStoredSession: fake.removeStoredSession });
  await auth.signIn('apple');
  return { ...fake, apple: appleFake, auth };
}

test('Sign in with Apple sends the hashed nonce to Apple and the raw nonce with the ID token to Supabase', async () => {
  const { apple: appleFake, auth, requests } = await signedIn();
  assert.deepEqual(appleFake.calls, [['signIn', 'hashed-nonce']]);
  assert.equal(requests[0].path, '/auth/v1/token');
  assert.equal(requests[0].grant, 'id_token');
  assert.equal(requests[0].body.provider, 'apple');
  assert.equal(requests[0].body.id_token, 'apple-id-token');
  assert.equal(requests[0].body.nonce, 'raw-nonce');
  assert.deepEqual(await auth.currentSession(),
    { userId, provider: 'apple', email: 'q7@privaterelay.appleid.com', providers: ['apple'] });
});

test('a cancelled Apple sheet is no sign-in and no error; a missing token is a provider failure', async () => {
  const cancelled = createSupabaseAccountAuth({ client: fakeAuth(() => assert.fail('no request')).client,
    apple: apple({ signIn: async () => null }), nonce, storedSession: async () => null, removeStoredSession: async () => {} });
  assert.equal(await cancelled.signIn('apple'), null);
  const tokenless = createSupabaseAccountAuth({ client: fakeAuth(() => assert.fail('no request')).client,
    apple: apple({ signIn: async () => ({ identityToken: null }) }), nonce, storedSession: async () => null, removeStoredSession: async () => {} });
  await assert.rejects(tokenless.signIn('apple'), (error) => error instanceof AccountProviderError && error.code === 'failed');
});

test('without the Google client id in the build, Google fails closed the way a provider failure does', async () => {
  const { auth } = await signedIn();
  for (const call of [() => auth.signIn('google'), () => auth.addProvider('google')]) {
    await assert.rejects(call(), (error) => error instanceof AccountProviderError && error.code === 'unavailable');
  }
});

/** A Google ID token for `sub`; the adapter reads only its subject, never its signature. */
const googleToken = (sub = 'google-sub') => `${base64url({ alg: 'RS256' })}.${base64url({ sub, aud: 'web-client' })}.c2ln`;

function google(over = {}) {
  const calls = [];
  return { calls, idToken: async (hashed) => { calls.push(hashed); return { idToken: googleToken(), accessToken: 'google-access-token' }; }, ...over };
}

function googleAuth(answer, googleFake = google()) {
  const fake = fakeAuth(answer);
  const auth = createSupabaseAccountAuth({ client: fake.client, apple: apple(), google: googleFake, nonce,
    storedSession: fake.storedSession, removeStoredSession: fake.removeStoredSession });
  return { ...fake, auth, google: googleFake };
}

test('Sign in with Google sends the hashed nonce to Google and the raw nonce, the ID token and Google\'s access token to Supabase', async () => {
  const { auth, google: googleFake, requests } = googleAuth(() => ({ body: tokenResponse({ providers: ['google'], primary: 'google' }) }));
  assert.deepEqual(await auth.signIn('google'),
    { userId, provider: 'google', email: 'q7@privaterelay.appleid.com', providers: ['google'] });
  assert.deepEqual(googleFake.calls, ['hashed-nonce']);
  assert.equal(requests[0].grant, 'id_token');
  // The access token lets Supabase check the ID token's `at_hash`.
  const { access_token: accessToken, id_token: idToken, nonce: sentNonce, provider } = requests[0].body;
  assert.deepEqual({ provider, idToken, sentNonce, accessToken },
    { provider: 'google', idToken: googleToken(), sentNonce: 'raw-nonce', accessToken: 'google-access-token' });
});

test('a cancelled Google sheet is no sign-in and no error; a Google failure is a provider failure', async () => {
  const cancelled = googleAuth(() => assert.fail('no request'), google({ idToken: async () => null }));
  assert.equal(await cancelled.auth.signIn('google'), null);
  await assert.rejects(cancelled.auth.addProvider('google'), (error) => error instanceof AccountProviderError && error.code === 'cancelled');
  const failing = googleAuth(() => assert.fail('no request'), google({ idToken: async () => { throw new Error('Google sign-in failed.'); } }));
  await assert.rejects(failing.auth.signIn('google'), (error) => error instanceof AccountProviderError && error.code === 'failed');
});

test('adding Google links the identity with its ID token and nonce, and an identity owned elsewhere is the identity-taken case', async () => {
  let taken = false;
  const linked = tokenResponse({ providers: ['apple', 'google'], primary: 'apple', n: 2 });
  const { auth, requests } = googleAuth((request) => {
    if (request.body?.link_identity) {
      return taken ? { status: 422, body: { code: 422, error_code: 'identity_already_exists', msg: 'taken' } } : { body: linked };
    }
    return { body: tokenResponse() };
  });
  await auth.signIn('apple');
  assert.deepEqual((await auth.addProvider('google')).providers, ['apple', 'google']);
  const link = requests.find(({ body }) => body?.link_identity);
  assert.deepEqual({ provider: link.body.provider, id_token: link.body.id_token, nonce: link.body.nonce, access_token: link.body.access_token },
    { provider: 'google', id_token: googleToken(), nonce: 'raw-nonce', access_token: 'google-access-token' });
  taken = true;
  await assert.rejects(auth.addProvider('google'), (error) => error instanceof AccountProviderError && error.code === 'identityTaken');
});

test('deleting a Google account re-authenticates with Google, sends no Apple code, and a cancel stops it before any token', async () => {
  const session = (n) => tokenResponse({ providers: ['google'], primary: 'google', n });
  const { auth, google: googleFake, requests } = googleAuth((request) => ({ body: session(request.grant === 'refresh_token' ? 7 : 1) }));
  await auth.signIn('google');
  const credentials = await auth.reauthorizeDeletion(false);
  assert.deepEqual(credentials, { provider: 'google', accessToken: jwt(7) });
  assert.equal(googleFake.calls.length, 2);
  assert.equal(requests.at(-1).grant, 'refresh_token');

  let cancel = false;
  const cancelling = googleAuth(() => ({ body: session(1) }),
    google({ idToken: async () => (cancel ? null : { idToken: googleToken(), accessToken: 'google-access-token' }) }));
  await cancelling.auth.signIn('google');
  cancel = true;
  const before = cancelling.requests.length;
  assert.equal(await cancelling.auth.reauthorizeDeletion(false), null);
  assert.equal(cancelling.requests.length, before);
});

test('deletion confirms with Apple only when this phone holds the Apple credential, else with Google', async () => {
  const both = () => ({ body: tokenResponse({ providers: ['apple', 'google'], primary: 'apple' }) });
  // Created with Apple, signed in here with Google on a phone whose Apple ID is not the account's.
  const withoutCredential = googleAuth(both);
  await withoutCredential.auth.signIn('google');
  const credentials = await withoutCredential.auth.reauthorizeDeletion(false);
  assert.equal(credentials.provider, 'google');
  assert.equal('appleAuthorizationCode' in credentials, false);
  assert.equal(withoutCredential.google.calls.length, 2);
  const holding = googleAuth(both);
  await holding.auth.signIn('google');
  assert.equal((await holding.auth.reauthorizeDeletion(true)).provider, 'apple');
  // An account with no Google identity can only confirm with Apple.
  const appleOnly = await signedIn();
  assert.equal((await appleOnly.auth.reauthorizeDeletion(false)).provider, 'apple');
});

test('deletion does not start when Google confirms with a different Google account than the signed-in one', async () => {
  let sub = 'google-sub';
  const fake = googleAuth(() => ({ body: tokenResponse({ providers: ['google'], primary: 'google' }) }),
    google({ idToken: async () => ({ idToken: googleToken(sub), accessToken: 'google-access-token' }) }));
  await fake.auth.signIn('google');
  sub = 'someone-else';
  const before = fake.requests.length;
  await assert.rejects(fake.auth.reauthorizeDeletion(false), (error) => error instanceof AccountProviderError && error.code === 'failed');
  assert.equal(fake.requests.length, before);
  for (const idToken of ['not-a-jwt', `${base64url({})}.${base64url({ aud: 'x' })}.c2ln`]) {
    const malformed = googleAuth(() => ({ body: tokenResponse({ providers: ['google'], primary: 'google' }) }),
      google({ idToken: async () => ({ idToken, accessToken: 'google-access-token' }) }));
    await malformed.auth.signIn('google');
    await assert.rejects(malformed.auth.reauthorizeDeletion(false), (error) => error instanceof AccountProviderError && error.code === 'failed');
  }
});

test('the session maps once, from identities and app metadata, and never from user metadata', () => {
  const session = tokenResponse({ providers: ['google', 'apple'], primary: 'google' });
  assert.deepEqual(authSessionOf(session),
    { userId, provider: 'google', email: 'q7@privaterelay.appleid.com', providers: ['apple', 'google'] });
  assert.equal(JSON.stringify(authSessionOf(session)).includes('Never Read'), false);
  const withoutIdentities = { ...session, user: { ...session.user, identities: undefined } };
  assert.deepEqual(authSessionOf(withoutIdentities).providers, ['apple', 'google']);
  const emailOnly = tokenResponse({ providers: ['email'], primary: 'email' });
  assert.equal(authSessionOf(emailOnly), null);
  assert.equal(appleUserIdOf(session), appleSub);
});

test('adding Apple links the identity with the ID token and nonce, and an identity owned elsewhere is the identity-taken case', async () => {
  const google = tokenResponse({ providers: ['google'], primary: 'google' });
  const linked = tokenResponse({ providers: ['google', 'apple'], primary: 'google', n: 2 });
  let taken = false;
  const fake = fakeAuth((request) => {
    if (request.body?.link_identity) {
      return taken ? { status: 422, body: { code: 422, error_code: 'identity_already_exists', msg: 'Identity is already linked to another user' } }
        : { body: linked };
    }
    return { body: google };
  });
  // Seed a Google session the way a later Google adapter will, through the same token route.
  await fake.client.auth.signInWithIdToken({ provider: 'google', token: 'google-token', nonce: 'n' });
  const auth = createSupabaseAccountAuth({ client: fake.client, apple: apple(), nonce, storedSession: fake.storedSession, removeStoredSession: fake.removeStoredSession });
  assert.deepEqual((await auth.addProvider('apple')).providers, ['apple', 'google']);
  const link = fake.requests.find(({ body }) => body?.link_identity);
  assert.deepEqual({ provider: link.body.provider, id_token: link.body.id_token, nonce: link.body.nonce },
    { provider: 'apple', id_token: 'apple-id-token', nonce: 'raw-nonce' });
  taken = true;
  await assert.rejects(auth.addProvider('apple'),
    (error) => error instanceof AccountProviderError && error.code === 'identityTaken');
});

/** Settles `promise` while the client's retry backoff runs on mocked timers; fails after 100 s of them. */
async function settled(t, promise) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  for (let tick = 0; !done; tick += 1) {
    if (tick === 200) assert.fail('the promise never settled within 100 s of mocked time');
    t.mock.timers.tick(500);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return promise;
}

test('settling a promise that never settles fails instead of hanging the run', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await assert.rejects(settled(t, new Promise(() => {})), /never settled/);
});

test('offline or a failing server never ends the session; a refused refresh token does', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  // The access token has expired, so every read asks the server for a new one.
  const expired = () => ({ body: { ...tokenResponse(), expires_in: 1, expires_at: Math.floor(Date.now() / 1000) - 60 } });
  const replies = {
    offline: () => { throw new TypeError('Network request failed'); },
    down: () => ({ status: 503, body: { message: 'Service Unavailable' } }),
    refused: () => ({ status: 400, body: { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' } }),
  };
  for (const [mode, reply] of Object.entries(replies)) {
    const fake = fakeAuth((request) => (request.grant === 'refresh_token' ? reply() : expired()));
    const auth = createSupabaseAccountAuth({ client: fake.client, apple: apple(), nonce, storedSession: fake.storedSession, removeStoredSession: fake.removeStoredSession });
    await settled(t, auth.signIn('apple'));
    const expected = mode === 'refused' ? null : userId;
    assert.equal((await settled(t, auth.currentSession()))?.userId ?? null, expected, `${mode}: launch`);
    assert.equal((await settled(t, auth.refreshSession()))?.userId ?? null, expected, `${mode}: foreground`);
    assert.equal(fake.store.has(storageKey), mode !== 'refused', `${mode}: the stored session`);
  }
});

test('a paused project, a rate limit or a page from something in between never ends the session', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  const expired = () => ({ body: { ...tokenResponse(), expires_in: 1, expires_at: Math.floor(Date.now() / 1000) - 60 } });
  const replies = {
    paused: () => ({ status: 540, body: { message: 'Project paused' } }),
    limited: () => ({ status: 429, body: { code: 429, error_code: 'over_request_rate_limit', msg: 'Too many requests' } }),
    page: () => ({ status: 403, html: '<html>Blocked</html>' }),
    refused: () => ({ status: 400, body: { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' } }),
  };
  for (const [mode, reply] of Object.entries(replies)) {
    const fake = fakeAuth((request) => (request.grant === 'refresh_token' ? reply() : expired()), keepSessionOnServiceFailure);
    const auth = createSupabaseAccountAuth({ client: fake.client, apple: apple(), nonce, storedSession: fake.storedSession, removeStoredSession: fake.removeStoredSession });
    await settled(t, auth.signIn('apple'));
    const expected = mode === 'refused' ? null : userId;
    assert.equal((await settled(t, auth.refreshSession()))?.userId ?? null, expected, `${mode}: foreground`);
    assert.equal(fake.store.has(storageKey), mode !== 'refused', `${mode}: the stored session`);
  }
});

test('right after a refresh failed offline the session holds no access token, until the auth service answers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  let reachable = false;
  const expired = () => ({ body: { ...tokenResponse(), expires_in: 1, expires_at: Math.floor(Date.now() / 1000) - 60 } });
  const fake = fakeAuth((request) => {
    if (request.grant === 'refresh_token') {
      if (!reachable) throw new TypeError('Network request failed');
      return { body: tokenResponse({ n: 2 }) };
    }
    return request.path.startsWith('/rest/') ? { body: [] } : expired();
  });
  const auth = createSupabaseAccountAuth({ client: fake.client, apple: apple(), nonce, storedSession: fake.storedSession, removeStoredSession: fake.removeStoredSession });
  await settled(t, auth.signIn('apple'));
  // The foreground offline: the refresh fails and the stored session stands.
  assert.equal((await settled(t, auth.refreshSession()))?.userId, userId);
  reachable = true;
  // The auth client keeps that failure for a while, so a request now would go out as nobody.
  await settled(t, fake.client.from('wardrobe_items').select('id'));
  assert.equal(fake.requests.at(-1).authorization, 'Bearer sb_publishable_test');
  assert.equal(await settled(t, auth.hasAccessToken()), false);
  t.mock.timers.tick(61_000);
  assert.equal(await settled(t, auth.hasAccessToken()), true);
  await settled(t, fake.client.from('wardrobe_items').select('id'));
  assert.equal(fake.requests.at(-1).authorization, `Bearer ${JSON.parse(fake.store.get(storageKey)).access_token}`);
  assert.notEqual(fake.requests.at(-1).authorization, 'Bearer sb_publishable_test');
});

test('when even the stored session cannot be read offline, the read throws instead of answering signed out', async () => {
  const fake = fakeAuth(() => ({ body: tokenResponse() }));
  const auth = createSupabaseAccountAuth({
    client: { auth: { ...fake.client.auth, getSession: async () => ({ data: { session: null }, error: new AuthRetryableFetchError('Network request failed', 0) }) } },
    apple: apple(), nonce, storedSession: async () => 'not json', removeStoredSession: async () => {},
  });
  await assert.rejects(auth.currentSession(), (error) => error instanceof AccountProviderError && error.code === 'unavailable');
});

test('deletion re-authorizes with Apple for a code and a fresh access token; a cancel stops it before any token', async () => {
  const { auth, requests } = await signedIn((request) => ({ body: tokenResponse({ n: request.grant === 'refresh_token' ? 7 : 1 }) }));
  const credentials = await auth.reauthorizeDeletion(true);
  assert.equal(credentials.appleAuthorizationCode, 'apple-code');
  assert.equal(credentials.accessToken, jwt(7));
  assert.equal(requests.at(-1).grant, 'refresh_token');
  // An account created with Google that added Apple confirms with Apple, and says so.
  const added = await signedIn(() => ({ body: tokenResponse({ providers: ['apple', 'google'], primary: 'google' }) }));
  assert.equal((await added.auth.reauthorizeDeletion(true)).provider, 'apple');

  const cancelled = await signedIn(undefined, { reauthorize: async () => null });
  const before = cancelled.requests.length;
  assert.equal(await cancelled.auth.reauthorizeDeletion(true), null);
  assert.equal(cancelled.requests.length, before);
});

test('a retry after the account was deleted with a lost answer still reaches the Worker with the stored access token', async () => {
  // The Worker deleted the user, so the refresh token is gone; the Worker answers an already-deleted account.
  for (const refused of [
    { status: 400, body: { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' } },
    { status: 403, body: { code: 403, error_code: 'user_not_found', msg: 'User not found' } },
  ]) {
    const { auth } = await signedIn((request) => (request.grant === 'refresh_token' ? refused : { body: tokenResponse({ n: 1 }) }));
    assert.deepEqual(await auth.reauthorizeDeletion(true), { provider: 'apple', accessToken: jwt(1), appleAuthorizationCode: 'apple-code' });
  }
});

test('a retry with an expired stored access token still reaches the Worker with that token', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  // The client's own read refreshes an expired token first and answers no session when that is refused.
  const expired = () => ({ body: { ...tokenResponse({ n: 1 }), expires_in: 1, expires_at: Math.floor(Date.now() / 1000) - 60 } });
  const refused = { status: 400, body: { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' } };
  const fake = fakeAuth((request) => (request.grant === 'refresh_token' ? refused : expired()));
  const auth = createSupabaseAccountAuth({ client: fake.client, apple: apple(), nonce, storedSession: fake.storedSession, removeStoredSession: fake.removeStoredSession });
  await settled(t, auth.signIn('apple'));
  const { accessToken, ...rest } = await settled(t, auth.reauthorizeDeletion(true));
  assert.deepEqual(rest, { provider: 'apple', appleAuthorizationCode: 'apple-code' });
  // The stored token (issue 1), whatever second the mocked clock stands in when it is compared.
  assert.equal(JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()).n, 1);
});

test('when Apple gives no code for another reason, deletion still gets the access token without one', async () => {
  for (const reauthorize of [async () => { throw new Error('ASAuthorizationError 1000'); }, async () => ({ authorizationCode: null })]) {
    const { auth } = await signedIn(undefined, { reauthorize });
    const credentials = await auth.reauthorizeDeletion(true);
    assert.equal(typeof credentials.accessToken, 'string');
    assert.equal('appleAuthorizationCode' in credentials, false);
  }
});

test('Apple\'s credential state is asked for the Apple identity of the session, and a failure throws', async () => {
  const { apple: appleFake, auth } = await signedIn();
  assert.equal(await auth.appleCredentialState(), 'authorized');
  assert.deepEqual(appleFake.calls.at(-1), ['state', appleSub]);
  const unreachable = await signedIn(undefined, { credentialState: async () => { throw new Error('offline'); } });
  await assert.rejects(unreachable.auth.appleCredentialState());
});

test('signing out removes the stored session even when the server cannot be reached', async () => {
  const { auth, store } = await signedIn((request) => {
    if (request.path === '/auth/v1/logout') throw new TypeError('Network request failed');
    return { body: tokenResponse() };
  });
  assert.equal(store.size > 0, true);
  await auth.signOut();
  assert.equal(await auth.currentSession(), null);
});

test('signing out offline with an expired access token still removes the stored session', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  const expired = () => ({ body: { ...tokenResponse(), expires_in: 1, expires_at: Math.floor(Date.now() / 1000) - 60 } });
  const fake = fakeAuth((request) => {
    if (request.grant === 'refresh_token' || request.path === '/auth/v1/logout') throw new TypeError('Network request failed');
    return expired();
  });
  const auth = createSupabaseAccountAuth({ client: fake.client, apple: apple(), nonce, storedSession: fake.storedSession, removeStoredSession: fake.removeStoredSession });
  await settled(t, auth.signIn('apple'));
  assert.equal(fake.store.has(storageKey), true);
  // auth-js itself answers this sign-out with a retryable error and keeps what it stored.
  const { error } = await settled(t, fake.client.auth.signOut({ scope: 'local' }));
  assert.equal(error?.name, 'AuthRetryableFetchError');
  assert.equal(fake.store.has(storageKey), true);
  await settled(t, auth.signOut());
  assert.equal(fake.store.has(storageKey), false);
  assert.equal(await settled(t, auth.currentSession()), null);
});

test('the Expo Apple wrapper asks for the email only, maps a cancel to null and every credential state', async () => {
  const requests = [];
  const module = {
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationCredentialState: { REVOKED: 0, AUTHORIZED: 1, NOT_FOUND: 2, TRANSFERRED: 3 },
    signInAsync: async (options) => {
      requests.push(options);
      if (options.nonce === 'cancel') throw Object.assign(new Error('The user canceled'), { code: 'ERR_REQUEST_CANCELED' });
      return { identityToken: 'token', authorizationCode: 'code' };
    },
    getCredentialStateAsync: async (sub) => Number(sub),
  };
  const wrapper = createExpoAppleSignIn(module);
  assert.deepEqual(await wrapper.signIn('hashed'), { identityToken: 'token' });
  assert.deepEqual(requests[0], { requestedScopes: [1], nonce: 'hashed' });
  assert.equal(await wrapper.signIn('cancel'), null);
  assert.deepEqual(await wrapper.reauthorize(), { authorizationCode: 'code' });
  assert.deepEqual(requests.at(-1), { requestedScopes: [] });
  assert.deepEqual(await Promise.all(['0', '1', '2', '3'].map((state) => wrapper.credentialState(state))),
    ['revoked', 'authorized', 'notFound', 'transferred']);
  await assert.rejects(wrapper.credentialState('9'));
});

test('the nonce is random hex and Apple receives its SHA-256', async () => {
  const { hashed, raw } = await createNonceSource({
    randomBytes: (count) => Uint8Array.from({ length: count }, (_, index) => index),
    sha256Hex: async (value) => createHash('sha256').update(value).digest('hex'),
  })();
  assert.match(raw, /^[0-9a-f]{64}$/);
  assert.equal(hashed, createHash('sha256').update(raw).digest('hex'));
});
