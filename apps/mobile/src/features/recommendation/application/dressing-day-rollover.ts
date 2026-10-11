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
  /**
   * The app state changed: a return to the foreground clears the turned-in-front mark and
   * reevaluates the day, and only the foreground keeps the timer for the next turn.
   */
  appStateChanged: (next: string) => void;
  /** Whether the latest day-choice read failed, so the next reevaluation reads it again. */
  choiceReadFailed: (failed: boolean) => void;
  /**
   * Keeps one timer for the next 04:00 or 18:00 while the app is in the foreground, so a day
   * left open across it turns at that moment; the returned function clears it.
   */
  watch: () => () => void;
}>;

/**
 * Moves the provider to the dressing day in force (the 04:00 and 18:00 flips) when a screen
 * asks, the app returns to the foreground, or the foreground app reaches the flip. The clock
 * is read by `readDay` and `untilNextDay`, at the edge.
 *
 * A flip the timer reaches is marked with `turnedInFront(key)` until the next return to the
 * foreground clears it with `turnedInFront(null)`: the day's question waits for that open.
 */
export function createDressingDayRollover<T extends Day>({
  initialAppState, readDay, adoptDay, retryChoiceRead, untilNextDay, turnedInFront,
}: Readonly<{
  initialAppState: string;
  readDay: () => T;
  adoptDay: (day: T) => void;
  retryChoiceRead: () => void;
  untilNextDay: () => number;
  turnedInFront: (dayKey: string | null) => void;
}>): DressingDayRollover {
  let appState = initialAppState;
  let lastChoiceReadFailed = false;
  let lastKey = readDay().key;
  let watching = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const read = () => {
    const day = readDay();
    const turned = day.key !== lastKey;
    lastKey = day.key;
    adoptDay(day);
    if (lastChoiceReadFailed) retryChoiceRead();
    return turned ? day.key : null;
  };
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = watching && appState === 'active' ? setTimeout(reachTurn, untilNextDay()) : null;
  };
  function reachTurn() {
    const turnedKey = read();
    if (turnedKey) turnedInFront(turnedKey);
    schedule();
  }

  return {
    reevaluate: () => { read(); },
    appStateChanged(next) {
      const wasInactive = appState !== 'active';
      appState = next;
      if (wasInactive && next === 'active') {
        turnedInFront(null);
        read();
      }
      schedule();
    },
    choiceReadFailed(failed) {
      lastChoiceReadFailed = failed;
    },
    watch() {
      watching = true;
      schedule();
      return () => {
        watching = false;
        schedule();
      };
    },
  };
}
