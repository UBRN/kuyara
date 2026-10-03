import assert from 'node:assert/strict';
import test from 'node:test';

import { PACED_FRAME_MS, pacedClock, pacedTick } from './paced-clock.ts';

// A layer taken off fades on `fast` (120 ms). The frame that mounts the change can reach the
// screen 70 ms or more after the motion starts; on the wall clock the fade was then nearly over
// before it was drawn, and the piece left in a single frame.
test('a stalled frame advances the motion by one frame, not by the stall', () => {
  const start = pacedClock(1000);
  assert.equal(start.time, 1000);
  const afterStall = pacedTick(start, 1071);
  assert.equal(afterStall.time, 1000 + PACED_FRAME_MS);
  assert.equal(afterStall.last, 1071);
});

test('frames at the display rate keep wall-clock time, at 60 and at 120 Hz', () => {
  let clock = pacedClock(0);
  for (let frame = 1; frame <= 6; frame += 1) clock = pacedTick(clock, frame * (1000 / 120));
  assert.equal(Math.round(clock.time * 1000) / 1000, 50);
  clock = pacedClock(0);
  for (let frame = 1; frame <= 3; frame += 1) clock = pacedTick(clock, frame * PACED_FRAME_MS);
  assert.equal(Math.round(clock.time * 1000) / 1000, 50);
});

test('a `fast` motion spans at least seven drawn frames however late they come', () => {
  let clock = pacedClock(0);
  let frames = 0;
  for (const now of [70, 105, 140, 160, 180, 300, 400, 500]) {
    clock = pacedTick(clock, now);
    frames += 1;
    if (clock.time >= 120) break;
  }
  assert.ok(frames >= 7, `ended after ${frames} frames`);
});

test('a clock that runs backwards never rewinds the motion', () => {
  const clock = pacedTick(pacedClock(500), 480);
  assert.equal(clock.time, 500);
  assert.equal(clock.last, 480);
});
