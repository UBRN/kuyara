import { useNavigation } from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';
import type { ParamListBase } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';

import { PUSH_WINDOW_MS } from './use-single-push';

/**
 * ADR 0020, "content arrives after the transition lands": true once the stack's push onto
 * this screen has finished, so a pushed screen's `Entrance` holds its content until then
 * instead of playing it under the moving screen. A screen that opens its navigator (a tab's
 * root) was not pushed and is landed from its first render, and any screen is landed once a
 * push would have finished. Once landed it stays landed: a return to the screen is not an
 * arrival.
 */
export function useTransitionLanded(): boolean {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const [landed, setLanded] = useState(() => navigation.getState()?.index === 0);

  useEffect(() => {
    if (landed) return;
    const unsubscribe = navigation.addListener('transitionEnd', (event) => {
      if (!event.data.closing) setLanded(true);
    });
    // A screen that never hears its push end (restored or deep-linked state, a cancelled
    // gesture) still lands once a push would have finished, so its content is never held.
    const fallback = setTimeout(() => setLanded(true), PUSH_WINDOW_MS);
    return () => {
      unsubscribe();
      clearTimeout(fallback);
    };
  }, [landed, navigation]);

  return landed;
}
