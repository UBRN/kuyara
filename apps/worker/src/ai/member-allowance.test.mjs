import assert from 'node:assert/strict';
import test from 'node:test';

import { AccountError } from '../account/account-error.ts';
import { createSupabaseTokenVerifier } from '../account/supabase-token-verifier.ts';
import { MEMBER_REASK_DAILY_LIMIT, createMemberAllowance } from './member-allowance.ts';

const userId = '3f2b8c1e-5d4a-4c1b-9a7e-0d6f1b2c3d4e';
const otherUserId = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const day = new Date('2026-09-15T10:00:00.000Z');

// A namespace whose objects count per key, like the real DailyCounter, and remember
// every name and key they were asked for.
function fakeNamespace({ failing = false } = {}) {
  const names = [];
  const keys = [];
  const counts = new Map();
  return {
    names,
    keys,
    idFromName(name) { names.push(name); return { name }; },
    get(id) {
      return {
        async fetch(input) {
          if (failing) throw new Error('counter unavailable');
          const key = new URL(String(input)).searchParams.get('key');
          keys.push(key);
          const stored = `${id.name}|${key}`;
          counts.set(stored, (counts.get(stored) ?? 0) + 1);
          return Response.json({ count: counts.get(stored) });
        },
      };
    },
  };
}

const withToken = (token) => new Request('https://worker.test/v2/ai/recommend', {
  method: 'POST',
  headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
});

function setup({ verifier, namespace = fakeNamespace() } = {}) {
  const verified = [];
  const allowance = createMemberAllowance({
    verifier: verifier ?? (async (token) => { verified.push(token); return { userId, hasAppleIdentity: false }; }),
    namespace,
  });
  return { allowance, namespace, verified };
}

test('the member limit is ten per day', () => {
  assert.equal(MEMBER_REASK_DAILY_LIMIT, 10);
});

test('a verified member gets ten re-asks and the eleventh is exhausted', async () => {
  const { allowance } = setup();
  for (let count = 1; count <= MEMBER_REASK_DAILY_LIMIT; count += 1) {
    assert.equal(await allowance(withToken('t'), day), 'within', `re-ask ${count}`);
  }
  assert.equal(await allowance(withToken('t'), day), 'exhausted');
  assert.equal(await allowance(withToken('t'), day), 'exhausted');
});

test('members count separately and the count restarts on the next UTC day', async () => {
  const verifiers = new Map([['a', userId], ['b', otherUserId]]);
  const { allowance } = setup({
    verifier: async (token) => ({ userId: verifiers.get(token), hasAppleIdentity: false }),
  });
  for (let count = 0; count < MEMBER_REASK_DAILY_LIMIT + 1; count += 1) await allowance(withToken('a'), day);
  assert.equal(await allowance(withToken('a'), day), 'exhausted');
  assert.equal(await allowance(withToken('b'), day), 'within');
  assert.equal(await allowance(withToken('a'), new Date('2026-09-16T00:00:00.000Z')), 'within');
});

test('a request without an Authorization header is not verified or counted', async () => {
  const { allowance, namespace, verified } = setup();
  assert.equal(await allowance(withToken(undefined), day), 'within');
  assert.equal(await allowance(new Request('https://worker.test/', { headers: { authorization: 'Basic abc' } }), day), 'within');
  assert.deepEqual(verified, []);
  assert.deepEqual(namespace.keys, []);
});

test('a token the verifier rejects is a non-member request and counts nothing', async () => {
  const { allowance, namespace } = setup({ verifier: async () => { throw new AccountError('unauthorized'); } });
  for (let count = 0; count < MEMBER_REASK_DAILY_LIMIT + 5; count += 1) {
    assert.equal(await allowance(withToken('bad'), day), 'within');
  }
  assert.deepEqual(namespace.keys, []);
});

test('a verifier outage never blocks and logs one closed line', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  for (const thrown of [new AccountError('unavailable'), new Error('boom with a secret')]) {
    const { allowance, namespace } = setup({ verifier: async () => { throw thrown; } });
    assert.equal(await allowance(withToken('t'), day), 'within');
    assert.deepEqual(namespace.keys, []);
  }
  assert.deepEqual(warnings, [
    { event: 'ai_member_verifier_unavailable' }, { event: 'ai_member_verifier_unavailable' },
  ]);
});

test('a counter outage never blocks and logs one closed line', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  const { allowance } = setup({ namespace: fakeNamespace({ failing: true }) });
  assert.equal(await allowance(withToken('t'), day), 'within');
  assert.deepEqual(warnings, [{ event: 'ai_member_counter_unavailable' }]);
});

test('the user id keys the counter only and appears in no log line', async (t) => {
  const lines = [];
  for (const level of ['warn', 'info', 'log', 'error']) {
    t.mock.method(console, level, (...args) => lines.push(JSON.stringify(args)));
  }
  const { allowance, namespace } = setup();
  for (let count = 0; count < MEMBER_REASK_DAILY_LIMIT + 1; count += 1) await allowance(withToken('t'), day);
  const failing = setup({ namespace: fakeNamespace({ failing: true }) });
  await failing.allowance(withToken('t'), day);
  const broken = setup({ verifier: async () => { throw new AccountError('unavailable'); } });
  await broken.allowance(withToken('t'), day);

  assert.deepEqual(namespace.names, Array(MEMBER_REASK_DAILY_LIMIT + 1).fill(`ai:member:${userId}`));
  assert.ok(namespace.keys.every((key) => key === 'ai:member:2026-09-15'), 'the stored key holds no user id');
  assert.equal(lines.some((line) => line.includes(userId) || line.includes('ai:member')), false);
});

test('a JWKS read that never settles leaves the re-ask within, after the verifier deadline', async () => {
  const verifier = createSupabaseTokenVerifier({
    supabaseUrl: 'https://project.supabase.co',
    now: () => day,
    timeoutMs: 20,
    fetch: () => new Promise(() => {}),
  });
  const { allowance, namespace } = setup({ verifier });
  // Shaped like an ES256 token with a key id, so the verifier reaches for the key set.
  const segment = (value) => Buffer.from(value).toString('base64url');
  const token = `${segment('{"alg":"ES256","kid":"k1"}')}.${segment('{}')}.${segment('x'.repeat(64))}`;
  const startedAt = Date.now();
  assert.equal(await allowance(withToken(token), day), 'within');
  assert.ok(Date.now() - startedAt < 1000);
  assert.deepEqual(namespace.names, []);
});
