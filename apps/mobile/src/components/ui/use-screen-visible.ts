import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

function inForeground(state: string) {
  return state !== 'background' && state !== 'inactive';
}

/**
 * Runs `run` while a mounted screen is focused and the app is in the foreground, and its
 * cleanup the moment either stops holding, so ambient work sleeps without the screen leaving
 * navigation. Nothing here is React state: a blur or a background draws no screen again.
 */
export function useWhileVisible(run: () => void | (() => void)): void {
  const flags = useRef({ focused: false, foreground: inForeground(AppState.currentState) });
  const stop = useRef<void | (() => void)>(undefined);

  const sync = useCallback(() => {
    stop.current?.();
    stop.current = flags.current.focused && flags.current.foreground ? run() : undefined;
  }, [run]);

  useFocusEffect(useCallback(() => {
    flags.current.focused = true;
    sync();
    return () => {
      flags.current.focused = false;
      sync();
    };
  }, [sync]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      flags.current.foreground = inForeground(state);
      sync();
    });
    return () => subscription?.remove();
  }, [sync]);
}

/** The same condition as state, for a screen part that must draw differently while hidden. */
export function useScreenVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useWhileVisible(useCallback(() => {
    setVisible(true);
    return () => setVisible(false);
  }, []));
  return visible;
}
