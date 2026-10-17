import { useEffect, useSyncExternalStore } from 'react';

// Everything presented over the current screen, or about to be (a sheet, a prompt, the tour, a
// launch curtain, a modal form), holds it while it is there; what must never appear over one
// waits until nothing holds the screen. Each holder counts once, for one process.
let holders = 0;
const listeners = new Set<() => void>();

function change(by: number) {
  holders += by;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const held = () => holders > 0;

/** Holds the screen while `holding`: something is presented over it, or is about to be. */
export function usePresentationHold(holding: boolean): void {
  useEffect(() => {
    if (!holding) return undefined;
    change(1);
    return () => change(-1);
  }, [holding]);
}

/** Whether anything holds the screen now. */
export function usePresentationHeld(): boolean {
  return useSyncExternalStore(subscribe, held, held);
}
