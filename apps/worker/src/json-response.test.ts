import assert from 'node:assert/strict';
import test from 'node:test';

import { z } from 'zod';

import { createErrorResponse, jsonHeaders } from './json-response.ts';

const schema = z.strictObject({ error: z.strictObject({ code: z.enum(['not_found', 'rate_limited']) }) });

test('an error response carries both JSON headers, the status and the validated envelope', async () => {
  const response = createErrorResponse(schema)(404, 'not_found');

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), { error: { code: 'not_found' } });
});

test('extra headers are added beside the JSON headers, never instead of them', () => {
  const response = createErrorResponse(schema)(429, 'rate_limited', { 'Retry-After': '60' });

  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(response.headers.get('cache-control'), jsonHeaders['Cache-Control']);
  assert.equal(response.headers.get('content-type'), jsonHeaders['Content-Type']);
});

test('a code outside the route contract is rejected before a response exists', () => {
  assert.throws(() => createErrorResponse(schema)(500, 'bogus'));
});
