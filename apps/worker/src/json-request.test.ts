import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkRateLimit,
  isJsonRequest,
  rateLimitedHeaders,
  readJsonBody,
  readTextWithLimit,
} from './json-request.ts';

const scope = { keyPrefix: 'weather', route: '/v1/weather', limiter: 'weather_burst' };
const requestFrom = (headers: Record<string, string> = {}) => new Request('https://worker.test/', { method: 'POST', headers });

function streamOf(...chunks: Uint8Array[]) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

const encode = (text: string) => new TextEncoder().encode(text);

test('the 429 header is one minute', () => {
  assert.deepEqual(rateLimitedHeaders, { 'Retry-After': '60' });
});

const contentTypeCases: [string | undefined, boolean][] = [
  ['application/json', true],
  ['Application/JSON; charset=utf-8', true],
  [' application/json ;x=1', true],
  ['text/plain', false],
  ['application/jsonx', false],
  [undefined, false],
];
for (const [contentType, expected] of contentTypeCases) {
  test(`content type ${contentType} is ${expected ? '' : 'not '}JSON`, () => {
    const headers: Record<string, string> = contentType === undefined ? {} : { 'content-type': contentType };
    assert.equal(isJsonRequest(requestFrom(headers)), expected);
  });
}

test('the limiter key is the prefix and the client IP, or unknown without one', async () => {
  const keys: string[] = [];
  const limiter = { limit: async ({ key }: { key: string }) => { keys.push(key); return { success: true }; } };
  assert.equal(
    await checkRateLimit(limiter, requestFrom({ 'cf-connecting-ip': '192.0.2.1' }), scope),
    'allowed',
  );
  assert.equal(await checkRateLimit(limiter, requestFrom(), scope), 'allowed');
  assert.deepEqual(keys, ['weather:192.0.2.1', 'weather:unknown']);
});

test('an IPv6 caller is limited by its /64, so rotating addresses inside one subscriber block does not help', async () => {
  const keys: string[] = [];
  const limiter = { limit: async ({ key }: { key: string }) => { keys.push(key); return { success: true }; } };
  for (const ip of [
    '2001:db8:85a3:12::8a2e:370:7334',
    '2001:0DB8:85A3:0012:ffff:ffff:ffff:1',
    '2001:db8:85a3:13::1',
    '2001:db8::1',
    '::1',
    '::ffff:192.0.2.1',
    '::ffff:c000:201',
    '64:ff9b::c000:201',
  ]) {
    await checkRateLimit(limiter, requestFrom({ 'cf-connecting-ip': ip }), scope);
  }
  assert.deepEqual(keys, [
    'weather:2001:db8:85a3:12::/64',
    'weather:2001:db8:85a3:12::/64',
    'weather:2001:db8:85a3:13::/64',
    'weather:2001:db8:0:0::/64',
    'weather:0:0:0:0::/64',
    'weather:::ffff:192.0.2.1',
    'weather:::ffff:c000:201',
    'weather:64:ff9b::c000:201',
  ]);
});

test('a denied limiter is limited and logs nothing itself', async (t) => {
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));
  assert.equal(
    await checkRateLimit({ limit: async () => ({ success: false }) }, requestFrom(), scope),
    'limited',
  );
  assert.deepEqual(warnings, []);
});

test('a failing limiter is unavailable and logged by name only', async (t) => {
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));
  assert.equal(
    await checkRateLimit({ limit: async () => { throw new Error('private'); } }, requestFrom(), scope),
    'unavailable',
  );
  assert.deepEqual(warnings, [
    { event: 'rate_limiter_error', route: '/v1/weather', limiter: 'weather_burst' },
  ]);
});

test('no limiter is no limit', async () => {
  assert.equal(await checkRateLimit(undefined, requestFrom(), scope), 'allowed');
});

test('a body over the limit is cancelled before it is read to the end', async () => {
  let pulled = 0;
  const body = new ReadableStream({
    pull(controller) {
      pulled += 1;
      controller.enqueue(new Uint8Array(1024));
    },
  });
  assert.equal(await readTextWithLimit(body, 4096), undefined);
  assert.ok(pulled <= 6);
});

test('no body reads as empty text', async () => {
  assert.equal(await readTextWithLimit(null, 10), '');
});

test('multi-byte characters split across chunks decode whole', async () => {
  const bytes = encode('İzmir');
  assert.equal(await readTextWithLimit(streamOf(bytes.slice(0, 1), bytes.slice(1)), 64), 'İzmir');
});

test('invalid UTF-8 is a replacement character, or a failure with fatal', async () => {
  const bad = () => streamOf(new Uint8Array([0x7b, 0xff, 0x7d]));
  assert.equal(await readTextWithLimit(bad(), 64), '{�}');
  await assert.rejects(readTextWithLimit(bad(), 64, { fatal: true }));
  assert.equal(await readJsonBody(streamOf(encode('{"a":"�"}')), 64, { fatal: true }) !== undefined, true);
  assert.equal(await readJsonBody(streamOf(new Uint8Array([0x22, 0xff, 0x22])), 64, { fatal: true }), undefined);
});

test('a JSON body parses, and every failure is undefined', async () => {
  assert.deepEqual(await readJsonBody(streamOf(encode('{"a":1}')), 64), { a: 1 });
  assert.equal(await readJsonBody(streamOf(encode('null')), 64), null);
  assert.equal(await readJsonBody(null, 64), undefined);
  assert.equal(await readJsonBody(streamOf(encode('')), 64), undefined);
  assert.equal(await readJsonBody(streamOf(encode('not json')), 64), undefined);
  assert.equal(await readJsonBody(streamOf(encode('{"a":"'.padEnd(100, 'x') + '"}')), 64), undefined);
});

const responseBody = (text: string) => new Response(text).body;

test('a body of exactly the limit is parsed and one byte more is refused', async () => {
  const text = '{"a":"bcd"}';
  assert.deepEqual(await readJsonBody(responseBody(text), text.length), { a: 'bcd' });
  assert.equal(await readJsonBody(responseBody(`${text} `), text.length), undefined);
});

test('the limit counts encoded bytes, not characters', async () => {
  // Each "ğ" is two UTF-8 bytes: four characters of string, six bytes of body.
  assert.equal(await readJsonBody(responseBody('"ğğ"'), 5), undefined);
  assert.equal(await readJsonBody(responseBody('"ğğ"'), 6), 'ğğ');
});

test('an absent, empty or non-JSON body is undefined', async () => {
  assert.equal(await readJsonBody(null, 64), undefined);
  assert.equal(await readJsonBody(responseBody(''), 64), undefined);
  assert.equal(await readJsonBody(responseBody('{'), 64), undefined);
});

test('an oversized streamed body is cancelled, never read to the end', async () => {
  let pulled = 0;
  let cancelled = false;
  const chunk = new TextEncoder().encode(' '.repeat(1024));
  const stream = new ReadableStream({
    pull(controller) {
      pulled += 1;
      if (pulled > 4096) controller.close(); else controller.enqueue(chunk);
    },
    cancel() { cancelled = true; },
  });
  assert.equal(await readJsonBody(stream, 4096), undefined);
  assert.equal(cancelled, true);
  assert.ok(pulled < 100, `pulled ${pulled} of 4096 chunks`);
});
