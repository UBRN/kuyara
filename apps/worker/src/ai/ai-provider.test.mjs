import assert from 'node:assert/strict';
import test from 'node:test';

import { AttemptTimeoutError } from '../attempt-timeout.ts';
import { AiProviderError, attemptFailureReason } from './ai-provider.ts';

test('an attempt failure is named: timeout, a classified kind, or provider_error', () => {
  assert.equal(attemptFailureReason(new AttemptTimeoutError()), 'timeout');
  assert.equal(attemptFailureReason(new AiProviderError('quota_exceeded')), 'quota_exceeded');
  assert.equal(attemptFailureReason(new AiProviderError('rate_limited')), 'rate_limited');
  assert.equal(attemptFailureReason(new Error('anything else')), 'provider_error');
  assert.equal(attemptFailureReason('not an error'), 'provider_error');
});

test('an attempt whose own timer aborted it is a timeout, even when the provider rejected first', () => {
  const controller = new AbortController();
  controller.abort();
  assert.equal(attemptFailureReason(new Error('aborted'), controller.signal), 'timeout');
  assert.equal(attemptFailureReason(new Error('aborted'), new AbortController().signal), 'provider_error');
});
