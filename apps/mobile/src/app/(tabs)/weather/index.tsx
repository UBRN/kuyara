import { Stack } from 'expo-router';

import { WeatherScreen } from '@/features/weather/presentation/weather-screen';
import { useMessages } from '@/localization/use-messages';

export default function WeatherRoute() {
  const messages = useMessages();
  return (
    <>
      {/* The header stays hidden; the title only names the back button on /weather/location. */}
      <Stack.Screen options={{ title: messages.weather.title }} />
      <WeatherScreen />
    </>
  );
}
