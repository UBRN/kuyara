// "How long since the app process started", as a port. The monotonic read behind it is injected
// (`data/process-clock.ts`) and the start mark is taken once by the root layout, so this module
// reads no clock itself. A wall clock is not used for the read because a device clock change in
// the middle of a launch would corrupt a duration.

export type ProcessClock = Readonly<{
  /** Takes the start mark. Only the first call counts. */
  mark: () => void;
  /** Milliseconds since the mark, or null while no mark was taken. */
  elapsedMs: () => number | null;
}>;

/**
 * `isTimed` says whether the launch can be timed at all: a background launch nobody saw has
 * no "since launch" (`launch-visibility.ts`), so it measures nothing.
 */
export function createProcessClock(read: () => number, isTimed: () => boolean): ProcessClock {
  let startedAt: number | null = null;
  return {
    mark() {
      startedAt ??= read();
    },
    elapsedMs: () => (startedAt === null || !isTimed() ? null : read() - startedAt),
  };
}
