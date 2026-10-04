import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemberReask } from './member-reask.ts';

test('a member\'s ten apply only to a re-ask whose token was read, and that request carries the same token', async () => {
  const limits = [];
  let next = 'member-token';
  const reask = createMemberReask({
    readToken: async () => next,
    reserve: async (_dayKey, dailyLimit) => { limits.push(dailyLimit); return true; },
  });
  assert.equal(await reask.token(), null);
  assert.equal(await reask.reserve('2026-10-05'), true);
  assert.equal(await reask.token(), 'member-token');

  next = null;
  await reask.reserve('2026-10-05');
  assert.equal(await reask.token(), null);
  assert.deepEqual(limits, [10, 5]);
});

test('a refused reservation still answers no for the request', async () => {
  const reask = createMemberReask({ readToken: async () => 'member-token', reserve: async () => false });
  assert.equal(await reask.reserve('2026-10-05'), false);
});
