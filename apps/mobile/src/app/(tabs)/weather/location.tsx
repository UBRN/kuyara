import { Stack } from 'expo-router';

import { WeatherLocationScreen } from '@/features/weather/presentation/weather-location-screen';
import { useMessages } from '@/localization/use-messages';

export default function WeatherLocationRoute() {
  const messages = useMessages();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerTitle: messages.weather.placeSearchTitle }} />
      <WeatherLocationScreen />
    </>
  );
}
