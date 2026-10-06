import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';

/**
 * Whether Today is the focused screen. Each focus, and each return to the foreground while
 * focused, re-reads the local day, runs the approved triggers and revalidates the weather;
 * leaving Today resets its retry attempt counter.
 */
export function useTodayFocus(): boolean {
  const { evaluateApprovedTriggers, reevaluateLocalDay } = useRecommendationApplication();
  const { revalidateFreshness: revalidateWeatherFreshness } = useWeatherApplication();
  const { retries } = useProductAnalytics();
  const [focused, setFocused] = useState(false);
  const evaluateOnFocus = useRef(evaluateApprovedTriggers);
  useEffect(() => { evaluateOnFocus.current = evaluateApprovedTriggers; }, [evaluateApprovedTriggers]);
  useFocusEffect(useCallback(() => {
    const recheck = () => {
      reevaluateLocalDay();
      void evaluateOnFocus.current(true);
      void revalidateWeatherFreshness();
    };
    recheck();
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && previousState !== 'active') recheck();
      previousState = nextState;
    });
    setFocused(true);
    return () => {
      subscription?.remove();
      setFocused(false);
      retries.reset('today');
    };
  }, [reevaluateLocalDay, retries, revalidateWeatherFreshness]));
  return focused;
}
