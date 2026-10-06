import assert from 'node:assert/strict';
import test from 'node:test';

import { generateEs256Key } from '../__tests__/es256-test-key.ts';
import type { FetchLike } from '../default-fetch.ts';
import { base64UrlEncode, createEs256Signer } from '../es256-jwt.ts';
import { AccountError } from './account-error.ts';
import { createSupabaseTokenVerifier } from './supabase-token-verifier.ts';

const supabaseUrl = 'https://project.supabase.co';
const userId = '3f2b8c1e-5d4a-4c1b-9a7e-0d6f1b2c3d4e';
const nowSeconds = 1_800_000_000;
const now = () => new Date(nowSeconds * 1000);
const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
const timeoutMs = 50;
const verified = { userId, hasAppleIdentity: false };

type ClaimsPatch = Record<string, unknown>;
// The verifier always passes an init to its JWKS fetch; RequestInit | undefined is the wider fetch signature.
type FetchCall = { url: string; init: RequestInit };

const claims = (patch: ClaimsPatch = {}) => ({
  iss: `${supabaseUrl}/auth/v1`, aud: 'authenticated', sub: userId, role: 'authenticated',
  iat: nowSeconds - 60, exp: nowSeconds + 3600, ...patch,
});

async function fixture() {
  const key = await generateEs256Key();
  const jwk = (kid: string, publicJwk: JsonWebKey = key.publicJwk) => ({ ...publicJwk, kid, alg: 'ES256', use: 'sig' });
  return { key, jwk, sign: createEs256Signer(key.bare) };
}

function jwksFetch(getKeys: () => unknown[], calls: FetchCall[] = []): FetchLike {
  return async (url, init) => {
    calls.push({ url: String(url), init: init as RequestInit });
    return Response.json({ keys: getKeys() });
  };
}

async function assertRejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof AccountError);
    assert.equal(error.code, code);
    return true;
  });
}

test('a valid token returns the user id from sub and reads the JWKS once', async () => {
  const { jwk, sign } = await fixture();
  const calls: FetchCall[] = [];
  const verify = createSupabaseTokenVerifier({ supabaseUrl, timeoutMs, now, fetch: jwksFetch(() => [jwk('k1')], calls) });
  const token = await sign({ alg: 'ES256', kid: 'k1', typ: 'JWT' }, claims());
  assert.deepEqual(await verify(token), verified);
  assert.deepEqual(await verify(token), verified);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, jwksUrl);
  // 'manual', not 'error': workerd rejects 'error' before any network call.
  assert.equal(calls[0].init.redirect, 'manual');
  assert.ok(calls[0].init.signal);
});

test('an aud array containing authenticated is accepted', async () => {
  const { jwk, sign } = await fixture();
  const verify = createSupabaseTokenVerifier({ supabaseUrl, timeoutMs, now, fetch: jwksFetch(() => [jwk('k1')]) });
  assert.deepEqual(await verify(await sign({ alg: 'ES256', kid: 'k1' }, claims({ aud: ['x', 'authenticated'] }))), verified);
});

test('claims that do not match are unauthorized', async () => {
  const { jwk, sign } = await fixture();
  const verify = createSupabaseTokenVerifier({ supabaseUrl, timeoutMs, now, fetch: jwksFetch(() => [jwk('k1')]) });
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
  const { jwk, sign } = await fixture();
  const verify = createSupabaseTokenVerifier({ supabaseUrl, timeoutMs, now, fetch: jwksFetch(() => [jwk('k1')]) });
  const good = await sign({ alg: 'ES256', kid: 'k1' }, claims());
  const [header, payload, signature] = good.split('.');
  const encode = (value: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
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
});

test('an unknown key id refetches once, then waits for the cooldown', async () => {
  const { jwk, sign } = await fixture();
  let clock = nowSeconds * 1000;
  const calls: FetchCall[] = [];
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, timeoutMs, now: () => new Date(clock), jwksCooldownMs: 60_000, fetch: jwksFetch(() => [jwk('k1')], calls),
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
  const calls: FetchCall[] = [];
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, timeoutMs, now: () => new Date(clock), jwksCooldownMs: 60_000, fetch: jwksFetch(() => keys, calls),
  });
  await verify(await first.sign({ alg: 'ES256', kid: 'k1' }, claims()));
  clock += 61_000;
  keys = [first.jwk('k1'), second.jwk('k2')];
  assert.deepEqual(await verify(await second.sign({ alg: 'ES256', kid: 'k2' }, claims({ exp: nowSeconds + 7200 }))), verified);
  assert.equal(calls.length, 2);
});

