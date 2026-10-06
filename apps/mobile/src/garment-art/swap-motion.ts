import { defineAnimation, makeMutable, type AnimationObject } from 'react-native-reanimated';

import { spacing } from '@/theme/theme';

import { pacedClock, pacedTick, type PacedClock } from './paced-clock';
import type { Box, PieceStart, PieceValues } from './swap-reconcile';

// Law 7's completion moment, as in `GarmentBoard`.
export const SETTLE_TRAVEL = spacing.xs;
// Law 7's dressing: a piece taken off rises one `lg` step as it fades on `fast`, and a piece
// put on is hung from that height onto its place on the arrival spring.
export const DRESS_LIFT = spacing.lg;

type PacedAnimation = AnimationObject<number> & { clock: PacedClock };

/** `animation` on a `pacedClock`: a frame that reaches the screen late moves it by one frame. */
export function paced(animation: number): number {
  'worklet';
  return defineAnimation<PacedAnimation, AnimationObject<number>>(animation, () => {
    'worklet';
    const inner = (typeof animation === 'function'
      ? (animation as () => AnimationObject<number>)() : animation) as unknown as AnimationObject<number>;
    return {
      isHigherOrder: true,
      clock: pacedClock(0),
      current: inner.current,
      previousAnimation: null,
      onStart: (self: PacedAnimation, value: number, now: number, previous: AnimationObject<number> | null) => {
        self.clock = pacedClock(now);
        self.current = value;
        inner.onStart(inner, value, now, previous);
      },
      onFrame: (self: PacedAnimation, now: number) => {
        self.clock = pacedTick(self.clock, now);
        const finished = inner.onFrame(inner, self.clock.time);
        self.current = inner.current;
        return finished;
      },
      callback: (finished?: boolean) => inner.callback?.(finished),
    };
  }) as unknown as number;
}

export function valuesFor(start: PieceStart): PieceValues {
  return {
    from: makeMutable<Box>(start.from), to: makeMutable<Box>(start.box), p: makeMutable(start.p),
    dx: makeMutable(start.dx), dy: makeMutable(0), op: makeMutable(start.op), sc: makeMutable(start.sc),
    drain: makeMutable(0),
    hand: makeMutable(start.hand), handFrom: makeMutable(1), handTo: makeMutable(Number.NaN),
  };
}
