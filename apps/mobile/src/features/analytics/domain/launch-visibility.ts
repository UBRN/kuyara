// iOS also starts kuyara in the background, for the weather-alert task (ADR 0004), and under
// the scene life cycle (ADR 0040) the whole UI then renders off screen. Nobody sees that
// launch, so it is not a session and has no launch timing: the session is counted, the
// analytics client is built and the launch is timed only once the person has seen the app.
// The platform's app state is injected (`data/launch-visibility.ts`), so this reads none.

export type LaunchAppState = Readonly<{
  /** The app state the process started in. */
  initial: string | null;
  onChange: (listener: (state: string) => void) => () => void;
}>;

export type LaunchVisibility = Readonly<{
  /** Calls `listener` once, when the launch is first seen; at once if it already has been. */
  onSeen: (listener: () => void) => void;
  /**
   * Whether this process's launch metrics describe a launch someone saw. Decided once, at the
   * first metric, as whether the app had been seen by then: a launch first timed off screen
   * stays untimed, because every later mark would still count from that unseen start.
   */
  isTimed: () => boolean;
}>;

export function createLaunchVisibility(appState: LaunchAppState): LaunchVisibility {
  // Only a background start is unseen: a foreground launch can begin `inactive`, before its
  // scene activates, and an unknown state is read as seen.
  let seen = appState.initial !== 'background';
  let timed: boolean | null = null;
  const pending = new Set<() => void>();
  const unsubscribe = seen ? null : appState.onChange((state) => {
    if (seen || state !== 'active') return;
    seen = true;
    unsubscribe?.();
    const listeners = [...pending];
    pending.clear();
    for (const listener of listeners) listener();
  });
  return {
    onSeen(listener) {
      if (seen) listener();
      else pending.add(listener);
    },
    isTimed() {
      timed ??= seen;
      return timed;
    },
  };
}
