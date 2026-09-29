import assert from 'node:assert/strict';
import test from 'node:test';

import { generateEs256Key } from '../__tests__/es256-test-key.mjs';
import { base64UrlEncode, createEs256Signer } from '../es256-jwt.ts';
import { AccountError } from './account-error.ts';
import { createSupabaseTokenVerifier } from './supabase-token-verifier.ts';

const supabaseUrl = 'https://project.supabase.co';
const userId = '3f2b8c1e-5d4a-4c1b-9a7e-0d6f1b2c3d4e';
const nowSeconds = 1_800_000_000;
const now = () => new Date(nowSeconds * 1000);
const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;

const claims = (patch = {}) => ({
  iss: `${supabaseUrl}/auth/v1`, aud: 'authenticated', sub: userId, role: 'authenticated',
  iat: nowSeconds - 60, exp: nowSeconds + 3600, ...patch,
});

async function fixture() {
  const key = await generateEs256Key();
  const jwk = (kid, publicJwk = key.publicJwk) => ({ ...publicJwk, kid, alg: 'ES256', use: 'sig' });
  return { key, jwk, sign: createEs256Signer(key.bare) };
}

function jwksFetch(getKeys, calls = []) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ keys: getKeys() });
  };
}

async function assertRejects(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof AccountError);
    assert.equal(error.code, code);
    return true;
  });
}

test('a valid token returns the user id from sub and reads the JWKS once', async () => {
  const { jwk, sign } = await fixture();
  const calls = [];
  const verify = createSupabaseTokenVerifier({ supabaseUrl, now, fetch: jwksFetch(() => [jwk('k1')], calls) });
  const token = await sign({ alg: 'ES256', kid: 'k1', typ: 'JWT' }, claims());
  assert.deepEqual(await verify(token), { userId });
  assert.deepEqual(await verify(token), { userId });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, jwksUrl);
  // 'manual', not 'error': workerd rejects 'error' before any network call.
  assert.equal(calls[0].init.redirect, 'manual');
  assert.ok(calls[0].init.signal);
});

test('a trailing slash on the project address does not change the issuer', async () => {
  const { jwk, sign } = await fixture();
  const verify = createSupabaseTokenVerifier({ supabaseUrl: `${supabaseUrl}/`, now, fetch: jwksFetch(() => [jwk('k1')]) });
  assert.deepEqual(await verify(await sign({ alg: 'ES256', kid: 'k1' }, claims())), { userId });
});

test('an aud array containing authenticated is accepted', async () => {
  const { jwk, sign } = await fixture();
  const verify = createSupabaseTokenVerifier({ supabaseUrl, now, fetch: jwksFetch(() => [jwk('k1')]) });
  assert.deepEqual(await verify(await sign({ alg: 'ES256', kid: 'k1' }, claims({ aud: ['x', 'authenticated'] }))), { userId });
});

test('claims that do not match are unauthorized', async () => {
  const { jwk, sign } = await fixture();
  const verify = createSupabaseTokenVerifier({ supabaseUrl, now, fetch: jwksFetch(() => [jwk('k1')]) });
  const header = { alg: 'ES256', kid: 'k1' };
  for (const patch of [
    { exp: nowSeconds }, { exp: nowSeconds - 1 }, { exp: undefined }, { exp: '9999999999' },
    { nbf: nowSeconds + 1 },
    { iss: supabaseUrl }, { iss: `${supabaseUrl}/auth/v1/` }, { iss: 'https://other.supabase.co/auth/v1' },
    { aud: 'anon' }, { aud: ['anon'] }, { aud: undefined },
    { sub: undefined }, { sub: '' }, { sub: 'not-a-uuid' }, { sub: `${userId}/../x` }, { sub: 42 },
  ]) {
    await assertRejects(verify(await sign(header, claims(patch))), 'unauthorized');
  }
});

test('only ES256 with a matching signature passes', async () => {
  const { key, jwk, sign } = await fixture();
  const verify = createSupabaseTokenVerifier({ supabaseUrl, now, fetch: jwksFetch(() => [jwk('k1')]) });
  const good = await sign({ alg: 'ES256', kid: 'k1' }, claims());
  const [header, payload, signature] = good.split('.');
  const encode = (value) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
  const other = await fixture();
  for (const token of [
    await sign({ alg: 'HS256', kid: 'k1' }, claims()),
    await sign({ alg: 'none', kid: 'k1' }, claims()),
    await sign({ alg: 'ES256' }, claims()),
    await sign({ alg: 'ES256', kid: 7 }, claims()),
    await other.sign({ alg: 'ES256', kid: 'k1' }, claims()),
    `${header}.${encode(claims({ sub: '00000000-0000-4000-8000-000000000000' }))}.${signature}`,
    `${header}.${payload}.${signature.slice(0, -4)}`,
    `${header}.${payload}.`,
    `${header}.${payload}`,
    `${header}.${payload}.${signature}.extra`,
    `${header}.${payload}.***`,
    '', 'garbage', `${'a'.repeat(9000)}.${payload}.${signature}`,
  ]) {
    await assertRejects(verify(token), 'unauthorized');
  }
  assert.ok(key);
});

