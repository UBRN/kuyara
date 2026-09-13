import { Stack, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useFocusedErrorEpisode } from '@/features/analytics/application/use-focused-error-episode';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenInteractive } from '@/features/analytics/application/use-screen-interactive';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';
import { WeatherScreen } from '@/features/weather/presentation/weather-screen';
import { useMessages } from '@/localization/use-messages';

export default function WeatherRoute() {
  const messages = useMessages();
  const { retries } = useProductAnalytics();
  const { state } = useWeatherApplication();
  useScreenViewed('weather');
  // Interactive once the screen has its own content, not while it is still loading and not
  // on the shell's bootstrap or error surfaces.
  useScreenInteractive(state.status === 'ready' ? { state: 'ready' } : null);
  useFocusedErrorEpisode(
    'weather',
    state.status === 'loading'
      ? undefined
      : state.status === 'error'
        ? 'unknown'
        : state.refreshFailure,
  );
  useFocusEffect(useCallback(() => () => retries.reset('weather'), [retries]));
  return (
    <>
      {/* The header stays hidden; the title only names the back button on /weather/location. */}
      <Stack.Screen options={{ title: messages.weather.title }} />
      <WeatherScreen />
    </>
  );
}
