import { useNavigation } from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';
import type { ParamListBase } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';

/**
 * ADR 0020, "content arrives after the transition lands": true once the stack's push onto
 * this screen has finished, so a pushed screen's `Entrance` holds its content until then
 * instead of playing it under the moving screen. A screen that opens its navigator (a tab's
 * root) was not pushed and is landed from its first render. Once landed it stays landed: a
 * return to the screen is not an arrival.
 */
export function useTransitionLanded(): boolean {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const [landed, setLanded] = useState(() => navigation.getState()?.index === 0);

  useEffect(() => {
    if (landed) return;
    return navigation.addListener('transitionEnd', (event) => {
      if (!event.data.closing) setLanded(true);
    });
  }, [landed, navigation]);

  return landed;
}
