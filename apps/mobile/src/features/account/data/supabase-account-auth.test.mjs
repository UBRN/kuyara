import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { AuthRetryableFetchError, createClient } from '@supabase/supabase-js';

import { appleUserIdOf, authSessionOf, createSupabaseAccountAuth } from './supabase-account-auth.ts';
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
function fakeAuth(answer) {
  const requests = [];
  const store = new Map();
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const request = { path: url.pathname, grant: url.searchParams.get('grant_type'),
      body: init.body === undefined ? undefined : JSON.parse(init.body) };
    requests.push(request);
    const reply = await answer(request);
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  const client = createClient('https://project.supabase.co', 'sb_publishable_test', {
    global: { fetch },
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

test('Google fails the way a provider failure does until its library arrives', async () => {
  const { auth } = await signedIn();
  for (const call of [() => auth.signIn('google'), () => auth.addProvider('google')]) {
    await assert.rejects(call(), (error) => error instanceof AccountProviderError && error.code === 'unavailable');
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

/** Settles `promise` while the client's retry backoff runs on mocked timers. */
async function settled(t, promise) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  while (!done) {
    t.mock.timers.tick(500);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return promise;
}

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
  const credentials = await auth.reauthorizeDeletion();
  assert.equal(credentials.appleAuthorizationCode, 'apple-code');
  assert.equal(credentials.accessToken, jwt(7));
  assert.equal(requests.at(-1).grant, 'refresh_token');

  const cancelled = await signedIn(undefined, { reauthorize: async () => null });
  const before = cancelled.requests.length;
  assert.equal(await cancelled.auth.reauthorizeDeletion(), null);
  assert.equal(cancelled.requests.length, before);
});

test('when Apple gives no code for another reason, deletion still gets the access token without one', async () => {
  for (const reauthorize of [async () => { throw new Error('ASAuthorizationError 1000'); }, async () => ({ authorizationCode: null })]) {
    const { auth } = await signedIn(undefined, { reauthorize });
    const credentials = await auth.reauthorizeDeletion();
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