test('a cached key set expires and is read again', async () => {
  const { jwk, sign } = await fixture();
  let clock = nowSeconds * 1000;
  const calls: FetchCall[] = [];
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, timeoutMs, now: () => new Date(clock), jwksMaxAgeMs: 600_000, fetch: jwksFetch(() => [jwk('k1')], calls),
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

test('by default a key Supabase revoked stops verifying ten minutes after the set was read', async () => {
  const { jwk, sign } = await fixture();
  let clock = nowSeconds * 1000;
  let keys = [jwk('k1')];
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, timeoutMs, now: () => new Date(clock), fetch: jwksFetch(() => keys),
  });
  const token = await sign({ alg: 'ES256', kid: 'k1' }, claims({ exp: nowSeconds + 7200 }));
  assert.deepEqual(await verify(token), verified);
  keys = [];
  clock += 599_000;
  assert.deepEqual(await verify(token), verified);
  clock += 1000;
  await assertRejects(verify(token), 'unauthorized');
});

test('the signed providers claim tells whether the account had an Apple identity', async () => {
  const { jwk, sign } = await fixture();
  const verify = createSupabaseTokenVerifier({ supabaseUrl, timeoutMs, now, fetch: jwksFetch(() => [jwk('k1')]) });
  const header = { alg: 'ES256', kid: 'k1' };
  const withProviders = (providers: string[]) => claims({ app_metadata: { provider: providers[0], providers } });
  assert.deepEqual(await verify(await sign(header, withProviders(['google', 'apple']))), { userId, hasAppleIdentity: true });
  assert.deepEqual(await verify(await sign(header, withProviders(['google']))), verified);
  assert.deepEqual(await verify(await sign(header, claims({ app_metadata: {} }))), verified);
  assert.deepEqual(await verify(await sign(header, claims())), verified);
  await assertRejects(verify(await sign(header, claims({ app_metadata: { providers: 'apple' } }))), 'unauthorized');
});

test('concurrent verifications share one JWKS request', async () => {
  const { jwk, sign } = await fixture();
  const calls: FetchCall[] = [];
  const verify = createSupabaseTokenVerifier({ supabaseUrl, timeoutMs, now, fetch: jwksFetch(() => [jwk('k1')], calls) });
  const token = await sign({ alg: 'ES256', kid: 'k1' }, claims());
  await Promise.all([verify(token), verify(token), verify(token)]);
  assert.equal(calls.length, 1);
});

test('non-EC and malformed keys in the set are ignored', async () => {
  const { jwk, sign } = await fixture();
  const keys = [{ kty: 'RSA', kid: 'k0', n: 'AQAB', e: 'AQAB' }, { kty: 'EC', crv: 'P-256', kid: 'bad', x: '!', y: '!' }, jwk('k1')];
  const verify = createSupabaseTokenVerifier({ supabaseUrl, timeoutMs, now, fetch: jwksFetch(() => keys) });
  assert.deepEqual(await verify(await sign({ alg: 'ES256', kid: 'k1' }, claims())), verified);
  await assertRejects(verify(await sign({ alg: 'ES256', kid: 'k0' }, claims())), 'unauthorized');
});

test('JWKS outages are unavailable and carry no upstream detail', async () => {
  const { sign } = await fixture();
  const token = await sign({ alg: 'ES256', kid: 'k1' }, claims());
  const failures: FetchLike[] = [
    async () => { throw new Error('private upstream detail'); },
    async () => new Response('private body', { status: 500 }),
    async () => new Response('not json'),
    async () => Response.json({ keys: 'nope' }),
    async () => Response.json({ nothing: true }),
  ];
  for (const fetch of failures) {
    const verify = createSupabaseTokenVerifier({ supabaseUrl, timeoutMs, now, fetch });
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
    fetch: (_url, init) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('private')); })),
  });
  await assertRejects(verify(await sign({ alg: 'ES256', kid: 'k1' }, claims())), 'unavailable');
  assert.equal(aborted, true);
});

