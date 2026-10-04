import assert from 'node:assert/strict';
import test from 'node:test';

import { generateEs256Key } from '../__tests__/es256-test-key.mjs';
import { base64UrlEncode } from '../es256-jwt.ts';
import { AccountError } from './account-error.ts';
import { createAppleTokenRevoker } from './apple-token-revoker.ts';

const nowSeconds = 1_800_000_000;
const subject = '001234.abcdef0123456789.1234';
const code = 'c-single-use-code';
const tokenUrl = 'https://appleid.apple.com/auth/token';
const revokeUrl = 'https://appleid.apple.com/auth/revoke';

const idToken = (claims) => `${base64UrlEncode(new TextEncoder().encode('{"alg":"RS256"}'))}.${
  base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)))}.sig`;
const goodIdToken = (patch = {}) => idToken({
  iss: 'https://appleid.apple.com', aud: 'com.ubrn.kuyara', sub: subject, ...patch,
});
const tokenAnswer = (patch = {}) => ({
  access_token: 'access-secret', refresh_token: 'refresh-secret', id_token: goodIdToken(), token_type: 'Bearer', expires_in: 3600, ...patch,
});

async function setup(handler) {
  const key = await generateEs256Key();
  const calls = [];
  const fetch = async (url, init) => {
    const call = { url: String(url), init, form: Object.fromEntries(new URLSearchParams(init.body)) };
    calls.push(call);
    return handler(call);
  };
  const revoke = createAppleTokenRevoker({
    teamId: 'TEAM123456', keyId: 'KEY1234567', privateKeyPem: key.pem,
    now: () => new Date(nowSeconds * 1000), fetch, timeoutMs: 20,
  });
  return { key, calls, revoke };
}

const happy = (call) => (call.url === tokenUrl ? Response.json(tokenAnswer()) : new Response('', { status: 200 }));

async function assertRejects(promise, code_) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof AccountError);
    assert.equal(error.code, code_);
    for (const secret of ['refresh-secret', 'access-secret', code, 'KEY1234567']) {
      assert.equal(error.message.includes(secret), false);
    }
    return true;
  });
}

test('exchanges the code, checks the subject, then revokes the refresh token', async () => {
  const { key, calls, revoke } = await setup(happy);
  assert.equal(await revoke({ authorizationCode: code, expectedSubject: subject }), 'revoked');
  assert.deepEqual(calls.map((call) => call.url), [tokenUrl, revokeUrl]);
  for (const call of calls) {
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(call.init.redirect, 'manual');
    assert.ok(call.init.signal);
    assert.equal(call.form.client_id, 'com.ubrn.kuyara');
  }
  assert.equal(calls[0].form.grant_type, 'authorization_code');
  assert.equal(calls[0].form.code, code);
  assert.equal(calls[0].form.redirect_uri, undefined);
  assert.equal(calls[1].form.token, 'refresh-secret');
  assert.equal(calls[1].form.token_type_hint, 'refresh_token');
  // The client secret is an ES256 JWT built for this call.
  const [header, payload, signature] = calls[0].form.client_secret.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), {
    iss: 'TEAM123456', iat: nowSeconds, exp: nowSeconds + 300, aud: 'https://appleid.apple.com', sub: 'com.ubrn.kuyara',
  });
  assert.equal(await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, key.keyPair.publicKey,
    Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${header}.${payload}`),
  ), true);
  assert.ok(calls[1].form.client_secret.split('.').length === 3);
});

test('a subject that is not the account\'s Apple identity is refused and nothing is revoked', async () => {
  const { calls, revoke } = await setup(happy);
  assert.equal(await revoke({ authorizationCode: code, expectedSubject: 'someone.else' }), 'refused');
  assert.deepEqual(calls.map((call) => call.url), [tokenUrl]);
});

test('an id_token that is not Apple\'s for this app is an upstream fault, not a wrong code', async () => {
  for (const patch of [{ iss: 'https://evil.example' }, { aud: 'com.other.app' }, { sub: undefined }, { sub: 7 }]) {
    const { calls, revoke } = await setup(() => Response.json(tokenAnswer({ id_token: goodIdToken(patch) })));
    await assertRejects(revoke({ authorizationCode: code, expectedSubject: subject }), 'unavailable');
    assert.equal(calls.length, 1);
  }
});

test('an expired or reused code (invalid_grant) is refused, without a revoke call', async () => {
  const { calls, revoke } = await setup(() => Response.json({ error: 'invalid_grant', error_description: 'private detail' }, { status: 400 }));
  assert.equal(await revoke({ authorizationCode: code, expectedSubject: subject }), 'refused');
  assert.equal(calls.length, 1);
});

test('configuration and upstream failures on the exchange are unavailable', async () => {
  const answers = [
    () => Response.json({ error: 'invalid_client' }, { status: 401 }),
    () => Response.json({ error: 'invalid_request' }, { status: 400 }),
    () => new Response('private body', { status: 500 }),
    () => new Response('not json'),
    () => Response.json({ error: 'invalid_grant' }, { status: 500 }),
    () => Response.json(tokenAnswer({ refresh_token: undefined })),
    () => Response.json(tokenAnswer({ refresh_token: '' })),
    () => Response.json(tokenAnswer({ id_token: undefined })),
    () => Response.json(tokenAnswer({ id_token: 'not-a-jwt' })),
    () => { throw new Error('private network detail'); },
  ];
  for (const answer of answers) {
    const { calls, revoke } = await setup(answer);
    await assertRejects(revoke({ authorizationCode: code, expectedSubject: subject }), 'unavailable');
    assert.equal(calls.length, 1);
  }
});

test('a failed or refused revocation is unavailable, so the account is not deleted', async () => {
  for (const answer of [
    () => new Response('', { status: 400 }),
    () => Response.json({ error: 'invalid_client' }, { status: 401 }),
    () => new Response('private', { status: 503 }),
    () => { throw new Error('private network detail'); },
  ]) {
    const { calls, revoke } = await setup((call) => (call.url === tokenUrl ? Response.json(tokenAnswer()) : answer()));
    await assertRejects(revoke({ authorizationCode: code, expectedSubject: subject }), 'unavailable');
    assert.equal(calls.length, 2);
  }
});

test('a hung Apple call is aborted at the timeout', async () => {
  let aborted = 0;
  const { revoke } = await setup(({ init }) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => { aborted += 1; reject(new Error('private')); });
  }));
  await assertRejects(revoke({ authorizationCode: code, expectedSubject: subject }), 'unavailable');
  assert.equal(aborted, 1);
});

test('an unusable signing key is unavailable and calls Apple never', async () => {
  let calls = 0;
  const revoke = createAppleTokenRevoker({
    teamId: 'T', keyId: 'K', privateKeyPem: 'sentinel-key-material',
    now: () => new Date(nowSeconds * 1000), timeoutMs: 20, fetch: async () => { calls += 1; return new Response(''); },
  });
  await assertRejects(revoke({ authorizationCode: code, expectedSubject: subject }), 'unavailable');
  assert.equal(calls, 0);
});
