import assert from 'node:assert/strict';
import test from 'node:test';

import { AttemptTimeoutError, raceWithTimeout, withDeadline } from './attempt-timeout.ts';

test('an attempt that answers in time returns its value and leaves the signal alone', async () => {
  const controller = new AbortController();
  assert.equal(await raceWithTimeout(controller, async () => 'ok', 1000), 'ok');
  assert.equal(controller.signal.aborted, false);
});

test('an attempt that fails in time rethrows its own error', async () => {
  const controller = new AbortController();
  await assert.rejects(
    raceWithTimeout(controller, async () => { throw new RangeError('own'); }, 1000),
    RangeError,
  );
  assert.equal(controller.signal.aborted, false);
});

test('an attempt past its deadline is aborted and rejects with the timeout error', async () => {
  const controller = new AbortController();
  await assert.rejects(
    raceWithTimeout(controller, () => new Promise(() => {}), 5),
    AttemptTimeoutError,
  );
  assert.equal(controller.signal.aborted, true);
});

test('the timer is cleared once the race settles', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  await raceWithTimeout(controller, async () => 'ok', 1000);
  t.mock.timers.tick(5000);
  assert.equal(controller.signal.aborted, false);
});

test('withDeadline hands the work a signal and returns its value', async () => {
  let received: AbortSignal | undefined;
  const value = await withDeadline(1000, async (signal) => {
    received = signal;
    return 'ok';
  });
  assert.equal(value, 'ok');
  assert.equal(received?.aborted, false);
});

test('withDeadline aborts the signal at the deadline and leaves the work to fail on it', async () => {
  const outcome = await withDeadline(5, (signal) => new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve('aborted'), { once: true });
  }));
  assert.equal(outcome, 'aborted');
});

test('withDeadline rethrows the work\'s own error and clears its timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let received: AbortSignal | undefined;
  await assert.rejects(
    withDeadline(1000, async (signal) => {
      received = signal;
      throw new RangeError('own');
    }),
    RangeError,
  );
  t.mock.timers.tick(5000);
  assert.equal(received?.aborted, false);
});
