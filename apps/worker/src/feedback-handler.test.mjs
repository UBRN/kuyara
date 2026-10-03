import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createFeedbackHandler } from './feedback-handler.ts';
import { buildRouter } from './index.ts';

const submissionId = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
const body = { submissionId, message: ' A useful note. ', appVersion: '0.1.20261002', platform: 'ios', locale: 'en' };
const request = (value = body, headers = {}) => new Request('https://worker.test/v1/feedback', {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1', ...headers },
  body: typeof value === 'string' ? value : JSON.stringify(value),
});

function fixture({ allowed = true, fail = false } = {}) {
  const rows = [];
  const keys = [];
  const handler = createFeedbackHandler({
    database: { prepare(sql) { return { bind(...values) { return { async run() {
      if (fail) throw new Error('secret');
      rows.push({ sql, values });
    } }; } }; } },
    rateLimiter: { async limit({ key }) { keys.push(key); return { success: allowed }; } },
    now: () => '2026-10-03T00:00:00.000Z',
  });
  return { handler, rows, keys };
}

test('stores only the approved fields and returns no content or identifier', async () => {
  const { handler, rows, keys } = fixture();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { status: 'received' } });
  assert.deepEqual(keys, ['feedback:192.0.2.1']);
  assert.deepEqual(rows[0].values, [submissionId, 'A useful note.', '0.1.20261002', 'ios', 'en', '2026-10-03T00:00:00.000Z']);
  assert.match(rows[0].sql, /INSERT INTO feedback .* ON CONFLICT\(id\) DO NOTHING/);
});

test('the D1 schema accepts a feedback insert without an IP column', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(readFileSync(new URL('../migrations/0001_feedback.sql', import.meta.url), 'utf8'));
    const handler = createFeedbackHandler({
      database: { prepare(sql) { return { bind(...values) { return {
        async run() { sqlite.prepare(sql).run(...values); },
      }; } }; } },
      rateLimiter: { async limit() { return { success: true }; } },
      now: () => '2026-10-03T00:00:00.000Z',
      });
    assert.equal((await handler(request())).status, 200);
    assert.deepEqual({ ...sqlite.prepare('SELECT * FROM feedback').get() }, {
      id: submissionId, message: 'A useful note.', app_version: '0.1.20261002',
      platform: 'ios', locale: 'en', created_at: '2026-10-03T00:00:00.000Z',
    });
  } finally {
    sqlite.close();
  }
});

test('a retry with the same submission id stores one row and still answers success', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(readFileSync(new URL('../migrations/0001_feedback.sql', import.meta.url), 'utf8'));
    const handler = createFeedbackHandler({
      database: { prepare(sql) { return { bind(...values) { return {
        async run() { sqlite.prepare(sql).run(...values); },
      }; } }; } },
      rateLimiter: { async limit() { return { success: true }; } },
      now: () => '2026-10-03T00:00:00.000Z',
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await handler(request());
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { data: { status: 'received' } });
    }
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM feedback').get().n, 1);
    assert.equal((await handler(request({ ...body, submissionId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' }))).status, 200);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM feedback').get().n, 2);
  } finally {
    sqlite.close();
  }
});

test('rejects extra fields, invalid text, oversized bodies and wrong methods without writes', async () => {
  const { handler, rows } = fixture();
  for (const value of [{ ...body, latitude: 41 }, { ...body, message: ' ' }, { ...body, appVersion: '1.0.0' }, { ...body, submissionId: 'x' }, 'x'.repeat(4097)]) {
    assert.equal((await handler(request(value))).status, 400);
  }
  const method = await handler(new Request('https://worker.test/v1/feedback'));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'POST');
  assert.equal(rows.length, 0);
});

test('rate limit and database failures fail closed with stable errors', async () => {
  const limited = await fixture({ allowed: false }).handler(request());
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: { code: 'rate_limited' } });
  const failed = await fixture({ fail: true }).handler(request());
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: { code: 'unavailable' } });
});

test('route remains unavailable until both D1 and limiter bindings exist', async () => {
  const context = { waitUntil() {} };
  for (const env of [{}, { FEEDBACK_DB: { prepare() { throw new Error('must stay offline'); } } }]) {
    const response = await buildRouter(env)(request(), context);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: 'unavailable' } });
  }
});
