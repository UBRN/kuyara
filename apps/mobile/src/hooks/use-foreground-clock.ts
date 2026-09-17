import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Reads the wall clock when a surface gains focus or the app returns to the foreground.
 * Callers with a live time boundary may also request a focused interval; ordinary display
 * callers keep the event-only behavior and do not pay for a timer.
 */
export function useForegroundClock(tickIntervalMs?: number): number {
  const [now, setNow] = useState(() => Date.now());
  const readClock = useCallback(() => setNow(Date.now()), []);

  useFocusEffect(useCallback(() => {
    readClock();
    if (tickIntervalMs === undefined) return undefined;

    const timer = setInterval(readClock, tickIntervalMs);
    return () => clearInterval(timer);
  }, [readClock, tickIntervalMs]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') readClock();
    });
    return () => subscription?.remove();
  }, [readClock]);

  return now;
}