test('an unknown key id refetches once, then waits for the cooldown', async () => {
  const { jwk, sign } = await fixture();
  let clock = nowSeconds * 1000;
  const calls = [];
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, now: () => new Date(clock), jwksCooldownMs: 60_000, fetch: jwksFetch(() => [jwk('k1')], calls),
  });
  const known = await sign({ alg: 'ES256', kid: 'k1' }, claims());
  await verify(known);
  assert.equal(calls.length, 1);
  clock += 1000;
  // The known key's own fetch counts: an unknown id right after it is inside the cooldown.
  await assertRejects(verify(await sign({ alg: 'ES256', kid: 'forged-1' }, claims())), 'unauthorized');
  await assertRejects(verify(await sign({ alg: 'ES256', kid: 'forged-2' }, claims())), 'unauthorized');
  assert.equal(calls.length, 1);
  clock += 60_000;
  await assertRejects(verify(await sign({ alg: 'ES256', kid: 'forged-3' }, claims())), 'unauthorized');
  assert.equal(calls.length, 2);
  await assertRejects(verify(await sign({ alg: 'ES256', kid: 'forged-4' }, claims())), 'unauthorized');
  assert.equal(calls.length, 2);
});

test('a rotated key is found by the one refetch', async () => {
  const first = await fixture();
  const second = await fixture();
  let clock = nowSeconds * 1000;
  let keys = [first.jwk('k1')];
  const calls = [];
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, now: () => new Date(clock), jwksCooldownMs: 60_000, fetch: jwksFetch(() => keys, calls),
  });
  await verify(await first.sign({ alg: 'ES256', kid: 'k1' }, claims()));
  clock += 61_000;
  keys = [first.jwk('k1'), second.jwk('k2')];
  assert.deepEqual(await verify(await second.sign({ alg: 'ES256', kid: 'k2' }, claims({ exp: nowSeconds + 7200 }))), { userId });
  assert.equal(calls.length, 2);
});

test('a cached key set expires and is read again', async () => {
  const { jwk, sign } = await fixture();
  let clock = nowSeconds * 1000;
  const calls = [];
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, now: () => new Date(clock), jwksMaxAgeMs: 600_000, fetch: jwksFetch(() => [jwk('k1')], calls),
  });
  const token = await sign({ alg: 'ES256', kid: 'k1' }, claims({ exp: nowSeconds + 7200 }));
  await verify(token);
  clock += 599_000;
  await verify(token);
  assert.equal(calls.length, 1);
  clock += 2000;
  await verify(token);
  assert.equal(calls.length, 2);
});

test('concurrent verifications share one JWKS request', async () => {
  const { jwk, sign } = await fixture();
  const calls = [];
  const verify = createSupabaseTokenVerifier({ supabaseUrl, now, fetch: jwksFetch(() => [jwk('k1')], calls) });
  const token = await sign({ alg: 'ES256', kid: 'k1' }, claims());
  await Promise.all([verify(token), verify(token), verify(token)]);
  assert.equal(calls.length, 1);
});

test('non-EC and malformed keys in the set are ignored', async () => {
  const { jwk, sign } = await fixture();
  const keys = [{ kty: 'RSA', kid: 'k0', n: 'AQAB', e: 'AQAB' }, { kty: 'EC', crv: 'P-256', kid: 'bad', x: '!', y: '!' }, jwk('k1')];
  const verify = createSupabaseTokenVerifier({ supabaseUrl, now, fetch: jwksFetch(() => keys) });
  assert.deepEqual(await verify(await sign({ alg: 'ES256', kid: 'k1' }, claims())), { userId });
  await assertRejects(verify(await sign({ alg: 'ES256', kid: 'k0' }, claims())), 'unauthorized');
});

test('JWKS outages are unavailable and carry no upstream detail', async () => {
  const { sign } = await fixture();
  const token = await sign({ alg: 'ES256', kid: 'k1' }, claims());
  const failures = [
    async () => { throw new Error('private upstream detail'); },
    async () => new Response('private body', { status: 500 }),
    async () => new Response('not json'),
    async () => Response.json({ keys: 'nope' }),
    async () => Response.json({ nothing: true }),
  ];
  for (const fetch of failures) {
    const verify = createSupabaseTokenVerifier({ supabaseUrl, now, fetch });
    await assert.rejects(verify(token), (error) => {
      assert.ok(error instanceof AccountError);
      assert.equal(error.code, 'unavailable');
      assert.equal(error.message.includes('private'), false);
      assert.equal(error.message.includes(token), false);
      return true;
    });
  }
});

test('a JWKS request that hangs is aborted at the timeout', async () => {
  const { sign } = await fixture();
  let aborted = false;
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, now, timeoutMs: 5,
    fetch: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('private')); })),
  });
  await assertRejects(verify(await sign({ alg: 'ES256', kid: 'k1' }, claims())), 'unavailable');
  assert.equal(aborted, true);
});

test('a failed fetch does not stay cached: the next call tries again', async () => {
  const { jwk, sign } = await fixture();
  let calls = 0;
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, now,
    fetch: async () => { calls += 1; return calls === 1 ? new Response('x', { status: 503 }) : Response.json({ keys: [jwk('k1')] }); },
  });
  const token = await sign({ alg: 'ES256', kid: 'k1' }, claims());
  await assertRejects(verify(token), 'unavailable');
  assert.deepEqual(await verify(token), { userId });
});
