import { useNavigation } from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';
import type { ParamListBase } from 'expo-router/react-navigation';
import { useEffect } from 'react';

import { useWalkthrough } from '@/features/walkthrough/application/walkthrough-context';

/**
 * Tells the tour when this pushed screen's pop back to Today starts, not when it lands: the
 * native back control pops first and moves the route only once the pop has finished. A swipe
 * back can be let go before it completes (`gestureCancel`, iOS): the screen then stays, and
 * the tour goes back to the step it left.
 */
export function useTourPopReport(): void {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const walkthrough = useWalkthrough();
  const reportReturningToday = walkthrough?.reportReturningToday;
  const reportPopCancelled = walkthrough?.reportPopCancelled;
  useEffect(() => navigation.addListener('transitionStart', (event) => {
    if (event.data.closing) reportReturningToday?.();
  }), [navigation, reportReturningToday]);
  useEffect(() => navigation.addListener('gestureCancel', () => reportPopCancelled?.()),
    [navigation, reportPopCancelled]);
}
