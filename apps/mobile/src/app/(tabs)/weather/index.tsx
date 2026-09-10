import { Stack } from 'expo-router';

import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { WeatherScreen } from '@/features/weather/presentation/weather-screen';
import { useMessages } from '@/localization/use-messages';

export default function WeatherRoute() {
  const messages = useMessages();
  useScreenViewed('weather');
  return (
    <>
      {/* The header stays hidden; the title only names the back button on /weather/location. */}
      <Stack.Screen options={{ title: messages.weather.title }} />
      <WeatherScreen />
    </>
  );
}
