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
