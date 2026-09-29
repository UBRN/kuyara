import assert from 'node:assert/strict';
import test from 'node:test';

import { AccountError } from './account-error.ts';
import { boundedFetch } from './bounded-fetch.ts';

function streamed(chunkCount, chunkBytes, counter) {
  const chunk = new TextEncoder().encode(`${'x'.repeat(chunkBytes - 1)} `);
  return new Response(new ReadableStream({
    pull(controller) {
      counter.pulled += 1;
      if (counter.pulled > chunkCount) controller.close(); else controller.enqueue(chunk);
    },
  }), { status: 200 });
}

test('a streamed body over the limit fails closed without being read to the end', async () => {
  const counter = { pulled: 0 };
  await assert.rejects(
    boundedFetch(async () => streamed(4096, 1024, counter), 'https://upstream.test/', {}, 1000),
    (error) => error instanceof AccountError && error.code === 'unavailable',
  );
  assert.ok(counter.pulled < 100, `pulled ${counter.pulled} of 4096 chunks`);
});

test('a small JSON body is parsed and an empty or non-JSON body is undefined', async () => {
  const run = (response) => boundedFetch(async () => response, 'https://upstream.test/', {}, 1000);
  assert.deepEqual(await run(Response.json({ a: 1 })), { status: 200, json: { a: 1 } });
  assert.deepEqual(await run(new Response('', { status: 200 })), { status: 200, json: undefined });
  assert.deepEqual(await run(new Response('nope', { status: 500 })), { status: 500, json: undefined });
});
