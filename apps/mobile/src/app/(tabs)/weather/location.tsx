import { Stack } from 'expo-router';

import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { WeatherLocationScreen } from '@/features/weather/presentation/weather-location-screen';
import { useMessages } from '@/localization/use-messages';

export default function WeatherLocationRoute() {
  const messages = useMessages();
  useScreenViewed('weather_location');
  return (
    <>
      {/* The back title is set here because the language can change while Weather sits
          under this screen, and react-native-screens refreshes a screen's native title only
          while it is on top: an inherited one would keep the old language. */}
      <Stack.Screen
        options={{
          headerBackTitle: messages.weather.title,
          headerShown: true,
          headerTitle: messages.weather.placeSearchTitle,
        }}
      />
      <WeatherLocationScreen />
    </>
  );
}
