import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useForegroundClock(): number {
  const [now, setNow] = useState(() => Date.now());
  const readClock = useCallback(() => setNow(Date.now()), []);

  useFocusEffect(readClock);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') readClock();
    });
    return () => subscription?.remove();
  }, [readClock]);

  return now;
}
