import assert from 'node:assert/strict';
import test from 'node:test';

import { RetryCounter } from './application/retry-counter.ts';

test('the first retry of a surface is attempt one', () => {
  const counter = new RetryCounter();
  assert.equal(counter.nextAttempt('today'), 1);
  assert.equal(counter.nextAttempt('today'), 2);
});

test('attempts five and above collapse to 5+', () => {
  const counter = new RetryCounter();
  const attempts = [1, 2, 3, 4, 5, 6].map(() => counter.nextAttempt('weather'));
  assert.deepEqual(attempts, [1, 2, 3, 4, '5+', '5+']);
});

test('a reset ends the failure episode', () => {
  const counter = new RetryCounter();
  counter.nextAttempt('closet');
  counter.nextAttempt('closet');
  counter.reset('closet');
  assert.equal(counter.nextAttempt('closet'), 1);
});

test('surfaces count independently', () => {
  const counter = new RetryCounter();
  counter.nextAttempt('today');
  counter.nextAttempt('today');
  assert.equal(counter.nextAttempt('weather'), 1);
  assert.equal(counter.nextAttempt('today'), 3);
});
