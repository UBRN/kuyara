import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import type { FetchLike } from '../default-fetch.ts';
import { runSupabaseKeepAlive } from './supabase-keep-alive.ts';

const supabaseUrl = 'https://project.supabase.co';
const secretKey = 'sb_secret_sentinel_value';

// The adapter always sends a plain header record; RequestInit types it as the wider HeadersInit.
type KeepAliveCall = { url: string; init: RequestInit & { headers: Record<string, string> } };

function capture(t: TestContext): unknown[] {
  const logs: unknown[] = [];
  t.mock.method(console, 'info', (entry: unknown) => logs.push(['info', entry]));
  t.mock.method(console, 'warn', (entry: unknown) => logs.push(['warn', entry]));
  return logs;
}

test('one authenticated RPC call to keep_alive, secret key in the apikey header only, and an ok outcome', async (t) => {
  const logs = capture(t);
  const calls: KeepAliveCall[] = [];
  await runSupabaseKeepAlive({
    supabaseUrl, secretKey, timeoutMs: 20,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init as KeepAliveCall['init'] });
      return Response.json(true);
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${supabaseUrl}/rest/v1/rpc/keep_alive`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.apikey, secretKey);
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[0].init.body, '{}');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.ok(calls[0].init.signal);
  assert.deepEqual(logs, [['info', { event: 'supabase_keep_alive', outcome: 'ok' }]]);
});

test('a missing setting calls nothing and logs skipped_unconfigured', async (t) => {
  const logs = capture(t);
  let calls = 0;
  const fetch = async () => { calls += 1; return Response.json(true); };
  const cases = [
    { supabaseUrl: undefined, secretKey },
    { supabaseUrl: '', secretKey },
    { supabaseUrl, secretKey: undefined },
    { supabaseUrl, secretKey: '' },
  ];
  for (const settings of cases) await runSupabaseKeepAlive({ ...settings, fetch });
  assert.equal(calls, 0);
  assert.deepEqual(logs, cases.map(() => ['info', { event: 'supabase_keep_alive', outcome: 'skipped_unconfigured' }]));
});

test('a rejected answer, a network fault and a timeout log a closed failure and never throw', async (t) => {
  const logs = capture(t);
  const run = (fetch: FetchLike) => runSupabaseKeepAlive({ supabaseUrl, secretKey, timeoutMs: 20, fetch });
  await run(async () => Response.json({ message: `private ${secretKey}` }, { status: 401 }));
  await run(async () => new Response('private', { status: 503 }));
  await run(async () => { throw new Error(`private ${secretKey}`); });
  await run((_url, init) => new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('private')));
  }));
  assert.deepEqual(logs, [
    ['warn', { event: 'supabase_keep_alive', outcome: 'failed', reason: 'rejected' }],
    ['warn', { event: 'supabase_keep_alive', outcome: 'failed', reason: 'rejected' }],
    ['warn', { event: 'supabase_keep_alive', outcome: 'failed', reason: 'unreachable' }],
    ['warn', { event: 'supabase_keep_alive', outcome: 'failed', reason: 'unreachable' }],
  ]);
});
