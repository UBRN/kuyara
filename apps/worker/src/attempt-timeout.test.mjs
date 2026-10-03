import assert from 'node:assert/strict';
import test from 'node:test';

import { AttemptTimeoutError, raceWithTimeout } from './attempt-timeout.ts';

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
