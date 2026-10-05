import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

const MINUTE_MS = 60_000;

/**
 * Reads the wall clock when a surface gains focus or the app returns to the foreground.
 * Callers with a live time boundary may also request a focused interval; ordinary display
 * callers keep the event-only behavior and do not pay for a timer. A caller whose data lands
 * while the surface stays open passes a `rereadWhen` value that changes with that data, so the
 * clock is read again when it arrives.
 *
 * A focus or foreground read inside the minute the clock last moved in keeps the value it
 * has: every consumer draws hours, days or minute-aligned boundaries from it, so a value
 * under a minute old says the same thing, and a new value would only re-render every surface
 * that holds the clock on each tab switch. Interval ticks always move it.
 */
export function useForegroundClock(tickIntervalMs?: number, rereadWhen?: unknown): number {
  const [now, setNow] = useState(() => Date.now());
  const tickClock = useCallback(() => setNow(Date.now()), []);
  const readClock = useCallback(() => setNow((previous) => {
    const current = Date.now();
    return Math.floor(previous / MINUTE_MS) === Math.floor(current / MINUTE_MS) ? previous : current;
  }), []);

  useFocusEffect(useCallback(() => {
    readClock();
    if (tickIntervalMs === undefined) return undefined;

    const timer = setInterval(tickClock, tickIntervalMs);
    return () => clearInterval(timer);
  }, [readClock, tickClock, tickIntervalMs]));
  // Adjusting state while rendering, guarded by the changed value, re-reads the clock in the
  // same pass instead of drawing once with the old hour and again after an effect.
  const [rereadSeen, setRereadSeen] = useState(rereadWhen);
  if (rereadSeen !== rereadWhen) {
    setRereadSeen(rereadWhen);
    readClock();
  }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') readClock();
    });
    return () => subscription?.remove();
  }, [readClock]);

  return now;
}
