import { Stack } from 'expo-router';

import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { WeatherLocationScreen } from '@/features/weather/presentation/weather-location-screen';
import { useMessages } from '@/localization/use-messages';

export default function WeatherLocationRoute() {
  const messages = useMessages();
  useScreenViewed('weather_location');
  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerTitle: messages.weather.placeSearchTitle }} />
      <WeatherLocationScreen />
    </>
  );
}