test('a failed fetch does not stay cached: the next call after the cooldown tries again', async () => {
  const { jwk, sign } = await fixture();
  let calls = 0;
  let at = nowSeconds * 1000;
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, timeoutMs, now: () => new Date(at),
    fetch: async () => { calls += 1; return calls === 1 ? new Response('x', { status: 503 }) : Response.json({ keys: [jwk('k1')] }); },
  });
  const token = await sign({ alg: 'ES256', kid: 'k1' }, claims());
  await assertRejects(verify(token), 'unavailable');
  at += 60_000;
  assert.deepEqual(await verify(token), verified);
});

test('during an outage with no key set loaded, calls inside the cooldown fail without fetching', async () => {
  const { jwk, sign } = await fixture();
  let calls = 0;
  let up = false;
  let at = nowSeconds * 1000;
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, timeoutMs, now: () => new Date(at),
    fetch: async () => { calls += 1; return up ? Response.json({ keys: [jwk('k1')] }) : new Response('x', { status: 503 }); },
  });
  const token = await sign({ alg: 'ES256', kid: 'k1' }, claims());
  await assertRejects(verify(token), 'unavailable');
  at += 30_000;
  await assertRejects(verify(token), 'unavailable');
  assert.equal(calls, 1, 'the second call inside the cooldown does not fetch');
  at += 30_000;
  await assertRejects(verify(token), 'unavailable');
  assert.equal(calls, 2, 'after the cooldown the keys are read again');
  up = true;
  at += 60_000;
  assert.deepEqual(await verify(token), verified);
  assert.equal(calls, 3);
});

test('a token whose role is not authenticated is unauthorized', async () => {
  const { jwk, sign } = await fixture();
  const verify = createSupabaseTokenVerifier({ supabaseUrl, timeoutMs, now, fetch: jwksFetch(() => [jwk('k1')]) });
  for (const role of ['service_role', 'anon', 'supabase_admin', '', undefined, 7]) {
    await assertRejects(verify(await sign({ alg: 'ES256', kid: 'k1' }, claims({ role }))), 'unauthorized');
  }
});

test('a JWKS request that ignores the abort never holds later callers', async () => {
  const { jwk, sign } = await fixture();
  let clock = nowSeconds * 1000;
  const calls: string[] = [];
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, timeoutMs, now: () => new Date(clock),
    // The first request never settles and never listens to its signal, as a request cancelled
    // by the runtime would; every later one answers.
    fetch: (url, init) => {
      calls.push(String(url));
      return calls.length === 1 ? new Promise<Response>(() => {}) : Promise.resolve(Response.json({ keys: [jwk('k1')] }));
    },
  });
  const token = await sign({ alg: 'ES256', kid: 'k1' }, claims());
  const startedAt = Date.now();
  // The caller that started the load and a caller that joined it both give up at their own deadline.
  await Promise.all([assertRejects(verify(token), 'unavailable'), assertRejects(verify(token), 'unavailable')]);
  assert.ok(Date.now() - startedAt < 1000, 'neither waited past its own deadline');
  assert.equal(calls.length, 1);
  clock += timeoutMs;
  await assertRejects(verify(token), 'unavailable');
  assert.equal(calls.length, 1, 'a dropped read counts as a failed attempt: the cooldown applies');
  clock += 60_000;
  assert.deepEqual(await verify(token), verified);
  assert.equal(calls.length, 2, 'after the cooldown the dropped read is replaced by a new one');
});

