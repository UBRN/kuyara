import assert from 'node:assert/strict';
import test from 'node:test';

import { readJsonBody } from './json-request.ts';

const body = (text) => new Response(text).body;

test('a body of exactly the limit is parsed and one byte more is refused', async () => {
  const text = '{"a":"bcd"}';
  assert.deepEqual(await readJsonBody(body(text), text.length), { a: 'bcd' });
  assert.equal(await readJsonBody(body(`${text} `), text.length), undefined);
});

test('the limit counts encoded bytes, not characters', async () => {
  // Each "ğ" is two UTF-8 bytes: four characters of string, six bytes of body.
  assert.equal(await readJsonBody(body('"ğğ"'), 5), undefined);
  assert.equal(await readJsonBody(body('"ğğ"'), 6), 'ğğ');
});

test('an absent, empty or non-JSON body is undefined', async () => {
  assert.equal(await readJsonBody(null, 64), undefined);
  assert.equal(await readJsonBody(body(''), 64), undefined);
  assert.equal(await readJsonBody(body('{'), 64), undefined);
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
