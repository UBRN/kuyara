import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalServerInstant, serverInstantSecondsBefore } from './server-instant.ts';

test('a server instant is the UTC form with six fractional digits, whatever offset it arrives in', () => {
  assert.equal(canonicalServerInstant('2026-09-30T10:00:00.123456+00:00'), '2026-09-30T10:00:00.123456Z');
  assert.equal(canonicalServerInstant('2026-09-30T13:00:00.5+03:00'), '2026-09-30T10:00:00.500000Z');
  assert.equal(canonicalServerInstant('2026-09-30T10:00:00Z'), '2026-09-30T10:00:00.000000Z');
});

test('the canonical form sorts as text in the order of arrival, microseconds included', () => {
  const earlier = canonicalServerInstant('2026-09-30T10:00:00.123456+00:00');
  const later = canonicalServerInstant('2026-09-30T10:00:00.123457+00:00');
  const muchLater = canonicalServerInstant('2026-09-30T13:00:01+03:00');
  assert.ok(earlier < later && later < muchLater);
});

test('a value that is not a datetime is refused', () => {
  for (const value of ['', 'yesterday', null, 5, '2026-13-01T00:00:00Z', '2026-09-30 10:00:00Z']) {
    assert.equal(canonicalServerInstant(value), null);
  }
});

test('moving an instant back keeps its microseconds and crosses a day boundary', () => {
  assert.equal(serverInstantSecondsBefore('2026-10-01T00:00:05.123456Z', 10), '2026-09-30T23:59:55.123456Z');
  assert.equal(serverInstantSecondsBefore('2026-10-01T03:00:05+03:00', 5), '2026-10-01T00:00:00.000000Z');
  assert.equal(serverInstantSecondsBefore('later', 10), null);
});
