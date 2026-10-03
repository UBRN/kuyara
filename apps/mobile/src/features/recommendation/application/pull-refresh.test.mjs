import assert from 'node:assert/strict';
import test from 'node:test';

import { refreshAfterPull } from './pull-refresh.ts';

function run(state) {
  const calls = [];
  return refreshAfterPull({
    getSnapshot: () => state,
    refresh: async () => { calls.push('refresh'); return null; },
    evaluateApprovedTriggers: async () => { calls.push('evaluate'); },
  }).then(() => calls);
}

test('a ready state holding recommended outfits only evaluates the approved triggers', async () => {
  assert.deepEqual(await run({ status: 'ready', snapshot: { recommendation: { status: 'recommended' } } }), ['evaluate']);
});

test('a ready state without recommended outfits is regenerated', async () => {
  assert.deepEqual(await run({ status: 'ready', snapshot: { recommendation: { status: 'unavailable' } } }), ['refresh']);
  assert.deepEqual(await run({ status: 'ready', snapshot: null }), ['refresh']);
});

test('a state that is not ready is left alone', async () => {
  assert.deepEqual(await run({ status: 'loading' }), []);
});
