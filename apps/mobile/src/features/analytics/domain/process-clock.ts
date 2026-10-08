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

export function createProcessClock(read: () => number): ProcessClock {
  let startedAt: number | null = null;
  return {
    mark() {
      startedAt ??= read();
    },
    elapsedMs: () => (startedAt === null ? null : read() - startedAt),
  };
}
