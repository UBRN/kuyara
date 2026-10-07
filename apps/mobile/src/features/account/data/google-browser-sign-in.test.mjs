import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createGoogleSignIn, resolveGoogleSignInSettings } from './google-browser-sign-in.ts';

const iosClientId = '123456789012-zyxwvutsrqponmlkjihgfedcba543210.apps.googleusercontent.com';
const redirectUri = 'com.googleusercontent.apps.123456789012-zyxwvutsrqponmlkjihgfedcba543210:/oauth2redirect';

test('the Google client setting needs the iOS client id in Google\'s format, else Google stays off', () => {
  assert.deepEqual(resolveGoogleSignInSettings(iosClientId), { iosClientId });
  assert.deepEqual(resolveGoogleSignInSettings(` ${iosClientId} `), { iosClientId });
  for (const value of [undefined, '', 'not-a-client-id', 'GOCSPX-secret', 'autoDetect']) {
    assert.equal(resolveGoogleSignInSettings(value), null, String(value));
  }
});

const crypto = {
  randomBytes: (count) => new Uint8Array(count).fill(7),
  sha256Hex: async (text) => createHash('sha256').update(text).digest('hex'),
};

/** A browser that answers with the redirect `answer(state)` builds, and records what it opened. */
function browser(answer) {
  const opened = [];
  return {
    opened,
    openAuthSessionAsync: async (url, redirect) => {
      opened.push({ url: new URL(url), redirect });
      return answer(new URL(url).searchParams.get('state'));
    },
  };
}

const success = (query) => ({ type: 'success', url: `${redirectUri}?${query}` });

function tokenEndpoint(status, body) {
  const requests = [];
  const send = async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
  return { requests, send };
}

const signIn = (web, token) => createGoogleSignIn({ browser: web, crypto, send: token.send }, { iosClientId });

test('the sign-in page asks Google for the iOS client with PKCE, the hashed nonce and the three scopes', async () => {
  const web = browser((state) => success(`code=the-code&state=${state}`));
  const token = tokenEndpoint(200, { id_token: 'google-id-token', access_token: 'never-read' });
  assert.deepEqual(await signIn(web, token).idToken('hashed-nonce'), { idToken: 'google-id-token' });

  const [{ url, redirect }] = web.opened;
  assert.equal(`${url.origin}${url.pathname}`, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(redirect, redirectUri);
  const params = Object.fromEntries(url.searchParams);
  const verifier = new URLSearchParams(token.requests[0].init.body).get('code_verifier');
  assert.deepEqual(params, {
    client_id: iosClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    nonce: 'hashed-nonce',
    state: params.state,
    prompt: 'select_account',
  });
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(params.state, /^[A-Za-z0-9_-]{22}$/);
});

test('the code is exchanged with Google for the ID token without a client secret', async () => {
  const token = tokenEndpoint(200, { id_token: 'google-id-token' });
  await signIn(browser((state) => success(`code=the-code&state=${state}`)), token).idToken('h');
  const [{ url, init }] = token.requests;
  assert.equal(url, 'https://oauth2.googleapis.com/token');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const body = Object.fromEntries(new URLSearchParams(init.body));
  assert.deepEqual(Object.keys(body).sort(), ['client_id', 'code', 'code_verifier', 'grant_type', 'redirect_uri']);
  assert.equal(body.client_id, iosClientId);
  assert.equal(body.code, 'the-code');
  assert.equal(body.grant_type, 'authorization_code');
  assert.equal(body.redirect_uri, redirectUri);
});

test('closing the sheet or declining on Google\'s page is a cancel', async () => {
  for (const answer of [() => ({ type: 'cancel' }), () => ({ type: 'dismiss' }), (state) => success(`error=access_denied&state=${state}`)]) {
    const token = tokenEndpoint(200, { id_token: 'unused' });
    assert.equal(await signIn(browser(answer), token).idToken('h'), null);
    assert.equal(token.requests.length, 0);
  }
});

test('a foreign state, a missing code or another error fails without asking Google for a token', async () => {
  for (const answer of [
    () => success('code=the-code&state=someone-else'),
    (state) => success(`state=${state}`),
    (state) => success(`error=server_error&state=${state}`),
    () => ({ type: 'locked' }),
  ]) {
    const token = tokenEndpoint(200, { id_token: 'unused' });
    await assert.rejects(signIn(browser(answer), token).idToken('h'), /^Error: Google sign-in failed\.$/);
    assert.equal(token.requests.length, 0);
  }
});

test('a refused exchange or an answer without an ID token fails with a closed message', async () => {
  for (const [status, body] of [[400, { error: 'invalid_grant', error_description: 'secret detail' }], [200, { access_token: 'x' }], [200, { id_token: '' }]]) {
    const web = browser((state) => success(`code=the-code&state=${state}`));
    await assert.rejects(signIn(web, tokenEndpoint(status, body)).idToken('h'), /^Error: Google sign-in failed\.$/);
  }
  const offline = { send: async () => { throw new Error('offline detail'); } };
  await assert.rejects(
    signIn(browser((state) => success(`code=the-code&state=${state}`)), offline).idToken('h'),
    /^Error: Google sign-in failed\.$/,
  );
});
