import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapProbeError,
  mapProbeResult,
  startAiProbe,
} from './ai-probe-state.ts';
import { WorkerAiProbeClientError } from '../data/worker-ai-probe-client.ts';

test('starts a supported idle probe and coalesces while checking', () => {
  assert.deepEqual(startAiProbe({ kind: 'idle' }, true), { kind: 'checking' });
  assert.deepEqual(startAiProbe({ kind: 'idle' }, false), { kind: 'idle' });

  const checking = { kind: 'checking' };
  assert.equal(startAiProbe(checking, true), checking);
});

test('maps successful probe states', () => {
  const checkedAt = '2026-08-29T12:00:00.000Z';

  assert.deepEqual(mapProbeResult({ status: 'ok', checkedAt }), {
    kind: 'ok',
    checkedAt,
  });
  assert.deepEqual(mapProbeResult({ status: 'unavailable', checkedAt }), {
    kind: 'unavailable',
  });
});

test('maps rate limiting separately and keeps all other failures generic', () => {
  assert.deepEqual(
    mapProbeError(new WorkerAiProbeClientError('rate-limited')),
    { kind: 'rate-limited' },
  );
  assert.deepEqual(
    mapProbeError(new WorkerAiProbeClientError('network')),
    { kind: 'error' },
  );
  assert.deepEqual(mapProbeError(new Error('private detail')), { kind: 'error' });
});
