import { useEffect, useSyncExternalStore } from 'react';

// Everything presented over the current screen, or about to be (a sheet, an alert, a share
// sheet, the keyboard, a prompt, the tour, a launch curtain, a modal form, the generation
// runway, the worn moment), holds it while it is there; what must never appear over one waits
// until nothing holds the screen. Each hold is its own token, so a release that comes twice
// lets go once. The set lives as long as the module: a development Fast Refresh of this file
// starts it empty while older holds are still on screen, which only a full reload puts right.
const holds = new Set<symbol>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const held = () => holds.size > 0;

/** Holds the screen until the returned release is called. */
export function holdPresentation(): () => void {
  const hold = Symbol('presentation');
  holds.add(hold);
  notify();
  return () => {
    if (holds.delete(hold)) notify();
  };
}

/** Holds the screen while `holding`: something is presented over it, or is about to be. */
export function usePresentationHold(holding: boolean): void {
  useEffect(() => (holding ? holdPresentation() : undefined), [holding]);
}

/** Whether anything holds the screen now. */
export function usePresentationHeld(): boolean {
  return useSyncExternalStore(subscribe, held, held);
}

/** Holds the screen while a system sheet, picker or browser the app waits for is up, until it settles. */
export function whilePresented<T>(present: () => Promise<T>): Promise<T> {
  const release = holdPresentation();
  // A presenter that throws at once rejects here too, so the hold is always released.
  return new Promise<T>((resolve) => resolve(present())).finally(release);
}
