/** The dressing day as the provider renders it: its key and what the key is read from. */
type Day = Readonly<{ key: string }>;

/**
 * The day to render once `read` has been read from the clock: the rendered one while the key
 * is unchanged, so nothing that reads it starts again, and `read` once the key has moved.
 */
export function dayInForce<T extends Day>(rendered: T, read: T): T {
  return rendered.key === read.key ? rendered : read;
}

export type DressingDayRollover = Readonly<{
  /**
   * Reads the dressing day again: a new key replaces the rendered day, and a day-choice read
   * that failed is tried again, even within the same dressing day.
   */
  reevaluate: () => void;
  /** The app state changed; a return to the foreground reevaluates the day. */
  appStateChanged: (next: string) => void;
  /** Whether the latest day-choice read failed, so the next reevaluation reads it again. */
  choiceReadFailed: (failed: boolean) => void;
}>;

/**
 * Moves the provider to the dressing day in force (the 04:00 and 18:00 flips) when a screen
 * asks or the app returns to the foreground. The clock is read by `readDay`, at the edge.
 */
export function createDressingDayRollover<T extends Day>({
  initialAppState, readDay, adoptDay, retryChoiceRead,
}: Readonly<{
  initialAppState: string;
  readDay: () => T;
  adoptDay: (day: T) => void;
  retryChoiceRead: () => void;
}>): DressingDayRollover {
  let appState = initialAppState;
  let lastChoiceReadFailed = false;

  const reevaluate = () => {
    adoptDay(readDay());
    if (lastChoiceReadFailed) retryChoiceRead();
  };

  return {
    reevaluate,
    appStateChanged(next) {
      const wasInactive = appState !== 'active';
      appState = next;
      if (wasInactive && next === 'active') reevaluate();
    },
    choiceReadFailed(failed) {
      lastChoiceReadFailed = failed;
    },
  };
}
