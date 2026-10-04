import assert from 'node:assert/strict';
import test from 'node:test';

import { coalescedRun } from './coalesced-run.ts';

test('calls during a run share one more run after it, and a task can ask for one itself', async () => {
  let runs = 0;
  let release;
  let askAgain = false;
  const run = coalescedRun(async () => {
    runs += 1;
    if (runs === 1) await new Promise((resolve) => { release = resolve; });
    if (askAgain) { askAgain = false; return true; }
  });
  const first = run();
  const second = run();
  const third = run();
  release();
  await Promise.all([first, second, third]);
  assert.equal(runs, 2);
  askAgain = true;
  await run();
  assert.equal(runs, 4);
});

test('a failing run settles its callers and the next call runs again', async () => {
  let fail = true;
  const run = coalescedRun(async () => { if (fail) throw new Error('unavailable'); });
  await assert.rejects(run());
  fail = false;
  await run();
});
