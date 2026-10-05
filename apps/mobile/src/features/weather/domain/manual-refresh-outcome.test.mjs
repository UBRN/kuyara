import assert from 'node:assert/strict';
import test from 'node:test';

import { manualRefreshOutcome } from './manual-refresh-outcome.ts';

const kept = { status: 'ready', refreshFailure: null, snapshot: { id: 'snapshot' } };

test('a manual refresh reports what the weather kept', () => {
  assert.equal(manualRefreshOutcome(kept), 'success');
  assert.equal(manualRefreshOutcome({ ...kept, refreshFailure: 'offline' }), 'failure_kept_last_known');
  assert.equal(manualRefreshOutcome({ ...kept, refreshFailure: 'offline', snapshot: null }), 'failure_no_snapshot');
  assert.equal(manualRefreshOutcome({ status: 'loading' }), 'failure_no_snapshot');
  assert.equal(manualRefreshOutcome({ status: 'error' }), 'failure_no_snapshot');
});