test('forged key ids never start more than one JWKS read per cooldown, even when reads hang', async () => {
  const { jwk, sign } = await fixture();
  let clock = nowSeconds * 1000;
  let calls = 0;
  let hang = false;
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, timeoutMs, now: () => new Date(clock), jwksCooldownMs: 60_000,
    fetch: () => {
      calls += 1;
      return hang ? new Promise<Response>(() => {}) : Promise.resolve(Response.json({ keys: [jwk('k1')] }));
    },
  });
  await verify(await sign({ alg: 'ES256', kid: 'k1' }, claims()));
  clock += 61_000;
  hang = true;
  const forged = (n: number) => sign({ alg: 'ES256', kid: `forged-${n}` }, claims());
  await assertRejects(verify(await forged(0)), 'unavailable');
  assert.equal(calls, 2);
  for (let n = 1; n <= 10; n += 1) {
    clock += timeoutMs;
    await assertRejects(verify(await forged(n)), 'unauthorized');
  }
  assert.equal(calls, 2, 'a dropped read does not reopen the cooldown');
  clock += 60_000;
  await assertRejects(verify(await forged(11)), 'unavailable');
  assert.equal(calls, 3);
});

test('a read that settles late never overwrites a newer key set', async () => {
  const first = await fixture();
  const second = await fixture();
  let clock = nowSeconds * 1000;
  let releaseLate = () => {};
  let calls = 0;
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, timeoutMs, now: () => new Date(clock),
    fetch: () => {
      calls += 1;
      if (calls === 1) return new Promise<Response>((resolve) => { releaseLate = () => resolve(Response.json({ keys: [first.jwk('k1')] })); });
      return Promise.resolve(Response.json({ keys: [second.jwk('k2')] }));
    },
  });
  const oldToken = await first.sign({ alg: 'ES256', kid: 'k1' }, claims());
  const newToken = await second.sign({ alg: 'ES256', kid: 'k2' }, claims());
  await assertRejects(verify(oldToken), 'unavailable');
  clock += 60_000;
  assert.deepEqual(await verify(newToken), verified);
  releaseLate();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(await verify(newToken), verified);
});

test('a key set older than its maximum age never verifies, even while the JWKS is down', async () => {
  const { jwk, sign } = await fixture();
  let clock = nowSeconds * 1000;
  let up = true;
  const calls: string[] = [];
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, timeoutMs, now: () => new Date(clock),
    fetch: async (url) => {
      calls.push(String(url));
      return up ? Response.json({ keys: [jwk('k1')] }) : new Response('x', { status: 503 });
    },
  });
  const token = await sign({ alg: 'ES256', kid: 'k1' }, claims({ exp: nowSeconds + 7200 }));
  assert.deepEqual(await verify(token), verified);
  up = false;
  clock += 599_000;
  assert.deepEqual(await verify(token), verified);
  assert.equal(calls.length, 1, 'inside its maximum age the set is not read again');
  clock += 1000;
  await assertRejects(verify(token), 'unavailable');
  assert.equal(calls.length, 2);
  clock += 30_000;
  await assertRejects(verify(token), 'unavailable');
  assert.equal(calls.length, 2, 'a failed read is not repeated inside the cooldown');
  clock += 30_000;
  await assertRejects(verify(token), 'unavailable');
  assert.equal(calls.length, 3);
  clock += 600_000;
  await assertRejects(verify(token), 'unavailable');
  up = true;
  clock += 60_000;
  assert.deepEqual(await verify(token), verified);
});

test('an unknown key id whose refetch fails inside the maximum age is unavailable and keeps the set', async () => {
  const { jwk, sign } = await fixture();
  let clock = nowSeconds * 1000;
  let up = true;
  const verify = createSupabaseTokenVerifier({
    supabaseUrl, timeoutMs, now: () => new Date(clock),
    fetch: async () => (up ? Response.json({ keys: [jwk('k1')] }) : new Response('x', { status: 503 })),
  });
  const known = await sign({ alg: 'ES256', kid: 'k1' }, claims({ exp: nowSeconds + 7200 }));
  assert.deepEqual(await verify(known), verified);
  up = false;
  clock += 120_000;
  await assertRejects(verify(await sign({ alg: 'ES256', kid: 'k2' }, claims())), 'unavailable');
  assert.deepEqual(await verify(known), verified);
});
