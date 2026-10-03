/**
 * A motion's clock that advances at most one 60 Hz frame per drawn frame. The frame that mounts
 * a board change can reach the screen well after its motion was asked for while the UI thread
 * mounts the change; on the wall clock a `fast` fade started with it is then nearly over before
 * it is drawn. Paced, a late frame costs one frame of the motion, never the motion.
 */
export const PACED_FRAME_MS = 1000 / 60;

export type PacedClock = Readonly<{ time: number; last: number }>;

export function pacedClock(now: number): PacedClock {
  'worklet';
  return { time: now, last: now };
}

export function pacedTick(clock: PacedClock, now: number): PacedClock {
  'worklet';
  return { time: clock.time + Math.min(Math.max(now - clock.last, 0), PACED_FRAME_MS), last: now };
}
